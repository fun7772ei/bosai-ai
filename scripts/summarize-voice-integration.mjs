import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=process.argv[2],runId=process.argv[3];
const report={runId,createdAt:new Date().toISOString(),platform:'Linux Chromium CPU/WASM; NOT iPad Safari',conversation:[],dictionary:[],runtime:[],unclassified:[]};
for(const file of readdirSync(dir).filter(f=>f.endsWith('.json'))){
 const bytes=readFileSync(dir+'/'+file),r=JSON.parse(bytes),evidence={file,sha256:createHash('sha256').update(bytes).digest('hex')};
 if(r.semantic&&r.rows){
  const gold=r.rows.filter(row=>row.gold);
  report.conversation.push({...evidence,casesPath:r.casesPath,implementation:r.implementation,build:r.build,status:r.status,turns:r.rows.length,control:r.control,badTop3Queries:r.semantic.badTop3Queries,failures:r.semantic.failures,positiveLabels:gold.length,top1:gold.filter(row=>row.rank===1).length,top3:gold.filter(row=>row.rank&&row.rank<=3).length,rankingMisses:gold.filter(row=>!row.rank||row.rank>3).map(row=>({caseId:row.caseId,turn:row.turn,input:row.input,gold:row.gold,rank:row.rank})),missingRequired:r.rows.filter(row=>row.requiredIds&&!row.allRequiredFound).map(row=>({caseId:row.caseId,turn:row.turn,requiredIds:row.requiredIds,actualIds:row.candidates?.map(c=>c.id)})),sourceRetentionFailures:r.rows.filter(row=>row.sourceRetained===false).map(row=>({caseId:row.caseId,turn:row.turn})),failedRuntimeChecks:Object.entries(r.checks).filter(([,v])=>!v).map(([k])=>k)});
 }else if(r.samples&&r.casesPath){
  const cases=JSON.parse(readFileSync(r.casesPath)),byId=new Map(cases.map(c=>[c.id,c]));
  const modes=[];for(const mode of ['light','ruri','hybrid']){
   const rows=r.samples.filter(row=>row.mode===mode),failures=[];let positive=0,top1=0,top3=0,dangerousTop3=0,scopeDifferences=0;
   for(const row of rows){const c=byId.get(row.caseId);if(!c||c.query!==row.query)throw Error('Case mismatch: '+file+' '+row.caseId);
    const ids=row.resultIds;
    if(c.relevant.length){positive++;top1+=Number(c.relevant.includes(ids[0]));if(ids.slice(0,3).some(id=>c.relevant.includes(id)))top3++;else failures.push({caseId:c.id,type:'gold-not-in-top3',query:c.query,expectedIds:c.relevant,actualIds:ids.slice(0,3),scope:row.scope.kind});}
    const bad=ids.slice(0,3).filter(id=>c.dangerous.includes(id));if(bad.length){dangerousTop3++;failures.push({caseId:c.id,type:'labelled-dangerous-top3',query:c.query,badIds:bad});}
    const expectedScope=c.kind==='absent'?'unsupported':c.kind==='ambiguous'?'clarify':'related';if(row.scope.kind!==expectedScope){scopeDifferences++;failures.push({caseId:c.id,type:'scope-label-difference',query:c.query,expected:expectedScope,actual:row.scope.kind});}
   }
   modes.push({mode,queries:rows.length,positive,top1,top3,dangerousTop3,scopeDifferences,failures});
  }
  report.dictionary.push({...evidence,casesPath:r.casesPath,status:r.status,implementation:r.implementation,build:r.build,modes});
 }else if(r.status||r.checks){report.runtime.push({...evidence,status:r.status,error:r.error||r.failure||null,checks:r.checks||null,noRedownload:r.noRedownload??null});}
 else report.unclassified.push(evidence);
}
report.notes=['Runtime success is not semantic correctness.','Dictionary gold/top3 and dangerous labels are frozen retrieval labels; related candidates are not certified answers.','Scope differences include intentional stricter refusals; inspect every row.','No real Japanese ASR/CER or iPad measurements.'];
writeFileSync('docs/diagnostics/voice-integration-20261015/ci-'+runId+'-summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({conversation:report.conversation.map(x=>({file:x.file,control:x.control,badTop3:x.badTop3Queries,failures:x.failures.length,rankingMisses:x.rankingMisses.length})),dictionary:report.dictionary.map(x=>({file:x.file,modes:x.modes.map(m=>({mode:m.mode,top3:m.top3,positive:m.positive,danger:m.dangerousTop3,scope:m.scopeDifferences}))})),runtime:report.runtime},null,2));
