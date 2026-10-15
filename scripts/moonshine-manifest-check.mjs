// Real pinned browser WASM manifest, no model inference or iPad claim.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch();
const out={createdAt:new Date().toISOString(),sdk:'0.1.5',platform:'Linux Chromium; NOT iPad Safari',models:{}};
try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto('http://localhost:4173/bosai-ai/');await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.goto('http://localhost:4173/bosai-ai/?voice_iso=1');
 out.isolated=await page.evaluate(()=>crossOriginIsolated);
 out.models=await page.evaluate(async()=>{
  const lib=await import('/bosai-ai/moonshine/index.js');
  const core=await Promise.race([lib.loadMoonshineModule(),new Promise((_,reject)=>setTimeout(()=>reject(Error('WASM init timeout')),60000))]);
  const models={};for(const [name,arch] of [['tiny',lib.ModelArch.Tiny],['base',lib.ModelArch.Base]])models[name]={arch,manifest:JSON.parse(core.sttDependencies('ja',String(arch),false))};
  return models;
 });
 out.status='passed';
}catch(e){out.status='failed';out.error=e.message;process.exitCode=1;}
finally{await mkdir('test-results',{recursive:true});await writeFile('test-results/moonshine-manifests.json',JSON.stringify(out,null,2)+'\n');await browser.close();console.log(JSON.stringify(out));}
