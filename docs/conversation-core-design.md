# 会話判断層の統合（2026-10-15）

基点は未統合の PR #19 `refactor/architecture-reset-20261015`。元データ、凍結評価、保存DB、モデルworker、音声アダプタは変更しない。

## 境界と対応

| 旧処理 | 統合後 |
| --- | --- |
| coverage / classifyAnswerRequest / assessQuestion | request-scope: 一つの範囲判定。会話は解析済みscopeをUI→controller→retrieveへ渡す。辞書も同じ入口。曖昧さの解消は型付きtopicsから行い、再検索文の正規表現判定をしない |
| conditions / factsIn / mergeFacts / send内の文脈分岐 | request-understanding: 純粋な `understandRequest(text, previous, turn)`。`request-facts` は日本語の語彙・述語認識だけを担当。結果は unsupported / clarify / retrieve と次状態 |
| contextualEvidence / assessApplicability | conversation-applicability: `evaluateEvidence`。取得・カタログ候補の両方に同じ前提判定を一回適用。関連度と適用評価は別フィールド。除外理由・元の検索IDを保持 |
| Conversation | 履歴、明示選択、非同期世代、Responseの提示だけを担当 |

旧ファイルは履歴テスト・研究利用向けの再exportのみ。旧判定の本体は削除し、別の規則として残さない。日本語認識の正規表現は検証済みの挙動を保つため移設している。全面的な自然言語理解ができたという主張ではない。

## 入出力

`understandRequest` は前状態を変更せず、解決済み `facts` と `assertions[key] = {value, polarity, subject, sourceTurn}` を返す。未知は null、否定は false、未言及はキーなし。訂正対象の事実を消してから新しい事実を適用する。乗り換えは永続的な事実でなくイベントとして扱う。複数主体は確認し、明示主体が途中で変わる文脈継承も確認する。主体省略を同一人物と確証したとは扱わない。

検索文は解決済みフレームと今回の入力から組み立て、前の入力文をそのまま連結しない。過去の肯定条件が復活する経路をなくす。過長文脈では黙って切り捨てず再入力を求める。

`evaluateEvidence` の各候補は score / provenance / assessment を持つ。scoreは適用の証明にならない。検証済み前提は元の4件のまま。bosai-84を含む84件は needs-confirmation を保つ。カタログによる順位付けは可能だが、未確認のものを検証済みにしない。原文の表示には全フィールドを持つ元レコードを使用する。

停止・リセットは既存の世代トークンと候補トークンを維持する。古い検索の完了もfinallyも新しい検索の状態を変更しない。保存形式、cache key、service worker、Moonshineの任意性は変更しない。

## 意図的な差異・限界

- 辞書検索でも発生日時・現在の道路安全・個別の薬の増減等を会話と同じく抑止する。以前の辞書候補出力との違いは意図的。
- 過去の入力全文の代わりに構造化された場面だけを引き継ぐ。寝室等、まだ構造化されていない細かい修飾語が短い追質問で失われ、順位が変わる可能性がある。安全に適用可能とみなすことはしない。
- 人物の照応、複雑な否定、仮定、複数経路は有限の語彙認識の限界がある。未知の日本語全体への安全保証はできない。
- 原文4件の前提確認は全項目の意味監査ではない。残る84件の前提監査は未完了。
- iPad Safari / PWA / 保存済みモデルのアップグレード / 音声の実機確認は別途必要。Chromium結果を実機確認とは呼ばない。

検証の実測と旧版比較は `conversation-core-validation.md` に追記する。過去の結果は変更しない。
