import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const freeze=JSON.parse(readFileSync('docs/diagnostics/conversation-v2-freeze.json'));
for(const [p,h] of Object.entries(freeze.coreSha256))if(createHash('sha256').update(readFileSync(p)).digest('hex')!==h)throw Error('Frozen core changed: '+p);
const load=name=>JSON.parse(readFileSync('test-results/conversation-v2-'+name+'.json'));
const median=a=>{a.sort((a,b)=>a-b);return a[Math.floor(a.length/2)]??null;};
function summary(r){
 if(r.status!=='passed')throw Error('Browser runtime checks failed: '+r.failure);
 const gold=r.rows.filter(x=>x.gold),warm=r.rows.filter(x=>x.diagnostics?.timings.warm),bad=r.rows.filter(x=>x.badTop3!==undefined),medical=r.rows.filter(x=>x.expected==='unsupported'),ambiguous=r.rows.filter(x=>x.expected==='clarify');
 return {implementation:r.implementation,build:r.build,questions:new Set(r.rows.map(x=>x.caseId)).size,turns:r.rows.length,
  responseKindAgreement:r.rows.filter(x=>x.kind===x.expected).length,stateAndConditionAgreement:r.control.passed,
  positiveQueries:gold.length,top1:gold.filter(x=>x.rank===1).length,top3:gold.filter(x=>x.rank&&x.rank<=3).length,top5:gold.filter(x=>x.rank&&x.rank<=5).length,
  retrievedBeforeCapabilityTop1:gold.filter(x=>x.retrievalBeforeCapabilityRank===1).length,
  inappropriateLabelledQueries:bad.length,inappropriateTop1Queries:bad.filter(x=>x.badTop3.includes(x.candidates?.[0]?.id)).length,inappropriateTop3Queries:bad.filter(x=>x.badTop3.length).length,
  unsupported:{total:medical.length,rejected:medical.filter(x=>x.kind==='unsupported').length,candidatePresentations:medical.filter(x=>x.candidates?.length).map(x=>x.caseId)},
  clarification:{total:ambiguous.length,matched:ambiguous.filter(x=>x.kind==='clarify').length},
  explicitFactChecks:r.rows.filter(x=>x.state.facts&&Object.keys(x.state.facts).length).length,
  completeMultiEvidence:r.rows.filter(x=>x.requiredIds).map(x=>({caseId:x.caseId,allFound:x.allRequiredFound})),
  warmSearchMedianMs:median(warm.map(x=>x.diagnostics.timings.totalMs)),warmConversationMedianMs:median(warm.map(x=>x.diagnostics.timings.conversationMs).filter(Number.isFinite)),
  firstModel:r.rows.find(x=>x.diagnostics?.actual==='hybrid')?.diagnostics.timings,
  peakBrowserPssMiB:Math.max(...r.memory.filter(x=>x.complete).map(x=>x.pssMiB)),releasePssMiB:[r.release.before.pssMiB,r.release.after.pssMiB],
  checks:r.checks,controlFailures:r.rows.filter(x=>!x.controlPass).map(x=>({caseId:x.caseId,turn:x.turn,input:x.input,kind:x.kind,expected:x.expected,candidates:x.candidates})),
  rankingFailures:gold.filter(x=>x.rank!==1).map(x=>({caseId:x.caseId,turn:x.turn,input:x.input,rank:x.rank,candidates:x.candidates})),
  inappropriateUpper:r.rows.filter(x=>x.badTop3?.length).map(x=>({caseId:x.caseId,input:x.input,top1:x.candidates[0].id,badTop3:x.badTop3})),
 };
}
const names=['before-dev','initial-before','initial-after','before-final','after-final','regression','regression-32'];
const result={createdAt:new Date().toISOString(),platform:'Linux Chromium149 CPU/WASM 1 thread, WebGPU disabled; not iPad Safari',freeze,sets:Object.fromEntries(names.map(n=>[n,summary(load(n))])),
 policy:'Initial32 was observed, corrected and moved to regression. Final24 was authored only after 5bc2c64 freeze. No tuning after Final24. Top-k is complete conversation retrieval, including query reconstruction and curated source capabilities; not Ruri-only accuracy. Baseline has no structured facts, counted absent in state assertions; response-kind metric is separate. Runtime status passed is not a perfect semantic-quality score.',
 limitations:['Hand-authored small sets; no independent disaster-expert evaluation','Invalid source IDs are a query-specific labelled subset, not exhaustive safety audit','No generated advice; original source selection does not certify question sufficiency','Single Linux PSS sample series, not Safari/model-only RAM or proof of long-running stability']};
const projection=r=>r.rows.map(x=>({id:x.caseId,turn:x.turn,kind:x.kind,rank:x.rank,controlPass:x.controlPass,candidates:x.candidates,state:x.state,sourceRetained:x.sourceRetained}));
result.measurementRepeat={reason:'Baseline known stale-candidate failure must be recorded false, not hidden by baseline bypass. Corrected harness and reran both sides, no implementation/label changes.',runs:Object.fromEntries(['before','after'].map(side=>{const first=load(side+'-final-first-run'),last=load(side+'-final');const warm=first.rows.filter(x=>x.diagnostics?.timings.warm).map(x=>x.diagnostics.timings.totalMs);return [side,{firstWarmMedianMs:median(warm),semanticParity:JSON.stringify(projection(first))===JSON.stringify(projection(last))}];}))};
if(Object.values(result.measurementRepeat.runs).some(x=>!x.semanticParity))throw Error('Repeat changed model dialogue results');
writeFileSync('docs/diagnostics/conversation-v2-summary.json',JSON.stringify(result,null,2)+'\n');
for(const n of ['initial-before','initial-after','before-final','after-final','regression','regression-32'])copyFileSync(`test-results/conversation-v2-${n}.json`,`docs/diagnostics/conversation-v2-${n}.json`);
console.log(JSON.stringify(result.sets['after-final'],null,2));
