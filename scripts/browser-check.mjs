import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
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
// Fixtures validate saving and resuming only; never treat these bytes as a real model.
let downloads = 0;
await page.route('https://huggingface.co/**', async route => {
  downloads++;
  const body = route.request().url().endsWith('.onnx') ? Buffer.alloc(12 * 1024 * 1024 + 123, 7) : Buffer.from('fixture');
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
    const chunk = await result(db.transaction('chunks').objectStore('chunks').get([weight.url, i]));
    if (chunk.some(byte => byte !== 7)) throw new Error('Corrupted chunk');
    sizes.push(chunk.byteLength);
  }
  db.close(); return { bytes: weight.bytes, sizes };
});
if (JSON.stringify(stored.sizes) !== JSON.stringify([4194304, 4194304, 4194304, 123])) throw new Error(`Bad chunk sizes: ${JSON.stringify(stored)}`);
// Simulate an old install that saved q4 before preference persistence existed.
await page.evaluate(() => localStorage.removeItem('bosai-ai-selected-dtype'));
await page.reload();
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('保存済みモデル（q4）'));
await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
if (downloads !== 5) throw new Error('Saved files were downloaded again');
// Reload offline while fixtures still exist; this verifies storage, not inference.
await context.setOffline(true);
await page.reload();
await page.getByText('選択中のq4: 5/5ファイル保存済み', { exact: false }).waitFor();
await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('ダウンロード・保存完了'));
if (downloads !== 5) throw new Error('Offline fixture reuse attempted a download');
await context.setOffline(false);
// Record interrupted initialization and verify recovery after a reload.
await page.evaluate(() => localStorage.setItem('bosai-ai-active-stage', JSON.stringify({ stage: 'モデル初期化（WebGPU）', dtype: 'q4f16' })));
await page.reload();
await page.getByText('前回は「モデル初期化（WebGPU）」', { exact: false }).waitFor();
await page.getByRole('button', { name: 'モデル保存を削除', exact: true }).click();
await page.waitForFunction(() => document.querySelector('#storage').textContent.includes('0ファイル'));
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
const result = { browser: `${process.platform} Playwright Chromium (not iPad Safari)`, environment, indexedDBChunkStorage: true, fixtureDownloadAndReuse: true, savedModelSurvivesReload: true, offlineFixtureReuse: true, savedDtypeRestored: true, legacyCacheDtypeRestored: true, interruptedStageRecovery: true, offlineShell: true, offlineMissingModel, horizontalOverflow: overflow, errors };
writeFileSync('test-results/browser-check.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
