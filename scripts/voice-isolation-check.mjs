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
