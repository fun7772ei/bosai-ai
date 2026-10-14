import test from'node:test';import assert from'node:assert/strict';import{SixController}from'../src/six-controller.js';
test('a reset during pending acquisition cannot send native generation or clear a newer run busy flag',async()=>{
 let continueAcquire,entered;const acquired=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>continueAcquire=resolve);let requests=0;
 const phases=[],controller=new SixController({notice:data=>phases.push(data.phase)});
 controller.acquire=async()=>{entered();await held;};
 const old=controller.run('寝てるときに地震が来たらどうすればいい？','D');await acquired;
 await controller.reset();controller.busy=true;controller.llm={request:()=>{requests++;throw Error('stale native request');}};
 continueAcquire();const result=await old;
 assert.equal(result.status,'interrupted');assert.equal(requests,0);assert.equal(controller.busy,true);assert.notEqual(phases.at(-1),'complete');controller.llm=null;controller.busy=false;
});
test('reset during download preparation does not create a late transfer or clear newer work',async()=>{
 let proceed,entered;const started=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>proceed=resolve);
 const controller=new SixController({beforeModels:async()=>{entered();await held;}});
 const old=controller.download('ruri');await started;await controller.reset();controller.busy=true;const newer={};controller.transfer=newer;
 proceed();await assert.rejects(old,/リセット/);assert.equal(controller.transfer,newer);assert.equal(controller.busy,true);controller.transfer=null;controller.busy=false;
});
test('stop during a cold LFM acquisition kills loading Worker and prevents native answer',async()=>{
 let proceed,entered;const pending=new Promise(r=>proceed=r),started=new Promise(r=>entered=r);let killed=false,answers=0;
 const c=new SixController();c.acquire=async()=>{c.llm={loading:true,kill:()=>killed=true,request:()=>answers++};entered();await pending;};
 const p=c.run('地震で台所が揺れた','D');await started;c.stop();proceed();const result=await p;assert.equal(killed,true);assert.equal(answers,0);assert.equal(result.status,'interrupted');assert.equal(c.busy,false);
});
test('stop while waiting for model preparation prevents a late new Worker',async()=>{
 let proceed,entered;const pending=new Promise(r=>proceed=r),started=new Promise(r=>entered=r);let checked=0;
 const c=new SixController({beforeModels:async()=>{entered();await pending;}});c.check=async()=>{checked++;throw Error('must not load');};
 const p=c.run('地震で台所が揺れた','D');await started;c.stop();proceed();const r=await p;assert.equal(r.status,'interrupted');assert.equal(checked,0);
});
