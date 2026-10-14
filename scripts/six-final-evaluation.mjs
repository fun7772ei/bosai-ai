// Frozen final evaluation. Labels never reach A-F; only Oracle receives source IDs.
import{chromium}from'@playwright/test';import{createServer}from'node:http';import{createReadStream,readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';
import{getModel,modelFileUrl}from'../src/config.js';import{browserMemory}from'./browser-memory.mjs';import corpus from'../src/bosai-data.json'with{type:'json'};
const selected=(process.argv.find(a=>a.startsWith('--methods='))?.slice(10)||'A,B,C').split(',');if(selected.some(m=>!['A','B','C','D','E','F','Oracle'].includes(m)))throw Error('Unknown methods');
const tag=selected.join('-'),cases=JSON.parse(readFileSync('scripts/evaluation/final-64.json')),freeze=JSON.parse(readFileSync('docs/diagnostics/six-evaluation-freeze.json')),provenance=JSON.parse(readFileSync('docs/diagnostics/six-final-set-provenance.json'));
for(const[path,expected]of Object.entries(freeze.coreSha256))if(createHash('sha256').update(readFileSync(path)).digest('hex')!==expected)throw Error('Frozen algorithm changed: '+path);
if(createHash('sha256').update(readFileSync('scripts/evaluation/final-64.json')).digest('hex')!==provenance.sha256)throw Error('Final labels changed');
const assets=JSON.parse(readFileSync('test-results/six-assets.json')),model=getModel('lfm2-cpu');assets.push({url:modelFileUrl(model.file,model.key),bytes:model.weightBytes.q4_k_m,localFile:'test-results/lfm2-q4-k-m.gguf'});
const fixture=createServer((q,r)=>{const a=assets[Number(new URL(q.url,'http://localhost').searchParams.get('id'))];r.writeHead(200,{'content-length':a.bytes,'access-control-allow-origin':'*','access-control-allow-private-network':'true'});createReadStream(a.localFile).pipe(r);});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
mkdirSync('test-results',{recursive:true});const profile=mkdtempSync('test-results/six-final-profile-'),context=await chromium.launchPersistentContext(profile);await context.addInitScript(()=>Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined}));
const page=context.pages()[0],errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));await context.route('https://huggingface.co/**',async route=>{const i=assets.findIndex(a=>a.url===route.request().url());if(i<0){errors.push('Unexpected external model request');await route.abort();return;}requests.push(assets[i].url);await route.fulfill({status:302,headers:{location:`http://127.0.0.1:${fixture.address().port}/asset?id=${i}`,'access-control-allow-origin':'*'}});});
const cdp=await context.browser().newBrowserCDPSession();const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');const pid=processInfo.find(p=>p.type==='browser').id;await cdp.detach();
const output={createdAt:new Date().toISOString(),methods:selected,algorithmFreezeCommit:'f9a7ca5',finalSetSha256:provenance.sha256,browser:'Linux Chromium CPU/WASM, GPU disabled, not iPad Safari',execution:'Final accuracy runs may overlap with one other single-thread evaluation browser (2 CPU quota); serial E2E residency run is the latency/memory comparison baseline.',status:'running',samples:[],errors,memory:{method:'500ms PPid browser descendant PSS, not Safari',peaks:{},timeline:[]}};
let method='setup';const sample=()=>{const m=browserMemory(pid);if(m.complete&&(!output.memory.peaks[method]||m.pssMiB>output.memory.peaks[method].pssMiB))output.memory.peaks[method]=m;};const timer=setInterval(sample,500);const save=()=>writeFileSync(`test-results/six-final-${tag}.json`,JSON.stringify(output,null,2));
function grade(item,ids){const positive=!!item.relevant.length;return{top1:positive&&item.relevant.includes(ids[0]),top3:positive&&ids.slice(0,3).some(id=>item.relevant.includes(id)),top5:positive&&ids.slice(0,5).some(id=>item.relevant.includes(id)),wrongTop1:positive&&!!ids.length&&!item.relevant.includes(ids[0]),positiveMiss:positive&&!ids.length,falsePositive:!positive&&!!ids.length,correctAbstention:!positive&&!ids.length,dangerous:item.dangerous.includes(ids[0]),relevantRetrieved:ids.filter(id=>item.relevant.includes(id)).length};}
try{
 await page.goto('http://localhost:4173/bosai-ai/');await page.waitForFunction(()=>document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
 await page.locator('#sixSaveEmbedding').click();await page.waitForFunction(()=>!window.bosaiSix.busy&&document.querySelector('#sixSaved').textContent.includes('Embedding: 保存済み'),null,{timeout:180000});
 if(selected.some(m=>['D','E','F','Oracle'].includes(m))){await page.locator('#sixSaveLfm').click();await page.waitForFunction(()=>!window.bosaiSix.busy&&document.querySelector('#sixSaved').textContent.includes('LFM350＋Tokenizer: 保存済み'),null,{timeout:180000});}
 output.appBuild=await page.locator('#build').textContent();output.assetRequests=requests;
 for(method of selected){
  await page.evaluate(()=>window.bosaiSix.reset());
  for(const item of cases){
   let result;
   if(method==='Oracle')result=await page.evaluate(({query,ids})=>window.bosaiSix.run(query,'Oracle',{oracleIds:ids}),{query:item.query,ids:item.oracleIds});
   else{
    await page.locator('#sixMethod').selectOption(method);await page.locator('#sixQuestion').fill(item.query);const old=await page.locator('#sixResults').getAttribute('data-run');await page.locator('#sixSubmit').click();
    await page.waitForFunction(old=>{const next=document.querySelector('#sixResults').dataset.run;return next&&next!==old;},old,{timeout:180000});result=JSON.parse(await page.locator('#sixResults').getAttribute('data-run'));
    const ids=await page.locator('[data-six-entry-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sixEntryId));if(JSON.stringify(ids)!==JSON.stringify(result.resultIds))throw Error('Result DOM does not match actual run');
    for(const id of ids){const entry=corpus.find(e=>e.id===id),card=page.locator(`[data-six-entry-id="${id}"]`);for(const text of [entry.title,entry.summary,entry.warning,...entry.steps])if(!(await card.textContent()).includes(text))throw Error('Original source missing');const links=await card.locator('a').evaluateAll(nodes=>nodes.map(a=>({label:a.textContent,url:a.getAttribute('href')})));if(JSON.stringify(links)!==JSON.stringify(entry.sources))throw Error('Source labels/URLs modified');}
   }
   if(result.answer?.tokens&&!result.answer.tokenCountMatches)throw Error('Native tokenizer mismatch on final set');
   const row={caseId:item.id,kind:item.kind,...result,retrievalGrade:grade(item,result.resultIds)};output.samples.push(row);const m=browserMemory(pid);output.memory.timeline.push({method,caseId:item.id,pssMiB:m.pssMiB,rendererPssMiB:m.rendererPssMiB,complete:m.complete});
   console.log(method,item.id,result.status,JSON.stringify(result.answer?.text||''),Math.round(result.timings.totalMs)+'ms');save();
   if(['unavailable','interrupted'].includes(result.status)){output.recoveryResets=(output.recoveryResets||0)+1;await page.evaluate(()=>window.bosaiSix.reset());}
  }
 }
 if(errors.length)throw Error(errors.join(';'));output.status='passed';
}catch(e){output.status='failed';output.failure=e.message;console.error(e);process.exitCode=1;}finally{sample();clearInterval(timer);save();await context.close();rmSync(profile,{recursive:true,force:true});fixture.closeAllConnections();await new Promise(r=>fixture.close(r));console.log(output.status);}
