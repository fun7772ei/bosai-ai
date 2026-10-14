// Fictional supplied notices, not live alerts or disaster advice.
export const disasterCases = [
  { id: 'extract-shelter', prompt: '架空の案内です。「避難先は中央小学校、受付は午前8時です。」から、避難先だけを書いてください。', expected: '中央小学校' },
  { id: 'copy-items', prompt: '架空の持ち出し品リスト「飲料水2本、薬1袋」を、数量を変えず、そのまま書いてください。説明は不要です。', expected: '飲料水2本、薬1袋' },
  { id: 'extract-closed', prompt: '架空の案内「橋は通行止めです。北側の道を使ってください。」に書かれた、通れない場所だけを書いてください。', expected: '橋' },
  { id: 'absent-bosai', prompt: '架空の案内「避難先は南中学校です。」に受付時刻が書かれていなければ「記載なし」とだけ答えてください。', expected: '記載なし' },
];
