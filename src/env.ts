/**
 * 環境変数ユーティリティ（Day1のチェックロジックを共有可能な形に切り出し）。
 *
 * - .env の読み込みは Node.js 標準（dotenv 等の依存は入れない）。
 * - 秘匿情報はすべてここ経由で process.env から読む。コードにハードコードしない。
 */

let loaded = false;

/** .env を一度だけ読み込む。無くてもエラーにしない。 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  try {
    process.loadEnvFile();
  } catch {
    console.info("ℹ️  .env が見つかりません（環境変数から直接読み込みます）。");
  }
}

/** 環境変数が「空でない文字列」として設定されているか。 */
export function isSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** 必須キーのうち未設定のものを返す（ログは出さない）。 */
export function missingKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => !isSet(k));
}

/** 環境変数を取得。未設定なら undefined。 */
export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}
