import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getModel, modelFileUrl } from '../src/config.js';
import { searchCases, grade } from './search-cases.mjs';
import corpus from '../src/bosai-data.json' with { type: 'json' };
import { browserMemory } from './browser-memory.mjs';
const key = process.argv.find(arg => arg.startsWith('--model='))?.split('=')[1] || 'lfm2-cpu';
const lightOnly = process.argv.includes('--light-only');
if (!['lfm2-cpu','lfm2-700m-cpu'].includes(key)) throw Error('Search selection supports LFM CPU models only');
const model = getModel(key), file = key === 'lfm2-cpu' ? 'test-results/lfm2-q4-k-m.gguf' : `test-results/${key}.gguf`;
if (!lightOnly) {
 const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
 if (statSync(file).size !== model.weightBytes.q4_k_m || hash.digest('hex') !== model.sha256) throw Error('Wrong pinned GGUF');
}
const server = createServer((req,res) => { res.writeHead(200, { 'content-length': String(model.weightBytes.q4_k_m), 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*', 'access-control-allow-private-network': 'true' }); createReadStream(file).pipe(res); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
mkdirSync('test-results',{recursive:true});
const profile = mkdtempSync('test-results/search-profile-');
const context = await chromium.launchPersistentContext(profile);
const cdp = await context.browser().newBrowserCDPSession(), {processInfo} = await cdp.send('SystemInfo.getProcessInfo');
const pid = processInfo.find(p=>p.type==='browser').id; await cdp.detach();
let phase = 'light', requests=0;
const output = { createdAt:new Date().toISOString(), modelKey:key, model:model.id, revision:model.revision, sha256:model.sha256, browser:'Linux Chromium; GPU disabled; not iPad Safari', corpusCount:corpus.length, status:'running', samples:[], errors:[], memory:{method:'500ms browser descendant PSS incl browser/renderer/GPU processes; not WASM heap or Safari memory',peaks:{}} };
output.memory.timeline = [];
const save = () => writeFileSync(`test-results/search-${lightOnly?'light':key}.json`,JSON.stringify(output,null,2));
const sample = () => {const m=browserMemory(pid);if(m.complete&&(!output.memory.peaks[phase]||m.pssMiB>output.memory.peaks[phase].pssMiB))output.memory.peaks[phase]=m;};
const timer=setInterval(sample,500);sample();
await context.addInitScript(()=>Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get:()=>undefined}));
await context.route('https://huggingface.co/**', async route=>{if(route.request().url()===modelFileUrl(model.file,key)){requests++;await route.fulfill({status:302,headers:{location:`http://127.0.0.1:${server.address().port}/model.gguf`,'access-control-allow-origin':'*'}});}else {output.errors.push('Unexpected remote request');await route.abort();}});
const page=context.pages()[0];page.on('pageerror',error=>output.errors.push(error.message));
const ready = async prefix=>{await page.waitForFunction(()=>/ダウンロード・保存完了|生成可能|生成終了|エラー:|リセット済み/.test(document.querySelector('#status').textContent),null,{timeout:180000});const status=await page.locator('#status').textContent();if(!status.startsWith(prefix))throw Error(status);};
async function diagnostic(){const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const path=`test-results/search-${key}-diagnostic.json`;await d.saveAs(path);return JSON.parse(readFileSync(path,'utf8'));}
async function run(item,method,record=true){
 await page.locator('#searchMethod').selectOption(method);await page.locator('#searchQuery').fill(item.query);
 const prior=await page.locator('#searchResults').getAttribute('data-run');
 await page.locator('#searchSubmit').click();
 await page.waitForFunction(prior=>{const v=document.querySelector('#searchResults').dataset.run;return v&&v!==prior;},prior,{timeout:180000});
 const result=JSON.parse(await page.locator('#searchResults').getAttribute('data-run'));
 const ids=await page.locator('.search-card').evaluateAll(cards=>cards.map(c=>c.dataset.entryId));
 if(JSON.stringify(ids)!==JSON.stringify(result.results))throw Error('Rendered IDs differ from diagnostics');
 // Assert that visible safety text/sources are original DB values, never model advice.
 for(const id of ids){const entry=corpus.find(e=>e.id===id),card=page.locator(`[data-entry-id="${id}"]`);for(const text of [entry.title,entry.summary,entry.items,entry.warning,...entry.steps])if(!(await card.textContent()).includes(text))throw Error('Missing original text '+id);const links=await card.locator('a').evaluateAll(nodes=>nodes.map(a=>({label:a.textContent,url:a.getAttribute('href')})));if(JSON.stringify(links)!==JSON.stringify(entry.sources))throw Error('Source label/URL differs from original');}
 if(result.llm&&!result.llm.error&&!result.llm.stopped&&(!result.llm.tokensKnown||!result.llm.tokens||!result.llm.text.trim()))throw Error('No actual model generation');
 if(record){output.samples.push({caseId:item.id,kind:item.kind,relevant:item.relevant,dangerousIds:item.dangerous,...result,grade:grade(item,ids)});if(method==='llm'){const m=browserMemory(pid);output.memory.timeline.push({caseId:item.id,pssMiB:m.pssMiB,rendererPssMiB:m.rendererPssMiB,complete:m.complete});}
 console.log(method,item.id,result.results.join(','),result.llm?.text??'',Math.round(result.totalMs)+'ms');save();}
 return result;
}
try{
 await page.goto('http://localhost:4173/bosai-ai/');await page.waitForFunction(()=>document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
 output.appBuild=(await diagnostic()).appBuild;
 for(const method of ['keyword','light'])for(const item of searchCases)await run(item,method);
 if(!lightOnly){
  phase='download';await page.locator('#model').selectOption(key);await page.locator('#download').click();await ready('ダウンロード・保存完了');await page.reload();
  phase='load';await page.locator('#load').click();await ready('生成可能');output.ready=(await diagnostic()).logs.find(l=>l.message==='モデル準備完了')?.data;
  if(output.ready?.modelKey!==key||output.ready.settings?.threads!==1||output.ready.settings?.contextTokens!==512||output.ready.settings?.gpuLayers!==0||!output.ready.settings?.compat)throw Error('Search runtime settings differ from bounded CPU policy');
  phase='llm';for(const item of searchCases)await run(item,'llm');
  // Original generation still works after repeated selection in the same session.
  phase='regression';await page.locator('#prompt').fill('「再開」とだけ書いてください。');await page.locator('#generate').click();await ready('生成終了');output.afterSearchGeneration=(await diagnostic()).runs.at(-1);if(!output.afterSearchGeneration?.tokens)throw Error('Generation after selection failed');
  // Stop and reset must settle pending search, preserving saved weights.
  await page.locator('#searchQuery').fill(searchCases[0].query);await page.locator('#searchSubmit').click();await page.waitForFunction(()=>!document.querySelector('#stop').disabled);await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('#searchStatus').textContent.startsWith('検索完了'),null,{timeout:180000});
  output.stoppedSearch=JSON.parse(await page.locator('#searchResults').getAttribute('data-run'));if(!output.stoppedSearch.llm?.stopped)throw Error('Search stop not observed');
  await page.locator('#searchSubmit').click();await page.waitForFunction(()=>!document.querySelector('#stop').disabled);await page.locator('#reset').click();await ready('リセット済み');await page.waitForFunction(()=>document.querySelector('#searchStatus').textContent.startsWith('検索完了'));output.resetSearch=JSON.parse(await page.locator('#searchResults').getAttribute('data-run'));
 }
 phase='offline';await context.setOffline(true);await page.reload();
 output.offlineSearch=await run(searchCases[0],'light',false);
 if(output.offlineSearch.results[0]!=='bosai-39')throw Error('Offline corpus search failed');
 if(!lightOnly){await page.locator('#load').click();await ready('生成可能');output.offlineLLM=await run(searchCases[1],'llm',false);if(!output.offlineLLM.llm?.tokens)throw Error('Offline selection did not generate');}
 if(output.errors.length)throw Error(output.errors.join(';'));
 if(!lightOnly&&requests!==1)throw Error('Saved GGUF was unexpectedly downloaded again');
 output.modelRequests=requests;output.status='passed';
 await page.screenshot({path:`test-results/search-${key}.png`,fullPage:true});
}catch(error){output.status='failed';output.errors.push(error.message);console.error(error);process.exitCode=1;}
finally{sample();clearInterval(timer);save();console.log(output.status);await context.close();rmSync(profile,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));}
