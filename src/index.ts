/**
 * まごころ — 環境変数チェック (Day1 / フェーズ0)
 *
 * 「空の器」が正しく起動し、必要な秘匿情報が環境変数から読めているかを確認する。
 * Webサーバ本体は src/server.ts（Day2-）。このスクリプトは env 単体チェック用。
 *   実行: npm run check:env
 *
 * 必須（このチェック時点）: LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET / OPENAI_API_KEY
 * それ以外は後続日で使用するため、未設定でも情報ログのみ（起動は止めない）。
 */

import { isSet, loadEnv, missingKeys } from "./env.js";

loadEnv();

/** 必須キー。未設定なら警告して終了する。 */
const REQUIRED_KEYS = [
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_CHANNEL_SECRET",
  "OPENAI_API_KEY",
] as const;

/** 後続日で使用するキー。未設定でも止めない（情報ログのみ）。 */
const UPCOMING_KEYS: { key: string; usedFrom: string }[] = [
  { key: "STT_API_KEY", usedFrom: "D7-8 音声STT" },
  { key: "TTS_API_KEY", usedFrom: "D7-8 音声TTS" },
  { key: "MEM0_API_KEY", usedFrom: "W9- 記憶" },
  { key: "UPSTASH_REDIS_REST_URL", usedFrom: "W9- セッション" },
  { key: "UPSTASH_REDIS_REST_TOKEN", usedFrom: "W9- セッション" },
  { key: "STRIPE_SECRET_KEY", usedFrom: "W15- 課金" },
  { key: "MAIL_API_KEY", usedFrom: "W13- 見守り通知(メール)" },
];

console.log("=== まごころ 環境変数チェック (Day1) ===");

const missingRequired = missingKeys(REQUIRED_KEYS);

for (const k of REQUIRED_KEYS) {
  console.log(`${isSet(k) ? "✅" : "❌"} [必須] ${k}`);
}

for (const { key, usedFrom } of UPCOMING_KEYS) {
  if (isSet(key)) {
    console.log(`✅ [後続] ${key}`);
  } else {
    console.info(`ℹ️  [後続] ${key} は未設定（後続日で使用: ${usedFrom}）`);
  }
}

if (missingRequired.length > 0) {
  console.warn(
    `\n⚠️  必須キーが未設定です: ${missingRequired.join(", ")}\n` +
      "    .env.example をコピーして .env を作成し、値を設定してください（cp .env.example .env）。",
  );
  process.exit(1);
}

console.log("\n✅ 必須キーは揃っています。フェーズ0の器は正常に起動しました。");
