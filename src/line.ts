/**
 * LINE Webhook の署名検証とイベント処理（Day5 / 会話プロト）。
 *
 * - 署名検証は「JSONパース前の生body(Buffer)」で行う（崩さないこと）。
 * - テキスト/スタンプは askWithPersona（まごころの人格）で応答を生成して返す。
 *   未対応タイプ（画像・音声など）はやさしい定型を返す（音声はD7-8）。
 * - 返信にはシニアが押しやすいクイックリプライ（定型ボタン）を添える。
 * - LLM失敗時は生エラーを返さず、やさしいフォールバックを返す。
 * - 会話履歴・長期記憶は持たせない（単発。記憶はW9）。秘匿情報は env 経由のみ。
 */

import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getEnv } from "./env.js";
import { askWithPersona } from "./openai.js";

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

/** スタンプ受信時に askWithPersona へ渡すヒント（利用者発話の代わり）。 */
const STICKER_HINT =
  "（利用者がスタンプを送ってくれました。言葉ではなく気持ちの表現です。あたたかく受け止めて、短い問いかけで会話をやさしく続けてください。）";

/** 未対応タイプ（画像・音声など）へのやさしい定型。音声はD7-8で対応予定。 */
const UNSUPPORTED_REPLY =
  "メッセージをありがとうございます。文字か、下のボタンでもお話できますよ。";

/** LLM呼び出しが失敗したときのやさしいフォールバック（生エラーは返さない）。 */
const FALLBACK_REPLY =
  "ごめんなさい、少し調子が悪いみたいです。もう一度お話しいただけますか。";

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
  if (event.type !== "message") {
    console.log(`ℹ️  対象外イベント: type=${event.type}`);
    return;
  }

  const message = event.message;
  // 応答テキストを先に確定する（送信が失敗してもログで確認できるように）。
  const replyText = await buildReplyText(message);

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
  }
}

/** メッセージ種別ごとに応答テキストを決める（text/sticker は LLM、他は定型）。 */
async function buildReplyText(
  message: webhook.MessageContent,
): Promise<string> {
  switch (message.type) {
    case "text":
      console.log(`💬 テキスト受信: "${message.text}"`);
      return generateReply(message.text);
    case "sticker":
      console.log("💟 スタンプ受信 → あたたかい応答を生成");
      return generateReply(STICKER_HINT);
    default:
      console.log(`ℹ️  未対応タイプ(${message.type}) → 定型応答`);
      return UNSUPPORTED_REPLY;
  }
}

/** askWithPersona を呼び、失敗時はやさしいフォールバックを返す（生エラーは返さない）。 */
async function generateReply(userText: string): Promise<string> {
  try {
    const reply = await askWithPersona(userText);
    console.log(`🤖 LLM応答生成: "${reply}"`);
    return reply;
  } catch (e) {
    console.error(
      `❌ LLM応答生成に失敗 → フォールバック返信: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return FALLBACK_REPLY;
  }
}
