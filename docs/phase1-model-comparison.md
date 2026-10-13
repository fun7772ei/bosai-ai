# Phase 1のモデル比較

更新: 2026-10-14（日本時間）。ユーザーはQwenへの固定を解除し、LFM2.5-350MとGemma 3-270M-itの両方をPhase 1へ追加し、GitHub Pages公開まで依頼した。Phase 2の辞書移植・RAG・会話履歴は実装しない。外部AI APIへの質問送信はなく、モデル本体をGitに含めない。`bosai-app`へのアクセス・変更も行わない。

## モデルと配布形式

| 選択名 | 配布先・固定revision | q4f16重み合計 | 保存対象 |
|---|---|---:|---|
| LFM2.5-350M | [モデルカード](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX) / `7dd4999565b0342c381ba90a3d8fc467d6df19c4` | 255,148,587 bytes（約255MB） | JSON4件＋ONNXグラフ＋外部重みの6件 |
| Gemma 3-270M-it | [モデルカード](https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX) / `2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0` | 272,956,893 bytes（約273MB） | JSON4件＋ONNXグラフ＋外部重みの6件 |
| Qwen3-0.6B | [モデルカード](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX) / `1e0a4a196ecabdf9a879664110574563d3f372d3` | 569,789,750 bytes（約570MB） | 従来のJSON4件＋ONNX重みの5件 |

JSON4件は `tokenizer_config.json` / `tokenizer.json` / `config.json` / `generation_config.json`。LFMとGemmaは `.onnx_data` が大きな重み本体であり、小さな `.onnx` だけでは完成扱いにしない。配布設定の `transformers.js_config.use_external_data_format: true` に従ってTransformers.jsが外部重みを読む。配布元のTokenizer設定には会話テンプレートが含まれ、別の `chat_template.jinja` の取得を必要としないことを実Tokenizerで確認した。

q4の重み合計はLFM約294MB・Gemma約323MB・Qwen約919MB。q4はshader-f16非対応時の比較用であり、省メモリとは限らない。上記は重みの保存サイズで、Tokenizerやアプリ資産を含まず、必要RAMでもない。LFMのTokenizer JSONは約3.3MB、Gemmaは約20.3MBで、Tokenizer初期化の差も評価する。

両新モデルの型 `lfm2` / `gemma3_text` は既存Transformers.js 4.3.1に登録済みで、依存更新は不要だった。採用は実際の日本語出力とiPad安定性で判断する。ライセンスはそれぞれ配布元のLFM1.0・Gemmaの条件を参照し、モデルカードへのリンクを維持する。

## 保存・比較操作

保存URLにモデルIDと固定revisionが含まれるため、同名のconfig・重みをモデル間で混同しない。既存のIndexedDB名・version・Qwenの保存URLを維持する。正常な旧Cache APIも再利用する。モデル追加やアプリ更新で保存データを掃除しない。

`bosai-ai-selected-model` にモデルを、`bosai-ai-selected-dtype:<modelKey>` に形式を保存する。旧Qwen用の `bosai-ai-selected-dtype` はQwenだけに引き継ぎ、LFM/Gemmaへ流用しない。旧設定がない場合も、選択モデル内で一つの形式だけが完成していればその形式を復元する。保存済みという理由だけで別モデルへ切り替えない。

処理中とモデル準備後は選択をロックする。比較前に「実行をリセット」で現在のWorkerを終了し、次のモデルを選ぶ。推論Workerを同時に複数保持しない。選択変更時は前モデルの表示メトリクスを消すが、診断ログ・成功runはモデル情報を付けて保持する。診断JSONにモデルID・revision・形式・catalogを含め、runには初期化時間も含める。ページ再読み込み前にJSONを保存する。

「選択モデルの保存を削除」はそのモデルの固定revisionのq4/q4f16と共通設定だけを削除し、他モデルを残す。正常保存を比較のために削除する必要はない。旧Cache API削除が失敗した場合はIndexedDB削除後に警告を記録する。

## 開発側の検証

Linux Cloud / Node.js 24.19.0、既存lockfile・依存は維持。

- `npm test`: 32件成功。旧Qwen形式の復元、モデル別URL、外部重み不足、外部重み取得の途中失敗後に不足ファイルだけ取得、3モデルの保存共存、モデル単位の削除、形式設定の分離を追加検証。
- `npm run build`: 成功。Worker、ローカルWASM、全モデルcatalogを含むshellを生成。
- port 4173の本番preview＋`node scripts/browser-check.mjs`: 成功。LFM/Gemmaの外部重みに12MiB＋123 bytesのダミーを使い、4分割のサイズと全バイト一致、6/6、モデル・形式の再読み込み復元、オフライン再利用、モデル別JSON、Qwenの保存・形式保持、選択モデル削除後に他2モデル保持を確認。既存のWorker起動失敗と再試行、アプリ更新、390px表示、未処理pageerrorなしも確認。
- 固定revisionの実TokenizerをGit外の `/tmp/bosai-phase1-tokenizers` へ取得。日本語system＋user、生成開始テンプレートと入力Tensor生成を確認。LFMは49 input tokens、Gemmaは40 input tokens。回答生成は行っていない。
- `node scripts/inference-check.mjs lfm2 q4f16` / `node scripts/inference-check.mjs gemma3 q4f16`: 両方 `not-run` / exit 2。WebGPUは検出できたがshader-f16非対応で、実モデルの重みは取得せず、初期化・生成は未検証。
- 開発中は、`modelFileUrl` にモデル引数を追加した際、旧テストのArray.mapがindexをモデル引数として渡して1件失敗した。明示的な関数呼出しに変更して解消。保存データの破損や実機失敗の再現ではない。

上記の保存検証はダミーデータ。実モデル保存、iPad Safari、ホーム画面、OS再起動、機内モード生成、長時間利用の成功ではない。実推論スクリプトはモデルkeyと形式を引数で受け、成果物を `test-results/inference-<modelKey>-<dtype>.*` に分ける。全ステップが成功した場合だけexit 0を返す。

## iPadでの最小比較手順

1. 公開後、オンラインで一度ページを開き、旧bosai-aiタブをすべて閉じて開き直す。アプリ版 `7912da5965d7` を確認。サイトデータ・Qwen保存を削除しない。
2. 「比較モデル」で **LFM2.5-350M**、形式q4f16、上限64トークンを選ぶ。「ダウンロードして保存」を一度押す。失敗ならそこで止めて診断JSONを保存する。
3. 完了後に再読み込み。LFM・q4f16・6/6と外部重みの分割表示を確認。「モデルを読み込む」を一度試す。Safariが終了／再読み込みする場合は最後の段階とアプリ版を記録し、同じモデルで繰り返さない。
4. 準備完了なら「日本語で1から5まで数えてください。」を生成し、続いて「次の文章を日本語で短くしてください。『避難するときは周囲の安全を確認してから移動します。』」を生成。日本語、指示への従い方、読み込み秒数、初回トークン、速度をJSONに保存する。辞書未統合なので防災判断の品質確認とは扱わない。
5. 「実行をリセット」→ **Gemma 3-270M-it** を選び、2〜4を同条件で実施する。LFMの保存は残る。モデルを変えるごとにページ再読み込みを挟むと、前モデルのメモリ残存の影響も減らせる。
6. 成功した各モデルで、JSON保存→タブ終了→機内モード＋Wi-Fiオフ→再起動→保存済みのみモードで同じモデル・形式を読み込み、短い生成を確認する。

## Phase 1の判断

両新モデルの実機成立は保留。Qwenは公開後のユーザー写真でWorker起動・WebGPU確認・重み読込doneまで到達し、その後Safari終了／ページ再読み込みが報告された。doneはモデル初期化完了ではなく、原因はメモリ圧迫・WebGPU/ORT等から未確定。小型候補でも重み全体のバッファとORT/GPUメモリを必要とする。

まずLFM、次にGemmaで保存・初期化・日本語・オフラインを比べ、成立したモデルを次の候補とする。軽量さだけで採用せず、同一入力の出力と実機安定性を評価する。両方とも初期化で再現性のあるクラッシュが続く場合は、端末内LLM必須のPhase 1は成立せず、辞書中心の軽量方式へ進めるかを再検討する。今回、辞書方式への切替やPhase 2実装は行わない。
