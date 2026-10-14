// Model-free interaction regression, separate from actual GGUF evaluation.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const run=async(query,method)=>{
 await page.locator('#searchMethod').selectOption(method);await page.locator('#searchQuery').fill(query);
 const previous=await page.locator('#searchResults').getAttribute('data-run');await page.locator('#searchSubmit').click();
 await page.waitForFunction(previous=>{const next=document.querySelector('#searchResults').dataset.run;return next&&next!==previous;},previous);
 return JSON.parse(await page.locator('#searchResults').getAttribute('data-run'));
};
try{
 await page.goto('http://localhost:4173/bosai-ai/');await page.waitForFunction(()=>document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
 const light=await run('寝てるときに地震が来たらどうすればいい？','light');if(light.results[0]!=='bosai-39')throw Error('Wrong light result');
 const fallback=await run('寝てるときに地震が来たらどうすればいい？','llm');if(fallback.outcome!=='fallback-model-not-ready'||fallback.results[0]!=='bosai-39'||fallback.llm)throw Error('Unloaded model fallback failed');
 const none=await run('今開設中の避難所の住所は？','light');if(none.results.length||await page.locator('.search-card').count())throw Error('No-match left stale cards');
 const escaped=await run('<img src=x onerror="alert(1)">地震','light');if(await page.locator('#searchResults img').count())throw Error('Query injected markup');
 await run('歯ブラシがないし水もほとんど出ない','light');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Search overflows narrow screen');
 await context.setOffline(true);await page.reload();const offline=await run('寝てるときに地震が来たらどうすればいい？','light');if(offline.results[0]!=='bosai-39')throw Error('Offline corpus unavailable');
 if(errors.length)throw Error(errors.join(';'));
 mkdirSync('test-results',{recursive:true});await page.locator('section[aria-labelledby="searchHeading"]').screenshot({path:'test-results/search-prototype-mobile.png'});
 writeFileSync('test-results/search-ui-check.json',JSON.stringify({status:'passed',browser:'Chromium mobile viewport, not iPad',width:390,modelUsed:false,light,fallback,none,escaped,offline,errors},null,2));console.log('search-ui-check passed');
}finally{await browser.close();}
