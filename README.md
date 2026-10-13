# bosai-ai — Phase 1

仕様書v1.1の最初の段階として、Qwen3-0.6Bの単独推論を検証するページ。iPad第10世代・iPadOS 26以降のSafariを優先する。**iPad実機での読み込み・推論・速度・安定性は未確認。** 辞書未統合のため、このページの回答を防災判断には使わない。

## 起動

Node.js 24以降で `npm ci` → `npm run dev`。本番とオフライン動作を確認する場合は `npm run build` → `npm run preview` → http://localhost:4173/bosai-ai/ 。WebGPUとService WorkerにはHTTPSまたはlocalhostが必要。iPadからLANのHTTPアドレスを開く方法はWebGPU検証には使えない。

公開予定URL: https://fun7772ei.github.io/bosai-ai/ 。GitHub Settings → Pages → Sourceを **GitHub Actions** に設定してmainへpushすると、`.github/workflows/pages.yml`でテスト・ビルド・公開する。

## 実装

- Transformers.js 4.3.1とONNX Runtimeはロックファイルで固定。
- `onnx-community/Qwen3-0.6B-ONNX`のrevision `1e0a4a196ecabdf9a879664110574563d3f372d3`を固定。第一候補q4f16、比較用q4。どちらも4bit重み。q4f16はshader-f16が必要。
- 専用Workerでモデルの取得・ウォームアップ・生成。`enable_thinking: false`、最大128トークン（64/128/256選択）、履歴なし。生成途中停止とWorkerリセットに対応。
- 読み込み時間は取得・初期化・1トークンのウォームアップを含む。初回トークン時間はテンプレート作成・prefillも含む。画面のtokens/secは生成トークン数÷生成全体の秒数。JSONのdecodeTokensPerSecondは初回トークン後の速度。特殊トークンもトークン数に含まれ、文字数とは異なる。
- 10回連続生成、最大100件の測定結果、診断ログ、JSONエクスポート。履歴はページ再読込で消える。質問・出力はAPI送信せず、診断JSONに含まれる。
- モデルは初回にHugging Faceから取得しCache APIの`bosai-ai-model-v1`へ保存。モデルをGitに含めない。JS/WASMはnpmパッケージからビルド成果物へ配置し、CDNへの実行時依存を避ける。
- Phase 1で再起動・オフラインを試すための最小Service Workerを先行実装。アプリキャッシュはビルドハッシュごとに更新。モデルキャッシュはアプリ更新で削除しない。保存ファイル数は完全性の保証ではなく、再起動後のオフライン生成をもって確認する。
- 保存済みモデルのみ使用するモードは、Transformers.jsのネットワーク取得を明示的に拒否する。アプリ本体はService Workerから再利用する。未保存・容量不足・Safariのストレージ削除は失敗として確認する。永続保存APIの許可は保持保証ではない。

## 検証

`npm test`、`npm run build`。ブラウザテストは `npx playwright install chromium`、本番preview起動中に `node scripts/browser-check.mjs`。実モデルの取得を伴う任意テストは `node scripts/inference-check.mjs`（WebGPU利用可能な環境が必要）。

今回の結果と限界は [docs/phase1-results.md](docs/phase1-results.md)、iPadでの手順は [docs/ipad-verification.md](docs/ipad-verification.md) に記録。デスクトップChromiumの結果をSafari実機の確認として扱わない。

## 次の段階

Phase 2: `fun7772ei/bosai-app`の`data.js`にある88項目を、内容・優先度・注意事項・出典を維持して移植。元リポジトリは参照のみ。Phase 1では移植しない。参照時のblob SHA: `881355b4a4b85a1da39515e8578aa5f74bb2644b`。元リポジトリはprivateのため、辞書を公開リポジトリに移す際に公開範囲・利用条件を確認する。

検索、緊急時の確定情報、3〜5件の根拠付きRAGを独立モジュールとして追加する。AIエラー時も辞書検索を維持する。Phase 3で会話UI・IndexedDB履歴、Phase 4で保存管理・PWA更新・容量不足への対応を仕上げる。iPadのPhase 1結果を判断材料にし、AIが動かない場合は軽量検索を中心に進める。

## 技術参照

- [Qwen3 ONNXモデルカード](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX)
- [Transformers.jsのQwen3公式例](https://github.com/huggingface/transformers.js-examples/tree/main/qwen3-webgpu)
- [WebKit Safari 26.0のWebGPU対応](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

アプリコードの再利用ライセンスは未設定。モデルの利用条件は固定revisionの配布元・ベースモデルを確認する。
