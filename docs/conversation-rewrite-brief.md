# 会話エンジン再設計：Codex向け実装契約（2026-10-15）

対象: `fun7772ei/bosai-ai`。現在の公開版は PR #18 が `main` に統合済み（`782ccdce`）。この文書は**再実装の目標**であり、実装完了を主張するものではない。`AGENTS.md` の製品要件を優先し、過去の `CLOUD_*.md` の「変更禁止」「PR #18のまま」「公開禁止」は当時の履歴として扱う。

## 本当に解決したい問題

新しい不具合のたびに既存分岐へ正規表現と例外処理を追加し、回帰テストを新設している。コード規模よりも「同じ問いが複数の層で別々に解釈される」ことが変更コストの原因。

**現状の重複 / 責務の衝突**（確認したソース）:

| 観点 | 今ある場所 | 改善指針 |
| --- | --- | --- |
| 非対応質問・リアルタイム/個別判断 | `src/conversation.js:coverage()`, `src/question-intent.js:classifyAnswerRequest()`, `src/query-scope.js:assessQuestion()` | 呼び出し元のUIに依存しない**共通の判定API**。Ruri初期化前に一度判定し、検索後の判定は同じ結果を再利用 |
| 否定・疑問・訂正・文脈 | `src/conversation.js:conditions()`, `src/conversation-context.js:factsIn()/mergeFacts()/focusFor()` | 事実/否定/不明/質問/誰の事実かを明示した型付き解析結果に集約。文字列結合で古い肯定条件が復活しないこと |
| 原文の候補昇格と適用判定 | `src/conversation-evidence.js:contextualEvidence()`, `src/conversation-applicability.js:assessApplicability()` | **検索関連度 ≠ 原文の適用可能性**を統一。候補の根拠と不確実性、明示的に否定された前提を一か所で評価 |
| 検索判定の繰り返し | `src/beta-controller.js:search()` と `src/beta-search.js:retrieve()` | 同一スコープ結果を引き回す。検索モードだけが変わっても非対応判定が食い違わないようにする |
| 推論・保存・UI | `src/beta-controller.js`, `src/ruri-client.js`, `src/conversation-ui.js`, `src/beta-main.js` | 対話判断ロジックから分離したアダプタ。保存済みRuriやMoonshineの既存データを黙って消さない |

## 推奨される新しい構造（変更可）

```text
userText / optional voice transcript
       |
understandRequest(text, previousState)
  -> intent: general | live | individual | unsupported | ambiguous
  -> facts: { key: {value: true|false|null|..., sourceTurn, subject}, ... }
  -> topics, denials, uncertainty, corrections, references
       |
decideRoute(understanding, state) -> unsupported | clarify | retrieve | selected-source
       |
retrieve(query, {mode, scope}) -> lexical / Ruri / fallback
       |
assessEvidence(candidate, explicitFacts, reviewedSidecars)
       |
typed ResponseDecision -> original-source | candidates | clarify | unsupported | no-evidence
       |
UI (原文全文・注意・出典、ユーザーが候補を明示選択)
```

ここでの関数名・ファイル構成は例。TypeScript導入は必須ではなく、まずは小さな純粋関数と明示的な入出力形で十分。**現在の内部APIや正規表現を維持する義務はない。** 設計を説明したあと、不要な旧ロジックを置き換える。旧コードをただラップして分岐を増やすのは目的に反する。

### 原文の扱いで特に重要

`src/conversation-applicability.json` の **88件中、適用前提の検証済みは4件**（`bosai-2`, `bosai-69`, `bosai-70`, `bosai-71`）。残り84件は暫定的なタイトル・概要の注記であって、適用可能と検証されたわけではない。`bosai-84` の `flood-footwear` も暫定。全件を「検証済み」に昇格させたり、ベクトル類似度だけで「回答済み」としてはならない。未確認のものは未確認として表示し、未知の前提はユーザー入力から決めつけない。

## 改変できるもの / 守るもの

**自由に改変可能:** 内部ファイル分割・関数名・検索スコア統合方法・正規表現・会話状態表現・画面内部構成・研究実装との依存関係・旧内部API。必要なら全面置換可。

**守るべき機能:** 88件の元データと出典が完全一致すること、未保存/故障時の軽量検索、オフライン辞書、既存保存/アップデート互換、選択された原文の全文と注意、非対応質問の説明、否定・疑問・複数人・状況更新の取り扱い、停止/リセットで古い結果が復活しないこと。固定辞書から現在の警報、個人の医療判断、特定道路の安全を保証しない。

**重要:** 既存の出力文言や候補順位のすべてを必ず再現することは要求しない。危険な取り違えを減らせるなら変更してよい。ただし、旧回帰の差異は原因・新旧の妥当性を明示し、都合の悪い失敗を隠さない。

## 完了条件（開発者が検証可能な範囲）

| 分類 | 受け入れ条件 |
| --- | --- |
| 一般情報 | 地震時の一般手順などが原文候補として提示される。候補を自動的に確定回答と見なさない |
| 非対応 | 今日の警報、避難所の現在の開設、地震発生日の問い合わせ、個人の服薬量、道路の現在の通行可否を、類似した記事で埋めない |
| 質問/否定 | 「道路が冠水していますか？」を冠水済みと解釈しない。「冠水していません」で冠水路の手順を確定的に提示しない |
| 状態更新 | 「車ではなく徒歩」「車椅子でなく徒歩」「違う車なのか？」を区別。条件訂正後に旧状況の選択ボタン・選択原文が復活しない |
| 主体 | 「私は徒歩、友人は車」の2人を混ぜずに確認する |
| 根拠 | 不明な前提は不明のまま。適用に矛盾する原文は候補から外す。元の全項目・注意・出典・IDを保持 |
| 非同期 | 停止/リセット後に古い検索結果が届いてもUI・状態に反映しない |
| オフライン | 未保存・モデル読み込み失敗で軽量検索へフォールバック。既存保存を更新時に削除しない |
| 音声 | Moonshineが失敗/無効でもテキスト会話と辞書を使える。Ruriとの競合や停止時リソース解放を確認 |
| 製品 | 端末外へ会話文を送らない。研究用自由生成を公開成果物へ混入させない |

既存の `tests/` と `scripts/evaluation/` は基準資料として維持。実装詳細だけに依存する旧テストは目的を確認したうえで新しい行動テストに置換可能。ただし独立した凍結セットの回答ラベルは変更しない。テストをパスさせるために危険な動作を許容しない。

### 検証の順番

1. **設計**: 公開UI・保存DBとの境界と、新旧で変わる意味上の挙動を簡潔に記す。変更範囲は最初は対話判断層に絞り、UIや音声の全面変更を同時に始めない。
2. **小さな単位で置換**: 既存 `tests/conversation.test.js` / `tests/conversation-applicability.test.js` / `tests/query-scope.test.js` 等を参考に、製品要件を表す回帰を整備。実装内部に依存するテストは分離。
3. **開発中の高速ループ**: 対象テスト → `npm test` → `npm run build` → `node scripts/check-public-build.mjs`。PRは**draft**で扱い、すべての小変更でRuriのフルブラウザ評価を起動しない。
4. **完成判断**: Ready for reviewで `beta-check.yml` のフルCIを通す。既存の凍結セットに加えて、**ソース変更を見て調整していない新しい評価用質問**で適用条件・不適切候補を報告。旧結果を「新しい独立評価」とは呼ばない。
5. **実機**: iPad Safari・PWA・オフライン・音声はユーザー実機確認が必要。Chromium成功をSafari実機確認済みとは記載しない。

## 禁止する「無限の開発ループ」

- 修正のたびに新しい例外分岐を別ファイルへ足して済ませること。
- 過去の全レポートを毎回読み直して、現在の仕様へ再翻訳すること。
- 合格率を上げるための旧評価データの書き換えや、評価を見た後の「未使用セット」扱い。
- CIが通っただけで「安全性が証明された」「iPadで検証済み」と断言すること。

## PR成果物

Codexが作るPRには、「旧層 → 新層の対応」「削除/置換できた旧ロジック」「意図的に変えた挙動」「テスト結果・残課題」「iPadで確認すべき事項」を短くまとめること。**mainマージ・Pages公開はそのタスクで明示されない限り行わない。**
