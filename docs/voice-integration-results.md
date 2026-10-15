# 音声・会話統合の検証（2026-10-15）

PR #21 / `prep/voice-conversation-eval-20261015`、準備コミット37af2dcからの変更。mainマージ・Pages公開なし。元88件、出典、88 sidecar、過去の凍結評価は変更していない。検証済み前提は4件のまま。

## 実装

- 通常はMoonshine WASM 0.1.5の日本語Tiny非Streaming。Baseは明示的な `voice_eval=base` 評価経路のみ。iPadでの適合を確認した一般向け選択肢には昇格していない。実機検証のため任意に開けるが、未検証と表示し、準備ボタン前に取得しない。ページ切替時の入力・会話・評価記録消失を案内する。
- 暫定、確定、停止後の補正候補を分ける。`voice-correction.js` の候補を明示採用するだけで、自動修正や送信はしない。確定した原認識文を評価用に保持し、手入力・補正を原認識文に混ぜない。手修正・暫定末尾・入力の変更がある候補は適用しない。
- 28文の手動試行収集とモデル別JSON出力。新規の録音停止後だけ記録でき、同じ試行の転用・ケース上書きを抑止。ユーザーが書き出すまでページ内だけに保持する。
- SDKは使用したファイルだけ専用Cache Storageへ保存。シェル更新やモデル保存キーを変えず、データ消去なし。容量不足でSDKキャッシュに書けなくてもオンライン取得を妨げない。
- 音声分離ページからの実Ruri Worker起動失敗を再現し、Ruri Worker自身の応答にもCOEP/CORPを付けて修正。マイク開始エラー時もclose経路を通す。
- 道路と車内の疑問/否定/肯定、車の状態と移動手段を分ける。共通道路語彙と冠水述語で水に覆われた道路・水浸しの通りを認識する。型付き条件を短い訂正・追質問へ継承し、場所とassertionの出所を保持。友達への主体変更を確認。一般的な「何分・何秒」を一律禁止しない。現在安全性・未収録数値限界は引き続き拒否する。
- 既存のfocus整合評価を車内脱出にも適用。bosai-84は履物の原文として一覧・明示した履物質問から確認でき、移動の質問の代替根拠にしない。provisionalのまま。

## 測定の区別

`moonshine-manifests.json` は実ブラウザWASMから得たマニフェスト。Tinyは71,815,430 bytes、Baseは141,001,214 bytes（各3モデルファイルの合計。SDKやメモリ量ではない）。`fetch-moonshine-assets.py` は配布URLを実取得しサイズ・CRC32Cをマニフェストと照合、SHA256と応答ヘッダーも記録する。実モデルはtest-resultsのみに保存し配布しない。Community License全文・Notice・Powered by Moonshine AI表記を同梱した。非商用検証であり、商用利用条件の法的承認を意味しない。

実モデルのブラウザ試験はLinux Chromium CPU/WASM、CDN実ファイルをローカルfixtureで運ぶ方式。Moonshineは合成マイクで開始/停止を確認するだけで、日本語音声精度の試験ではない。`voice-review-ui.json` はSDKテストダブルによるUI確認で、実ASRの証拠ではない。日本語28文のTiny/Base CER、iPad速度・ピークメモリは未測定。

各試験の最終結果・CIリンクは検証完了後に追記する。実機手順は [voice-integration-ipad-checklist.md](voice-integration-ipad-checklist.md)。SDK closeとモデルdisposeの確認は、WASMヒープのOSへの即時返却を証明しない。複雑な照応・複数経路の日本語全体の意味理解、未監査84 sidecarの適用保証も残課題。
