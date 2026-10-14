// Real pinned Ruri30 ONNX. Model bytes are local fixture transport only; inference is genuine WASM.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,createReadStream,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {browserMemory} from './browser-memory.mjs';
import corpus from '../src/bosai-data.json' with {type:'json'};
const option=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=')||fallback;
const tag=option('tag','conversation-v2-dev'),casesPath=option('cases','scripts/evaluation/conversation-v2-dev.json');
const baseline=process.argv.includes('--baseline');
const cases=JSON.parse(readFileSync(casesPath));
const base=option('base','http://localhost:4173/bosai-ai/');
const freeze=JSON.parse(readFileSync(option('freeze','docs/diagnostics/conversation-v13-freeze.json')));
if(!baseline)for(const [path,hash] of Object.entries(freeze.coreSha256))if(createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)throw Error('Frozen v2 implementation changed: '+path);
if(casesPath===freeze.initialCases&&createHash('sha256').update(readFileSync(casesPath)).digest('hex')!==freeze.initialCasesSha256)throw Error('Initial final/regression cases changed');
if(casesPath===freeze.finalCases&&createHash('sha256').update(readFileSync(casesPath)).digest('hex')!==freeze.finalCasesSha256)throw Error('Final cases changed');
if(casesPath.endsWith('conversation-final-24.json')&&createHash('sha256').update(readFileSync(casesPath)).digest('hex')!==freeze.oldRegressionSha256)throw Error('Original 24 cases changed');
if(freeze.regressionCaseSha256?.[casesPath]&&createHash('sha256').update(readFileSync(casesPath)).digest('hex')!==freeze.regressionCaseSha256[casesPath])throw Error('Regression cases changed');
const assets=JSON.parse(readFileSync('test-results/ruri-assets.json'));
const server=createServer((req,res)=>{const a=assets[Number(new URL(req.url,'http://localhost').searchParams.get('id'))];res.writeHead(200,{'content-length':a.bytes,'access-control-allow-origin':'*'});createReadStream(a.localFile).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=mkdtempSync('test-results/conversation-profile-');
const out={createdAt:new Date().toISOString(),platform:'Linux Chromium, CPU/WASM, WebGPU disabled; not iPad Safari',baseline, casesPath, implementation:baseline?freeze.baselineCommit:freeze.implementationCommit,casesSha256:createHash('sha256').update(readFileSync(casesPath)).digest('hex'),rows:[],errors:[],requests:[],memory:[],checks:{}};
let context,page,pid;const save=()=>writeFileSync('test-results/'+tag+'.json',JSON.stringify(out,null,2));
const memory=()=>{if(pid)out.memory.push(browserMemory(pid));};const timer=setInterval(memory,500);
async function launch(offline=false){context=await chromium.launchPersistentContext(profile,{offline,viewport:{width:1024,height:1000}});await context.addInitScript(()=>Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined}));const cdp=await context.browser().newBrowserCDPSession();pid=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;await cdp.detach();page=context.pages()[0];page.on('pageerror',e=>out.errors.push(e.message));await context.route('https://huggingface.co/**',async route=>{const i=assets.findIndex(a=>a.url===route.request().url());if(i<0)throw Error('Unexpected model URL');out.requests.push(assets[i].file);await route.fulfill({status:302,headers:{location:`http://127.0.0.1:${server.address().port}/?id=${i}`,'access-control-allow-origin':'*'}});});await page.goto(base);await page.waitForFunction(()=>document.querySelector('#shellState').textContent.startsWith('アプリ・辞書のオフライン準備が完了'));}
async function send(text){const before=await page.locator('#conversation').getAttribute('data-state');await page.locator('#chatQuestion').fill(text);const t=performance.now();await page.locator('#chatSend').click();await page.waitForFunction(before=>!window.bosaiConversation.busy&&document.querySelector('#conversation').dataset.state!==before,before,{timeout:180000});const state=JSON.parse(await page.locator('#conversation').getAttribute('data-state'));return {...state.history.at(-1),wallMs:performance.now()-t};}
async function choose(id){await page.locator(`[data-source-choice="${id}"]:enabled`).last().click();const e=corpus.find(e=>e.id===id),card=page.locator(`[data-source-id="${id}"]`).last();const text=await card.textContent();for(const s of [e.title,e.summary,e.warning,e.items,...e.steps])if(!text.includes(s))throw Error('Missing original field '+id);const links=await card.locator('a').evaluateAll(ns=>ns.map(n=>({label:n.textContent,url:n.getAttribute('href')})));if(JSON.stringify(links)!==JSON.stringify(e.sources))throw Error('Sources changed');}
try{
 await launch();out.build=await page.locator('#build').textContent();await page.locator('#chatToggle').click();const missing=await send('寝室で地震にあったときは？');out.checks.unsavedFallback=missing.diagnostics.actual==='light';await page.getByRole('button',{name:'通常検索に戻る',exact:true}).click();
 await page.locator('#saveModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy&&window.bosaiBeta.saved?.complete,null,{timeout:180000});await page.locator('#chatToggle').click();
 for(const test of cases){await page.locator('#chatClear').click();let chosen,previous;
  for(const [index,turn] of test.turns.entries()){
   const r=await send(turn.text),row={caseId:test.id,category:test.kind,turn:index+1,input:turn.text,expected:turn.kind,...r};row.controlPass=r.kind===turn.kind&&(!turn.queryIncludes||r.diagnostics?.query.includes(turn.queryIncludes))&&(!turn.queryExcludes||!r.diagnostics?.query.includes(turn.queryExcludes));
   const state=await page.evaluate(()=>window.bosaiConversation.state);row.state=state;
   if(turn.noPending)row.controlPass&&=state.pending.length===0&&state.referenceIds.length===0;
   if(turn.absentFacts)row.controlPass&&=turn.absentFacts.every(k=>state.facts?.[k]===undefined);
   if(turn.facts)row.controlPass&&=Object.entries(turn.facts).every(([k,v])=>state.facts?.[k]===v);
   if(turn.notFocus)row.controlPass&&=r.diagnostics?.evidence?.focus!==turn.notFocus;
   if(turn.rejectPrevious){row.staleEnabled=await page.locator('[data-source-choice]:enabled').count();row.oldChoiceRejected=await page.evaluate(id=>{try{window.bosaiConversation.choose(id);return false;}catch{return true;}},previous);row.controlPass&&=row.staleEnabled===0&&row.oldChoiceRejected;}
   if(turn.badIds)row.badTop3=(r.candidates||[]).slice(0,3).filter(c=>turn.badIds.includes(c.id)).map(c=>c.id);
   if(turn.gold){row.gold=turn.gold;row.rank=r.candidates?.findIndex(c=>c.id===turn.gold)+1||null;row.retrievalBeforeCapabilityRank=r.diagnostics?.evidence?.originalResultIds?(r.diagnostics.evidence.originalResultIds.indexOf(turn.gold)+1||null):row.rank;row.provenance=r.candidates?.find(c=>c.id===turn.gold)?.provenance;}
   if(turn.requiredIds){row.requiredIds=turn.requiredIds;row.allRequiredFound=turn.requiredIds.every(id=>r.candidates?.some(c=>c.id===id));}
   if(['unsupported','clarify'].includes(turn.kind))row.unqualifiedCandidates=(r.candidates||[]).length;

   if(r.kind==='source')row.sourceRetained=!!chosen&&r.entryIds?.[0]===chosen;
   if(turn.choose&&r.candidates?.length){chosen=r.candidates.find(c=>c.id===turn.gold)?.id||r.candidates[0].id;await choose(chosen);row.chosen=chosen;row.originalFieldsVerified=true;}
   previous=r.candidates?.[0]?.id||previous;out.rows.push(row);save();
  }
 }
 // Stop a real cold initialization via existing controls, then recover in the conversation UI.
 await page.getByRole('button',{name:'通常検索に戻る',exact:true}).click();await page.locator('#resetModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy);await page.locator('#chatToggle').click();await page.locator('#chatClear').click();await page.locator('#chatQuestion').fill('地震で寝室にいたらどうする？');await page.locator('#chatSend').click();await page.waitForFunction(()=>window.bosaiBeta.busy);await page.locator('#chatStop').click();await page.waitForTimeout(200);out.checks.stoppedCold=await page.evaluate(()=>!window.bosaiBeta.busy&&!window.bosaiBeta.channel&&!window.bosaiConversation.busy);await page.locator('#chatClear').click();out.checks.resetDuringLoad=await page.evaluate(()=>window.bosaiConversation.history.length===0);const recovered=await send('地震で寝室にいたらどうする？');out.checks.recoveredReal=recovered.diagnostics.actual==='hybrid';
 await page.setViewportSize({width:390,height:844});out.checks.mobileNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:'test-results/'+tag+'-mobile.png',fullPage:true});
 const before=out.requests.length;await context.close();pid=null;await launch(true);await page.locator('#chatToggle').click();const offline=await send('停電中は冷蔵庫を開けてよいですか');out.offline=offline;out.checks.offlineReal=offline.diagnostics.actual==='hybrid'&&offline.diagnostics.timings.embeddingMs!==undefined;out.checks.noRedownload=out.requests.length===before;out.checks.memoryOnlyHistory=await page.evaluate(()=>window.bosaiConversation.history.length===2);
 await page.getByRole('button',{name:'通常検索に戻る',exact:true}).click();out.checks.voiceIntact=await page.locator('#voiceLoad').isVisible()&&await page.locator('#question').count()===1;out.release={before:browserMemory(pid)};await page.locator('#resetModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy);await page.waitForTimeout(3000);out.release.after=browserMemory(pid);out.checks.workerReleased=await page.evaluate(()=>!window.bosaiBeta.channel&&!window.bosaiBeta.ready);
 out.control={passed:out.rows.filter(r=>r.controlPass).length,total:out.rows.length};
 out.checks.noStaleCandidateSelection=out.rows.filter(r=>r.oldChoiceRejected!==undefined).every(r=>r.oldChoiceRejected&&r.staleEnabled===0);
 out.status=Object.entries(out.checks).every(([key,passed])=>passed||(baseline&&key==='noStaleCandidateSelection'))&&!out.errors.length?'passed':'failed';if(out.status==='failed')process.exitCode=1;
}catch(e){out.status='failed';out.failure=e.message;console.error(e);process.exitCode=1;}finally{clearInterval(timer);memory();save();await context?.close();rmSync(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));console.log(out.status,out.failure||'',out.rows.length,out.checks);}
