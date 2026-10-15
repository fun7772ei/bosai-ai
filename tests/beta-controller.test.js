import test from 'node:test';import assert from 'node:assert/strict';import{BetaController}from'../src/beta-controller.js';import vectors from'../src/bosai-vectors.json'with{type:'json'};
const saved=async()=>({complete:true,files:[]});
test('missing or failing Ruri automatically retains the usable lexical dictionary',async()=>{
 for(const status of [async()=>({complete:false}),async()=>{throw Error('IndexedDB denied');}]){const c=new BetaController({status,channel:()=>{throw Error('must not create a worker');}});const r=await c.search('寝ているときに地震が来たら');assert.equal(r.actual,'light');assert.equal(r.resultIds[0],'bosai-39');assert.ok(r.fallback);}
 const c=new BetaController({status:saved,channel:()=>({request:async()=>{throw Error('ORT init failure');},kill(){}})});const r=await c.search('寝ているときに地震が来たら');assert.equal(r.actual,'light');assert.ok(r.fallback.includes('ORT'));assert.equal(c.ready,false);
});
test('stop while Ruri is loading rejects the old search without embedding or changing newer state',async()=>{
 let entered,complete,fail;const start=new Promise(r=>entered=r);let embeds=0,killed=0;
 const c=new BetaController({status:saved,channel:()=>({request:async type=>{if(type==='load'){entered();return new Promise((r,j)=>{complete=r;fail=j;});}embeds++;},kill(){killed++;fail?.(Error('stopped'));}})});
 const p=c.search('寝ているときに地震が来たら');await start;c.stop();const next=await c.search('寝ているときに地震が来たら','light');complete({loadMs:1});await assert.rejects(p,/停止|中断/);assert.equal(embeds,0);assert.ok(killed>=1);assert.equal(c.busy,false);assert.equal(c.ready,false);assert.equal(c.runs.length,1);assert.equal(c.runs[0].actual,'light');assert.equal(next.actual,'light');
});
test('Ruri is reused for warm queries and reinitialized only after explicit release',async()=>{
 let loads=0,embeds=0,disposals=0;const c=new BetaController({status:saved,channel:()=>({request:async type=>{if(type==='load'){loads++;return{loadMs:1};}embeds++;return{vector:vectors.vectors[39],elapsedMs:1};},dispose:async()=>{disposals++;},kill(){}})});
 await c.search('寝ているときに地震');const second=await c.search('寝ているときに地震','ruri');assert.equal(loads,1);assert.equal(embeds,2);assert.equal(second.timings.warm,true);await c.reset();assert.equal(disposals,1);await c.search('寝ているときに地震');assert.equal(loads,2);
});
test('unsupported questions do not start model initialization or present source candidates',async()=>{const c=new BetaController({status:()=>{throw Error('must not read model');}});for(const q of ['今夜の津波の予想は何メートル？','インスリンは何単位打つ？']){const r=await c.search(q);assert.equal(r.scope.kind,'unsupported');assert.deepEqual(r.resultIds,[]);assert.equal(r.fallback,null);}});

test('dictionary and conversation share typed action evidence without certifying footwear',async()=>{
 const c=new BetaController({status:async()=>({complete:false})});
 const query='大雨で膝まで水がある道路を、足元を確かめながら歩くのは？';
 const r=await c.search(query,'light');
 assert(!r.resultIds.some(id=>['bosai-84','bosai-70'].includes(id)));assert.deepEqual(r.resultIds,r.results.map(x=>x.entry.id));
 assert(r.results.every(x=>x.assessment));
 const shoes=await c.search('道路が冠水したときの履物は長靴と運動靴のどちら？','light');
 assert(shoes.resultIds.includes('bosai-84'));assert.equal(shoes.results.find(x=>x.entry.id==='bosai-84').assessment.status,'needs-confirmation');
 const denied=await c.search('道路は冠水していません。徒歩です','light');
 assert(!denied.resultIds.some(id=>['bosai-69','bosai-70'].includes(id)));
});
