/**
 * OpenAI 接続テスト (Day3) — npm run test:openai
 *
 * 固定プロンプトを askOnce で1回投げ、応答をコンソールに出力する。
 * OPENAI_API_KEY が未設定なら、その旨を明示してエラー終了する。
 */

import { loadEnv } from "./env.js";
import { askOnce, getModel, MissingApiKeyError } from "./openai.js";

loadEnv();

const PROMPT = "こんにちは。10文字以内で挨拶してください。";

async function main(): Promise<void> {
  console.log("=== OpenAI 接続テスト (Day3) ===");
  console.log(`モデル: ${getModel()}`);
  console.log(`プロンプト: ${PROMPT}`);

  const reply = await askOnce(PROMPT);

  console.log("--- 応答 ---");
  console.log(reply);
  console.log("✅ OpenAI への接続に成功しました。");
}

main().catch((e) => {
  if (e instanceof MissingApiKeyError) {
    console.error(`\n❌ ${e.message}`);
    console.error(
      "    .env に OPENAI_API_KEY を設定してから再実行してください（例: OPENAI_API_KEY=sk-...）。",
    );
    process.exit(1);
  }
  // それ以外（認証/レート制限/課金未設定など）も明示して終了。
  console.error(
    `\n❌ 接続テストに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
  );
  process.exit(1);
});
