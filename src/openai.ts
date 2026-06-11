/**
 * OpenAI クライアントの最小実装 (Day3 / フェーズ0)
 *
 * - APIキーが有効で応答が返るかを確認するための単発呼び出しのみ。
 * - 会話履歴・記憶・ガードレール・ペルソナは未実装（D4以降）。
 * - 秘匿情報（OPENAI_API_KEY）は env 経由でのみ参照する。コードに書かない。
 */

import OpenAI from "openai";
import { getEnv } from "./env.js";

/**
 * 既定モデルは「安価な mini 級の現行モデル」（コスト方針）。
 * OPENAI_MODEL を設定すれば差し替え可能。高価モデルは既定にしない。
 */
export const DEFAULT_MODEL = "gpt-4o-mini";

/** 既定モデル名（環境変数 OPENAI_MODEL があればそちらを優先）。 */
export function getModel(): string {
  return getEnv("OPENAI_MODEL") ?? DEFAULT_MODEL;
}

/** APIキーが無ければ分かりやすいメッセージで投げる専用エラー。 */
export class MissingApiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY が未設定です（.env に設定してください）。");
    this.name = "MissingApiKeyError";
  }
}

/**
 * 単発の chat completion を投げ、応答テキストを返す。
 * 失敗（認証エラー/レート制限/課金未設定など）は握りつぶさず、ログ出力のうえ再throwする。
 *
 * @param prompt ユーザープロンプト
 * @returns 応答テキスト
 */
export async function askOnce(prompt: string): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const client = new OpenAI({ apiKey });
  const model = getModel();

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    const text = completion.choices[0]?.message?.content ?? "";
    return text.trim();
  } catch (e) {
    // 認証/レート制限/課金未設定などをそのまま見えるようにする。
    console.error(
      `❌ OpenAI 呼び出しに失敗しました (model=${model}): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    throw e;
  }
}
