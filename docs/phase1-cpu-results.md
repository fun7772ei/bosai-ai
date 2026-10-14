# Phase 1：CPU/WASM比較

2026-10-14。必須対象はiPad第10世代・iPadOS 26.5・Safari・PWAオフライン利用。ユーザーの承認で追加した比較であり、**iPadでCPU版を確認した結果ではない**。

## 背景と変更

LFMの同一入力10回完了後、ユーザーから異なる入力の3件目前後でSafari終了／再読み込みと品質不足の報告があった。Qwenの初期化時、Gemmaの連続生成中にもクラッシュ報告がある。Safariのメモリ/GPU等の原因は未確定。再読み込みが保存済み重みを削除したとは判断しない。

比較対象は `LiquidAI/LFM2.5-350M-GGUF` の `LFM2.5-350M-Q4_K_M.gguf`。revision `657e078c94084481950a2d555a941481f715536b`、229,312,224 bytes（約219 MiB）、テスト用取得ファイルのSHA256は `7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4`。

- wllama/compat 3.8.1、同梱Asyncify/MEMORY32ランタイムを強制する。JSPI/MEMORY64・WebGPU・SharedArrayBufferを要求しない。1スレッドCPUなのでGitHub PagesのCOOP/COEP設定を必要としない。
- GPU layers 0、context 512、batch/ubatch 64、parallel 1、KV offloadなし。入力200文字以下、出力32（初期値）/64トークン、会話履歴・prompt cacheなし。文字制限だけで全入力が文脈に収まる保証はなく、ランタイムエラーは診断する。
- 既存IndexedDBの4 MiB分割保存を利用し、GGUFは1ファイル・55分割。全分割キー/サイズ、全体サイズ、GGUFヘッダーを確認し、分割Blobから読み込む。本番読込の暗号学的ハッシュ検証は未実装。ネイティブBlob・WASMへのコピー・モデル/KV等のメモリは残り、ピークメモリ改善は未計測。
- runtime WASMをService Workerのアプリ資産へ追加。CPU推論は保存済みBlobのみを読み、ライブラリのモデル取得経路を拒否する。停止後の再生成と子Worker終了確認を含むリセットに対応する。
- 既存WebGPU、固定revision、旧Cache API/IndexedDB保存、モデル別設定を維持。アプリ更新でモデルを削除しない。モデル本体はGitやPages成果物へ含めない。質問・出力を外部AI APIへ送信しない。bosai-appは変更していない。

## 開発側の検証

Node.js 24.19で `npm ci`、`npm test`（40件）、`npm run build` 成功。本番previewはport 4173。

`node scripts/browser-check.mjs` はダミーデータによる保存・再読込・形式復元・選択削除・旧モデル保持・オフライン画面・安全なアプリ更新・Worker失敗と再試行を確認。実モデルやiPad成功とは別。

`node scripts/cpu-inference-check.mjs` は実GGUFを使い、Linux ChromiumでWebGPUを無効化して、Safari向けCPU互換ランタイムを確認した。

- 実ファイルを一度ストリーム配信し、アプリの取得Worker経由で分割保存。固定ファイルはテスト開始前にSHA256を照合する。テスト用配信はループバックのみで、実行資産/モデルをdistへ追加しない。
- 異なる入力5件の生成、途中停止、停止後の再生成、リセット後の再初期化、ブラウザのネットワーク遮断＋ページ再読み込み＋保存のみモードでの生成が成功。通常生成8件と途中停止1件。モデル取得要求は1回、未処理pageerrorなし。
- スレッド1、文脈512、GPU layers 0、compat経路を診断で確認。libllamaは `b11364-46ca246`。トークン数は実ランタイムのusage/timingsを使い、文字数から推測しない。
- 測定版は `64ece2a7b9b6`。初期化1.90〜2.11秒、初回トークン1.90〜2.97秒、生成全体の速度1.79〜4.87 tokens/sec。少数回のデスクトップ測定で、iPadの代表性能ではない。[生データ](diagnostics/chromium-cpu-wasm-result.json)。
- ブラウザのネットワーク遮断はiPadの機内モード・Safari/OS再起動・ホーム画面PWAの試験ではない。

検証中の失敗も区別する。初期スクリプトではURL監視のglobが不適切で、実生成後に取得回数0の判定が失敗した。監視を直した後、ローカル配信のCORS不足でfetch失敗。Playwright経由で229 MBのbodyを渡す試行ではブラウザが終了した。テスト用配信をCORS付きストリームサーバーへ変更した再試験で上記の保存・生成が通った。これらをiPadの原因の証拠とは扱わない。最初のブラウザ実行ではpreview未起動による接続失敗があり、起動後に成功した。

`npx playwright install --with-deps chromium` は管理者切替の認証失敗（`su: Authentication failure`）で終了1。既存のOS依存とインストール済みChromiumで実行できた。CloudのWebGPUはshader-f16非対応で、ONNX q4f16の実モデル検証には使えない。

## 品質とPhase 1の判定

CPU方式にしても回答品質は改善確認できていない。実出力は次の通り。

| 入力の目的 | 出力例 | 判定 |
|---|---|---|
| 1〜5の列挙 | `1, 2, 3, 4, 5` | 指示を実行 |
| 「今日は晴れです。」の完全コピー | `晴れです。` | 一部欠落 |
| 果物を別々の行へ | `りんご・みかん・バナナをそれぞれ行に書きます。` | 指定形式を実行できない |
| 「集合は午前9時、図書館の入口です。」の要約 | `図書館の入口です。` | 時刻欠落 |
| 時刻がなければ「記載なし」 | `集合時刻なし` | 指定文字列に従わない |

防災の自由回答を任せられる品質としては不十分。**Phase 1はiPad実機の安定性・PWA再起動後オフライン・回答品質について未成立**。CPUはWebGPU経路から切り分ける候補で、Safariでも確実に動くという結論ではない。次は [iPadの最小確認](ipad-verification.md) を行う。

現時点では辞書検索・定型回答を中心にし、LLMを補助にする方向を推奨する。重要な時刻の欠落が実測されており、安定性だけ解消しても自由生成を中核にできない。ユーザーのLLM希望を維持してCPU比較を続けるが、今回は辞書/RAG等のPhase 2を実装しない。

## 再現コマンド

Node.js 24以降で `npm ci`、`npm test`、`npm run build`、`npx playwright install --with-deps chromium`、`npm run preview -- --port 4173 --strictPort`。別ターミナルで `node scripts/browser-check.mjs`。

実モデル試験は任意で大容量取得を伴う。Git対象外の `test-results/` に上記固定URLのGGUFを取得して `lfm2-q4-k-m.gguf` と置く。preview起動中に `node scripts/cpu-inference-check.mjs`（別のローカルパスは引数指定）。結果JSON/ログ/画面は `test-results/cpu-inference-*`。成功はexit 0、失敗はexit 1。実行中にビルドをやり直さない。
