// Real pinned Ruri30 ONNX. Model bytes are local fixture transport only; inference is genuine WASM.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,createReadStream,mkdtempSync,rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {browserMemory} from './browser-memory.mjs';
import corpus from '../src/bosai-data.json' with {type:'json'};
const freeze=JSON.parse(readFileSync('docs/diagnostics/conversation-freeze.json'));
for(const [path,hash] of Object.entries(freeze.coreSha256))if(createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)throw Error('Conversation evaluation core changed: '+path);
const cases=JSON.parse(readFileSync('scripts/evaluation/conversation-final-24.json'));
const assets=JSON.parse(readFileSync('test-results/ruri-assets.json'));
const server=createServer((req,res)=>{const a=assets[Number(new URL(req.url,'http://localhost').searchParams.get('id'))];res.writeHead(200,{'content-length':a.bytes,'access-control-allow-origin':'*'});createReadStream(a.localFile).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
if(createHash('sha256').update(readFileSync('scripts/evaluation/conversation-final-24.json')).digest('hex')!==freeze.casesSha256)throw Error('Evaluation cases changed');
const profile=mkdtempSync('test-results/conversation-profile-');
const out={createdAt:new Date().toISOString(),platform:'Linux Chromium, CPU/WASM, WebGPU disabled; not iPad Safari',freeze:'937a981',casesSha256:createHash('sha256').update(readFileSync('scripts/evaluation/conversation-final-24.json')).digest('hex'),rows:[],errors:[],requests:[],memory:[],checks:{}};
let context,page,pid;const save=()=>writeFileSync('test-results/conversation-browser.json',JSON.stringify(out,null,2));
const memory=()=>{if(pid)out.memory.push(browserMemory(pid));};const timer=setInterval(memory,500);
async function launch(offline=false){context=await chromium.launchPersistentContext(profile,{offline,viewport:{width:1024,height:1000}});await context.addInitScript(()=>Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined}));const cdp=await context.browser().newBrowserCDPSession();pid=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;await cdp.detach();page=context.pages()[0];page.on('pageerror',e=>out.errors.push(e.message));await context.route('https://huggingface.co/**',async route=>{const i=assets.findIndex(a=>a.url===route.request().url());if(i<0)throw Error('Unexpected model URL');out.requests.push(assets[i].file);await route.fulfill({status:302,headers:{location:`http://127.0.0.1:${server.address().port}/?id=${i}`,'access-control-allow-origin':'*'}});});await page.goto('http://localhost:4173/bosai-ai/');await page.waitForFunction(()=>document.querySelector('#shellState').textContent.startsWith('アプリ・辞書のオフライン準備が完了'));}
async function send(text){const before=await page.locator('#conversation').getAttribute('data-state');await page.locator('#chatQuestion').fill(text);const t=performance.now();await page.locator('#chatSend').click();await page.waitForFunction(before=>!window.bosaiConversation.busy&&document.querySelector('#conversation').dataset.state!==before,before,{timeout:180000});const state=JSON.parse(await page.locator('#conversation').getAttribute('data-state'));return {...state.history.at(-1),wallMs:performance.now()-t};}
async function choose(id){await page.locator(`[data-source-choice="${id}"]:enabled`).last().click();const e=corpus.find(e=>e.id===id),card=page.locator(`[data-source-id="${id}"]`).last();const text=await card.textContent();for(const s of [e.title,e.summary,e.warning,e.items,...e.steps])if(!text.includes(s))throw Error('Missing original field '+id);const links=await card.locator('a').evaluateAll(ns=>ns.map(n=>({label:n.textContent,url:n.getAttribute('href')})));if(JSON.stringify(links)!==JSON.stringify(e.sources))throw Error('Sources changed');}
try{
 await launch();out.build=await page.locator('#build').textContent();await page.locator('#chatToggle').click();const missing=await send('寝室で地震にあったときは？');out.checks.unsavedFallback=missing.diagnostics.actual==='light';await page.getByRole('button',{name:'通常検索に戻る',exact:true}).click();
 await page.locator('#saveModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy&&window.bosaiBeta.saved?.complete,null,{timeout:180000});await page.locator('#chatToggle').click();
 for(const test of cases){await page.locator('#chatClear').click();let chosen;
  for(const [index,turn] of test.turns.entries()){
   const r=await send(turn.text),row={caseId:test.id,category:test.kind,turn:index+1,input:turn.text,expected:turn.kind,...r};row.controlPass=r.kind===turn.kind&&(!turn.queryIncludes||r.diagnostics?.query.includes(turn.queryIncludes))&&(!turn.queryExcludes||!r.diagnostics?.query.includes(turn.queryExcludes));
   if(turn.gold){row.gold=turn.gold;row.rank=r.candidates?.findIndex(c=>c.id===turn.gold)+1||null;}
   if(r.kind==='source')row.sourceRetained=!!chosen&&r.entryIds?.[0]===chosen;
   if(turn.choose&&r.candidates?.length){chosen=r.candidates.find(c=>c.id===turn.gold)?.id||r.candidates[0].id;await choose(chosen);row.chosen=chosen;row.originalFieldsVerified=true;}
   out.rows.push(row);save();
  }
 }
 // Stop a real cold initialization via existing controls, then recover in the conversation UI.
 await page.getByRole('button',{name:'通常検索に戻る',exact:true}).click();await page.locator('#resetModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy);await page.locator('#chatToggle').click();await page.locator('#chatClear').click();await page.locator('#chatQuestion').fill('地震で寝室にいたらどうする？');await page.locator('#chatSend').click();await page.waitForFunction(()=>window.bosaiBeta.busy);await page.locator('#chatStop').click();await page.waitForTimeout(200);out.checks.stoppedCold=await page.evaluate(()=>!window.bosaiBeta.busy&&!window.bosaiBeta.channel&&!window.bosaiConversation.busy);await page.locator('#chatClear').click();out.checks.resetDuringLoad=await page.evaluate(()=>window.bosaiConversation.history.length===0);const recovered=await send('地震で寝室にいたらどうする？');out.checks.recoveredReal=recovered.diagnostics.actual==='hybrid';
 await page.setViewportSize({width:390,height:844});out.checks.mobileNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:'test-results/conversation-mobile.png',fullPage:true});
 const before=out.requests.length;await context.close();pid=null;await launch(true);await page.locator('#chatToggle').click();const offline=await send('停電中は冷蔵庫を開けてよいですか');out.offline=offline;out.checks.offlineReal=offline.diagnostics.actual==='hybrid'&&offline.diagnostics.timings.embeddingMs!==undefined;out.checks.noRedownload=out.requests.length===before;out.checks.memoryOnlyHistory=await page.evaluate(()=>window.bosaiConversation.history.length===2);
 await page.getByRole('button',{name:'通常検索に戻る',exact:true}).click();out.checks.voiceIntact=await page.locator('#voiceLoad').isVisible()&&await page.locator('#question').count()===1;out.release={before:browserMemory(pid)};await page.locator('#resetModel').click();await page.waitForFunction(()=>!window.bosaiBeta.busy);await page.waitForTimeout(3000);out.release.after=browserMemory(pid);out.checks.workerReleased=await page.evaluate(()=>!window.bosaiBeta.channel&&!window.bosaiBeta.ready);
 out.status=Object.values(out.checks).every(Boolean)&&!out.errors.length&&out.rows.every(r=>r.controlPass&&r.sourceRetained!==false)?'passed':'failed';if(out.status==='failed')process.exitCode=1;
}catch(e){out.status='failed';out.failure=e.message;console.error(e);process.exitCode=1;}finally{clearInterval(timer);memory();save();await context?.close();rmSync(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));console.log(out.status,out.failure||'',out.rows.length,out.checks);}
