# 環境変数一覧 (ENV)

`.env.example` の各キーの用途と取得元。実値は `.env` にのみ書き、**コミットしない**。

| キー | 用途 | 取得元（サービス） | 使用開始 | 必須(Day1) |
| --- | --- | --- | --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API でメッセージ送受信 | LINE Developers Console（Messaging APIチャネル） | D2- | ✅ |
| `LINE_CHANNEL_SECRET` | LINE Webhook の署名検証 | LINE Developers Console（Messaging APIチャネル） | D2- | ✅ |
| `OPENAI_API_KEY` | LLM による応答生成 | OpenAI Platform（API keys） | D3- | ✅ |
| `OPENAI_MODEL` | 使用モデル名の上書き（任意。未設定なら `gpt-4o-mini`） | 設定値（取得不要） | D3-（任意） | — |
| `OPENAI_STT_MODEL` | 音声文字起こし(STT)モデルの上書き（任意。未設定なら `whisper-1`）。`OPENAI_API_KEY` を共用 | 設定値（取得不要） | D7-（任意） | — |
| `OPENAI_TTS_MODEL` | 音声合成(TTS)モデルの上書き（任意。未設定なら `tts-1`）。`OPENAI_API_KEY` を共用 | 設定値（取得不要） | D8-（任意） | — |
| `OPENAI_TTS_VOICE` | 音声合成(TTS)の声の上書き（任意。未設定なら `alloy`） | 設定値（取得不要） | D8-（任意） | — |
| `STT_MIN_DURATION_SEC` | STT幻聴対策: この秒数未満は文字起こししない（任意。未設定なら `1.0`） | 設定値（取得不要） | D8-（任意） | — |
| `STT_MAX_NO_SPEECH_PROB` | STT幻聴対策: no_speech_prob がこの値超なら空扱い（任意。未設定なら `0.6`） | 設定値（取得不要） | D8-（任意） | — |
| `PUBLIC_BASE_URL` | 生成音声をLINEに取得させる公開ベースURL（任意。未設定ならリクエストヘッダから導出） | ngrok等の公開URL | D8-（任意） | — |
| `FFMPEG_PATH` | ffmpeg実行ファイルの絶対パス（任意。未設定なら `/opt/homebrew/bin/ffmpeg`） | `which ffmpeg` | D8-（任意） | — |
| `FFPROBE_PATH` | ffprobe実行ファイルの絶対パス（任意。未設定なら `/opt/homebrew/bin/ffprobe`） | `which ffprobe` | D8-（任意） | — |
| `STT_API_KEY` | 音声→テキスト（STT） | 音声STTプロバイダ（D7-8で選定） | D7-8 | — |
| `TTS_API_KEY` | テキスト→音声（TTS） | 音声TTSプロバイダ（D7-8で選定） | D7-8 | — |
| `MEM0_API_KEY` | 長期記憶ストア | mem0（mem0.ai） | W9- | — |
| `UPSTASH_REDIS_REST_URL` | セッション/短期状態の保存先 | Upstash（Redis REST） | W9- | — |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis の認証トークン | Upstash（Redis REST） | W9- | — |
| `STRIPE_SECRET_KEY` | 課金・サブスクリプション | Stripe Dashboard（API keys） | W15- | — |
| `MAIL_API_KEY` | 見守り通知のメール送信（二重化） | メール送信サービス（W13で選定） | W13- | — |

## メモ
- **必須(Day1)** が ✅ の3キーは、未設定だと `npm run dev` が警告して終了する。
- それ以外のキーは未設定でもよい（起動時に「後続日で使用」と情報ログ表示）。
- キーが増えたら `.env.example` / この表 / `src/index.ts` の3か所を揃える。
