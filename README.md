# まごころ

高齢者向けAIコンパニオン（ver1.2）。LINE を入口に、見守りと会話を提供する。

現在は**フェーズ0（疎通優先）**。Day2 時点で LINE Webhook を受け取る Webサーバの雛形（署名検証＋オウム返し）まで動く。LLM接続・記憶・見守りは D3 以降。

## 必要環境
- Node.js（LTS）
- TypeScript / tsx（開発実行用）

## セットアップ

```bash
# 1. 依存をインストール
npm install

# 2. 環境変数ファイルを作成
cp .env.example .env
#   → .env を開き、LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET を設定する。
#   （Day2 では OpenAIキーは不要。その他のキーも後続日で使うため空のままでよい）

# 3. Webサーバを起動
npm run dev
```

- 起動すると `✅ listening on http://localhost:3000` が表示される。
- `PORT` 環境変数で待受ポートを変更できる（未設定なら 3000）。
- LINE2キーが未設定でも起動はするが、警告が出て `/webhook` の署名検証・返信は動かない。
- env 単体チェックだけしたい場合は `npm run check:env`（必須3キーの状態を表示）。
- `.env` は `.gitignore` 済み。**実値は絶対にコミットしない**。

各キーの用途と取得元は [docs/ENV.md](docs/ENV.md) を参照。

## エンドポイント

| メソッド / パス | 説明 |
| --- | --- |
| `GET /health` | 死活確認。`200` と `{"status":"ok"}` を返す。 |
| `POST /webhook` | LINE Webhook 受信。`X-Line-Signature` を Channel secret で HMAC-SHA256 検証し、不正なら `401`。検証OKなら各イベントを処理し `200` を返す。テキストメッセージは同じ内容で**オウム返し**（D3以降にLLM接続予定）。 |

署名検証は **JSONパース前の生body（Buffer）** に対して行う。LINE以外からの偽リクエストはここで弾く。

### ローカルでの署名付きテスト手順

サーバ起動後、別ターミナルで：

```bash
# 1) 死活確認
curl -i http://localhost:3000/health        # → 200 {"status":"ok"}

# 2) 署名NG（ヘッダ無し）→ 401
curl -i -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" -d '{"events":[]}'

# 3) 署名OK → 200（サーバログにオウム返し対象が出る）
SECRET=$(grep -E "^LINE_CHANNEL_SECRET=" .env | cut -d= -f2-)
BODY='{"events":[{"type":"message","replyToken":"dummyReplyToken","message":{"type":"text","text":"こんにちは"}}]}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256',process.argv[1]).update(Buffer.from(process.argv[2],'utf8')).digest('base64'))" "$SECRET" "$BODY")
curl -i -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" -H "X-Line-Signature: $SIG" -d "$BODY"
```

> 3) では本物のアクセストークンでないと実際の返信送信は失敗する（ログに「返信送信に失敗」と出る）。
> 今日の確認範囲は、署名検証を通過し**オウム返し対象が確定する**ところまで。

## OpenAI 接続テスト

OpenAI の APIキーが有効で応答が返るかを、単発呼び出しで確認する。

```bash
npm run test:openai
```

- `.env` に `OPENAI_API_KEY` があれば、実際に OpenAI へ問い合わせて応答テキストを表示する。
- `OPENAI_API_KEY` が未設定／空なら「`OPENAI_API_KEY が未設定`」と明示して `exit 1` で終了する。
- モデルは既定で安価な mini 級（`gpt-4o-mini`）。`OPENAI_MODEL` 環境変数で差し替え可能。
- これは接続確認専用の単発呼び出し。会話履歴・記憶・回想療法プロンプト・ガードレールは D4 以降に実装する（今日は Webhook に LLM を組み込まない）。

## スクリプト
| コマンド | 内容 |
| --- | --- |
| `npm run dev` | `src/server.ts` を tsx で実行（Webサーバ起動） |
| `npm run check:env` | `src/index.ts` を実行（環境変数の単体チェック） |
| `npm run test:openai` | `src/test-openai.ts` を実行（OpenAI 接続テスト） |
| `npm run build` | TypeScript を `dist/` へビルド |
| `npm start` | ビルド済み `dist/server.js` を実行 |
| `npm run typecheck` | 型チェックのみ（出力なし） |

## 開発方針（1名運用）
- **Chat（仕様・レビュー担当）**: 仕様の検討、設計判断、コードレビュー、受入確認を行う。
- **Code（実装担当）**: Chat で固めた仕様に沿って実装する。
- 1日（D=Day / W=Week）単位で段階的に積み上げる。重い構成は持ち込まず、疎通を優先する。

## ドキュメント
- [docs/PRINCIPLES.md](docs/PRINCIPLES.md) — ver1.2 の設計原則（以降の実装の判断基準）。
- [docs/ENV.md](docs/ENV.md) — 環境変数の用途と取得元。

> 法務文言（利用規約・同意・プライバシー）の確定は専門家確認後（D24 / W23-24）。docs は現時点ではメモ。
