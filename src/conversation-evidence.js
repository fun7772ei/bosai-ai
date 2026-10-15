import {corpus} from './beta-search.js';
import {applicabilityRecords,applicabilityValidation} from './conversation-applicability.js';
// Curated document capabilities, not query/benchmark IDs or generated advice.
// Exact titles make drift fail closed. Full original steps/warnings/sources are always shown.
const capabilities = applicabilityRecords.filter(record=>record.focus).map(record=>({
  focus:record.focus,title:record.sourceTitle,requires:record.prerequisites||{}
}));
export function contextualEvidence(run, focus, facts={}, topics=[]) {
  if(!applicabilityValidation.valid)return {...run,results:[],evidence:{focus,policy:'invalid-applicability-catalog'}};
  if(run.scope.kind!=='related')return {...run,evidence:{focus:null,policy:'retrieval-only'}};
  const originalResultIds=run.resultIds||run.results.map(r=>r.entry.id);
  // A storm-only question must not present earthquake-only guidance as equivalent.
  // Do not apply this rule to a question explicitly naming multiple disasters.
  const explicitRain=topics.length===1&&topics[0]==='大雨・浸水';
  const conflictsHazard=row=>explicitRain&&row.entry.category==='地震'&&!/大雨|台風|雨|洪水|浸水|冠水/.test(row.entry.title+' '+row.entry.summary);
  const offTopic=run.results.filter(conflictsHazard);
  run={...run,results:run.results.filter(row=>!conflictsHazard(row))};
  // A prerequisite explicitly denied by the user disqualifies that capability,
  // even when there is no positive focus. Unknown values never imply denial.
  const contradicts=entry=>Object.entries(capabilities.find(c=>c.title===entry.title)?.requires||{}).some(([key,value])=>facts[key]===false&&value===true);
  const denied=run.results.filter(row=>contradicts(row.entry));
  run={...run,results:run.results.filter(row=>!contradicts(row.entry))};
  if(!focus)return {...run,evidence:{focus:null,policy:denied.length||offTopic.length?'filtered-explicit-conditions':'retrieval-only',originalResultIds,excludedIds:[...offTopic,...denied].map(row=>row.entry.id)}};
  const capability = capabilities.find(c => c.focus === focus);
  const matches = corpus.filter(e => e.title === capability?.title);
  if (matches.length !== 1) return {...run, results:[], evidence:{focus, policy:'missing-capability'}};
  if(contradicts(matches[0]))return {...run,results:[],evidence:{focus,policy:'contradictory-focus',originalResultIds,excludedIds:denied.map(row=>row.entry.id)}};
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
    ].slice(0,5), evidence:{focus, policy:'explicit-scene-capability', originalResultIds,
      relatedIds:related.map(r=>r.entry.id), excludedIds:[...offTopic,...denied,...run.results.filter(conflicting)].map(r=>r.entry.id),
      caution:'条件と原文の用途の一致のみ確認しています。現在の安全性・建物の適否・数値限界や、質問全体への十分性は判断しません。'}};
}
