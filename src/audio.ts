/**
 * 音声まわりの infra ヘルパ (D8) — ffmpeg/ffprobe と公開音声ファイルの管理。
 *
 * - leaf モジュール（openai 等を import しない）。openai.ts / line.ts から利用される。
 * - 生成音声・中間ファイルは要配慮個人情報になり得る。公開ディレクトリは .gitignore 済で、
 *   古いファイルは自動削除する。中間ファイルは都度削除する。
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 生成音声(m4a)を配信する公開ディレクトリ。Express の静的ルートで配信する。 */
export const PUBLIC_AUDIO_DIR = join(process.cwd(), "public", "audio");

// ffmpeg/ffprobe は PATH に依存せず絶対パスで呼ぶ（spawn の ENOENT 回避）。
// 環境が違う場合のみ FFMPEG_PATH / FFPROBE_PATH で上書き。既定は Apple Silicon Homebrew の標準位置。
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH ?? "/opt/homebrew/bin/ffprobe";

/** コマンドを実行し、stdout を返す（シェルを介さない）。 */
function run(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/** ファイルの長さ（秒）を ffprobe で取得する。 */
async function probeDurationSecFromFile(path: string): Promise<number> {
  const { stdout } = await run(FFPROBE_PATH, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const sec = Number.parseFloat(stdout.trim());
  if (Number.isNaN(sec)) throw new Error(`ffprobe: 長さを取得できません (${stdout})`);
  return sec;
}

/** バッファ（音声）の長さ（秒）を ffprobe で測る。中間ファイルは削除する。 */
export async function probeDurationSec(
  buffer: Buffer,
  ext: string,
): Promise<number> {
  const tmp = join(tmpdir(), `magokoro-probe-${randomUUID()}.${ext}`);
  try {
    await writeFile(tmp, buffer);
    return await probeDurationSecFromFile(tmp);
  } finally {
    await rm(tmp, { force: true });
  }
}

/**
 * mp3 バッファを m4a(AAC) に変換して公開ディレクトリへ保存する。
 * @returns 保存したファイル名と長さ（ミリ秒）
 */
export async function saveM4aFromMp3(
  mp3Buffer: Buffer,
): Promise<{ fileName: string; durationMs: number }> {
  mkdirSync(PUBLIC_AUDIO_DIR, { recursive: true });
  const id = randomUUID();
  const tmpMp3 = join(tmpdir(), `magokoro-tts-${id}.mp3`);
  const fileName = `${id}.m4a`;
  const outPath = join(PUBLIC_AUDIO_DIR, fileName);
  try {
    await writeFile(tmpMp3, mp3Buffer);
    // mp3 → m4a(AAC)。faststart でストリーミング再生しやすくする。
    await run(FFMPEG_PATH, [
      "-y",
      "-i",
      tmpMp3,
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-movflags",
      "+faststart",
      outPath,
    ]);
    const sec = await probeDurationSecFromFile(outPath);
    return { fileName, durationMs: Math.max(1, Math.round(sec * 1000)) };
  } finally {
    // 中間ファイル(mp3)は必ず削除する。
    await rm(tmpMp3, { force: true });
  }
}

/** 公開ディレクトリの古い音声（既定: 30分以上前）を削除する。best-effort。 */
export async function cleanupOldAudio(
  maxAgeMs: number = 30 * 60 * 1000,
): Promise<void> {
  try {
    const now = Date.now();
    const files = await readdir(PUBLIC_AUDIO_DIR);
    for (const f of files) {
      const p = join(PUBLIC_AUDIO_DIR, f);
      try {
        const s = await stat(p);
        if (now - s.mtimeMs > maxAgeMs) await rm(p, { force: true });
      } catch {
        // 個別の削除失敗は無視（次回再試行）。
      }
    }
  } catch {
    // ディレクトリ未作成などは無視。
  }
}
