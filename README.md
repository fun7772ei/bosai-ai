> PR #18の継続改善：[会話の文脈・対象行動の評価結果](docs/phase2-conversation-improvement.md)。P1/P2を修正し、実Ruriで別の未使用会話を評価。否定した場面の候補や未収録の誤提示は残っており、公開・安全性完成とは扱いません。main/Pages未反映、Moonshineは今回変更なし。

> 開発中：Phase 2 αの[文字会話試作と評価](docs/phase2-conversation-alpha.md)。既存検索から切替、文脈/聞き返し/原文参照に対応。新規PRでレビュー中、main/公開Pagesには未反映。自由生成なし。検索の危険な取り違えは未解決で、正式完成ではありません。MoonshineのIssue #16は別トラック・未修正です。

# ぼうさい辞書 AI — Ruri優先ベータ版

**公開URL： https://fun7772ei.github.io/bosai-ai/**

ベータ版 `f41848b50937` を公開済み。[公開・実モデル保存検証の記録](docs/ruri-beta.md#公開結果2026-10-14-utc)。

88件の防災情報を自然な日本語で探す、端末内検索のベータ版。既定は軽量検索＋Ruri-v3-30m、Ruri単独・モデル不要の軽量検索も選べる。AIは関連候補を探し、選択した項目の概要・全手順・注意・出典を**原文で表示**する。自由生成した防災回答は公開版で実行しない。

現在の災害状況・警報・予報・避難所の開設状況は確認できない。個人の診断や投薬量、安全性を判断するアプリではない。候補が出ても、質問への具体的な答えが収録されている保証はない。iPad第10世代/iPadOS26.5 SafariとオフラインPWAが最終目標だが、実機の安定性・防災上の安全性は未確認で、正式完成ではない。

使い方：

1. 状況を入力して検索し、関連候補を選んで原文と注意事項を見る。
2. AI検索には「AIモデルを保存」で約44MBを一度明示取得。未保存・保存失敗・初期化失敗時も軽量検索を利用できる。
3. アプリ本体・辞書・事前計算EmbeddingはPWA cache、RuriはIndexedDBへ保存する。保存済みモデルを再ダウンロードせず使い、解放/更新で旧モデルを自動削除しない。
4. Safari通常タブとホーム画面PWAは保存状態を別々に確認する。アプリ削除・再インストールは不要。

[評価・失敗例・容量/速度/メモリ・実機最小手順](docs/ruri-beta.md) / [引き継ぎ](CLOUD_HANDOFF.md)。レビュー修正後の未使用60問では併用Top-1 31/36、Top-3 35/36。未収録の明示棄却9/16で、危険な候補取り違えも残る。Chromiumの成功をiPad Safari成功とは扱わない。

## 開発と検証

Node.js24以降。

```bash
npm ci
npm test
npm run build
node scripts/check-public-build.mjs
npm run preview -- --port 4173 --strictPort
```

http://localhost:4173/bosai-ai/ 。実Ruriのブラウザ・オフライン・更新試験は上記評価資料を参照。重みは明示取得してGit対象外の`test-results/`へ置く。外部AI APIは使用しない。アプリ配信はGitHub Pages、初回モデル取得はHugging Face。出典を開くと外部サイトへ移動する。

`fun7772ei/bosai-app`の固定commitの88件をコピーして同梱。元リポジトリ・原文は変更せず、実行時にGitHubへ同期しない。`node scripts/import-bosai-data.mjs --check`で全フィールド・ID・順序を照合する。Ruriのrevision/bytes/SHAは`src/aux-assets.json`、原データの来歴は`docs/source/`。

## 研究用コード

PR #6〜#9の通常生成・保存・モデル選択・比較コードと、既存GGUF/ONNXの保存は維持する。公開ビルドには実行コード/LLM用WASMを含めない。

- `npm run dev:research`：ローカルの`/bosai-ai/research.html`。
- `npm run build:research`：`research-dist/`に明示出力。Pages配信対象外。
- 過去の[6方式](docs/phase1-six-methods.md)・[4モデル](docs/phase1-four-cpu-models.md)・[品質](docs/phase1-cpu-quality.md)・[検索](docs/phase1-search-prototype.md)比較は履歴。現在の公開用方針はRuri＋原文である。

RuriはApache-2.0、研究用LFMはLFM Open License。利用条件を混同しない。正式Phase 2への移行は行っていない。
