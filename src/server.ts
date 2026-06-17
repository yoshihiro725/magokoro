/**
 * まごころ Webサーバ (Day2 / フェーズ0)
 *
 * - GET  /health  : 死活確認（200 / {status:"ok"}）
 * - POST /webhook : LINE Webhook 受信。署名検証 → イベント処理（オウム返し）
 *
 * 公開URLでの疎通確認は D3。今日はローカルで起動・型・署名検証まで。
 */

import { mkdirSync } from "node:fs";
import express from "express";
import type { webhook } from "@line/bot-sdk";
import { getEnv, loadEnv, missingKeys } from "./env.js";
import { handleEvent, verifyLineSignature } from "./line.js";
import { PUBLIC_AUDIO_DIR } from "./audio.js";

loadEnv();

// 今日の必須env（LINE2キー）。無くても起動はするが警告する（OpenAIキーは不要）。
const REQUIRED_FOR_WEBHOOK = [
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
] as const;
const missing = missingKeys(REQUIRED_FOR_WEBHOOK);
if (missing.length > 0) {
  console.warn(
    `⚠️  必須env未設定: ${missing.join(", ")}\n` +
      "    /webhook の署名検証・返信が正しく動きません（.env に設定してください）。",
  );
}

const PORT = Number(getEnv("PORT") ?? "3000");

const app = express();

// 生成音声(m4a)の静的配信。LINEが取得するので Content-Type を明示する。
// ngrok の警告ページ回避ヘッダも付けておく（LINEの取得には通常不要だが保険）。
mkdirSync(PUBLIC_AUDIO_DIR, { recursive: true });
app.use(
  "/audio",
  express.static(PUBLIC_AUDIO_DIR, {
    setHeaders: (res) => {
      res.setHeader("Content-Type", "audio/m4a");
      res.setHeader("ngrok-skip-browser-warning", "true");
    },
  }),
);

// 死活確認。
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// LINE Webhook。署名検証のため生body(Buffer)で受ける（JSONパース前）。
app.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const channelSecret = getEnv("LINE_CHANNEL_SECRET");
  if (!channelSecret) {
    console.warn("⚠️  LINE_CHANNEL_SECRET 未設定。署名検証ができないため 401。");
    res.status(401).json({ error: "signature verification not configured" });
    return;
  }

  const signature = req.header("x-line-signature");
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body ?? "");

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    console.warn("⚠️  署名検証失敗 → 401（LINE以外からの偽リクエストの可能性）。");
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  // 検証OK。ここで初めて生bodyをJSONパースする。
  let body: { events?: webhook.Event[] };
  try {
    body = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    res.status(400).json({ error: "invalid json" });
    return;
  }

  const events = body.events ?? [];

  // 音声配信用の公開ベースURL。PUBLIC_BASE_URL を優先、無ければヘッダから導出。
  const proto = (req.header("x-forwarded-proto") ?? req.protocol ?? "https")
    .split(",")[0]
    .trim();
  const host = req.header("x-forwarded-host") ?? req.header("host");
  const derivedBase = host ? `${proto}://${host}` : undefined;
  const baseUrl = getEnv("PUBLIC_BASE_URL") ?? derivedBase;

  // まずLINEへ即座に200を返す。応答が遅いと判断されると再配信されるため。
  res.sendStatus(200);

  // 以降は fire-and-forget。レスポンスは返し終えているので処理を待たない。
  // 順序を保つため非同期IIFEで1件ずつ処理し、失敗はログのみ。
  void (async () => {
    for (const event of events) {
      try {
        await handleEvent(event, baseUrl);
      } catch (e) {
        console.error("イベント処理中のエラー:", e);
      }
    }
  })();
});

app.listen(PORT, () => {
  console.log(`✅ listening on http://localhost:${PORT}`);
  console.log("   GET  /health  → 死活確認");
  console.log("   POST /webhook → LINE Webhook（署名検証＋まごころ会話応答）");
});
