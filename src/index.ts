/**
 * まごころ — 環境変数チェック (Day1 / フェーズ0)
 *
 * 今日はアプリ機能を実装しない。「空の器」が正しく起動し、
 * 必要な秘匿情報が環境変数から読めているかだけを確認する。
 *
 * 必須（今日時点）: LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET / OPENAI_API_KEY
 * それ以外は後続日で使用するため、未設定でも情報ログのみ（起動は止めない）。
 */

// .env を読み込む（Node.js 標準。dotenv 等の依存は入れない）。
// .env が無くても起動できるよう、失敗は握りつぶす。
try {
  process.loadEnvFile();
} catch {
  console.info("ℹ️  .env が見つかりません（環境変数から直接読み込みます）。");
}

/** 今日の必須キー。未設定なら警告して終了する。 */
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

const isSet = (name: string): boolean => {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
};

console.log("=== まごころ 環境変数チェック (Day1) ===");

// 必須キーの確認
const missingRequired = REQUIRED_KEYS.filter((k) => !isSet(k));

for (const k of REQUIRED_KEYS) {
  console.log(`${isSet(k) ? "✅" : "❌"} [必須] ${k}`);
}

// 後続キーの確認（未設定OK）
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
