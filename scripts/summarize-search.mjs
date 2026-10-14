import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const median = values => {const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const mid=Math.floor(v.length/2);return v.length%2?v[mid]:(v[mid-1]+v[mid])/2;};
const outputs=['lfm2-cpu','lfm2-700m-cpu'].filter(key=>existsSync(`test-results/search-${key}.json`)).map(key=>JSON.parse(readFileSync(`test-results/search-${key}.json`,'utf8')));
const summaries=[];
for(const data of outputs){
 for(const method of ['keyword','light','llm']){
  const rows=data.samples.filter(x=>x.method===method),positives=rows.filter(x=>x.relevant.length),absent=rows.filter(x=>!x.relevant.length),generated=rows.filter(x=>x.llm?.tokens>0&&!x.llm.error);
  if(!rows.length)continue;
  const changed=rows.filter(row=>row.results[0]!==row.candidateIds[0]);
  const light=new Map(data.samples.filter(x=>x.method==='light').map(row=>[row.caseId,row]));
  const summary={ model:method==='llm'?data.modelKey:'none',run:data.modelKey,method,status:data.status,questions:rows.length,positiveQuestions:positives.length,top1:positives.filter(x=>x.grade.top1).length,top3:positives.filter(x=>x.grade.top3).length,wrongTop1:rows.filter(x=>x.grade.wrongTop1).length,positiveMisses:positives.filter(x=>!x.results.length).length,absentQuestions:absent.length,correctAbstention:absent.filter(x=>x.grade.correctAbstention).length,falsePositive:absent.filter(x=>x.grade.falsePositive).length,dangerousSelections:rows.filter(x=>x.grade.dangerous).length,multiRetrieved:rows.filter(x=>x.kind==='multi').reduce((n,r)=>n+r.grade.relevantRetrieved,0),multiTotal:rows.filter(x=>x.kind==='multi').reduce((n,r)=>n+r.grade.relevantTotal,0),medianRetrievalMs:median(rows.map(x=>x.retrievalMs)),medianFirstResponseMs:median(rows.map(x=>x.firstResponseMs)),medianTotalMs:median(rows.map(x=>x.totalMs)),actualGenerations:generated.length,medianLLMMs:median(generated.map(x=>x.llm.elapsedMs)),medianTTFTMs:median(generated.map(x=>x.llm.ttftMs)),maxPromptTokens:Math.max(0,...generated.map(x=>x.llm.promptTokens||0)),outcomes:Object.fromEntries([...new Set(rows.map(x=>x.outcome))].map(o=>[o,rows.filter(x=>x.outcome===o).length])),changedTop1:changed.length,improved:method==='llm'?positives.filter(x=>x.grade.top1&&!light.get(x.caseId)?.grade.top1).map(x=>x.caseId):[],regressed:method==='llm'?positives.filter(x=>!x.grade.top1&&light.get(x.caseId)?.grade.top1).map(x=>x.caseId):[],byKind:Object.fromEntries([...new Set(rows.map(x=>x.kind))].map(kind=>{const r=rows.filter(x=>x.kind===kind);return[kind,{count:r.length,top1:r.filter(x=>x.grade.top1).length,top3:r.filter(x=>x.grade.top3).length,correctAbstention:r.filter(x=>x.grade.correctAbstention).length}]}))};
  summaries.push(summary);
 }
}
writeFileSync('test-results/search-summary.json',JSON.stringify(summaries,null,2));console.log(JSON.stringify(summaries,null,2));
