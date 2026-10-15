// Source-bound, conservative sidecar. Provisional title/summary annotations do not certify applicability.
import records from './conversation-applicability.json' with {type:'json'};
import corpus from './bosai-data.json' with {type:'json'};

export function sourceFingerprint(entry) {
  let hash=2166136261;
  for(const char of JSON.stringify(entry)){
    hash^=char.charCodeAt(0);
    hash=Math.imul(hash,16777619)>>>0;
  }
  return hash.toString(16).padStart(8,'0');
}
export function validateApplicability(entries=corpus, annotations=records) {
  const errors=[], lookup=new Map();
  if(entries.length!==88||annotations.length!==entries.length)errors.push('Expected exactly 88 originals and sidecars');
  for(const record of annotations){
    if(!record?.id||lookup.has(record.id)){errors.push('Missing or duplicate id: '+record?.id);continue;}
    lookup.set(record.id,record);
  }
  for(const entry of entries){
    const record=lookup.get(entry.id);
    if(!record){errors.push('Missing '+entry.id);continue;}
    if(record.sourceTitle!==entry.title||record.sourceFingerprint!==sourceFingerprint(entry)||record.hazard!==entry.category){
      errors.push('Source changed: '+entry.id);continue;
    }
    const evidence=[entry.title,entry.summary,...entry.steps,entry.warning].join('\n');
    if(record.prerequisiteEvidence && !evidence.includes(record.prerequisiteEvidence))errors.push('Unsupported prerequisite: '+entry.id);
    if(Object.values(record.prerequisites||{}).some(x=>typeof x!=='boolean'))errors.push('Invalid prerequisite: '+entry.id);
    if(!['provisional-title-and-summary','verified-prerequisite-only'].includes(record.reviewStatus))errors.push('Unrecognized review state: '+entry.id);
    if(record.reviewStatus==='verified-prerequisite-only' &&
       (!record.prerequisiteEvidence||!Object.keys(record.prerequisites||{}).length||!record.focus))errors.push('Unverified capability marked as verified: '+entry.id);
  }
  return {valid:errors.length===0,errors,byId:lookup};
}
const catalog=validateApplicability();
export const applicabilityValidation={valid:catalog.valid,errors:catalog.errors};
export const applicabilityRecords=records;
// A high Ruri score never implies applicability. Unknown prerequisites stay unknown.
export function assessApplicability(entry,{facts={},focus=null}={}) {
  const record=catalog.valid?catalog.byId.get(entry?.id):null;
  if(!record||record.sourceFingerprint!==sourceFingerprint(entry)){
    return {status:'needs-confirmation',reason:'原文の適用メタデータを検証できません。'};
  }
  for(const [name,expected] of Object.entries(record.prerequisites||{})){
    if(facts[name]!==undefined && facts[name]!==null && facts[name]!==expected){
      return {status:'not-applicable',reason:'原文が必要とする「'+record.prerequisiteEvidence+'」の条件と質問の明示条件が矛盾します。'};
    }
  }
  const missing=Object.keys(record.prerequisites||{}).filter(k=>facts[k]===undefined||facts[k]===null);
  if(missing.length)return {status:'needs-confirmation',reason:'原文の前提条件が質問から確認できません。'};
  if(focus && record.focus===focus && record.reviewStatus==='verified-prerequisite-only'){
    return {status:'candidate',reason:'確認された状況・対象行動と原文用途が整合します。現在の安全性や質問全体への回答を保証しません。'};
  }
  return {status:'needs-confirmation',reason:'関連記事ですが、原文が質問へ直接適用できるかは未確認です。'};
}

// Catalog focus is a retrieval aid, including provisional annotations. It never
// upgrades reviewStatus. Every retrieved/catalog row enters the same evaluator.
const capabilities = new Map(records.filter(record=>record.focus).map(record=>[record.focus,record]));
export function evaluateEvidence(run,focus=null,facts={},topics=[]) {
  const originalResultIds=run.resultIds||run.results.map(row=>row.entry.id);
  const base={focus,originalResultIds};
  if(!catalog.valid)return {...run,results:[],applicability:[],evidence:{...base,policy:'invalid-applicability-catalog',excludedIds:originalResultIds}};
  if(run.scope.kind!=='related')return {...run,results:[],applicability:[],evidence:{...base,policy:'retrieval-only',excludedIds:[]}};
  const assessments=new Map(),excluded=new Map();
  const assess=entry=>{
    if(!assessments.has(entry))assessments.set(entry,assessApplicability(entry,{facts,focus}));
    return assessments.get(entry);
  };
  const conflict=entry=>{
    if(assess(entry).status==='not-applicable')return 'contradictory-prerequisite';
    if(topics.length===1&&topics[0]==='大雨・浸水'&&entry.category==='地震'&&!/大雨|台風|雨|洪水|浸水|冠水/.test(entry.title+' '+entry.summary))return 'different-hazard';
    const other=catalog.byId.get(entry.id)?.focus;
    if((focus?.startsWith('flood-')||focus==='vehicle-escape')&&(/津波|竜巻|雷/.test(entry.title)||(other&&other!==focus)))return 'different-scene-or-action';
    if(focus==='tsunami-time'&&entry.category!=='津波')return 'different-hazard';
    return null;
  };
  const rows=run.results.filter(row=>{
    const reason=conflict(row.entry);
    if(reason)excluded.set(row.entry.id,reason);
    return !reason;
  });
  let primary=null,policy=excluded.size?'filtered-explicit-conditions':'retrieval-only';
  if(focus){
    const capability=capabilities.get(focus);
    primary=corpus.find(entry=>entry.id===capability?.id);
    if(!primary)return {...run,results:[],applicability:[],evidence:{...base,policy:'missing-capability',excludedIds:[...excluded.keys()]}};
    const reason=conflict(primary);
    if(reason){excluded.set(primary.id,reason);return {...run,results:[],applicability:[{id:primary.id,...assess(primary)}],evidence:{...base,policy:'contradictory-focus',excludedIds:[...excluded.keys()]}};}
    policy='explicit-scene-capability';
  }
  const related=rows.filter(row=>row.entry.id!==primary?.id);
  const found=rows.find(row=>row.entry.id===primary?.id);
  const selected=primary?[
    {entry:primary,score:found?.score??null,provenance:found?'retrieval-and-capability':'catalog-capability',fit:'scene-and-action'},
    ...related.map(row=>({...row,fit:'related-unverified',provenance:'retrieval'})),
  ].slice(0,5):rows;
  return {...run,results:selected.map(row=>({...row,assessment:assess(row.entry)})),
    applicability:[...assessments].map(([entry,assessment])=>({id:entry.id,...assessment,exclusion:excluded.get(entry.id)||null})),
    evidence:{...base,policy,relatedIds:related.map(row=>row.entry.id),excludedIds:[...excluded.keys()],
      exclusions:[...excluded].map(([id,reason])=>({id,reason})),
      caution:'原文用途と明示条件の整合のみを確認します。不明な前提・未確認の適用範囲・現在の安全性は判断しません。'}};
}
