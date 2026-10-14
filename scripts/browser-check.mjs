import { MODELS } from '../src/config.js';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
const candidateModels = [
  { key: 'lfm2', label: 'LFM2.5-350M', id: 'onnx-community/LFM2.5-350M-ONNX' },
  { key: 'gemma3', label: 'Gemma 3-270M-it', id: 'onnx-community/gemma-3-270m-it-ONNX' },
];
try {
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') console.log('console:', msg.text()); });
page.on('requestfailed', req => console.log('failed:', req.url(), req.failure()));
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://localhost:4173/bosai-ai/');
await page.waitForFunction(() => document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => document.querySelector('#environment').textContent !== '環境を確認中…');
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
const environment = await page.locator('#environment').textContent();
if (await page.locator('#model').inputValue() !== 'lfm2-cpu') throw new Error('Fresh installs should prefer CPU LFM');
await page.getByLabel('比較モデル', { exact: true }).selectOption('qwen3');
// Fixtures validate saving and resuming only; never treat these bytes as a real model.
let downloads = 0;
await page.route('https://huggingface.co/**', async route => {
  downloads++;
  const url = route.request().url();
  const weight = url.endsWith('.gguf') || url.endsWith('.onnx_data') || (url.includes('/Qwen3-0.6B-ONNX/') && url.endsWith('.onnx'));
  const body = weight ? Buffer.alloc(12 * 1024 * 1024 + 123, 7) : Buffer.from('fixture');
  await route.fulfill({ body, headers: { 'access-control-allow-origin': '*', 'content-length': String(body.length) } });
});
await page.getByLabel('4bit形式', { exact: true }).selectOption('q4');
await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
if (downloads !== 5) throw new Error(`Expected 5 fixture downloads; got ${downloads}`);
await page.reload();
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('保存済みモデル（q4）'));
if (await page.getByLabel('4bit形式', { exact: true }).inputValue() !== 'q4') throw new Error('Selected format was lost after reload');
await page.getByText('選択中のq4: 5/5ファイル保存済み', { exact: false }).waitFor();
await page.getByText('モデル本体: IndexedDB・4分割', { exact: false }).waitFor();
const stored = await page.evaluate(async () => {
  const result = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  const db = await result(indexedDB.open('bosai-ai-model-chunks-v1', 1));
  const files = await result(db.transaction('files').objectStore('files').getAll());
  const weight = files.find(file => file.url.endsWith('.onnx'));
  const sizes = [];
  for (let i = 0; i < weight.chunks; i++) {
    const key = weight.generation ? [weight.url, weight.generation, i] : [weight.url, i];
    const chunk = await result(db.transaction('chunks').objectStore('chunks').get(key));
    if (chunk.some(byte => byte !== 7)) throw new Error('Corrupted chunk');
    sizes.push(chunk.byteLength);
  }
  db.close(); return { bytes: weight.bytes, sizes };
});
if (JSON.stringify(stored.sizes) !== JSON.stringify([4194304, 4194304, 4194304, 123])) throw new Error(`Bad chunk sizes: ${JSON.stringify(stored)}`);
// Simulate an old install that saved q4 before preference persistence existed.
await page.evaluate(() => {
  localStorage.removeItem('bosai-ai-selected-dtype');
  localStorage.removeItem('bosai-ai-selected-dtype:qwen3');
});
await page.reload();
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('保存済みモデル（q4）'));
await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
if (downloads !== 5) throw new Error('Saved files were downloaded again');
// Offline metadata and download reuse must work with the saved fixtures intact.
await context.setOffline(true);
await page.reload();
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('保存済みモデル（q4）'));
await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
if (downloads !== 5) throw new Error('Offline reuse tried to download fixtures');
await context.setOffline(false);
// Save the actual two candidate file layouts, with dummy external weights.
let expectedDownloads = 5;
for (const model of candidateModels) {
  await page.getByLabel('比較モデル', { exact: true }).selectOption(model.key);
  await page.getByLabel('4bit形式', { exact: true }).selectOption('q4f16');
  await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
  expectedDownloads += 6;
  if (downloads !== expectedDownloads) throw new Error(`${model.key}: wrong download count`);
  await page.reload();
  await page.waitForFunction(label => document.querySelector('#storage').textContent.includes(label) && document.querySelector('#storage').textContent.includes('6/6ファイル保存済み'), model.label);
  if (await page.locator('#model').inputValue() !== model.key) throw new Error('Selected model was lost');
  const external = await page.evaluate(async id => {
    const result = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const db = await result(indexedDB.open('bosai-ai-model-chunks-v1', 1));
    const files = await result(db.transaction('files').objectStore('files').getAll());
    const weight = files.find(file => file.url.includes(`/${id}/`) && file.url.endsWith('.onnx_data'));
    const sizes = [];
    for (let i = 0; i < weight.chunks; i++) {
      const chunk = await result(db.transaction('chunks').objectStore('chunks').get([weight.url, weight.generation, i]));
      if (chunk.some(byte => byte !== 7)) throw new Error('Corrupted external weight chunk');
      sizes.push(chunk.byteLength);
    }
    db.close(); return sizes;
  }, model.id);
  if (JSON.stringify(external) !== JSON.stringify([4194304, 4194304, 4194304, 123])) throw new Error('Wrong external weight layout');
  const [diagnostic] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '検証結果をJSON保存', exact: true }).click()]);
  const exported = JSON.parse(readFileSync(await diagnostic.path(), 'utf8'));
  if (exported.model !== model.id || exported.modelKey !== model.key || exported.modelCatalog.length !== MODELS.length) throw new Error('Wrong model in diagnostic JSON');
  if (!exported.logs.some(log => log.data?.model === model.id && log.data?.modelKey === model.key)) throw new Error('Logs lost model attribution');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('保存済みモデル（q4f16）'));
  await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
  if (downloads !== expectedDownloads) throw new Error('Candidate offline reuse downloaded again');
  await context.setOffline(false);
}
// New CPU saves use separate fixed URLs; deleting one must retain ONNX saves.
const cpuCandidates = MODELS.filter(model => model.engine === 'wllama-cpu' && model.key !== 'lfm2-cpu');
for (const model of cpuCandidates) {
  await page.locator('#model').selectOption(model.key);
  if (await page.locator('#dtype').inputValue() !== 'q4_k_m') throw new Error('CPU dtype mismatch');
  await page.locator('#download').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
  const count = downloads;
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#storage').textContent.includes('1/1ファイル保存済み'));
  if (await page.locator('#model').inputValue() !== model.key) throw new Error('CPU selection not restored');
  await context.setOffline(true);
  await page.locator('#download').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
  if (downloads !== count) throw new Error('CPU dummy fixture was downloaded again');
  await context.setOffline(false);
  await page.locator('#clear').click();
  await page.waitForFunction(() => document.querySelector('#storage').textContent.includes('0/1ファイル保存済み'));
}
// Switching back must retain Qwen's old format and all its saved files.
await page.getByLabel('比較モデル', { exact: true }).selectOption('qwen3');
await page.waitForFunction(() => document.querySelector('#storage').textContent.includes('Qwen3-0.6B') && document.querySelector('#storage').textContent.includes('5/5ファイル保存済み'));
if (await page.locator('#dtype').inputValue() !== 'q4') throw new Error('Qwen dtype was overwritten by a candidate');
// Record interrupted initialization and verify recovery after a reload.
await page.evaluate(() => localStorage.setItem('bosai-ai-active-stage', JSON.stringify({ stage: 'モデル初期化（WebGPU）', dtype: 'q4f16' })));
await page.reload();
await page.getByText('前回は「モデル初期化（WebGPU）」', { exact: false }).waitFor();
await page.getByRole('button', { name: '選択モデルの保存を削除', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#storage').textContent.includes('12ファイル') && document.querySelector('#storage').textContent.includes('0/5ファイル保存済み'));
await context.setOffline(true);
await page.reload();
await page.getByRole('heading', { name: '端末内AIを、確かめる。' }).waitFor();
await page.getByLabel('保存済みモデルのみ使用', { exact: false }).check();
await page.getByRole('button', { name: 'モデルを読み込む', exact: true }).click();
console.log('after click:', await page.locator('#status').textContent());
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('エラー:'), { timeout: 30000 });
const offlineMissingModel = await page.locator('#status').textContent();
if (!(await page.getByRole('button', { name: 'モデルを読み込む', exact: true }).isEnabled())) throw new Error('Retry button disabled');
await context.setOffline(false);
await page.reload();
await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
if (overflow) throw new Error('Horizontal overflow');
await page.setViewportSize({ width: 1180, height: 820 });
mkdirSync('test-results', { recursive: true });
await page.screenshot({ path: 'test-results/phase1.png', fullPage: true });
// A failed dependency import must surface details and allow retry, without a
// model or real GPU. Block SW here so injected failures reach the module loader.
const failureContext = await browser.newContext({ serviceWorkers: 'block' });
let breakModule = true;
await failureContext.route('**/assets/download.worker-*.js', route => breakModule
  ? route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
  : route.continue());
await failureContext.route('https://huggingface.co/**', route => route.fulfill({ body: 'fixture', headers: { 'access-control-allow-origin': '*' } }));
const failurePage = await failureContext.newPage();
failurePage.on('pageerror', error => errors.push(error.message));
await failurePage.goto('http://localhost:4173/bosai-ai/');
await failurePage.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await failurePage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('エラー:'));
const workerImportFailure = await failurePage.locator('#logs').textContent();
if (!workerImportFailure.includes('Workerモジュールの読み込み')) throw new Error('Missing worker import stage');
if (!(await failurePage.locator('#download').isEnabled())) throw new Error('Worker error left download disabled');
breakModule = false;
await failurePage.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await failurePage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
await failureContext.close();
// Install a second SW while a page is open: it must wait rather than deleting
// the old hashed Worker assets. Activation must also preserve both model stores.
const updateContext = await browser.newContext();
await updateContext.route('https://huggingface.co/**', route => route.fulfill({ body: 'fixture', headers: { 'access-control-allow-origin': '*' } }));
const oldPage = await updateContext.newPage();
oldPage.on('pageerror', error => errors.push(error.message));
await oldPage.goto('http://localhost:4173/bosai-ai/');
await oldPage.waitForFunction(() => document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
await oldPage.reload();
await oldPage.waitForFunction(() => navigator.serviceWorker.controller !== null);
// Existing explicit ONNX selection must survive an update with a new CPU default.
await oldPage.locator('#model').selectOption('lfm2');
await oldPage.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await oldPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
await oldPage.evaluate(async () => {
  const cache = await caches.open('bosai-ai-model-v1');
  await cache.put('https://example.org/legacy-sentinel', new Response('keep-legacy'));
});
const updateScript = 'dist/sw-update-test.js';
writeFileSync(updateScript, readFileSync('dist/sw.js', 'utf8').replace(/const SHELL = '[^']+';/, "const SHELL = 'bosai-ai-shell-test-update';"));
try {
  await oldPage.evaluate(() => navigator.serviceWorker.register('/bosai-ai/sw-update-test.js', { scope: '/bosai-ai/' }));
  await oldPage.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
  const oldController = await oldPage.evaluate(() => navigator.serviceWorker.controller.scriptURL);
  if (!oldController.endsWith('/sw.js')) throw new Error('App update took over an active page');
  await updateContext.setOffline(true);
  await oldPage.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
  await oldPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
  await updateContext.setOffline(false);
  await oldPage.close();
  const newPage = await updateContext.newPage();
  // Poll from an uncontrolled page; a SW global's registration object can be
  // stale during its own activation. Keep new clients outside the scope first.
  await newPage.goto('http://localhost:4173/outside-bosai-scope');
  await newPage.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/bosai-ai/');
    return registration?.active?.scriptURL.endsWith('/sw-update-test.js') && registration.active.state === 'activated';
  });
  const shellCaches = await newPage.evaluate(() => caches.keys());
  if (!shellCaches.includes('bosai-ai-shell-test-update')) throw new Error('Update did not install the new shell cache');
  await newPage.goto('http://localhost:4173/bosai-ai/');
  await newPage.waitForFunction(() => document.querySelector('#status').textContent.includes('保存済みモデル（q4f16）'));
  if (await newPage.locator('#model').inputValue() !== 'lfm2') throw new Error('New CPU default overwrote an existing ONNX selection');
  const legacy = await newPage.evaluate(async () => (await (await caches.open('bosai-ai-model-v1')).match('https://example.org/legacy-sentinel')).text());
  if (legacy !== 'keep-legacy') throw new Error('App update deleted legacy models');
} finally { unlinkSync(updateScript); await updateContext.close(); }
const result = { browser: `${process.platform} Playwright Chromium (not iPad Safari)`, environment, candidateModelFixtures: candidateModels.map(model => model.key), cpuCandidateFixtures: cpuCandidates.map(model => model.key), externalWeightChunksVerified: true, selectedModelAndDtypeRestored: true, modelAttributedDiagnostics: true, selectedDeletionPreservesOtherModels: true, indexedDBChunkStorage: true, fixtureDownloadAndReuse: true, savedModelSurvivesReload: true, offlineFixtureReuse: true, savedDtypeRestored: true, savedFormatWithoutPreferenceRestored: true, interruptedStageRecovery: true, workerImportFailureAndRetry: true, safeAppUpdatePreservesWorkersAndModels: true, offlineShell: true, offlineMissingModel, horizontalOverflow: overflow, errors };
writeFileSync('test-results/browser-check.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
} catch (error) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/browser-check.json', JSON.stringify({ status: 'failed', error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); }
