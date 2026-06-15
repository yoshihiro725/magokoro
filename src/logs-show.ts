/**
 * 会話ログ整形表示 (D6) — npm run logs:show
 *
 * 当日（または引数で指定した YYYYMMDD）の logs/conversation-YYYYMMDD.jsonl を読み、
 * 「[時刻] 種別 / 利用者: ... / まごころ: ...」の人が読める形で stdout に出す。
 * レビュー時にそのまま貼り付けられることを狙う。
 *
 *   npm run logs:show            # 当日
 *   npm run logs:show 20260615   # 日付指定
 */

import { readFileSync } from "node:fs";
import { logFilePath } from "./log.js";

interface TurnRecord {
  ts: string;
  source: string;
  inputType: string;
  userHash: string;
  userText: string;
  replyText: string;
}

/** 入力種別の表示名。 */
const INPUT_LABEL: Record<string, string> = {
  text: "テキスト",
  button: "定型ボタン",
  sticker: "スタンプ",
};

/** 応答の出どころの注記（llm は注記なし）。 */
const SOURCE_NOTE: Record<string, string> = {
  fallback: "（フォールバック）",
  template: "（定型）",
};

/** 引数の日付（YYYYMMDD）。無ければ当日。 */
function targetDateStamp(): string {
  const arg = process.argv[2];
  if (arg && /^\d{8}$/.test(arg)) return arg;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** ISO の ts を HH:MM:SS（ローカル）にする。 */
function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString("ja-JP", { hour12: false });
}

function main(): void {
  const stamp = targetDateStamp();
  const path = logFilePath(stamp);

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    console.error(`ログがありません: ${path}`);
    console.error("（まだ会話していないか、日付が違うかもしれません）");
    process.exit(1);
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  console.log(`=== まごころ 会話ログ ${stamp}（${lines.length}ターン）===\n`);

  for (const line of lines) {
    let r: TurnRecord;
    try {
      r = JSON.parse(line);
    } catch {
      console.log(`（解析できない行をスキップ）`);
      continue;
    }
    const time = formatTime(r.ts);
    const kind = INPUT_LABEL[r.inputType] ?? r.inputType;
    const note = SOURCE_NOTE[r.source] ?? "";
    console.log(`[${time}] ${kind}`);
    console.log(`  利用者: ${r.userText}`);
    console.log(`  まごころ${note}: ${r.replyText}`);
    console.log("");
  }
}

main();
