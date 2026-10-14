// No network, embedding model, or generated advice. All results reference the local corpus.
const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
const stop = new Set('の は が を に で と も へ や から まで なら ので ため とき 時 こと もの です ます する し した して いる ある なる ない た て な ん どう すれ ば いい い たい ください 教え 教えて どうすれば 何 どこ それ これ 私 れる られる か できる しまう 来る 来 たら なか っ れ す わ'.split(' '));
export const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
// General vocabulary expansion, independent of evaluation IDs/questions. Search-only;
// source records are never rewritten. No broad equivalence of tsunami/flood vertical evacuation.
const aliases = [
  ['寝てる', '寝ている', '就寝', '睡眠'], ['ベッド', '寝床', '布団'],
  ['水が使えない', '水が出ない', '断水'], ['お手洗い', '便所', 'トイレ'],
  ['逃げ', '逃げる', '避難'], ['山へ逃げ', '高台'], ['間に合わ', '間に合わない'],
  ['寒い', '寒さ', '低体温', '防寒'], ['暑い', '暑さ', '熱中症'],
  ['薬切れ', '薬がない', '薬が足りない', '常用薬'], ['年寄り', 'お年寄り', '高齢者'],
  ['赤ん坊', '赤ちゃん', '乳児'], ['妊娠', '妊婦', '妊産婦'],
  ['わんこ', '犬', 'ペット'], ['にゃんこ', '猫', 'ペット'],
  ['歯みがき', '歯磨き', '口腔ケア'], ['入れ歯', '義歯'],
  ['クルマ', '自動車', '車'], ['運転', '走行'], ['水びたし', '水浸し', '冠水', '浸水'],
  ['スマホ', 'スマートフォン'], ['バッテリー', '電池'], ['電気が消え', '停電'],
  ['エレベータ', 'エレベーター', '昇降機'], ['ブロック塀', '塀'],
  ['ガラス', '窓ガラス', '窓'], ['雷鳴', '雷'], ['アレルギー', 'アレルギ'],
  ['津波の旗', '赤白の旗', '津波フラッグ'], ['引き波', '引き潮'],
].map(group => group.map(normalize));
// Segment both scripts: kana folding before segmentation alone can split katakana nouns.
// Keep the kana channel for spelling variants and the original-script channel for word boundaries.
function words(text) { return [...segmenter.segment(normalize(text)), ...segmenter.segment(String(text).normalize('NFKC').toLowerCase())].filter(s => s.isWordLike && !stop.has(normalize(s.segment)) && !/^\d$/.test(s.segment)).map(s => normalize(s.segment)); }
function grams(text) { const parts = normalize(text).match(/[\p{L}\p{N}]+/gu) || []; return parts.flatMap(part => Array.from({ length: Math.max(0, part.length - 1) }, (_, i) => part.slice(i, i + 2))); }
function features(text) { return [...new Set([...words(text).map(w => 'w:' + w), ...grams(text).map(w => 'g:' + w)])]; }
export function legacySearch(entries, query, limit = 3) {
  const terms = query.toLowerCase().trim().split(/[\s ]+/).filter(Boolean);
  if (!terms.length) return [];
  return entries.filter(item => terms.every(word => [item.title, item.summary, item.items, ...item.steps, ...item.keywords].some(value => value.toLowerCase().includes(word))))
    .sort((a, b) => b.priority - a.priority).slice(0, limit).map(entry => ({ entry, score: entry.priority }));
}
export function unsupportedLiveQuery(query) {
  const text = normalize(query);
  // The copied corpus has general instructions, not live local observations or addresses.
  return (/(今|現在|今日|いま)/.test(text) && /(開いて|開設|住所|到達時刻|警報|震度)/.test(text))
    || (/(私|うち|自宅|ここ)/.test(text) && /震度.*(いくつ|何)/.test(text));
}
export function createSearch(entries) {
  const docs = entries.map(entry => {
    const weights = new Map();
    for (const [text, weight] of [[entry.title, 5], [entry.keywords.join(' '), 4], [entry.summary, 2], [entry.items, 2], [entry.steps.join(' '), 1], [entry.warning, 0.5]])
      for (const f of features(text)) weights.set(f, Math.max(weights.get(f) || 0, weight));
    return { entry, weights, text: normalize([entry.title, ...entry.keywords].join(' ')) };
  });
  const df = new Map(); for (const doc of docs) for (const f of doc.weights.keys()) df.set(f, (df.get(f) || 0) + 1);
  const idf = f => Math.log(1 + (entries.length + 0.5) / ((df.get(f) || 0) + 0.5));
  return (query, limit = 3) => {
    if (typeof query !== 'string' || !query.trim() || unsupportedLiveQuery(query)) return [];
    const original = normalize(query), expanded = new Set(features(query));
    for (const group of aliases) if (group.some(alias => original.includes(alias))) for (const alias of group) for (const f of features(alias)) expanded.add(f);
    const originalFeatures = new Set(features(query));
    const results = docs.map(doc => {
      let score = 0, strong = 0;
      for (const f of expanded) {
        const weight = doc.weights.get(f); if (!weight) continue;
        const value = idf(f) * weight * (f.startsWith('w:') ? 1 : 0.25) * (originalFeatures.has(f) ? 1 : 0.55);
        score += value;
        if (f.startsWith('w:') && f.length >= 4 && weight >= 2) strong++;
      }
      return { entry: doc.entry, score, strong };
    }).filter(result => result.strong > 0 && result.score >= 8)
      .sort((a, b) => b.score - a.score || b.entry.priority - a.entry.priority);
    return results.filter(result => result.score >= (results[0]?.score || 0) * 0.3).slice(0, limit);
  };
}
export const SEARCH_MODELS = ['lfm2-cpu', 'lfm2-700m-cpu'];
export function selectionPrompt(query, candidates) {
  if (typeof query !== 'string' || !query.trim() || query.length > 120) throw Error('LLM選別の入力は120文字以下にしてください（軽量検索は200文字まで）。');
  if (!candidates.length || candidates.length > 3) throw Error('検索候補は1〜3件です。');
  // Titles carry the distinguishing scenario; full safety instructions stay outside LLM context.
  return `質問に最も合う項目の番号を1つ選んでください。該当なしは0。数字だけで答えてください。\n質問:${query.trim()}\n` + candidates.map((item, i) => `${i + 1}:${item.entry.title}`).join('\n');
}
export function applySelection(candidates, generated) {
  // Reject explanations, injected text, unknown IDs, partial tokens, and interrupted output.
  if (generated.stopped || generated.outputLimitReached) return { results: candidates, selectedId: null, outcome: 'fallback-interrupted' };
  const text = generated.text.trim();
  if (!/^[0-3]$/.test(text) || Number(text) > candidates.length) return { results: candidates, selectedId: null, outcome: 'fallback-invalid' };
  if (text === '0') return { results: [], selectedId: null, outcome: 'no-match' };
  const selected = candidates[Number(text) - 1];
  return { results: [selected, ...candidates.filter(item => item !== selected)], selectedId: selected.entry.id, outcome: 'selected' };
}
