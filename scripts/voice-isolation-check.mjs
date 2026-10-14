import { chromium } from '@playwright/test';

const base = process.env.BOSAI_PREVIEW_URL || 'http://127.0.0.1:4173/bosai-ai/';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw Error('Service Worker is unavailable');
    await navigator.serviceWorker.ready;
  });
  // A new navigation controlled by the Service Worker is essential; the
  // original Github Pages response does not carry isolation headers.
  await page.close();
  const isolated = await context.newPage();
  isolated.on('pageerror', error => errors.push(error.message));
  await isolated.goto(base + '?voice_iso=1', { waitUntil: 'load' });
  const result = await isolated.evaluate(() => ({
    isolated: crossOriginIsolated,
    workerController: !!navigator.serviceWorker.controller,
    swHeader: document.querySelector('#voiceEnableIso') !== null,
    microphoneWarning: document.querySelector('#voiceStatus')?.textContent,
  }));
  if (!result.workerController || !result.isolated || !result.swHeader) {
    throw Error('Voice isolation missing: ' + JSON.stringify(result));
  }
  // The published threaded SDK currently hangs at native WASM initialization
  // in Linux Chromium (confirmed 60s timeout). Do not make the unrelated Ruri
  // regression suite wait for the speech engine. Keep an explicit opt-in probe.
  const nativeProbe = process.env.BOSAI_MOONSHINE_NATIVE_PROBE === '1';
  const sdk = await isolated.evaluate(async ({nativeProbe}) => {
    const lib=await import(new URL('moonshine/index.js',location.origin+'/bosai-ai/').href);
    const result={mic:typeof lib.MicTranscriber,arch:typeof lib.ModelArch};
    if(!nativeProbe)return result;
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('Native Moonshine WASM did not finish within 60s')),60000));
    const native=await Promise.race([(async()=>{
      const core=await lib.loadMoonshineModule();
      const manifest=JSON.parse(core.sttDependencies('ja',String(lib.ModelArch.TinyStreaming),false));
      return {wasmVersion:core.version(),assets:manifest.groups?.reduce((n,g)=>n+(g.files?.length||0),0)};
    })(),timeout]);
    return {...result,...native};
  },{nativeProbe});
  if(sdk.mic!=='function'||sdk.arch!=='object'||(nativeProbe&&!(sdk.assets>0))){
    throw Error('Moonshine SDK/WASM smoke check failed: '+JSON.stringify(sdk));
  }
  await isolated.close();
  const regular = await context.newPage();
  regular.on('pageerror', error => errors.push(error.message));
  await regular.goto(base, { waitUntil: 'load' });
  const regularIso = await regular.evaluate(() => crossOriginIsolated);
  if (regularIso) throw Error('Regular Ruri page must remain non-isolated');
  const sdkHead = await regular.request.get(new URL('moonshine/index.js', base).href);
  const wasmHead = await regular.request.get(new URL('moonshine/moonshine.wasm', base).href, { timeout: 60000 });
  if (!sdkHead.ok() || !wasmHead.ok()) throw Error('Moonshine same-origin assets missing: ' + sdkHead.status() + '/' + wasmHead.status());
  if (errors.length) throw Error('Page errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ status: 'passed', base, voiceMode: result, regularIsolated: regularIso }));
  await context.close();
} finally {
  await browser.close();
}
