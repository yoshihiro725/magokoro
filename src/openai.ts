/**
 * OpenAI クライアントの最小実装 (Day3 / フェーズ0)
 *
 * - APIキーが有効で応答が返るかを確認するための単発呼び出しのみ。
 * - 会話履歴・記憶・ガードレール・ペルソナは未実装（D4以降）。
 * - 秘匿情報（OPENAI_API_KEY）は env 経由でのみ参照する。コードに書かない。
 */

import OpenAI, { toFile } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getEnv } from "./env.js";
import { SYSTEM_PROMPT } from "./persona.js";
import { probeDurationSec } from "./audio.js";

/**
 * 既定モデルは「安価な mini 級の現行モデル」（コスト方針）。
 * OPENAI_MODEL を設定すれば差し替え可能。高価モデルは既定にしない。
 */
export const DEFAULT_MODEL = "gpt-4o-mini";

/** 既定モデル名（環境変数 OPENAI_MODEL があればそちらを優先）。 */
export function getModel(): string {
  return getEnv("OPENAI_MODEL") ?? DEFAULT_MODEL;
}

/**
 * 音声文字起こし(STT)の既定モデル。
 * OPENAI_STT_MODEL を設定すれば差し替え可能（将来 gpt-4o-mini-transcribe 等へ）。
 */
export const DEFAULT_STT_MODEL = "whisper-1";

/** STT モデル名（環境変数 OPENAI_STT_MODEL があればそちらを優先）。 */
export function getSttModel(): string {
  return getEnv("OPENAI_STT_MODEL") ?? DEFAULT_STT_MODEL;
}

/** 音声合成(TTS)の既定モデル・声（.env で差し替え可能）。 */
export const DEFAULT_TTS_MODEL = "tts-1";
export const DEFAULT_TTS_VOICE = "alloy";

export function getTtsModel(): string {
  return getEnv("OPENAI_TTS_MODEL") ?? DEFAULT_TTS_MODEL;
}
export function getTtsVoice(): string {
  return getEnv("OPENAI_TTS_VOICE") ?? DEFAULT_TTS_VOICE;
}

/** STT 幻聴対策のしきい値（.env で調整可能）。 */
function getMinDurationSec(): number {
  const v = Number.parseFloat(getEnv("STT_MIN_DURATION_SEC") ?? "1.0");
  return Number.isNaN(v) ? 1.0 : v;
}
function getMaxNoSpeechProb(): number {
  const v = Number.parseFloat(getEnv("STT_MAX_NO_SPEECH_PROB") ?? "0.6");
  return Number.isNaN(v) ? 0.6 : v;
}

/** Whisper が無音・雑音に対して出しがちな幻聴の定型句（短く完全一致なら空扱い）。 */
const HALLUCINATION_PHRASES = new Set([
  "ご視聴ありがとうございました",
  "ご視聴ありがとうございました。",
  "ご清聴ありがとうございました",
  "ご清聴ありがとうございました。",
  "おわり",
  "終わり",
]);

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
  return chat([{ role: "user", content: prompt }]);
}

/**
 * ペルソナ（システムプロンプト）付きで単発応答を返す。
 * 会話履歴はまだ持たせない（単発）。記憶・履歴は D5 以降。
 *
 * @param userText 利用者の発話
 * @param system 任意。未指定なら persona.ts の SYSTEM_PROMPT を使う。
 * @returns 応答テキスト
 */
export async function askWithPersona(
  userText: string,
  system: string = SYSTEM_PROMPT,
): Promise<string> {
  return chat([
    { role: "system", content: system },
    { role: "user", content: userText },
  ]);
}

/**
 * 音声バッファを文字起こし（STT）してテキストを返す。
 * 失敗は握りつぶさず、ログ出力のうえ再throwする（呼び出し側でフォールバック）。
 *
 * @param buffer 音声データ（LINEの音声はm4a）
 * @param filename 拡張子つきのファイル名（例: "audio.m4a"）。toFile に渡す。
 * @returns 文字起こしテキスト（前後空白を除去）
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  // 幻聴対策その1: 極端に短い音声は Whisper にかけず空扱い（無音での偽文字起こし防止）。
  const minSec = getMinDurationSec();
  try {
    const durationSec = await probeDurationSec(buffer, "m4a");
    if (durationSec < minSec) {
      console.warn(
        `⚠️  音声が短すぎます (${durationSec.toFixed(2)}秒 < ${minSec}秒) → 空扱い。`,
      );
      return "";
    }
  } catch (e) {
    // 長さが測れなくても文字起こし自体は試みる（ガードは後続の no_speech_prob 等に委ねる）。
    console.warn(
      `⚠️  音声長の測定に失敗（処理は継続）: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  const client = new OpenAI({ apiKey });
  const model = getSttModel();

  try {
    // バッファをそのままファイル化（一時ファイルは作らない）。日本語固定。
    // verbose_json で no_speech_prob を取得し、幻聴を弾く。
    const file = await toFile(buffer, filename);
    const result = await client.audio.transcriptions.create({
      file,
      model,
      language: "ja",
      response_format: "verbose_json",
    });

    const text = (result.text ?? "").trim();

    // 幻聴対策その2: no_speech_prob が高い（無音らしい）なら空扱い。
    const segments = result.segments ?? [];
    const maxNoSpeech = segments.reduce(
      (m, s) => Math.max(m, s.no_speech_prob ?? 0),
      0,
    );
    if (segments.length > 0 && maxNoSpeech > getMaxNoSpeechProb()) {
      console.warn(
        `⚠️  no_speech_prob が高い (${maxNoSpeech.toFixed(2)}) → 空扱い。`,
      );
      return "";
    }

    // 幻聴対策その3: 既知の幻聴定型句に短く完全一致なら空扱い。
    if (HALLUCINATION_PHRASES.has(text)) {
      console.warn(`⚠️  幻聴定型句に一致 ("${text}") → 空扱い。`);
      return "";
    }

    return text;
  } catch (e) {
    console.error(
      `❌ 音声文字起こしに失敗しました (model=${model}): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    throw e;
  }
}

/**
 * テキストを音声(mp3)に合成して返す（OpenAI TTS）。
 * m4a への変換・長さ取得は audio.ts 側で行う（ここは OpenAI 呼び出しに専念）。
 * 失敗は握りつぶさず、ログ出力のうえ再throw。
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const client = new OpenAI({ apiKey });
  const model = getTtsModel();
  const voice = getTtsVoice();

  try {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: "mp3",
    });
    return Buffer.from(await response.arrayBuffer());
  } catch (e) {
    console.error(
      `❌ 音声合成に失敗しました (model=${model}, voice=${voice}): ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    throw e;
  }
}

/**
 * 共通の chat completion 実行。
 * キー未設定は MissingApiKeyError。API失敗は握りつぶさずログ出力のうえ再throw。
 */
async function chat(messages: ChatCompletionMessageParam[]): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const client = new OpenAI({ apiKey });
  const model = getModel();

  try {
    const completion = await client.chat.completions.create({ model, messages });
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
