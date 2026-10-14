# bosai-ai — Phase 1

端末内LLMの保存・読み込み・推論を比較するPhase 1ページ。必須対象はiPad第10世代・iPadOS 26.5のSafariとPWAオフライン利用。Qwen/GemmaのWebGPU版ではクラッシュ、LFMも入力変更時のクラッシュと品質不足のユーザー報告がある。対策比較として **LFM2.5-350M GGUF Q4_K_MのCPU/WASM版** を追加した。CPU版はユーザー提供ログで短時間生成とリセット後の再初期化に成功。ただし回答品質・長時間・PWAオフラインと今回の変更版の実機動作は未確認で、Phase 1成立とは扱わない。辞書未統合のため、このページの回答を防災判断には使わない。


CPUはLFM2.5-350Mに加え、Qwen3.5-0.8B日本語SFT v2・Qwen3-0.6B・LFM2-700MのGGUF Q4_K_Mを比較できる。[4モデルの実測比較・暫定順位](docs/phase1-four-cpu-models.md) を参照。既定はLFM350のまま。Qwen系はthinking無効で、追加3候補のiPad動作は未確認。全候補を取得する必要はなく、選択だけではダウンロードしない。

## 起動

Node.js 24以降で `npm ci` → `npm run dev`。本番とオフライン動作を確認する場合は `npm run build` → `npm run preview` → http://localhost:4173/bosai-ai/ 。WebGPUとService WorkerにはHTTPSまたはlocalhostが必要。iPadからLANのHTTPアドレスを開く方法はWebGPU検証には使えない。

公開URL: https://fun7772ei.github.io/bosai-ai/ 。GitHub PagesのSourceは **GitHub Actions** に設定済み。mainへpushすると、`.github/workflows/pages.yml`でテスト・ビルド・公開する。

## CPU比較

「LFM2.5-350M（CPU/WASM比較）」を選び、Q4_K_Mを保存→再読み込み→1/1保存済みを確認→読み込む。ONNXの保存とは別の約229MBのGGUFを取得する。1スレッド、文脈512、入力200文字、出力32/64トークンで比較する。既存のモデルを消す必要はない。CPUもメモリを使い、低速になる可能性がある。

wllama/compat 3.8.1を固定し、Safari向けAsyncify/MEMORY32を強制する。同梱WASMもService Workerに保存する。CPUにWebGPUは不要。全体サイズ・GGUFヘッダー・分割キー/サイズを確認するが、本番読込の暗号学的ハッシュ検証は未実装。[結果・再現手順](docs/phase1-cpu-results.md)、[iPad最小手順](docs/ipad-verification.md) を参照。

## 4モデル比較

PR #6を継承した比較で、wllama/compat 3.8.1の更新なしに4モデルが実生成に成功した。既存12問＋架空の防災文4問、32/64上限、配布元推奨設定を評価。LFM2-700Mの厳密遵守率が最高だったが、追加モデルの64 tokens生成は約14〜16秒で、メモリも増えた。いずれも防災回答品質の成立とは扱わない。

開発側比較は `node scripts/cpu-model-comparison.mjs`、`--timing-only` で32/64実生成とメモリ。固定ファイルの場所/SHA256は `scripts/cpu-comparison-models.mjs`。本番previewの追加候補は `node scripts/cpu-inference-check.mjs --model=qwen35-cpu --smoke` 等で保存・停止・リセット・再読込を検証する。モデル本体はGit対象外。測定用Linux/proc・CDPは開発スクリプトだけで、本番アプリには不要。

## 回答品質の比較（PR #6の履歴）

[品質比較結果](docs/phase1-cpu-quality.md) に実GGUFの18条件・108生成を記録。Jinja、system指示、temperature/top_k/top_p/repeat_penalty、32/64上限を比較したが、品質と速度を両立する改善は確認できず、生成設定は維持した。品質比較スクリプトは `node scripts/cpu-quality-check.mjs`。元の6項目と別入力6項目で実出力・採点・速度を保存し、回答を固定文字列へ置換しない。

CPUの診断JSONに `finishReason` と `outputLimitReached` を追加。ネイティブの `length` 終了時には画面で出力上限と途中回答の可能性を表示し、通常終了や停止と区別する。上限は32/64、文脈512のまま。Safari/PWAオフラインの実機検証はユーザー判断で後回し。

## 実装

- LFMの同一入力10回成功の後、入力変更時に3件目前後で落ちるとの報告がある。新規利用の初期選択はCPU版に変更。既存の明示選択・形式・保存は維持し、自動置換しない。

- 「比較モデル」でLFM2.5-350M／Gemma 3-270M-it／Qwen3-0.6Bを選べる。Qwenの既存保存・形式設定を維持し、新モデルの取得は明示操作。現在はCPU版を優先し、WebGPU候補は既存利用・比較用として保持する。モデルを変える前に「実行をリセット」する。
- LFMとGemmaはONNXグラフ＋外部重み `.onnx_data` を含む6ファイルを分割保存する。Qwenは従来の5ファイル。モデル別の固定revision・形式設定・保存状態・診断を使い、選択モデルを削除してもほかのモデルは残る。[比較モデル・手順・検証限界](docs/phase1-model-comparison.md) を参照。

- Transformers.js 4.3.1とONNX Runtimeはロックファイルで固定。
- `onnx-community/Qwen3-0.6B-ONNX`のrevision `1e0a4a196ecabdf9a879664110574563d3f372d3`を固定。第一候補q4f16、比較用q4。どちらも4bit重み。q4f16はshader-f16が必要。
- 専用の取得Workerでレスポンスを4MiBずつIndexedDBへ分割保存。全分割の保存後に完了情報を書き、途中失敗を保存完了として扱わない。JavaScriptで重み全体を収集せず、推論の初期化と別の操作にする。保存後はページを再読み込みしてから「モデルを読み込む」。推論初期化には依然大きなメモリが必要。
- 推論Workerは保存済みモデルのみ読み込み、Hugging Faceへの未保存ファイル取得を拒否する。`enable_thinking: false`、最大128トークン（64/128/256選択）、履歴なし。生成途中停止とWorkerリセットに対応。読み込み時の自動ウォームアップを廃止し、最初の生成を明示操作にする。
- 読み込み時間は保存済みモデルの初期化とTokenizer読み込み。初回トークン時間はテンプレート作成・prefill・初回シェーダー準備も含む。画面のtokens/secは生成トークン数÷生成全体の秒数。JSONのdecodeTokensPerSecondは初回トークン後の速度。特殊トークンもトークン数に含まれ、文字数とは異なる。改修前の時間とは測定範囲が異なる。
- 処理段階をlocalStorageへ記録し、途中終了後の再読み込みで表示。意図的なタブ終了・再読み込みでも未完了として記録されるため、クラッシュの原因を断定する診断ではない。
- 選択したq4/q4f16を再読み込み後に復元。以前の版で形式が記録されていない場合も、必要ファイルがすべて揃っている形式が一つだけなら、その保存済み形式を選ぶ。保存件数は選択中の形式ごとに表示し、再読み込み後も必要ファイルがあれば保存済みと表示する。ファイル存在確認は推論成功や永続保持の保証ではない。
- 10回連続生成、最大100件の測定結果、診断ログ、JSONエクスポート。履歴はページ再読込で消える。質問・出力はAPI送信せず、診断JSONに含まれる。
- モデルは初回にHugging Faceから取得しIndexedDBの`bosai-ai-model-chunks-v1`へ保存。旧Cache APIの`bosai-ai-model-v1`に残る正常なファイルは再利用し、旧キャッシュのInternal errorで新しい保存方式を妨げない。モデルをGitに含めない。JS/WASMはnpmパッケージからビルド成果物へ配置し、CDNへの実行時依存を避ける。
- Phase 1で再起動・オフラインを試すための最小Service Workerを先行実装。アプリキャッシュはビルドハッシュごとに更新。モデルキャッシュはアプリ更新で削除しない。保存ファイル数は完全性の保証ではなく、再起動後のオフライン生成をもって確認する。
- 保存済みモデルのみ使用するモードは、Transformers.jsのネットワーク取得を明示的に拒否する。アプリ本体はService Workerから再利用する。未保存・容量不足・Safariのストレージ削除は失敗として確認する。永続保存APIの許可は保持保証ではない。

## 検証

`npm test`、`npm run build`。ブラウザテストは `npx playwright install chromium`、本番preview起動中に `node scripts/browser-check.mjs`。実モデルの取得を伴う任意テストは `node scripts/inference-check.mjs`（WebGPU利用可能な環境が必要）。

今回の結果と限界は [docs/phase1-results.md](docs/phase1-results.md)、iPadでの手順は [docs/ipad-verification.md](docs/ipad-verification.md) に記録。実モデルの比較スクリプトは `node scripts/inference-check.mjs lfm2 q4f16` または `node scripts/inference-check.mjs gemma3 q4f16`。q4比較時は最後の引数をq4とするが、省メモリになる保証はない。成果物をモデル・形式別に保存する。デスクトップChromiumの結果をSafari実機の確認として扱わない。

Cloudでの追加修正と検証は [docs/phase1-cloud-review.md](docs/phase1-cloud-review.md)。Workerの起動待ち・詳細ログ、分割キーとサイズの検証、再保存失敗時の旧データ保持を追加。旧IndexedDB形式とCache API保存を読み続ける。アプリ更新は使用中のタブを強制切替せず、旧タブを閉じた後に有効になる。保存データやSafariのサイトデータを消す必要はない。画面の「アプリ版」と診断JSONの `appBuild` で使用版を識別する。

ブラウザ依存込みの準備は `npx playwright install --with-deps chromium`。Cloudで管理者権限がない場合は失敗しうるため、既存OS依存で起動できるかを `npx playwright install chromium` 後に実行確認する。実モデルスクリプトはq4f16に必要なGPU機能がなければ取得せず終了コード2（未検証）、保存・生成失敗は1、オンラインとオフラインで生成できた場合だけ0を返す。

## 次の段階

Phase 2: `fun7772ei/bosai-app`の`data.js`にある88項目を、内容・優先度・注意事項・出典を維持して移植。元リポジトリは参照のみ。Phase 1では移植しない。参照時のblob SHA: `881355b4a4b85a1da39515e8578aa5f74bb2644b`。元リポジトリはprivateのため、辞書を公開リポジトリに移す際に公開範囲・利用条件を確認する。

検索、緊急時の確定情報、3〜5件の根拠付きRAGを独立モジュールとして追加する。AIエラー時も辞書検索を維持する。Phase 3で会話UI・IndexedDB履歴、Phase 4で保存管理・PWA更新・容量不足への対応を仕上げる。iPadのPhase 1結果を判断材料にし、AIが動かない場合は軽量検索を中心に進める。

## 技術参照

- [Qwen3 ONNXモデルカード](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX)
- [Transformers.jsのQwen3公式例](https://github.com/huggingface/transformers.js-examples/tree/main/qwen3-webgpu)
- [WebKit Safari 26.0のWebGPU対応](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

アプリコードの再利用ライセンスは未設定。モデルの利用条件は固定revisionの配布元・ベースモデルを確認する。
