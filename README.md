# まごころ

高齢者向けAIコンパニオン（ver1.2）。LINE を入口に、見守りと会話を提供する。

現在は**フェーズ0（疎通優先）**。本リポジトリはまだ「空の器」で、Day1時点では環境変数チェックのみが動く。アプリ機能（LINE Webhook 等）は D2 以降に載せる。

## 必要環境
- Node.js（LTS）
- TypeScript / tsx（開発実行用）

## セットアップ

```bash
# 1. 依存をインストール
npm install

# 2. 環境変数ファイルを作成
cp .env.example .env
#   → .env を開き、最低限 LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET / OPENAI_API_KEY を設定する。
#   （その他のキーは後続日で使うため、空のままでよい）

# 3. 起動（環境変数チェック）
npm run dev
```

- 必須3キーが未設定の場合、警告を出して終了する。
- 必須3キーが揃っていれば「正常に起動しました」と表示される。
- `.env` は `.gitignore` 済み。**実値は絶対にコミットしない**。

各キーの用途と取得元は [docs/ENV.md](docs/ENV.md) を参照。

## スクリプト
| コマンド | 内容 |
| --- | --- |
| `npm run dev` | `src/index.ts` を tsx で実行（環境変数チェック） |
| `npm run build` | TypeScript を `dist/` へビルド |
| `npm start` | ビルド済み `dist/index.js` を実行 |
| `npm run typecheck` | 型チェックのみ（出力なし） |

## 開発方針（1名運用）
- **Chat（仕様・レビュー担当）**: 仕様の検討、設計判断、コードレビュー、受入確認を行う。
- **Code（実装担当）**: Chat で固めた仕様に沿って実装する。
- 1日（D=Day / W=Week）単位で段階的に積み上げる。重い構成は持ち込まず、疎通を優先する。

## ドキュメント
- [docs/PRINCIPLES.md](docs/PRINCIPLES.md) — ver1.2 の設計原則（以降の実装の判断基準）。
- [docs/ENV.md](docs/ENV.md) — 環境変数の用途と取得元。

> 法務文言（利用規約・同意・プライバシー）の確定は専門家確認後（D24 / W23-24）。docs は現時点ではメモ。
