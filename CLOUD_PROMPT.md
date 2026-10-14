# 検索実験の最新状態

今回の作業ブランチは `codex/phase1-natural-language-search`。PR #7 (`codex/phase1-cpu-model-comparison`) を継承する積み上げPR。PR #6/#7/今回のPRを勝手にマージせず、Pagesも公開しないでください。[検索比較結果](docs/phase1-search-prototype.md) とCLOUD_HANDOFF.mdの最新節を先に読んでください。

88件を原文のまま移植し、モデル不要の軽量検索を既定に、従来AND検索・LFM350/700による候補選別を比較できます。LLMは上位3件のタイトルから番号を選ぶだけで、表示する防災情報は常に原文です。既存のモデル保存・選択・停止・リセットを維持し、モデルの取得は明示操作だけです。

検索実GGUFの再現は本番preview4173で `node scripts/search-browser-check.mjs --model=lfm2-cpu` / `--model=lfm2-700m-cpu`、集計は `node scripts/summarize-search.mjs`。検索評価は40問の開発用セットであり、独立した専門家評価ではありません。LLMが精度を悪化させた結果もそのまま記録し、検索結果を安全性の保証と扱わないでください。

---

# Codex Cloudに貼り付けるプロンプト

対象リポジトリは `fun7772ei/bosai-ai`、開始点は最新の `main` と未マージPRの状態を確認して決めてください。比較ブランチは `codex/phase1-cpu-model-comparison`、依存するPR #6は勝手にマージしないでください。以下を新しいCloudチャットの依頼文として使ってください。

---

防災AIチャットボット `bosai-ai` のPhase 1を引き継いでください。最初に `CLOUD_HANDOFF.md`、`README.md`、`docs/specification-v1.1.md`、`docs/phase1-results.md`、`docs/phase1-cpu-results.md`、`docs/phase1-cpu-quality.md`、`docs/phase1-four-cpu-models.md`、`docs/ipad-verification.md` を読んでください。古い記述は履歴として扱い、最新の比較結果とユーザー指示を優先してください。

現在の有力候補は **LFM2.5-350M GGUF Q4_K_MのCPU/WASM版**。wllama/compat 3.8.1、1スレッド、GPUなし、文脈512、入力200文字、出力32/64、履歴なしを維持します。CPUの比較候補としてQwen3.5-0.8B日本語SFT v2、Qwen3-0.6B、LFM2-700Mもあります。Qwen系はJinjaとenable_thinking:falseを明示します。旧WebGPUも互換性のため残しますが、第一候補ではありません。新しいモデルはユーザーの依頼なしに追加しないでください。

必須対象は **iPad第10世代・iPadOS 26.5・Safari**、最終的にPWAで初回取得後のオフライン利用に対応することです。ユーザー判断でオフライン/PWAの実機テストは後回し。Safari通常タブでの安定性と回答品質を優先し、同じ入力の反復やサイトデータ/アプリ消去を求めないでください。

WebGPU版ではQwenの初期化、Gemmaの連続生成、LFMの入力変更時にクラッシュ報告があります。CPU版の提供ログは異なる入力7件完了、その後の別試行でも5件完了とリセット後の再初期化・生成成功を記録しています。短時間のユーザー提供結果であり、開発側によるiPad直接検証・長時間安定性・途中停止・PWAオフライン成功とは扱わないでください。UAだけでiPadの機種を確定しないでください。

現在の課題はコピーの省略、出力形式違反、要約の時刻欠落、食べ物の誤分類など。公式テンプレート、system指示、生成パラメータ、出力上限を一つずつ比較し、実GGUFの出力・正誤・速度に根拠のある変更だけ採用してください。テスト専用の固定回答や入力別分岐で品質を偽装しないでください。今回のユーザー指示で、Phase 1の検索比較実験として辞書88件の固定コピー・原文表示・自然言語検索を先行実装しました。正式なPhase 2統合・RAGには進めず、検索の精度と速度・実機結果で判断してください。

保存は既存IndexedDBへ4MiB分割し、全分割保存後に完了情報を書きます。旧Cache API/IndexedDB形式、モデル別選択・量子化設定・保存済みモデルを維持します。アプリ更新で保存を削除しないでください。分割保存でもWASM/重み/KV等のメモリが必要で、ピークメモリ改善は未計測です。クラッシュ原因や、再読み込みが保存済み重みを削除したことを断定しないでください。

質問や回答を外部AI APIへ送信せず、モデル本体をGitやPages成果物へ含めないでください。`fun7772ei/bosai-app`は読み取り・固定コピーの参照元で、一切変更しないでください。データはローカル同梱し、GitHubへの動的同期は不要です。

Node.js 24以降で `npm ci`、`npm test`、`npm run build`。Cloudでは必要に応じてNode 24のプロキシ対応を `NODE_USE_ENV_PROXY=1` で有効にします。ブラウザ準備は `npx playwright install --with-deps chromium`。本番previewをport 4173で起動し `node scripts/browser-check.mjs`（ダミー保存）と `node scripts/cpu-inference-check.mjs`（実GGUF）を実行してください。品質調整の比較は `node scripts/cpu-quality-check.mjs`。4モデルの比較は `node scripts/cpu-model-comparison.mjs`、32/64実生成とメモリは `--timing-only`。アプリ経路の追加CPUは `node scripts/cpu-inference-check.mjs --model=lfm2-700m-cpu --smoke` 等。モデルはGit対象外のローカルファイルを使用します。ダミーデータ、Chromium実モデル、ユーザー提供実機ログを区別してください。

`codex/`で始まるブランチで作業し、比較結果・失敗・未確認事項・最小限のiPad手順を日本語で資料に記録して、レビュー可能なPRを作成してください。今回の依頼がPRまでの場合は自動マージ/公開しないでください。「iPad確認済み」「完全オフライン完成」と一括して報告せず、どの環境・範囲の検証が成立したかを明記してください。
