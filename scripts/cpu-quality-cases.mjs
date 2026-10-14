// Synthetic evaluation inputs only. These answers are never imported by app code.
export const cases = [
  { id: 'copy', prompt: '「今日は晴れです。」をそのまま書いてください。説明は不要です。', expected: '今日は晴れです。' },
  { id: 'lines', prompt: 'りんご、みかん、バナナを、それぞれ別の行に書いてください。', expected: 'りんご\nみかん\nバナナ' },
  { id: 'summary', prompt: '次の文章を1文で短くしてください。「集合は午前9時、図書館の入口です。」', required: ['午前9時', '図書館の入口'] },
  { id: 'food', prompt: '「水、パン、タオル」から、食べ物だけを書いてください。', expected: 'パン' },
  { id: 'extract', prompt: '「集合は午後3時、公園の入口です。」から、時刻と場所だけを書いてください。', expected: '午後3時、公園の入口', alternatives: ['15時、公園の入口', '15:00、公園の入口'] },
  { id: 'absent', prompt: '「集合場所は公園です。」この文に集合時刻がなければ「記載なし」と答えてください。', expected: '記載なし' },
];
export const holdouts = [
  { id: 'copy-alt', prompt: '「明日は雨です。」を一字も変えずに書いてください。前置きは不要です。', expected: '明日は雨です。' },
  { id: 'lines-alt', prompt: '赤、青、緑を1行に1つずつ書いてください。説明は不要です。', expected: '赤\n青\n緑' },
  { id: 'summary-alt', prompt: '「受付は午後2時、体育館の正面入口です。」を、時刻と場所を残して1文で短くしてください。', required: ['午後2時', '体育館の正面入口'] },
  { id: 'food-alt', prompt: '「石けん、おにぎり、靴下」から食べ物だけを書いてください。', expected: 'おにぎり' },
  { id: 'extract-alt', prompt: '「受付は午前10時、駅の西口です。」から、時刻と場所だけを書いてください。', expected: '午前10時、駅の西口', alternatives: ['10:00 駅西口', '10:00 駅の西口', '午前10時 駅西口', '10時、駅の西口'] },
  { id: 'absent-alt', prompt: '「集合場所は図書館です。」に時刻がなければ「記載なし」とだけ答えてください。', expected: '記載なし' },
];
export const improvedSystem = '日本語でユーザーの指示を正確に実行してください。指定された文章は変更せず、時刻・場所・数値を省略しないでください。指定の行数・形式・回答文を守り、前置きや説明を加えないでください。抽出では条件に合う項目だけを返し、記載のない情報を推測しないでください。';
export function score(item, text) {
  const normalized = text.trim().replace(/\r\n/g, '\n');
  // Extraction permits equivalent time notation and separators, but no extra facts.
  if (item.id.startsWith('extract')) {
    const canonical = value => value.replace(/[\s、，,。]/g, '').replace(/です$/, '');
    return [item.expected, ...(item.alternatives || [])].some(expected => canonical(normalized) === canonical(expected));
  }
  const actual = item.id.startsWith('food') ? normalized.replace(/。$/, '') : normalized;
  return item.expected !== undefined ? actual === item.expected : item.required.every(part => normalized.includes(part)) && !normalized.includes('\n');
}

export const englishSystem = 'Follow the user’s instructions exactly. Answer in Japanese. Preserve the original wording when copying. Keep times, places and numbers when summarizing. Obey the requested format and exact response. For extraction, include only items matching the requested category. Do not invent missing information. Output only the answer, without explanations.';
export const shortSystem = '指示された内容だけを日本語で出力してください。コピーは原文のまま。時刻と場所は省略しない。指定の形式と回答文を守る。抽出条件に合わない項目や説明は加えない。';
