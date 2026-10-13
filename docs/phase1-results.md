# Phase 1の実装・検証結果

検証日: 2026-10-13（日本時間）。Phase 1のテストページ実装を完了。**iPad実機検証は未実施で、Qwen3のSafari推論成功・実機速度・長時間安定性は未確認。**

| 検証 | 結果 |
|---|---|
| Node.jsテスト | 速度の計算・初回トークンなしの2件が成功 |
| Vite本番ビルド | 成功。JS/Worker/WASM/Service Workerを出力 |
| npm依存の監査 | インストール時点で既知の脆弱性0件 |
| Windows Playwright Chromium | ページ描画、オフライン画面再表示、GPUエラー表示・再試行、390px幅で横はみ出しなし、未処理pageerrorなし |
| 自動ブラウザのモデル推論 | WebGPUアダプターを取得できず未実行。UIのエラー表示を確認 |
| Windows Codex内ブラウザ | WebGPU・shader-f16対応を検出。モデル読込開始後、ブラウザ制御がタイムアウト。読込完了・生成成功は未確認 |
| iPad第10世代 / Safari / PWA | 未検証 |
| モデル保存後のオフライン再推論 | 未検証 |

Windowsブラウザの対応検出はiPadの検証結果ではない。生成速度や日本語回答の品質は実測値がないため掲載しない。オフラインでアプリ画面を表示できることと、モデルを再利用して生成できることは別の確認項目。

ブラウザテストでVite previewの`Vary: Origin`によるオフライン資産取得失敗を検出し、固定アプリ資産のCache.matchをignoreVary指定に修正。修正後の再テストは成功。モデル・アプリのキャッシュを分離し、アプリ更新時にモデルキャッシュを削除しない。

`fun7772ei/bosai-app`はGitHub連携でmetadataと`data.js`冒頭のみ参照。変更・push・移植は行っていない。新規の`fun7772ei/bosai-ai`へ独立実装する。AI重みはGitの対象外。

次に [iPad検証手順](ipad-verification.md) で実測し、その結果に応じてPhase 2の辞書移植・軽量検索・RAGへ進める。Phase 2〜4の機能を完成済みとは扱わない。
