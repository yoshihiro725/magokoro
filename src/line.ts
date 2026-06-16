/**
 * LINE Webhook の署名検証とイベント処理（Day5 / 会話プロト）。
 *
 * - 署名検証は「JSONパース前の生body(Buffer)」で行う（崩さないこと）。
 * - テキスト/スタンプは askWithPersona（まごころの人格）で応答を生成して返す。
 * - 音声(audio)は文字起こし(STT)してから同じ会話パイプラインに流す（D7）。音声返信(TTS)はD8。
 *   その他の未対応タイプ（画像など）はやさしい定型を返す。
 * - 返信にはシニアが押しやすいクイックリプライ（定型ボタン）を添える。
 * - LLM失敗時は生エラーを返さず、やさしいフォールバックを返す。
 * - 会話履歴・長期記憶は持たせない（単発。記憶はW9）。秘匿情報は env 経由のみ。
 */

import type { Readable } from "node:stream";
import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getEnv } from "./env.js";
import { askWithPersona, transcribeAudio } from "./openai.js";
import { appendTurn } from "./log.js";

/**
 * X-Line-Signature を Channel secret で HMAC-SHA256 検証する。
 * @param rawBody JSONパース前の生リクエストボディ（Buffer）
 * @param signature X-Line-Signature ヘッダ値（無ければ false）
 * @param channelSecret LINE Channel secret
 */
export function verifyLineSignature(
  rawBody: Buffer,
  signature: string | undefined,
  channelSecret: string,
): boolean {
  if (!signature) return false;
  try {
    return validateSignature(rawBody, channelSecret, signature);
  } catch {
    return false;
  }
}

// 返信用クライアントは遅延生成（トークンが無ければ生成しない）。
let client: messagingApi.MessagingApiClient | null = null;
function getClient(): messagingApi.MessagingApiClient | null {
  const token = getEnv("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) return null;
  if (!client) {
    client = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  }
  return client;
}

// 音声等のバイナリ取得用クライアント（v11では Blob 用クライアントが別）。
let blobClient: messagingApi.MessagingApiBlobClient | null = null;
function getBlobClient(): messagingApi.MessagingApiBlobClient | null {
  const token = getEnv("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) return null;
  if (!blobClient) {
    blobClient = new messagingApi.MessagingApiBlobClient({
      channelAccessToken: token,
    });
  }
  return blobClient;
}

/** スタンプ受信時に askWithPersona へ渡すヒント（利用者発話の代わり）。 */
const STICKER_HINT =
  "（利用者がスタンプを送ってくれました。言葉ではなく気持ちの表現です。あたたかく受け止めて、短い問いかけで会話をやさしく続けてください。）";

/** 未対応タイプ（画像など）へのやさしい定型。 */
const UNSUPPORTED_REPLY =
  "メッセージをありがとうございます。文字か、下のボタンでもお話できますよ。";

/** LLM呼び出しが失敗したときのやさしいフォールバック（生エラーは返さない）。 */
const FALLBACK_REPLY =
  "ごめんなさい、少し調子が悪いみたいです。もう一度お話しいただけますか。";

/** 音声の取得・文字起こしに失敗、または聞き取れなかったときのやさしい定型。 */
const STT_FALLBACK_REPLY =
  "ごめんなさい、うまく聞き取れませんでした。もう一度お話しいただけますか。";

/** 文字起こし結果がこれ未満の長さ（空など）なら聞き取れなかった扱いにする。 */
const MIN_TRANSCRIPT_LEN = 1;

/** シニアが押しやすい定型ボタン。タップで同じ文言が通常メッセージとして送られる。 */
const QUICK_REPLY_LABELS = ["元気だよ", "ちょっと疲れた", "昔の話をしたい", "ありがとう"];

/** クイックリプライ（定型ボタン）を組み立てる。 */
function buildQuickReply(): messagingApi.QuickReply {
  return {
    items: QUICK_REPLY_LABELS.map((label) => ({
      type: "action",
      action: { type: "message", label, text: label },
    })),
  };
}

/**
 * 1イベントを処理する。message イベントのみ対応。
 * text/sticker は LLM で応答生成、その他は定型。返信には定型ボタンを添える。
 */
export async function handleEvent(event: webhook.Event): Promise<void> {
  // 再配信イベント（サーバ再起動後などにLINEが再送するもの）はスキップする。
  // 返信トークンは既に期限切れで返信できず、Invalid reply token の嵐の原因になるため。
  if (event.deliveryContext?.isRedelivery === true) {
    console.log("↩️  再配信イベントのためスキップ");
    return;
  }

  if (event.type !== "message") {
    console.log(`ℹ️  対象外イベント: type=${event.type}`);
    return;
  }

  const message = event.message;
  // 応答テキストを先に確定する（送信が失敗してもログで確認できるように）。
  const turn = await buildReplyText(message);
  const replyText = turn.replyText;

  // レビュー用ログに1ターン追記（応答確定直後・送信可否に関わらず記録）。
  // userId は log.ts 側でハッシュ化される（生値は残さない）。
  appendTurn({
    ts: new Date().toISOString(),
    source: turn.source,
    inputType: turn.inputType,
    userText: turn.userText,
    replyText,
    userId: event.source?.userId,
  });

  // replyToken はLINE仕様上オプショナル。無ければ返信できない。
  if (!event.replyToken) {
    console.warn("⚠️  replyToken が無いため返信できません（応答は生成済み）。");
    return;
  }
  const replyToken = event.replyToken;

  const c = getClient();
  if (!c) {
    console.warn(
      "⚠️  LINE_CHANNEL_ACCESS_TOKEN 未設定のため送信スキップ（応答は生成済み）。",
    );
    return;
  }

  try {
    console.log(
      `📤 送信準備: 本文+クイックリプライ[${QUICK_REPLY_LABELS.join(" / ")}]`,
    );
    await c.replyMessage({
      replyToken,
      messages: [{ type: "text", text: replyText, quickReply: buildQuickReply() }],
    });
    console.log("✅ 返信送信成功（クイックリプライ付き）。");
  } catch (e) {
    // ダミートークン等で送信失敗してもハンドラ到達は確認できる。
    console.warn(
      `⚠️  返信送信に失敗（トークンがダミー/無効の可能性）: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    // 失敗の本当の原因を特定するため、LINE返信APIのエラー詳細を出す。
    // HTTPステータスと、LINEが返すエラー本文（例: {"message":"Invalid reply token"}）。
    // ※アクセストークン・シークレット・署名値は出さない。
    // @line/bot-sdk v11 は HTTPFetchError（status / body=JSON文字列）。
    // 旧SDK形（statusCode / originalError.response）もフォールバックで拾う。
    const err = e as {
      status?: number;
      statusCode?: number;
      body?: unknown;
      originalError?: { response?: { status?: number; data?: unknown } };
    };
    const status =
      err.status ?? err.statusCode ?? err.originalError?.response?.status;
    let data: unknown = err.body ?? err.originalError?.response?.data;
    // body は JSON 文字列のことがあるので、見やすいよう可能ならパースする。
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // パースできなければ文字列のまま。
      }
    }
    console.warn(`   LINE APIエラー詳細: ${JSON.stringify({ status, data })}`);
  }
}

/** buildReplyText の結果（応答テキストとレビューログ用のメタ情報）。 */
interface TurnResult {
  replyText: string;
  /** 入力種別: 'text' | 'button' | 'sticker' | 画像等の生type。 */
  inputType: string;
  /** 応答の出どころ: 'llm' | 'fallback' | 'template'。 */
  source: string;
  /** ログ用の利用者発話（スタンプ・未対応は内容の説明）。 */
  userText: string;
}

/** メッセージ種別ごとに応答テキストを決める（text/sticker は LLM、他は定型）。 */
async function buildReplyText(
  message: webhook.MessageContent,
): Promise<TurnResult> {
  switch (message.type) {
    case "text": {
      // クイックリプライ（定型ボタン）のタップも text として届く。文言で見分ける。
      const isButton = QUICK_REPLY_LABELS.includes(message.text);
      console.log(
        `${isButton ? "🔘 定型ボタン" : "💬 テキスト"}受信: "${message.text}"`,
      );
      const r = await generateReply(message.text);
      return {
        replyText: r.text,
        inputType: isButton ? "button" : "text",
        source: r.source,
        userText: message.text,
      };
    }
    case "sticker": {
      console.log("💟 スタンプ受信 → あたたかい応答を生成");
      const r = await generateReply(STICKER_HINT);
      return {
        replyText: r.text,
        inputType: "sticker",
        source: r.source,
        userText: `[スタンプ packageId=${message.packageId} stickerId=${message.stickerId}]`,
      };
    }
    case "audio": {
      console.log("🎙️  音声受信 → 文字起こし(STT)");
      const transcript = await transcribeAudioMessage(message.id);
      if (transcript === null) {
        // 取得/文字起こし失敗、または空/極端に短い → 聞き取れなかった定型。
        return {
          replyText: STT_FALLBACK_REPLY,
          inputType: "audio",
          source: "fallback",
          userText: "[音声 文字起こし失敗/空]",
        };
      }
      console.log(`📝 文字起こし: "${transcript}"`);
      // 文字起こしテキストを既存のテキスト経路に流す。
      const r = await generateReply(transcript);
      return {
        replyText: r.text,
        inputType: "audio",
        source: r.source,
        userText: transcript,
      };
    }
    default:
      console.log(`ℹ️  未対応タイプ(${message.type}) → 定型応答`);
      return {
        replyText: UNSUPPORTED_REPLY,
        inputType: message.type,
        source: "template",
        userText: `[${message.type}]`,
      };
  }
}

/** askWithPersona を呼び、失敗時はやさしいフォールバックを返す（生エラーは返さない）。 */
async function generateReply(
  userText: string,
): Promise<{ text: string; source: "llm" | "fallback" }> {
  try {
    const reply = await askWithPersona(userText);
    console.log(`🤖 LLM応答生成: "${reply}"`);
    return { text: reply, source: "llm" };
  } catch (e) {
    console.error(
      `❌ LLM応答生成に失敗 → フォールバック返信: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return { text: FALLBACK_REPLY, source: "fallback" };
  }
}

/**
 * 音声メッセージを取得して文字起こしする。
 * 失敗・空・極端に短い場合は null を返す（呼び出し側でフォールバック）。
 * 例外は内部で握り、サーバを落とさない。
 */
async function transcribeAudioMessage(
  messageId: string,
): Promise<string | null> {
  const blob = getBlobClient();
  if (!blob) {
    console.warn("⚠️  LINE_CHANNEL_ACCESS_TOKEN 未設定のため音声を取得できません。");
    return null;
  }
  try {
    // LINEの音声はm4a。バッファ化してメモリ上で文字起こしする（一時ファイルは作らない）。
    const stream = await blob.getMessageContent(messageId);
    const buffer = await streamToBuffer(stream);
    const text = await transcribeAudio(buffer, "audio.m4a");
    if (text.trim().length < MIN_TRANSCRIPT_LEN) {
      console.warn("⚠️  文字起こし結果が空/極端に短いため聞き取れなかった扱いにします。");
      return null;
    }
    return text.trim();
  } catch (e) {
    console.error(
      `❌ 音声の取得/文字起こしに失敗: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return null;
  }
}

/** Readable ストリームを Buffer に集約する。 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
