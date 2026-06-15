/**
 * レビュー用 会話ログ (D6) — 開発支援のローカルログ。ユーザー向け機能ではない。
 *
 * - 各ターン（入力/応答）を logs/conversation-YYYYMMDD.jsonl に1行JSONで追記する。
 * - 会話内容は要配慮個人情報になり得るため、logs/ は絶対にコミットしない（.gitignore済）。
 * - userId 等の識別子は生値を残さず、ハッシュ化して保存する。
 * - APIキー等の秘匿情報はログに出さない。
 *
 * 注: 実ユーザーの会話を記録する段階（PoC以降）では、同意取得・保存範囲・削除方針
 *     （事業計画9-4）に沿った設計へ作り直す前提。
 */

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** ログ保存ディレクトリ（プロジェクト直下 logs/）。 */
const LOG_DIR = join(process.cwd(), "logs");

/** 1ターンの記録。userId は任意で、保存時にハッシュ化される。 */
export interface TurnInput {
  /** ISO8601 のタイムスタンプ。 */
  ts: string;
  /** 応答の出どころ: 'llm' | 'fallback' | 'template' など。 */
  source: string;
  /** 入力種別: 'text' | 'sticker' | 'button' | 画像等の生type。 */
  inputType: string;
  /** 利用者の発話（スタンプ等は内容の説明）。 */
  userText: string;
  /** まごころの応答テキスト。 */
  replyText: string;
  /** LINE の userId（生値。保存時にハッシュ化し、生値は残さない）。 */
  userId?: string;
}

/** userId を短いハッシュにする（生値を残さないため）。 */
function maskUserId(userId: string | undefined): string {
  if (!userId) return "anon";
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

/** ts（ISO）から YYYYMMDD（ローカル日付）を作る。 */
function dateStampFromTs(ts: string): string {
  const d = new Date(ts);
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = valid.getFullYear();
  const m = String(valid.getMonth() + 1).padStart(2, "0");
  const day = String(valid.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** 指定日（YYYYMMDD）のログファイルパス。 */
export function logFilePath(dateStamp: string): string {
  return join(LOG_DIR, `conversation-${dateStamp}.jsonl`);
}

/**
 * 1ターンを logs/conversation-YYYYMMDD.jsonl に追記する。
 * 失敗してもアプリ本体（会話応答）を止めないよう、例外は内部で握ってログに出す。
 */
export function appendTurn(input: TurnInput): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const record = {
      ts: input.ts,
      source: input.source,
      inputType: input.inputType,
      userHash: maskUserId(input.userId),
      userText: input.userText,
      replyText: input.replyText,
    };
    const path = logFilePath(dateStampFromTs(input.ts));
    appendFileSync(path, JSON.stringify(record) + "\n", "utf-8");
  } catch (e) {
    // ログ記録の失敗は会話応答に影響させない。
    console.error(
      `⚠️  会話ログの追記に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
