# Phase 1：LFM CPU版の回答品質比較

2026-10-14。対象は既存のLFM2.5-350M GGUF Q4_K_M。別モデル・辞書・RAG・thinking・二段階生成は追加していない。今回の範囲は比較・整合性修正・PR作成までで、マージ/Pages公開は行わない。

## 結論と採否

**品質と速度を両立する改善は確認できず、system指示・生成設定は維持した。** 元の6問だけでは1→2問に改善するsystem指示もあったが、別入力6問で退行し、合計はすべて4/12だった。長い指示は初回応答も遅くなった。固定回答・入力別の回答分岐・出力の書き換えはない。

採用した変更は、新規ユーザーのCPU版初期選択、出力上限による終了の診断・表示、比較用スクリプト、古い方針・引き継ぎ資料の整理。既存選択・量子化・モデル保存・停止・リセットは維持する。UIの初期選択を決める`PREFERRED_MODEL`だけをCPUへ変更し、旧QwenのURL/helper互換用`DEFAULT_MODEL`は維持した。

## 環境と比較方法

- 固定モデル：`LiquidAI/LFM2.5-350M-GGUF` / revision `657e078c94084481950a2d555a941481f715536b` / `LFM2.5-350M-Q4_K_M.gguf`。
- SHA256：`7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4`。229,312,224 bytes。Git/Pages成果物に含めない。
- Linux Chromium、WebGPUを無効化、wllama/compat 3.8.1、Safari向けAsyncify/MEMORY32経路。1スレッド、文脈512、batch/ubatch64、履歴・prompt cacheなしは同じ。
- `scripts/cpu-quality-check.mjs` がViteの試験専用ページとループバック配信を起動し、実GGUFをBlobで読み込む。同じ本番用`CpuSession`を使い、試験側だけでload/requestをラップして一つずつ条件を変える。アプリの保存経路は別の本番preview検証で確認する。
- 元の6問と、文・単語・時刻・場所を変えた別入力6問を使用。18条件・108生成が有効な比較。temperature 0.1の推奨設定はseed42/43/44も比較した。単一の小さな合成テスト集合で、一般的な正答率を示さない。
- コピーは原文、列挙は指定の3行、不明時は指定文字列を厳密に採点。要約は時刻・場所が残る一行、食べ物は対象だけ、抽出は時刻表記・区切り・語尾の意味が同等なら許容する（例：午前10時と10:00）。初期の厳密文字列判定で不当に落とした等価な抽出表記は、同じ採点関数で全条件を再採点した。
- 比較値は各6生成の中央値。tokens/secは初回待ちを含む生成全体の速度。長い誤回答で値が高くなる場合もあるため、初回応答・完了時間・出力内容を併記する。ピークメモリは未計測。

全出力・入力・正誤・生成数・時間・設定・seedは [生データ](diagnostics/chromium-cpu-quality.json)。`status:passed`は実験の実行成功であり、全回答が正しいという意味ではない。

## 公式チャットテンプレートとJinja

GGUFの`tokenizer.chat_template`は、固定ONNX revision `7dd4999565b0342c381ba90a3d8fc467d6df19c4`の`tokenizer_config.json`内の公式テンプレートと完全一致した。テンプレート文字列のSHA256は `013eed60546434b6967e3483153d8c5c37abcb1d667f8b1f914683f2a9411531`。

テンプレートは先頭に`<|startoftext|>`、system/userメッセージに`<|im_start|>role\n...<|im_end|>\n`、生成開始に`<|im_start|>assistant\n`を使う。GGUFはBOS id1、EOS id7、add_bos_token=true。wllamaの`getChatTemplate()`でも埋め込みテンプレートを確認した。アプリはrole/contentを`createChatCompletion()`へ渡し、手書きChatMLやBOSを二重に付加する処理はしていない。

wllamaはloadの`chat_template`/`jinja`をnativeへ渡し、GGUFのテンプレートを利用する。本番はどちらも上書きしない。`jinja:true`だけ追加した条件は6問すべて変更前と同じ出力で、品質・速度とも改善なし。明示設定は採用しない。この比較はtext-only・system+user・履歴なしの経路に限り、toolsや過去thinkingの扱いまで検証したものではない。

参照：[公式モデルカード](https://huggingface.co/LiquidAI/LFM2.5-350M)、[固定GGUFモデルカード](https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/blob/657e078c94084481950a2d555a941481f715536b/README.md)、[固定Tokenizer](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX/blob/7dd4999565b0342c381ba90a3d8fc467d6df19c4/tokenizer_config.json)。公式カードの推奨はtemperature 0.1、top_k 50、repeat penalty 1.05。

## 比較結果

| 条件 | 元6問 | 別6問 | 元6問の初回応答中央値 | 元6問の速度中央値 |
|---|---:|---:|---:|---:|
| 変更前：日本語で簡潔に、temperature 0、上限32 | 1/6 | 3/6 | 2.73秒 | 2.38 tokens/sec |
| Jinjaのみ明示的に有効 | 1/6 | 未実施 | 2.72秒 | 2.38 |
| 公式例の短い英語system | 2/6 | 2/6 | 2.76秒 | 3.41 |
| 指示遵守・情報保持・形式を明示する日本語system | 2/6 | 2/6 | 6.90秒 | 1.19 |
| 上記の短い日本語版 | 2/6 | 2/6 | 5.26秒 | 1.70 |
| 同趣旨の英語版 | 1/6 | 未実施 | 5.88秒 | 1.14 |
| temperatureのみ0.1 | 1/6 | 未実施 | 2.72秒 | 2.20 |
| 上記にtop_k=50を追加 | 1/6 | 未実施 | 2.66秒 | 2.21 |
| 上記にrepeat_penalty=1.05を追加 | 1/6 | 未実施 | 2.73秒 | 2.12 |
| 上記にtop_p=0.9を追加 | 1/6 | 未実施 | 2.72秒 | 2.17 |
| 変更前から上限だけ64 | 1/6 | 未実施 | 2.67秒 | 2.41 |
| 採用後の本番生成設定（変更前を維持） | 1/6 | 同じ設定 | 2.73秒 | 2.42 |

サンプリングの行は順に一つだけ追加し、未指定値は同じnative既定値に従う。top_p比較の親はrepeat_penalty条件。公式推奨のtemperature/top_k/repeat_penalty条件はseed43と44でも各1/6で、食べ物や不明時の誤答は揺れたが改善しなかった。

**元6問の変更前→採用後の実出力**（生成設定を維持したため同一）:

| 項目 | 変更前・採用後の出力 | 正誤 |
|---|---|---|
| 完全コピー | `晴れです。` | × 原文省略 |
| 果物を1行ずつ | `りんご・みかん・バナナをそれぞれ行に書きます。` | × 改行形式違反 |
| 集合時刻と場所を保つ要約 | `図書館の入口です。` | × 午前9時が欠落 |
| 食べ物だけ抽出 | `パンとタオル` | × 対象外を含む |
| 時刻と場所の抽出 | `午後3時、公園の入口` | ○ |
| 未記載時刻 | `集合時刻なし` | × 指定の「記載なし」と異なる |

詳しい日本語systemでは要約が`午前9時、図書館の入口`へ改善したが、食べ物は`水パンタオル`へ変化。別入力でも食べ物の誤分類や空回答が発生した。公式例の英語systemも元6問では時刻を残せたが、別入力の「記載なし」が`「記載なし」`となり、合計4/12で変更前と同じ。元6問だけを見て採用しない。

## 32/64トークンによる欠落と診断の変更

変更前の元6問は32でもすべてnativeの`finish_reason:stop`で終わり、64でも同じ出力・正誤だった。コピー省略・時刻欠落の主因を32トークン上限とは判断できない。

一方、20項目の理由付きリストは32トークンで`length`になり、実際に途中で切れる。上限を増やせば常に品質が改善するわけではなく、長文には不足する、という区別が必要。本番CPU結果に`finishReason`と`outputLimitReached`を追加し、nativeが`length`で終了した場合だけ画面へ「出力上限に達しました。回答が途中の可能性があります」と表示する。トークン数が上限と一致するだけでは打ち切りと推定せず、通常終了・停止と区別する。

文脈512、出力32/64、入力200文字、temperature 0、元のsystem指示、1スレッドは維持。追加推論や長いsystem指示を本番へ入れない。メモリ設定を増やしていないが、実際のピークメモリを測定した結論ではない。

## 回帰検証と失敗

- Node.js 24.19。`NODE_USE_ENV_PROXY=1 npm ci`、42テスト、本番ビルド成功。旧Qwen設定、新規CPUと既存明示選択、モデル保存共存、停止/リセット、native終了理由、評価関数を検証。
- 本番preview port4173の`browser-check.mjs`成功。ダミーデータで旧ONNXの明示選択・保存が、新規CPUを既定にしたアプリの更新後も残ることを確認。実モデルの成功とは別。
- 同previewの`cpu-inference-check.mjs`成功（[生データ](diagnostics/chromium-cpu-quality-regression.json)、測定版 `47aafc41f945`、未公開）。実GGUFで通常生成9件、途中停止1件、停止後の再生成、リセット後の初期化、ネットワーク遮断後の生成、32上限のnative lengthと画面警告を確認。取得1回、pageerrorなし。Chromiumでの検証でありiPad/PWAの成功ではない。
- 初回npm ciはNodeの外向き取得にプロキシが適用されずECONNREFUSED。Node 24のプロキシ対応を有効にして再実行成功。
- 品質ハーネス初版は通常アプリのHTMLを読んで試験用defineが不足し、開発サーバーのHMRで比較も中断。試験専用の空ページ、HMR/監視無効へ修正し、比較をやり直した。
- wllamaの型に残る`penalty_repeat`はnative chat endpointでは有効なrepeat設定名ではない。native libllama `b11364-46ca246`の[server-schema.cpp](https://github.com/ggml-org/llama.cpp/blob/46ca246/tools/server/server-schema.cpp)が読む`repeat_penalty`で再実験した。無効名を使った2条件12生成は108生成の比較から除外し、生データに理由付きで保存。
- 新規既定モデルの変更途中では古い期待値のNodeテストと、既定がONNXだと仮定する更新テストが失敗。新規CPUの期待値と旧ONNX明示選択をそれぞれ検証するよう修正し、上記の最終検証で成功した。

## 未解決事項と次の判断

今回の修正のiPad実機、長時間、ピークメモリ、PWAオフラインは未確認。オフライン/PWAはユーザー判断で後回し。もし公開後に実機確認するなら、既存保存を消さず、一度だけ上限32で長いリストを生成し、上限表示と診断を確認する。品質の同じ反復は求めない。

**LFM CPUは安定性比較の基準として維持する価値があるが、防災の自由回答用としての採用は保留。** 小さなテスト集合でも単純コピー・分類に失敗し、設定変更だけでは十分に改善しなかった。

**次にQwen3-0.6B GGUFのCPU版を比較する価値はある。** 現在のLFMより大きくthinkingにも対応するため、品質比較の候補にはなる。一方、WASMの速度・メモリ・安定性は未確認で、改善保証ではない。まずthinkingなしの同条件で品質を比較し、その後に必要なら思考予算を限定して別条件にする。以前のWebGPU版の失敗だけでCPU版の可否は判断しない。今回はQwen GGUFを追加していない。

## 再現

`npm ci`後、Git対象外の`test-results/lfm2-q4-k-m.gguf`に固定GGUFを置き、`node scripts/cpu-quality-check.mjs`。モデルSHA256を確認してから実行する。試験用サーバーはport4180で自動起動し、別途previewは不要。任意パスは`CPU_QUALITY_GGUF`、比較条件を絞る場合はJSON配列のパスを第1引数へ渡す。全18条件は数分以上かかる。結果は`test-results/cpu-quality-check.json`。

`scripts/cpu-quality-cases.mjs`の期待値は試験側だけで使い、本番アプリからは一切importしない。品質の不合格は各sampleの`pass:false`へ記録し、モデル実行エラー・ハッシュ不一致・ブラウザエラーは終了1にする。
