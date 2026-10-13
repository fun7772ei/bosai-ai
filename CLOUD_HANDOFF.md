# bosai-ai: Codex Cloudへの引き継ぎ

更新日: 2026-10-14（日本時間）。作業の対象は**Phase 1の安定化**。

## Cloud継続作業の更新（2026-10-14 日本時間）

作業ブランチ: `codex/phase1-worker-storage-stability`。今回の詳細は [Cloudレビュー結果](docs/phase1-cloud-review.md)。**最新修正もiPad実機・実モデル推論は未確認。Phase 1の成立とは扱わない。** 以下の古い検証結果と今回の結果を区別する。

- 新しい提供ログは [safari-worker-failure.json](docs/diagnostics/safari-worker-failure.json)。ダウンロード開始直後のWorkerエラーに詳細がなく、成功記録なし。保存状態のログ形式は分割保存前のコードと一致し、現在の公開資産の形式とは異なる。旧画面・旧資産の可能性はあるが、Safariの原因を断定しない。ログ末尾には明示的なモデルキャッシュ削除がある。
- 小さなbootstrap Workerから取得／推論モジュールを動的に読み、起動完了後に処理を送る。モジュール読込・作成・実行・メッセージ・起動無応答を診断し、空のErrorEventにも説明を付ける。アプリ版を画面とJSONへ追加。
- IndexedDBのDB名・versionは維持。旧 `[url, index]` を読み、新規保存は `[url, generation, index]`。完成情報と全分割キーを照合し、取得サイズ・読込時の分割サイズを確認。再保存中は旧完成ファイルを保持し、最終transactionで切り替える。途中データは次の明示的な取得時に整理する。Rangeによる途中再開と暗号学的な内容検証は未実装。
- 書込はWeb Locksでタブ／Worker間を直列化する。APIがない環境の代替は同一JS実行領域のみで、複数タブの保証はない。旧Cache APIの正常ファイルの再利用は維持。
- Service Workerの即時切替を廃止。使用中の旧画面のWorker資産を保ち、旧タブを閉じた後に更新する。モデル保存の削除処理は追加しない。
- Node.js 24.19.0で現行10テスト・ビルド・ブラウザ検証を再実行後、回帰テストを追加。Cloud側の実測・失敗は上記レビュー資料に記録する。
- Qwen3と量子化の第一候補は変更しない。4MiB保存でもTransformers.jsは重み全体をUint8Arrayに読み、ORT/WASM/WebGPUの追加メモリが必要。実機の保存・初期化・短い生成・再起動後オフライン生成が判断材料。

## まず読むもの

1. [仕様書v1.1](docs/specification-v1.1.md)
2. 本ファイル
3. [現在の実装](README.md)
4. [検証結果と改修履歴](docs/phase1-results.md)
5. [ユーザー提供のSafari診断ログ](docs/diagnostics/ipad-cache-failure.json)
6. [iPad実機の検証手順](docs/ipad-verification.md)

[CLOUD_PROMPT.md](CLOUD_PROMPT.md) がCloudの新しいチャットへ貼る依頼文。

## 対象と制約

- 開発リポジトリ: https://github.com/fun7772ei/bosai-ai
- 公開テストページ: https://fun7772ei.github.io/bosai-ai/
- 引き継ぎ直前の実装コミット: `19bd080b839fb83437bc237ba0ffce35335a29a8`。引き継ぎファイル自体は後続コミットに追加するため、開始時は最新mainと差分を確認する。
- **iPad第10世代のSafariを最優先**。iPadOS 26以降を想定。実際のiPadOSバージョンはユーザーから明示されていない。
- 第一候補はQwen3-0.6Bの4bit量子化、Transformers.js＋WebGPUで端末内推論。思考モード無効、短い日本語生成。
- 外部AI APIを使わず、質問を外部へ送信しない。AIモデルをGitにコミットしない。初回オンラインで取得し、端末に保存する。
- GitHub Pagesで公開できる構成と完全オフライン動作を目標にする。
- `fun7772ei/bosai-app`は辞書データの参照元のみ。**変更、push、PR、設定変更を行わない**。privateリポジトリで、Cloudからアクセスできるとは限らない。
- Phase 2以降はまだ実装しない。辞書88項目の移植・検索・RAG・会話履歴は未実装。
- UIの判断は仕様書の範囲で可能だが、当面は診断・省メモリ・保存安定性を優先する。

## 現状の結論

**Phase 1のページ実装と公開は済んでいるが、iPadでの成立は未確認。初版で失敗報告があり、最新修正の実機結果待ち。**

ユーザーは、モデル読み込みだけでSafari自体が終了する場合と、「サイトに問題が発生しました」と表示され再読み込みする場合を報告している。メモリ不足、WebGPU、ストレージなどのどれが原因かは断定できない。

続いて「再読み込みでモデルが消えるように見える」「モデル保存が未完了と表示される」と報告。提供JSONから確認できた事実は次のとおり。

- WebGPUとshader-f16の検出は成功。
- 設定・Tokenizerの4ファイルは保存されている。
- `onnx/model_q4f16.onnx`だけが不足。
- q4f16のダウンロード開始から約41秒後、download操作で`Internal error`。
- その後の保存確認でも`Internal error`。
- 保存完了イベントはなく、`runs`も空。

この記録は**重みの保存に失敗した証拠**であり、再読み込みが保存済み重みを削除した証拠ではない。q4/q4f16の取り違えは別に見つけた不具合で、このログの原因ではなかった。ログのUAはSafari 26.5.2・Macintosh表記だが、UAだけから端末型番やiPadOSバージョンを断定しない。WebGPUのmaxBufferSizeは総メモリ上限ではない。

## 最新の実装

| ファイル | 役割 |
|---|---|
| `src/config.js` | モデルID・固定revision・対象ファイル・URL正規化・速度計算 |
| `src/chunk-store.js` | 4MiB単位のIndexedDB保存とストリーム読込 |
| `src/model-storage.js` | 新保存＋旧Cache APIの再利用、形式別の存在確認・形式復元 |
| `src/download.js` | ファイルを順に取得し保存。重み全体のarrayBuffer化・clone・チャンク収集を避ける |
| `src/download.worker.js` | ダウンロード専用Worker |
| `src/ai.worker.js` | 保存済みモデルのWebGPU初期化、Tokenizer読込、日本語生成、停止 |
| `src/main.js` | 操作・進捗・メトリクス・診断JSON・途中終了の記録 |
| `public/sw.js` | アプリ本体のオフラインキャッシュ |
| `vite.config.js` | `/bosai-ai/`のbase、ローカルWASM配置、アプリ資産ハッシュ |
| `.github/workflows/pages.yml` | main更新時にテスト・ビルド・Pages公開 |

モデルは `onnx-community/Qwen3-0.6B-ONNX`、revisionは `1e0a4a196ecabdf9a879664110574563d3f372d3`、Transformers.jsは4.3.1。依存はpackage-lockで固定。q4f16が第一候補で、q4は比較用であり、省メモリになるとは限らない。

最新の保存先はIndexedDB `bosai-ai-model-chunks-v1`。`chunks`へ4MiBずつ書き、全transaction完了後に`files`へ完了情報を保存。途中失敗したデータは完了扱いにしない。読込用ResponseのhighWaterMarkは0で、存在確認だけでは重みを読み出さない。旧Cache API `bosai-ai-model-v1`にある正常なファイルは再利用し、旧キャッシュの例外で新しい保存を止めない。

「ダウンロードして保存」と「モデルを読み込む」は別操作。保存後にページ再読み込みを案内する。推論Workerは未保存のHugging Faceファイルの取得を拒否。自動ウォームアップは廃止し、最初の推論は生成ボタンで開始する。

モデル初期化後にTokenizerを読み込み、`enable_thinking: false`、最大128トークン（選択可能64/128/256）。取得を分割しても、Transformers.js／ONNX Runtimeの推論初期化ではモデル全体のメモリ確保が残る。**分割保存だけでiPadの推論クラッシュが直ったとは言えない。**

量子化形式をlocalStorageへ保存。古い版で形式設定がなくても、完全に保存された形式が一つだけなら選択を復元する。localStorageの未完了段階はタブ終了や意図的な再読み込みでも残るので、原因特定ではなく切り分けの材料。

## 確認済みと未確認を分ける

最新IndexedDB版の開発側検証:

- Node.jsの10テスト成功、本番ビルド成功。
- Windows Playwright Chromiumで12MiB＋123バイトの**ダミー重み**を4分割保存。再読み込み後に各分割のサイズ・内容一致、形式復元、再取得なしを確認。
- 途中失敗を完了扱いしないこと、旧Cache APIのInternal errorを回避できることをテスト。
- オフライン画面表示、未保存ファイルの不足表示、狭い画面での横はみ出しなしを確認。
- 最終実装コミットのPages workflow成功、公開URLのHTTP 200と最新資産を確認。

旧Cache API版ではWindows Chromiumの実モデル生成と、ブラウザのネットワーク遮断後の再読込・生成に成功。ただしその測定値を最新IndexedDB版の実測値やiPadの結果として流用しない。自己紹介依頼を正しく処理できない回答もあり、品質は別問題。

未確認:

- 最新IndexedDB版のiPadでの約570MBモデル保存、再読み込み・Safari終了後の保持。
- 最新IndexedDB版の実モデル初期化・日本語生成・機内モード再利用。
- iPadでの生成速度、長時間安定性、ホーム画面アプリの保存領域・再起動。
- Safari強制終了の具体的原因。

## Cloudでの最初の作業

1. 現在のmain、関連ファイル、診断JSONを読み、テストと本番ビルドを再実行する。
2. まず最新IndexedDB版が妥当かをレビューする。大きな分割データ、transaction失敗、容量不足、キャンセル／Worker終了、途中データ、完了manifest、保存形式、再読み込みとオフライン読込を重点確認する。
3. 推論初期化のメモリ負荷・コピー・バッファ割当と、Safari/WebGPUの互換性を調査する。変更は測定・実装根拠に基づく小さなものにする。Qwen3を別モデルへ自動置換しない。
4. 既存のユーザー保存をアプリ更新で削除しない。現在のコードは破損・途中保存に対する完全性保証や中断位置からのダウンロード再開を実装済みではない。必要なら改善し、限界を報告する。
5. iPadなしで実施できた確認と、ユーザー実機で必要な確認を分けた短い手順を用意する。失敗する同じ操作を何度もユーザーに繰り返させない。
6. 作業ブランチに変更と検証結果をまとめ、レビュー可能なPRを作成する。Phase 1の結論と残課題を報告し、Phase 2の着手判断を残す。

追加情報を待つ間もコードレビュー・テスト・軽量化調査を進める。CloudでiPad Safariを直接操作できなければ「実機確認済み」と報告しない。WebKitの自動テストやheadless Chromiumは実機Safariの代替証明ではない。

## 実行方法

Node.js 24以降。環境でnpmレジストリと必要なブラウザ配布先へアクセスできる状態にする。GPUは利用可能か検出して判断し、ない場合は推論成功を捏造しない。外部AI APIの資格情報は不要。

```bash
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
```

本番previewを一つのターミナルで起動:

```bash
npm run preview -- --port 4173
```

別のターミナルで保存経路のテスト:

```bash
node scripts/browser-check.mjs
```

これはダミーデータのテスト。実モデルを使う任意のテストは`node scripts/inference-check.mjs`で、約570MBの取得とWebGPUが必要。現在のスクリプトは診断用であり、終了コードだけでは推論成功を証明できない。ログ・出力・状態を確認し、必要なら成功／失敗判定を改善する。

ブラウザテストはlocalhost:4173に依存する。成果物はgitignore対象の`test-results/`。環境制約でテスト不能なら理由と未確認範囲を記録する。モデル本体をリポジトリやPRへ追加しない。

Cloud環境の設定の参考: [OpenAI公式 Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments)。利用できる機能・権限・ネットワークは実際の環境で確認する。

## Phase 2以降の方向

Phase 2は辞書88項目の移植・軽量検索・根拠付きRAG。Phase 3は会話UI・履歴・詳細画面、Phase 4はPWA保存管理・実機オフライン検証。AIが成立しない場合でも辞書検索を維持する。privateの辞書リポジトリへアクセスできなくても、内容を推測して作らず、その制約を報告する。
