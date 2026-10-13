# Phase 1安定化レビュー（2026-10-14、日本時間）

対象main: `63d3853`。Qwen3-0.6B、q4f16第一候補、固定revision、Transformers.js 4.3.1、WebGPU、GitHub Pagesを維持。Phase 2は未着手。bosai-appにはアクセス・変更していない。

## 結論

Phase 1は**iPadで未成立（修正版の実機結果待ち）**。今回の保存経路改善は、実モデル保存・生成・完全オフライン動作の成功を証明しない。提供ログは重み保存失敗を示し、再読み込みによる保存済み重みの削除は示さない。

辞書中心の軽量方式は、災害時の基本機能として優先すべき。ただし今すぐQwen3を置換する根拠は不足。今回の修正版で保存→再起動→短い推論を一度切り分け、推論初期化で再度Safari終了が起きるなら、iPadでは生成を必須にせず軽量検索中心へ進める判断を推奨する。別モデルへの置換・辞書移植は今回行っていない。

## レビューと変更

| 対象 | 確認・修正 | 残る制約 |
|---|---|---|
| 取得・保存 | 順次取得、4MiBの一時バッファ、chunkごとのtransaction完了待ちを維持。空データとContent-Length不一致を保存完了にしない | Content-Length不明・圧縮の場合、配布元サイズとの照合はできない。通信側が渡すchunkのサイズ自体は制御できない |
| transaction失敗 | chunk書込・完了情報書込のabortを注入し、失敗伝播・完了扱いしないこと・再試行を検証 | fake-indexeddbによるabortはSafariの容量不足・Internal errorそのものの再現ではない |
| 途中終了 | manifestのない孤立chunkは不可視。次の同一URL取得で除去してやり直す。兄弟ファイルは維持 | 強制終了ではcatchは走らない。中断位置からのRange再開は未実装。孤立chunkは再試行か明示削除まで容量を使う |
| 完全性 | 保存状態取得時にchunk件数をキーだけで確認。読込時に総byte数と新manifestの分割サイズを確認 | 同じ長さの内容破損は検出できない。SHA等による配布元との内容照合は未実装。旧Cacheは存在確認のみ |
| 保存形式・更新 | DB名・version・キーは変更なし。旧manifestの読込をテスト。正常な旧Cacheも再利用し、自動再書込・削除なし。SW更新はshell名のみに限定 | 必要5ファイルありは推論成功の意味ではない。q4とq4f16両方が完全な場合は既存選択を維持 |
| 再読み込み | close/reopenのbyte一致をNodeで確認。量子化復元と最後の段階表示は既存実装を維持 | 意図的終了も途中終了表示になる。OS/Safariによる保存領域の破棄を防ぐ保証なし |
| オフライン | 読込Workerは保存済みモデルのみ、欠損HFファイル取得拒否。JS/WASMはshell保存。ブラウザスクリプトにダミー保存を残したオフライン再読込・再利用を追加 | この環境ではブラウザを起動できず追加経路は未実行。実モデル・機内モード・ホーム画面は未確認 |
| 推論メモリ | 依存のhub.jsとhub/utils.jsを直接確認。progress付き読込でも`new Uint8Array(total)`へ全モデルを集め、各chunkをコピーする。正しいContent-Lengthの維持は再確保を避ける上で必要 | 約570MBの連続CPUバッファに加えORT/WASM/WebGPU側の確保が必要。コピー数・ピーク・実機上限は未測定。WebGPU maxBufferSizeは総メモリではない |
| 推論検証スクリプト | WebGPU検出を取得前に実行。保存・初期化・オンライン/オフライン生成失敗と空出力で非ゼロ終了にする | 推論スクリプト自体は未実行。短い出力の有無は日本語品質の合格判定ではない |

新manifestには`chunkBytes`を追加するだけでDBのmigrationやclearは行わない。正常な旧manifestには総byte数の照合を適用し、分割サイズは新manifestのみ照合する。状態確認で重み全体を読まない設計を維持する。

## 今回実施した検証

実行環境: Linux / Node.js v24.19.0。iPad・Safariは使用していない。

| コマンド・確認 | 結果 |
|---|---|
| 通常の`npm ci` | 失敗。onnxruntime-nodeの追加バイナリ取得がERR_PROXY_TUNNELでタイムアウト |
| `npm ci --ignore-scripts` | 成功。初期のレビュー・テスト用。これだけを通常install成功とは扱わない |
| `ONNXRUNTIME_NODE_INSTALL=skip npm ci` | 成功。依存の公式installスクリプトが提供するNode追加バイナリ省略指定。ブラウザ用ビルドではNode CUDAバイナリを使用しない |
| `npm test` | 16/16成功。既存10件＋6件（うちtransactionケースはchunk/manifest両方） |
| `npm run build` | 成功。JS/Worker/ローカルWASM/SW/shell出力 |
| `node --check scripts/inference-check.mjs` | 成功（構文確認のみ） |
| `npx playwright install --with-deps chromium` | 失敗。aptのsetgroups/seteuid権限制約 |
| `npx playwright install chromium` | 失敗。配布ZIPが不正または不完全で展開不可 |
| `npm run preview -- --port 4173` | 起動失敗。uv_interface_addressesの環境制約 |
| `npm run preview -- --port 4173 --host 127.0.0.1` | Local URLの起動表示まで確認。別実行からのcurlは接続不可。HTTP疎通成功とは扱わない |
| `node scripts/browser-check.mjs` | 起動失敗。Chromium実行ファイルがなく、ブラウザ保存検証は未実行 |
| WebGPU・実モデル生成 | ブラウザ起動前に停止したためGPU利用可否も未確認。実モデルの取得・推論は今回実施していない |

最初のテスト実行もnpm ci失敗後の依存不足で2テストファイルが失敗した。依存導入後の既存10件と修正後16件は成功。過去のWindows Chromium成功を今回の環境・実装・iPadへ流用しない。

PR用CI `.github/workflows/phase1-check.yml`を追加。Node24で通常npm ci、テスト、本番ビルド、Chromium導入、4173 preview、ダミー保存ブラウザ検証を実施する。Pages公開は行わず、実モデルはダウンロードしない。CI結果はGitHub上で別途確認するまで未確認。

## iPadで次に試す最小手順

PRがレビュー・mergeされPagesに反映された後、Safariの通常タブで試す。保存削除・サイトデータ削除は不要。

1. iPadOSバージョンと端末型番を控え、オンラインでq4f16の「ダウンロードして保存」だけを一度実行。失敗したら推論せずJSONと最後の表示を保存して終了。
2. 保存完了後にページを再読み込み。5/5とIndexedDBの分割数が残るか確認。不足なら推論せずJSONを保存。Safariを閉じて再起動しても残るか確認。
3. 5/5の場合だけ「モデルを読み込む」を一度実行し、64トークンで「日本語で1から5まで数えてください。」を生成。落ちたら一度復帰し、前回段階とJSONを保存。同じクラッシュを繰り返さない。
4. 成功した場合のみJSONを保存し、機内モード＋Wi-FiオフでSafariを再起動。「保存済みモデルのみ使用」で読込→同じ短い生成を一度試す。

この4段階が成功してから、停止・リセット・連続利用・ホーム画面版を既存の詳細手順で試す。ここまで成功しても長時間安定性・ホーム画面アプリの保持は別検証。
