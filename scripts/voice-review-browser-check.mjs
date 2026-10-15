// Deterministic SDK double checks UI/state only. Not an ASR accuracy/runtime result.
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch(),out={platform:'Linux Chromium',sdk:'test double; UI only',checks:{}};
try{
 const context=await browser.newContext({acceptDownloads:true});
 await context.route('**/moonshine/index.js',route=>route.fulfill({contentType:'text/javascript',body:`
 export const ModelArch={Tiny:0,Base:1};
 export class MicTranscriber {
 language(){return this} modelArch(a){window.testVoiceArch=a;return this} onProgress(){return this} onText(cb){this.text=cb;return this} onLine(cb){this.line=cb;return this} onError(){return this}
 async load(){window.testMic=this} async start(){} async stop(){} async close(){if(window.testCloseFailure)throw Error('test close failure');window.testClosed=true}
 }`}));
 const page=await context.newPage();await page.goto('http://localhost:4173/bosai-ai/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.goto('http://localhost:4173/bosai-ai/?voice_iso=1');
 await page.locator('#chatToggle').click();
 await page.locator('#voiceLoad').click();await page.locator('#voiceListen').click();
 await page.evaluate(()=>{window.testMic.text('自信が発生した。');window.testMic.line({id:'1',text:'自信が発生した。津波は来ない。震度5。'});});
 out.checks.committed=await page.locator('#voiceCommitted').textContent().then(t=>t.startsWith('確定：'));
 out.checks.noAutoRewrite=await page.locator('#chatQuestion').inputValue().then(t=>t.startsWith('自信'));
 await page.locator('#voiceStop').click();out.checks.closed=await page.evaluate(()=>window.testClosed);
 await page.locator('#voiceCorrections button').click();
 out.checks.confirmedOnly=await page.locator('#chatQuestion').inputValue().then(t=>t==='地震が発生した。津波は来ない。震度5。');
 const evaluation=page.locator('.voice-lab details').filter({hasText:'音声評価（28文・手動記録）'});await evaluation.locator('summary').click();await evaluation.getByRole('button',{name:'直前の試行を記録',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');await evaluation.getByRole('button',{name:'評価JSONを書き出す',exact:true}).click();const download=await downloadPromise;await download.saveAs('test-results/voice-review-capture.json');
 const capture=JSON.parse(await (await import('node:fs/promises')).readFile('test-results/voice-review-capture.json','utf8'));
 out.checks.rawCapture=capture.model==='tiny'&&capture.results.length===1&&capture.results[0].transcript.startsWith('自信');
 // This deliberately generated capture must never be reported as measured ASR data.
 writeFileSync('test-results/voice-review-capture.json',JSON.stringify({...capture,synthetic:true,warning:'SDK double, NOT measured ASR'},null,2));
 await page.locator('#voiceLoad').click();await page.locator('#voiceListen').click();await page.evaluate(()=>window.testMic.line({id:'2',text:'自信が発生した。'}));await page.locator('#chatQuestion').fill('私の手入力は変えない');await page.evaluate(()=>window.testMic.line({id:'3',text:'自信が発生した。'}));await page.locator('#voiceStop').click();
 out.checks.editsPreserved=await page.locator('#chatQuestion').inputValue().then(t=>t==='私の手入力は変えない')&&await page.locator('#voiceCorrections button').count()===0;
 await page.goto('http://localhost:4173/bosai-ai/?voice_iso=1&voice_eval=base');await page.locator('#voiceLoad').click();out.checks.baseExplicit=await page.evaluate(()=>window.testVoiceArch===1)&&await page.locator('.voice-lab-tag').textContent().then(t=>t.includes('未検証'));
 await page.evaluate(()=>window.testCloseFailure=true);await page.locator('#voiceUnload').click();out.checks.releaseFailureVisible=await page.locator('#voiceStatus').textContent().then(t=>t.includes('停止・解放を確認できません'))&&await page.locator('#voiceListen').isDisabled();
 await page.evaluate(()=>window.testCloseFailure=false);await page.locator('#voiceUnload').click();await page.locator('#appNavigation [data-view="settings"]').click();out.checks.settingsAfterRelease=await page.locator('#appSettings').isVisible();
 out.status=Object.values(out.checks).every(Boolean)?'passed':'failed';if(out.status==='failed')process.exitCode=1;
}catch(e){out.status='failed';out.error=e.message;process.exitCode=1;}finally{writeFileSync('test-results/voice-review-ui.json',JSON.stringify(out,null,2));console.log(out);await browser.close();}
