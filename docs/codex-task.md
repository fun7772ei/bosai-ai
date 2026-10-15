# Codexに渡す短いタスク

リポジトリ `fun7772ei/bosai-ai` の会話エンジンを、既存コードの局所修正ではなく**必要なら全面再設計**してください。開始時に `AGENTS.md` と `docs/conversation-rewrite-brief.md` を読んでください。

- 既存の `coverage` / `classifyAnswerRequest` / `assessQuestion`、`conditions` / `factsIn` / `mergeFacts`、`contextualEvidence` / `assessApplicability` の重複を調べ、判断の一貫性を持つ小さな設計へ統合する。内部API・旧コード・UI内部は壊して構わない。
- 88件の原文と出典、未確認の適用前提、オフライン辞書・保存済みRuri、Moonshineの任意性、停止/リセットの整合性、非対応質問の抑止は製品要件として守る。
- 過去の結果・回帰データは変更しない。差異を隠さず記録し、必要なら旧実装を適切に削除する。単なる条件分岐の追加を目的にしない。
- 開発は別ブランチの**draft PR**で進め、軽量テストで反復。Ready-for-review時にフルCIを実行。新しい未使用ケースで適用範囲を検証する。
- **マージ・Pages公開はしない。** 変更後の設計、旧処理との違い、失敗/残課題をPRに記録する。

注: PR #19 の設計文書・CI改善が `main` に未統合なら、PR #19 のブランチ `refactor/architecture-reset-20261015` を作業の基点にして、スタックPRとして提出するか、#19統合後に着手する。どちらも旧mainの指示を誤って優先しない。
