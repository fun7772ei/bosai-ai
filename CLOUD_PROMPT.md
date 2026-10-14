# 今回の最新方針：Ruriサイズ・検索品質研究

ユーザーは今回は **mainマージ・Pages更新を禁止**。旧公開承認で公開しない。新規PR #14は未マージ。`CLOUD_HANDOFF.md`と`docs/ruri-size-study.md`を先に読む。30Mの公開版と保存を維持し、音声PR #12も保持する。

30/70/130の実q8比較・研究モデル選択・typed coverage/action guardを実装済み。判断は30M維持。ガードには否定長文の誤棄却/別場面選択が残り、公開採用しない。aab6486で凍結後の新80問は最終用で、正解を見て調整してはいけない。次の改善には別の開発・評価問題を用意する。

ユーザーによるiPad10 Safariの30M基本動作は成功報告あり。未確認は長時間/実メモリ/PWA同等性/オフラインactual方式のJSON/70M・130M。開発側の実機操作や全オフライン成立とは扱わず、既存の3問反復を要求しない。

研究入口はruri-study.html、dev:ruri/build:ruri/preview:ruri。公開build/cacheを肥大化させず、原文88件/元bosai-app/旧保存を変えず、外部AI API/重みのGitコミット/自由生成LLMの公開復帰は禁止。詳細と証跡は上記資料。

---

以下は以前の公開時方針の履歴。

# bosai-ai：Ruri優先ベータの継続作業

2026-10-14 UTCにPR #10を通常mergeして公開済み。アプリ版f41848b50937、公開URL https://fun7772ei.github.io/bosai-ai/ 。実HF保存・Chromiumオフライン再起動まで成功、iPad実機は未確認。公開証跡は `docs/diagnostics/beta-release.json`。

`fun7772ei/bosai-ai` の [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md)、[README.md](README.md)、[公開ベータ検証](docs/ruri-beta.md) を先に読んでください。過去のCPU品質/6方式比較は履歴として残っています。

公開版は88件の原文を参照する防災辞書です。既定は軽量＋Ruri-v3-30m q8 CPU/WASM、Ruri単独も利用可能、未保存や失敗時は軽量検索へ戻ります。候補と質問の答えを同一視せず、状況を確認して原文・注意・出典を表示します。現在の災害/警報・開設状況や個別医療判断は提供できません。未収録判定には取りこぼしがあり、正式な安全性確認済みではありません。

公開ビルドで防災回答の自由生成を実行しないでください。研究コードと旧保存は維持し、研究は `research.html` / `npm run dev:research` / `npm run build:research` で分離します。公開成果物へ研究HTML・LFMランタイム・モデル重みを混入させないでください。`node scripts/check-public-build.mjs` で検査します。

データ88件の原文を変更せず、元 `fun7772ei/bosai-app` も変更しません。アプリに固定コピーと事前計算ベクトルを同梱し、実行時にGitHubへ同期しません。Ruri本体は初回明示取得→既存IndexedDBへ4MiB分割保存→保存済みのみで再利用。既存モデル選択・設定・保存を更新で削除しないでください。質問を外部AI APIへ送らず、重みをGitに含めません。

PR #9の64問は回帰用。87cf7c3後の80問はレビュー修正後には回帰用です。安全上のレビュー修正をd7be140で再凍結した後の60問が最終評価用で、正解を見て検索設定を調整してはいけません。次回改善は新たな開発問題で行い、新しい独立評価を用意します。結果と失敗例は `docs/diagnostics/beta-*.json`。精度・棄却・危険な取り違え・曖昧質問を別々に評価してください。

Node.js 24以降で `npm ci`、`npm test`、`npm run build`、公開成果物検査。実モデル用は `python3 scripts/fetch-ruri-assets.py`、port 4173の本番previewと `scripts/beta-browser-check.mjs`。詳細な再現コマンドは公開ベータ資料を参照してください。実モデル・ダミー保存・Chromium・Safari実機の結果を混同しません。

現在の公開依頼は、PRで変更をレビュー可能にし、必要な検証が成功した場合のmain統合とPages公開まで承認されています。積み上げPR #6〜#9を個別に公開せず、生成無効化までまとめてmainへ統合します。公開チェックに重大な問題があれば公開せず報告します。今後の作業で公開範囲が変わる場合は、その時点のユーザー指示を優先してください。

目標端末はiPad第10世代・iPadOS 26.5・Safari・オフラインPWAですが、今回の開発側実機検証は未実施です。「iPad確認済み」「完全オフライン完成」と報告せず、ベータ版を明示してください。Safari通常タブとホーム画面PWAは別に最小限の試験を行い、アプリ/サイトデータの削除を要求しないでください。Phase 2正式統合・会話/RAGへ進めません。
