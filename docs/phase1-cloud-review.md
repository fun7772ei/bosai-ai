# Phase 1 Cloudレビュー（2026-10-14 日本時間）

対象: `fun7772ei/bosai-ai`、開始main `63d3853`、作業ブランチ `codex/phase1-worker-storage-stability`。指定6資料を読んでから現行検証を実行。`fun7772ei/bosai-app`にはアクセス・変更を行っていない。Phase 2以降は実装せず、Qwen3・固定revision・4bit候補は維持。質問を外部AI APIへ送る処理やモデル本体のGit追加はない。

## 結論

**Phase 1はiPad第10世代Safariで未成立・未確認。今回の保存・Worker回帰検証は成功したが、実機と実モデルの成功証明ではない。** 新しい提供ログの理由不明なWorkerエラーを、今回の修正で実機上でも解消したとは言えない。最初に保存だけを一度試し、その後の初期化と生成を分けて確認する。

## 新しい提供ログの事実

[safari-worker-failure.json](diagnostics/safari-worker-failure.json) は2026-10-13 16:18 UTC生成。WebGPU・shader-f16を検出し、ダウンロード開始約0.03〜0.34秒後に詳細 `{}` のWorkerエラーを繰り返す。保存完了・生成結果はなく、`runs`は空。冒頭の前回段階は「モデル初期化（WebGPU）」で、今回のWorker失敗原因の証明ではない。

保存ログは `urls / estimate / persisted` のみで、`d7d942f`以前の `main.js` と一致する。分割保存版 `19bd080` は `selectedDtype / statuses` も出す。確認時の公開HTML・shell.jsonはmainの分割保存版の資産名と一致。提供ログは最新IndexedDB版を使えていた証拠にならず、古い画面／資産が残った可能性がある。具体的な使用コミット、Safari側のスクリプト失敗理由、旧資産が残った経緯は未確定。

旧Cache APIの一覧には設定・Tokenizerの4ファイルだけがあり、q4f16重みが不足と表示される。旧画面の一覧だけで、IndexedDBを含む全保存領域の内容を断定しない。オリジン使用量約1.23GBも、重み完成の証拠ではない。16:17:50には明示的な「モデルキャッシュを削除」があり、その直後に一覧は空となる。再読み込みが保存済み重みを削除した証拠ではない。永続保存拒否も保存不能や今回の原因を意味しない。UAだけから端末型番・OSを断定しない。

## 改善した問題

| 経路 | 現行実装の問題 | 修正と確認 |
|---|---|---|
| Worker起動 | 静的import失敗は操作のtry/catchに届かず、Safariの空ErrorEventで理由が消える。無応答ではbusyが残る | 小さなbootstrapで取得／推論モジュールを動的import。成功通知後に操作送信。モジュール失敗・作成・実行・送受信・30秒起動無応答を記録し、終了・再試行できる |
| 保存完了 | manifestだけで存在判定し、分割欠落を完成扱いしうる | manifestと分割キー数・順序を確認。重み本体は状態確認では読み出さない |
| 取得途中終了 | 正常なEOFでもContent-Lengthより短いデータを完成扱いしうる | 非圧縮の宣言サイズと実取得サイズを照合。空データは失敗。圧縮HTTPの転送サイズは展開後サイズと比較しない |
| 再保存失敗 | putの最初に既存の完成ファイルを消す | 世代別分割へ書き、全transaction成功後に完成情報と旧世代削除を同一transactionで実施。失敗時は旧完成情報とデータを保持 |
| transaction | リクエスト成功だけではcommit成功を意味しない | oncompleteを待つ方式を維持し、onabort時にtransactionまたはrequestのエラーを保存。分割put・manifest put成功直後のabortを注入して確認 |
| Worker強制終了 | catchが走らず途中分割が残る | 完成情報のない分割を完成扱いしない。明示的な再取得で未完成世代を整理。途中からのRange再開は行わず、そのファイルを先頭から取得 |
| 保存互換性 | アプリ更新で保存を失わないことが必要 | DB名・version 1は維持。旧 `[url,index]` と新 `[url,generation,index]` を読める。正常な旧Cache APIは再利用し、例外は新保存を妨げない |
| アプリ更新 | skipWaiting＋旧shell削除で、使用中の旧画面が参照するWorkerのハッシュURLを失う経路 | 即時切替を廃止し、旧タブの終了を待つ。更新待ち中のWorker起動・オフライン再利用、更新後のIndexedDBと旧Cache保持を検証 |
| 使用版 | ログから新旧の識別が難しい | 画面のアプリ版とJSONの `appBuild` を追加。今回のアプリ版は `dee194cc740a` |
| 実モデル検証スクリプト | 推論失敗でも終了コードだけでは成功と区別しにくい | GPU機能不足は取得せず `not-run` / exit 2、保存・オンライン生成・オフライン生成失敗はexit 1、全部成功時だけexit 0 |

書込と明示削除はWeb Locksで直列化。Web Locks非対応時の代替は同一JS実行領域のみで、複数タブ書込の保証はない。初期化時に保存領域を掃除しない。未完成世代の整理は再取得時だけなので、途中終了後の使用量は再取得まで残りうる。正常ファイルの置換中は新旧分のディスク容量が必要になるが、通常のダウンロード操作は完成済みファイルを再利用する。

完全性確認の範囲は分割キーの構造・取得サイズ・読込時の分割サイズと総サイズまで。同じ長さの内容改変を検出する暗号学的ハッシュ検証、旧Cache API本体の全内容検査、OSによる保存削除の防止は未実装。manifest確認の成功は推論成功・永続保持の保証ではない。

## メモリ経路のレビュー

取得は4MiB作業バッファとストリームで行い、重み全体のarrayBuffer・clone・チャンク配列収集は行わない。各IndexedDB書込にはstructured cloneやブラウザ内部のバッファがあり、総メモリが4MiBだけになるとは言えない。

状態確認では分割キーだけを読み、ResponseはhighWaterMark 0。実際の読込時に分割サイズと総サイズを確認する。保存済みResponseのContent-Lengthは実保存サイズにするため、Transformers.jsがサイズ不明でバッファを繰り返し拡張する経路を避ける。

一方、Transformers.js 4.3.1の `src/utils/hub.js` / `src/utils/hub/utils.js` の `readResponse` は重み全体のUint8Arrayを事前確保し、全分割をそこへコピーする。その後 `src/backends/onnx.js` の `InferenceSession.create` へ渡され、ORTのWASM・WebGPUのメモリも必要。約570MBの重み取得成功は、この初期化の成立を保証しない。GPUのmaxBufferSizeは総メモリ上限ではない。

実機メモリ測定ができないため、ORTのメモリ設定の恣意的な変更やq4への自動変更は行っていない。q4はFP32演算の比較用で、省メモリ化の保証はない。モデル置換も行わない。

## 実施した検証と失敗

実行環境: Linux Cloud / Node.js 24.19.0 / npm 11.9.0 / Playwright Chromium。テスト成果物はgitignore対象 `test-results/`。

| 検証 | 結果 |
|---|---|
| 通常の `npm ci` | onnxruntime-nodeの取得がECONNREFUSED / ENETUNREACHで失敗 |
| `NODE_USE_ENV_PROXY=1 npm ci` | 環境のプロキシを利用し成功。依存・lockfileの変更なし |
| 現行mainの `npm test` / `npm run build` | 10件成功・本番ビルド成功 |
| 現行mainのブラウザ保存検証 | ダミーデータで成功。実機失敗は再現せず |
| `npx playwright install --with-deps chromium` | OS依存導入のsu認証で失敗。管理者パスワードは要求しない |
| `NODE_USE_ENV_PROXY=1 npx playwright install chromium` | 成功。既存OS依存でブラウザが実際に起動した |
| 修正後 `npm test` | 26件成功。旧形式、旧Cache再利用、サイズ不一致、容量不足、分割／manifest transaction abort、孤立分割、分割欠落、並行書込、起動失敗等 |
| 修正後 `npm run build` | 成功。ES形式のbootstrap・分離モジュール・ローカルWASMを出力 |
| 本番preview port 4173＋`node scripts/browser-check.mjs` | 成功。12MiB＋123 bytesのダミー重みを4分割し内容一致、形式復元、再取得なし、オフライン再利用、Worker import失敗と再試行、更新待ち・更新後モデル保持、画面の横はみ出しなし、未処理pageerrorなし |
| `node scripts/inference-check.mjs` | `not-run` / exit 2。WebGPUは検出、shader-f16は非対応。第一候補q4f16の実モデルを取得せず、実モデル推論は未検証 |
| iPad第10世代Safari / 実モデル保存・生成 | 今回は未検証 |

開発中の回帰検証では、manifest transaction abortが `AbortError` を返すテストで当初のエラー文言条件が狭く1件失敗した。abort自体を確認する条件へ修正して成功。アプリ更新テストでは、Service Worker内の登録状態の取得と新画面の自動再登録を含めた判定がタイムアウトした。非制御ページから有効化を確認する方法に変更した。更新後に旧shell名が残る観測もあり、全旧shell名の即時消滅は保証せず、今回必要な更新待ち・新shell有効化・モデル保持を確認している。これらをiPadでの失敗再現として扱わない。

## 次の実機確認と方式判断

[iPadの最小手順](ipad-verification.md) を使用する。PRのマージ・Pages公開後、サイトデータを削除せず旧タブを閉じて更新し、アプリ版を確認。取得一回→再読み込みで5/5と分割表示→初期化一回→64トークン生成→タブ終了後の機内モード生成。各段階で失敗したらそこで止めてJSONと最後の表示を記録する。

今はQwen3を維持して、この保存・初期化の切り分けを一度行うのが妥当。Worker起動失敗だけではQwen3が端末に重すぎる証拠にならない。一方、正常保存・最新資産を確認した状態でも初期化でSafari終了が再現するなら、Qwen3必須のPhase 1は成立しないと判断し、辞書中心の軽量検索・確定情報表示を優先し、AIは任意機能とする方針を勧める。辞書方式は重み全体・WASM・GPU初期化を必要としないため、災害時に確実に情報を見られる目的に適する。別モデルの採用はメモリ・日本語品質・オフライン再利用を比較してから相談し、無断置換しない。今回、辞書の移植やPhase 2着手は行っていない。
