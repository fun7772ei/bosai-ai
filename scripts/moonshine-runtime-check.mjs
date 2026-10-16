// Real models via verified local fixture transport. No speech/CER measurements.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,createReadStream,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
const assets=JSON.parse(readFileSync('test-results/moonshine-assets.json'));
const ruri=JSON.parse(readFileSync('test-results/ruri-assets.json'));
const files=Object.values(assets.models).flatMap(m=>m.manifest.groups.flatMap(g=>g.files));
const server=createServer((req,res)=>{const f=[...files,...ruri].find(f=>f.url===decodeURIComponent(req.url.slice(1)));if(!f){res.writeHead(404).end();return;}res.writeHead(200,{'content-length':f.size??f.bytes,'access-control-allow-origin':'*'});createReadStream(f.localFile).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=mkdtempSync('test-results/moonshine-profile-');let context,page;
const out={createdAt:new Date().toISOString(),platform:'Linux Chromium; fixture transport of actual CDN weights; NOT iPad Safari',rows:[],requests:[],speechAccuracy:'unmeasured'};
async function launch(offline=false){
 context=await chromium.launchPersistentContext(profile,{offline,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});page=context.pages()[0];page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await context.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined});window.voiceWorkerCount=0;const OriginalWorker=window.Worker;window.Worker=new Proxy(OriginalWorker,{construct(target,args){if(String(args[0]).includes('stt-worker.js'))window.voiceWorkerCount++;return Reflect.construct(target,args);}});});
 await context.route('https://huggingface.co/**',async route=>{out.requests.push(route.request().url());await route.fulfill({status:302,headers:{location:'http://127.0.0.1:'+server.address().port+'/'+encodeURIComponent(route.request().url()),'access-control-allow-origin':'*'}});});
 await context.route('https://download.moonshine.ai/**',async route=>{out.requests.push(route.request().url());await route.fulfill({status:302,headers:{location:'http://127.0.0.1:'+server.address().port+'/'+encodeURIComponent(route.request().url()),'access-control-allow-origin':'*'}});});
 await page.goto('http://localhost:4173/bosai-ai/?voice_iso=1');await page.evaluate(()=>navigator.serviceWorker.ready);
 if(!await page.evaluate(()=>crossOriginIsolated))await page.reload();
}
async function appSwitch(offline,model){
 await page.goto('http://localhost:4173/bosai-ai/?voice_iso=1'+(model==='base'?'&voice_eval=base':''));
 await page.waitForFunction(()=>window.bosaiBeta.saved?.complete&&!window.bosaiBeta.busy);

 await page.locator('#appNavigation [data-view="settings"]').evaluate(b=>b.click());await page.locator('#loadModel').click();await page.waitForFunction(()=>window.bosaiBeta.ready&&!window.bosaiBeta.busy,null,{timeout:180000});
 await page.locator('#appNavigation [data-view="chat"]').evaluate(b=>b.click());await page.locator('#voiceToggle').click();await page.waitForFunction(()=>document.querySelector('.voice-lab').dataset.phase==='recording',null,{timeout:180000});
 if(!await page.evaluate(()=>!window.bosaiBeta.channel&&!window.bosaiBeta.ready))throw Error('Ruri still resident during voice');
 await page.waitForFunction(()=>!document.querySelector('#voiceStop').disabled);
 const workers=await page.evaluate(()=>window.voiceWorkerCount);
 await page.locator('#voiceStop').click();await page.waitForFunction(()=>['review','error'].includes(document.querySelector('.voice-lab').dataset.phase));
 if(await page.locator('.voice-lab').getAttribute('data-phase')!=='review')throw Error(await page.locator('#voiceStatus').textContent());
 if(!(await page.locator('#voiceModelState').textContent()).includes('メモリに保持'))throw Error('Stopped model was not retained');
 await page.locator('#voiceToggle').click();await page.waitForFunction(()=>document.querySelector('.voice-lab').dataset.phase==='recording',null,{timeout:180000});
 if(await page.evaluate(()=>window.voiceWorkerCount)!==workers)throw Error('Restart recreated model worker');
 await page.locator('#voiceStop').click();await page.waitForFunction(()=>document.querySelector('.voice-lab').dataset.phase==='review',null,{timeout:180000});
 await page.locator('#chatQuestion').fill('寝ているときに地震が来たら？');await page.locator('#chatSend').click();
 await page.waitForFunction(()=>!window.bosaiConversation.busy&&window.bosaiConversation.history.at(-1)?.diagnostics,null,{timeout:180000});
 const run=await page.evaluate(()=>window.bosaiConversation.history.at(-1).diagnostics);if(run.actual!=='hybrid')throw Error('Real Ruri did not recover after voice');
 out.rows.push({appSwitch:true,offline,model:await page.locator('#voiceModelState').textContent(),actual:run.actual});
}
async function check(model,offline){
 const row=await page.evaluate(async({model,offline})=>{
  const lib=await import('/bosai-ai/moonshine/index.js'),mic=new lib.MicTranscriber().language('ja').modelArch(model==='tiny'?lib.ModelArch.Tiny:lib.ModelArch.Base);
  const start=performance.now();let loadMs,loaded=false,started=false,stopped=false,closed=false,error;
  try{await mic.load();loadMs=performance.now()-start;loaded=true;await mic.start();started=true;await mic.stop();stopped=true;}catch(e){error=e.message||String(e);}finally{try{await mic.close();closed=true;}catch(e){error=String(e);}}
  return {model,offline,loadMs,loaded,started,stopped,closed,error,elapsedMs:performance.now()-start};
 },{model,offline});out.rows.push(row);writeFileSync('test-results/moonshine-runtime.json',JSON.stringify(out,null,2));console.log(row);
 if(!row.loaded||!row.started||!row.stopped||!row.closed)throw Error('Runtime failed: '+JSON.stringify(row));
}
try{
 await launch();
 await page.locator('#appNavigation [data-view="settings"]').evaluate(b=>b.click());await page.locator('#saveModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy,null,{timeout:60000});console.log('SAVE',await page.locator('#modelState').textContent());if(!await page.evaluate(()=>window.bosaiBeta.saved?.complete))throw Error('Save failed: '+await page.locator('#modelState').textContent());
 for(const m of ['tiny','base'])await check(m,false);
 for(const m of ['tiny','base'])await appSwitch(false,m);
 const count=out.requests.length;await context.close();await launch(true);
 for(const m of ['tiny','base'])await check(m,true);
 for(const m of ['tiny','base'])await appSwitch(true,m);
 out.noRedownload=out.requests.length===count;if(!out.noRedownload)throw Error('Offline redownload');out.status='passed';
}catch(e){out.status='failed';out.error=e.message;console.log('FAILED',e.message);process.exitCode=1;}
finally{writeFileSync('test-results/moonshine-runtime.json',JSON.stringify(out,null,2));await context?.close();rmSync(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));}
