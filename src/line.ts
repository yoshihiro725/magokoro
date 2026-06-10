/**
 * LINE Webhook の署名検証とイベント処理（Day2 / オウム返しの雛形）。
 *
 * - 署名検証は「JSONパース前の生body(Buffer)」で行う（崩さないこと）。
 * - 今日はLLMに接続しない。テキストメッセージを同じ内容でオウム返しするだけ。
 * - 秘匿情報は env 経由でのみ参照する。
 */

import { messagingApi, validateSignature, webhook } from "@line/bot-sdk";
import { getEnv } from "./env.js";

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

/**
 * 1イベントを処理する。
 * type=message かつ message.type=text のときだけ、同じテキストをオウム返しする。
 * それ以外は対象外としてログのみ。
 */
export async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type !== "message" || event.message.type !== "text") {
    const messageType =
      event.type === "message" ? event.message.type : "(non-message)";
    console.log(`ℹ️  対象外イベント: type=${event.type} message=${messageType}`);
    return;
  }

  const text = event.message.text;
  // エコー対象を確定し、ログに残す（送信が失敗しても確認できるように先に出す）。
  console.log(`🔁 オウム返し対象: "${text}"`);

  // replyToken はLINE仕様上オプショナル。無ければ返信できない。
  if (!event.replyToken) {
    console.warn("⚠️  replyToken が無いため返信できません（エコー対象は確定済み）。");
    return;
  }
  const replyToken = event.replyToken;

  const c = getClient();
  if (!c) {
    console.warn(
      "⚠️  LINE_CHANNEL_ACCESS_TOKEN 未設定のため送信スキップ（エコー対象は確定済み）。",
    );
    return;
  }

  try {
    await c.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
    console.log("✅ 返信送信成功（オウム返し）。");
  } catch (e) {
    // ダミートークン等で送信失敗してもハンドラ到達は確認できる。
    console.warn(
      `⚠️  返信送信に失敗（トークンがダミー/無効の可能性）: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}
