import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
// Opt-in integration run: downloads the real model into the temporary browser cache.
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
page.on('console', msg => { if (msg.type() === 'error') console.log('browser:', msg.text()); });
page.on('pageerror', error => console.log('pageerror:', error.message));
try {
  await page.goto('http://localhost:4173/bosai-ai/');
  await page.getByRole('button', { name: 'ダウンロードして保存', exact: true }).click();
  await page.waitForFunction(() => /ダウンロード・保存完了|エラー:/.test(document.querySelector('#status').textContent), null, { timeout: 600000 });
  await page.reload();
  await page.getByRole('button', { name: 'モデルを読み込む', exact: true }).click();
  await page.waitForFunction(() => /生成可能|エラー:/.test(document.querySelector('#status').textContent), null, { timeout: 600000 });
  console.log('load:', await page.locator('#status').textContent());
  if (await page.locator('#status').textContent() === '生成可能') {
    await page.getByRole('button', { name: '生成する', exact: true }).click();
    await page.waitForFunction(() => /生成終了|エラー:/.test(document.querySelector('#status').textContent), null, { timeout: 180000 });
    console.log('output:', await page.locator('#output').textContent());
    console.log('speed:', await page.locator('#speed').textContent());
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await page.getByLabel('保存済みモデルのみ使用', { exact: false }).check();
    await page.getByRole('button', { name: 'モデルを読み込む', exact: true }).click();
    await page.waitForFunction(() => /生成可能|エラー:/.test(document.querySelector('#status').textContent), null, { timeout: 180000 });
    console.log('offline load:', await page.locator('#status').textContent());
    if (await page.locator('#status').textContent() === '生成可能') {
      await page.getByRole('button', { name: '生成する', exact: true }).click();
      await page.waitForFunction(() => /生成終了|エラー:/.test(document.querySelector('#status').textContent), null, { timeout: 180000 });
      console.log('offline output:', await page.locator('#output').textContent());
    }
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/inference-log.txt', await page.locator('#logs').textContent());
  await page.screenshot({ path: 'test-results/inference.png', fullPage: true });
} finally { await browser.close(); }

