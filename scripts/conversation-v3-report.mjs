import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const freeze=JSON.parse(readFileSync('docs/diagnostics/conversation-v3-freeze.json'));
for(const [path,hash] of Object.entries(freeze.coreSha256))if(createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)throw Error('Review-fix core changed: '+path);
const load=n=>JSON.parse(readFileSync('test-results/conversation-v3-'+n+'.json'));
const median=a=>{a.sort((a,b)=>a-b);return a[Math.floor(a.length/2)]??null;};
function summarize(r){if(r.status!=='passed')throw Error(r.failure||'Runtime checks failed');const gold=r.rows.filter(x=>x.gold),bad=r.rows.filter(x=>x.badTop3!==undefined),needs=r.rows.filter(x=>x.expected==='clarify'),warm=r.rows.filter(x=>x.diagnostics?.timings.warm);return{
 implementation:r.implementation,build:r.build,turns:r.rows.length,control:r.control,kindAgreement:r.rows.filter(x=>x.kind===x.expected).length,
 positive:gold.length,top1:gold.filter(x=>x.rank===1).length,top3:gold.filter(x=>x.rank&&x.rank<=3).length,top5:gold.filter(x=>x.rank&&x.rank<=5).length,
 needsClarification:needs.length,clarified:needs.filter(x=>x.kind==='clarify').length,labelledBadQueries:bad.length,badTop1:bad.filter(x=>x.badTop3.includes(x.candidates?.[0]?.id)).length,badTop3:bad.filter(x=>x.badTop3.length).length,
 warmMedianMs:median(warm.map(x=>x.diagnostics.timings.totalMs)),first:r.rows.find(x=>x.diagnostics?.actual==='hybrid')?.diagnostics.timings,
 peakBrowserPssMiB:Math.max(...r.memory.filter(x=>x.complete).map(x=>x.pssMiB)),releasePssMiB:[r.release.before.pssMiB,r.release.after.pssMiB],checks:r.checks,
 failures:r.rows.filter(x=>!x.controlPass).map(x=>({id:x.caseId,turn:x.turn,expected:x.expected,actual:x.kind,facts:x.state.facts})),badCases:bad.filter(x=>x.badTop3.length).map(x=>({id:x.caseId,input:x.input,first:x.candidates[0].id,badTop3:x.badTop3}))};}
const names=['before-final','after-final','regression24','original24','regression32'];
const original=JSON.parse(readFileSync('docs/diagnostics/conversation-v2-after-final.json')),now=load('regression24');
const project=r=>r.rows.map(x=>({id:x.caseId,turn:x.turn,kind:x.kind,rank:x.rank,candidates:x.candidates,state:x.state,controlPass:x.controlPass,query:x.diagnostics?.query}));
const parity=JSON.stringify(project(original))===JSON.stringify(project(now));if(!parity)throw Error('Prior evaluation ranks/state changed; inspect before reporting parity');
const out={createdAt:new Date().toISOString(),platform:'Linux Chromium149 CPU/WASM, WebGPU disabled; not iPad Safari',freeze,sets:Object.fromEntries(names.map(n=>[n,summarize(load(n))])),priorFinal24StateRankQueryParity:parity,
 limitations:['Fresh12 is a targeted review-fix set, not a general disaster-safety evaluation','Previous24/32 are regression data now, earlier independent results preserved','Source Top-1 correctness and answer sufficiency are different','Known denial/source mismatch and missing earthquake-date rejection remain','Single-machine, small-run PSS/latency is not iPad Safari memory or stability']};
writeFileSync('docs/diagnostics/conversation-v3-summary.json',JSON.stringify(out,null,2)+'\n');
for(const n of names)copyFileSync(`test-results/conversation-v3-${n}.json`,`docs/diagnostics/conversation-v3-${n}.json`);
console.log(JSON.stringify(out.sets['after-final'],null,2));
