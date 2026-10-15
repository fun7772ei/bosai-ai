// Source-bound, conservative sidecar. Provisional title/summary annotations do not certify applicability.
import records from './conversation-applicability.json' with {type:'json'};
import {corpus} from './beta-search.js';

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
  if(focus && record.focus===focus){
    return {status:'candidate',reason:'確認された状況・対象行動と原文用途が整合します。現在の安全性や質問全体への回答を保証しません。'};
  }
  return {status:'needs-confirmation',reason:'関連記事ですが、原文が質問へ直接適用できるかは未確認です。'};
}
