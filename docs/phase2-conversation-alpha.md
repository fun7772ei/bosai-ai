# Phase 2 α：文字会話と原文参照の試作

今回の成果は新規PRでの試作・検証まで。**mainへマージせず、Pagesは更新しない。** 公開URLにこの会話機能はまだない。

## 現在の基準と先行成果の扱い

Issue #17全文（コメントなし）を最初に読み、最新main **6ae5471659499a16fd0c6ad4b7dbc0844b49b151** から `codex/phase2-text-conversation` を作成。開始時のPagesはHTTP取得成功、公開JSの表示ビルド **d07e478f5f8f**。mainのPages Actionsも成功している。

- PR #14はOPEN・未マージ。比較報告・`intent.js`・`improved.js` を確認。30M継続の根拠と、未収録棄却の改善と引き換えに否定/長文の誤棄却・再現率低下を起こした問題を引き継ぐ。研究ガード・大型モデル・別文書ベクトルは取り込まない。
- PR #12/#13/#15はMERGED。現行Moonshineは同一origin SDK `@moonshine-ai/moonshine-wasm@0.1.5`、日本語 `ModelArch.Tiny` 通常版・非Streaming。SWの `?voice_iso=1` 分離は維持。`onText` は暫定表示、`onLine` が既存 `#question` に確定反映する。
- Issue #16全文を確認。iPadユーザーの基本音声認識成功、約14文字付近の入力欄反映停止、誤認識が報告済み。暫定イベントと確定イベントの差は原因候補で、未確定。**本作業では未修正・未解決のまま。** TinyStreamingへ戻さず、二重SDKや新マイクUIを作らない。
- 古いCLOUD_*・音声資料の「未着手」「Streaming」「iPad未検証」を現状として転記しない。ユーザーによるRuri30基本検索/オフライン成功、Moonshine基本認識成功はIssue #17のとおり。開発者がiPadを操作した意味ではなく、長時間・実RAM・PWA同等性・オフライン時のRuri診断確認は未完了。

## 実装

既存検索を初期表示として維持し、「会話モードを試す（文字入力）」で試作へ移動する。通常検索へ戻れる。Ruri保存/読み込みは既存パネルを使い、同じBetaController/Workerを共有する。追加モデル・依存更新・DB変更はない。既存 `beta-main.js` の全文をprefixとして保持し、末尾に独立UIのmountだけ追加した。Moonshine認識処理・既存 `#question`・SW・保存処理は変更していない。

`src/conversation.js` は生成器ではない。話題/災害、状況、対象行動、明示的な否定条件、確認した条件、原文ID、未確認候補をメモリ内で管理する。

- 最大40メッセージ。再読み込み/会話リセットで消去。状態や本文の自動外部送信・永続化はしない。既存の診断JSONは利用者の明示操作で質問を含み出力される。
- 「地震の相談→寝室です」の省略を補い、「それについて詳しく」は選択済み原文を参照。「新しい話題」、災害の変更、条件の訂正で古い原文を自動適用しない。
- 明示的な「AではなくB」「診断を求めていない」などを限定的に分離する。否定の一般的な構文解析はできない。PR #14の語彙ガード全体は移植していない。
- 文脈不足、複数の災害、複数の主体は確認質問にする。現況・個別診断/投薬等は辞書の範囲外とする。蓄積入力200文字超過時は切り捨てず、まとめ直しを依頼する。
- 回答可能性を `needs-context` / `outside-coverage` / `no-evidence` / `unverified-candidates` / `user-confirmed-source` に分ける。**検索類似度やユーザーの原文選択を、質問への十分な答え・安全性の認証には使わない。** 通常の検索結果は毎回候補として確認する保守的なα設計。
- 候補から利用者が選んだ原文の概要・全手順・注意・準備物・出典を表示。「もっと詳しく」「ほかの状況なら？」を用意。自由な要約・推奨・生成LLMはない。
- 停止/リセット/通常検索への復帰で古い非同期結果を破棄。モデル保存は消さない。音声が準備済み/処理中の場合、文字会話から別のRuriを同時にロードせず、通常検索の音声導線に戻るよう案内する。音声結果を新しい欄へ自動接続する改修は今回行わない。

## 評価方法

実装 **937a981** で検索/会話エンジンを固定後、新しい24会話・38ターンを作成。旧40/64/80/60問、PR #14の80問を新規最終問題として再利用していない。[凍結記録](diagnostics/conversation-freeze.json)でエンジンと既存検索9ファイルのSHA、問題SHAを検査する。最終結果を見て検索・エンジン・正解を調整していない。凍結後はUIの停止ボタンと検証スクリプトのみ補足。

Linux Chromium149 / Playwright1.61.1 / Node24.19.0、Ruri-v3-30m q8、Transformers.js4.3.1、CPU/WASM1スレッド。WebGPUを無効化。既存の固定revision/SHAの実ONNX4ファイルを検証し、HTTP fixtureを取得経路としてIndexedDBへ保存。偽Embeddingなし。インターネットの取得速度を測る試験ではない。

入力・ボタン操作から会話表示を確認。モデル未保存→軽量、実保存→Ruri、冷間初期化中の停止→再試行、会話リセット、390px表示、ブラウザ終了後の同一profileオフライン再起動、保存済み再利用、原文/出典一致、Worker解放を検証した。

## 実測結果

[全ターン・時間・チェック](diagnostics/conversation-browser.json)、[集計・失敗候補](diagnostics/conversation-summary.json)。

| 項目 | 結果 |
|---|---:|
| 新規会話 / ターン | 24 / 38 |
| 期待した状態・文脈条件の一致 | 38 / 38 |
| 正解IDを付けた検索ターン | 15（全て実Ruri併用） |
| Top-1 / Top-3 / Top-5 | 10 / 13 / 13（分母15） |
| 確認済み原文への追加参照 | 3 / 3 |
| 原文の全フィールド/出典をDOM照合した選択 | 6 / 6 |
| 評価セット内の実Ruri推論 | 20回 |
| 温状態の検索中央値（controller、描画前） | 約18.7ms |
| 初期化 / 初期化込み初問 | 約2.00秒 / 2.22秒 |
| ブラウザ全体PSSピーク（500ms採取） | 約756.5MiB |
| 解放前→解放3秒後の全体PSS | 約744.4→292.7MiB |
| モデル容量 | 従来と同じ43,778,410 bytes |
| オフライン再起動 | actual=hybrid、Embedding時間あり、再DLなし |

UI再描画やPlaywright操作を含む時間は全行の`wallMs`、推論/検索は`diagnostics.timings`。短い試験であり、長時間リークなし・全メモリ即時回収を証明しない。PSSは全ブラウザのLinux値で、モデル単体/iPad Safariの必要RAMではない。

38/38は、あらかじめ決めた聞き返し/文脈/棄却状態が返った割合。**意味的な完全正答率でも、安全な防災チャット成立率でもない。** Top-kは手作業で付けた原文IDとの一致であり、独立した防災専門家の評価はない。対象ケース数も小さい。

### 成功と失敗

- 地震→「寝室です」で文脈を補い39、断水トイレの聞き返しから17、確認後の注意/出典を保持。
- 「水没した車ではなく地震後に車を残す」で水没を検索へ混ぜず55が先頭。「電話番号ではなく在宅支援」は誤棄却しない。投薬量・現況は原文回答にしない。
- **冠水した道路を徒歩で進む質問**：期待69は3位、1位は竜巻74、2位は履物84。候補に津波10も残る。「激しい雨」だけでは既存災害フィルターが十分働かない。自動回答しないことで誤断定を抑えるが、危険な候補選びの問題は残る。
- **車→徒歩の訂正**：古い運転条件を外したが、訂正後は69がTop-5に入らない。保持する災害ラベルだけでは具体的な状況が失われる。これは会話制御の状態テストが通っても検索目的を満たさない例。
- **高い場所まで行く時間がない津波**：垂直避難2がTop-5にない。時間/到達可能性を候補選別へ結びつける必要がある。
- 「診断を求めない薬不足」は28が2位、夜間津波14は2位。ID不一致を全て重大な誤情報とは扱わず、原文の適用範囲を別途見る必要がある。
- 「津波じゃない、洪水」は複数災害扱いで聞き返す。否定された津波を回答へ適用はしないが、一般的な否定理解が完成した意味ではない。

検索結果からの十分性判定は未完成。利用者の選択に頼るため、迷う利用者の負担も残る。今回の結果から公開版の置換・自動回答への昇格は勧めない。次は場面/対象行動の保持と、根拠不足時の具体的な確認を開発用ケースで改善し、別の未使用会話で評価する。最終24会話は以後回帰用にする。

## 回帰・再現

```bash
# Node24以上。環境によってNodeのプロキシ利用が必要
npm ci
npm test
npm run build
node scripts/check-public-build.mjs
node scripts/import-bosai-data.mjs --check
npx playwright install --with-deps chromium
python3 scripts/fetch-ruri-assets.py
npm run preview -- --port 4173 --strictPort
# 別ターミナル
node scripts/conversation-browser-check.mjs
node scripts/conversation-report.mjs
node scripts/voice-isolation-check.mjs
node scripts/beta-browser-check.mjs --cases=scripts/evaluation/final-64.json --tag=phase2-beta-regression-64
node scripts/beta-browser-check.mjs --cases=scripts/evaluation/beta-unseen-80.json --tag=phase2-beta-regression-80
node scripts/beta-browser-check.mjs --cases=scripts/evaluation/beta-review-final-60.json --tag=phase2-beta-regression-60
```

単体91件（会話14件追加）成功。原文88件・順序・全フィールドは元の固定blob `881355b4a4b85a1da39515e8578aa5f74bb2644b` に完全一致。モデル/選択/設定/旧ダミーGGUFの保存保持は従来ブラウザ回帰で検証する。ダミーGGUF保持は実GGUF推論成功の意味ではない。

初回 `npm ci` はonnxruntime-nodeインストーラーの直接通信が失敗。`NODE_USE_ENV_PROXY=1 npm ci` で通常スクリプトを含めて導入成功。`playwright install --with-deps` はsu認証制約で失敗し、既設Chromiumを使用。GitHub CIでは通常手順も実行する。Moonshine分離/SDK検査は成功したが、今回マイクの認識精度やIssue #16を検証・修正した意味ではない。

## iPadで次に確認する最小手順（PRレビュー/別途反映承認後）

今回Pagesは更新しない。既存の3問の再検証やモデル再ダウンロード、アプリ削除は不要。開発版を実機で開ける段階になったら以下を確認する。

1. 保存済み30Mのまま文字会話に入り、「地震の相談」→「寝室です」→候補選択→「注意事項は？」。原文の注意/手順/出典と、文脈の引継ぎを確認。
2. 「津波で高台に間に合わない」など別場面へ切替。古い原文を適用しないことを確認。冠水徒歩は既知の失敗例なので、正答保証と受け取らない。
3. 会話の停止/リセット後に再送信し、保存は残ることを確認。再読み込みで会話が消えることも確認。
4. オフラインで開き直し、会話の診断で actual=hybrid/ruri とEmbedding時間を確認。軽量フォールバックと区別する。
5. Safari通常タブとホーム画面PWAは別の検証。今回iPad実機を操作していないため、この会話UIのSafari互換性・PWA同等性は未確認。音声問題はIssue #16の別トラックとして残す。
