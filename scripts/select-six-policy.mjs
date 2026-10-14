import{readFileSync,writeFileSync}from'node:fs';import corpus from'../src/bosai-data.json'with{type:'json'};import{createSearch}from'../src/bosai-search.js';import{semanticSearch,combineSearch}from'../src/semantic-search.js';import{searchCases}from'./search-cases.mjs';
const probe=JSON.parse(readFileSync('test-results/six-dev-probe.json')),v=JSON.parse(readFileSync('src/bosai-vectors.json')),light=createSearch(corpus);
const grade=(q,results)=>({top1:q.relevant.includes(results[0]?.entry.id),top3:results.slice(0,3).some(r=>q.relevant.includes(r.entry.id)),top5:results.slice(0,5).some(r=>q.relevant.includes(r.entry.id)),falsePositive:!q.relevant.length&&results.length>0,abstain:!q.relevant.length&&!results.length,danger:q.dangerous.includes(results[0]?.entry.id)});
const grid=[];
for(const threshold of [0,0.7,0.75,0.78,0.8,0.82,0.84,0.86])for(const fusion of ['rrf','score'])for(const weight of [.25,.5,.75]){
 const rows=searchCases.map(q=>{const vector=probe.queries.find(x=>x.caseId===q.id).vector;const b=semanticSearch(corpus,v.vectors,vector,q.query,{threshold,limit:10}),a=light(q.query,10),c=combineSearch(a,b,{method:fusion,weight,limit:5});return{q,a:grade(q,a),b:grade(q,b),c:grade(q,c),maxScore:semanticSearch(corpus,v.vectors,vector,q.query,{threshold:0,limit:1})[0]?.score};});
 const sum=k=>({top1:rows.filter(r=>r[k].top1).length,top3:rows.filter(r=>r[k].top3).length,top5:rows.filter(r=>r[k].top5).length,falsePositive:rows.filter(r=>r[k].falsePositive).length,abstain:rows.filter(r=>r[k].abstain).length,danger:rows.filter(r=>r[k].danger).length});
 const b=sum('b'),c=sum('c');grid.push({threshold,fusion,weight,b,c,objective:b.top1+c.top1-3*(b.falsePositive+c.falsePositive)-2*(b.danger+c.danger)});
}
grid.sort((a,b)=>b.objective-a.objective||b.b.top3+b.c.top3-a.b.top3-a.c.top3||a.threshold-b.threshold);writeFileSync('test-results/six-policy-grid.json',JSON.stringify(grid,null,2));console.log('Top candidates',grid.slice(0,8));
console.log('dev positives/OOD max similarities',searchCases.map(q=>({id:q.id,absent:!q.relevant.length,max:semanticSearch(corpus,v.vectors,probe.queries.find(x=>x.caseId===q.id).vector,q.query,{threshold:0,limit:1})[0]?.score})));
