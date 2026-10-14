import {corpus} from './beta-search.js';
// Curated document capabilities, not query/benchmark IDs or generated advice.
// Exact titles make drift fail closed. Full original steps/warnings/sources are always shown.
const capabilities = [
  {focus:'flood-footwear', title:'浸水避難では履き慣れた運動靴を選ぶ'},
  {focus:'flood-walk', title:'冠水した道路を歩かない'},
  {focus:'flood-drive', title:'冠水した道路へ車で入らない'},
  {focus:'vehicle-escape', title:'車が水没し始めたら早めに脱出する'},
  {focus:'tsunami-time', title:'高台まで間に合わないときの垂直避難'},
];
export function contextualEvidence(run, focus) {
  if (!focus || run.scope.kind !== 'related') return {...run, evidence:{focus:null, policy:'retrieval-only'}};
  const capability = capabilities.find(c => c.focus === focus);
  const matches = corpus.filter(e => e.title === capability?.title);
  if (matches.length !== 1) return {...run, results:[], evidence:{focus, policy:'missing-capability'}};
  const primary = matches[0], found = run.results.find(r => r.entry.id === primary.id);
  // Keep other potentially useful information. Only known conflicting action/scene roles
  // are demoted out of the selectable list; unknown coverage is explicitly unverified.
  const conflicting = row => {
    const other = capabilities.find(c => c.title === row.entry.title)?.focus;
    if (focus.startsWith('flood-')) {
      if (/津波|竜巻|雷/.test(row.entry.title)) return true;
      if (other && other !== focus) return true;
    }
    if (focus === 'tsunami-time' && row.entry.category !== '津波') return true;
    return false;
  };
  const related = run.results.filter(r => r.entry.id !== primary.id && !conflicting(r));
  return {...run, results:[
      {entry:primary, score:found?.score ?? null, provenance:found ? 'retrieval-and-capability' : 'catalog-capability', fit:'scene-and-action'},
      ...related.map(r=>({...r, fit:'related-unverified', provenance:'retrieval'})),
    ].slice(0,5), evidence:{focus, policy:'explicit-scene-capability', originalResultIds:run.resultIds || run.results.map(r=>r.entry.id),
      relatedIds:related.map(r=>r.entry.id), excludedIds:run.results.filter(conflicting).map(r=>r.entry.id),
      caution:'条件と原文の用途の一致のみ確認しています。現在の安全性・建物の適否・数値限界や、質問全体への十分性は判断しません。'}};
}
