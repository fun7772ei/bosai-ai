import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_MODEL, getModel, modelFiles } from '../src/config.js';
const modelKey = process.argv[2] || DEFAULT_MODEL;
const dtype = process.argv[3] || 'q4f16';
const selectedModel = getModel(modelKey);
modelFiles(dtype, modelKey); // Validate arguments before launching or downloading.
// Opt-in real-model run. Unsupported GPU is a distinct non-success (exit 2).
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
const result = { modelKey, model: selectedModel.id, revision: selectedModel.revision, dtype, browser: `${process.platform} Playwright Chromium (not iPad Safari)`, status: 'failed', stages: [], errors: [] };
page.on('pageerror', error => result.errors.push(error.message));
async function step(name, button, expected, timeout = 180000) {
  await page.getByRole('button', { name: button, exact: true }).click();
  await page.waitForFunction(() => /ダウンロード・保存完了|生成可能|生成終了|エラー:/.test(document.querySelector('#status').textContent), null, { timeout });
  const status = await page.locator('#status').textContent();
  result.stages.push({ name, status });
  if (!status.startsWith(expected)) throw new Error(`${name}: ${status}`);
}
async function generate(name) {
  await step(name, '生成する', '生成終了');
  const output = await page.locator('#output').textContent();
  const count = await page.locator('#count').textContent();
  if (!output.trim() || !/^[1-9]\d*\s*\//.test(count)) throw new Error(`${name}: no generated tokens/output`);
  result.stages.push({ name: `${name} output`, output, count, speed: await page.locator('#speed').textContent() });
}
try {
  await page.goto('http://localhost:4173/bosai-ai/');
  await page.getByLabel('比較モデル', { exact: true }).selectOption(modelKey);
  await page.getByLabel('4bit形式', { exact: true }).selectOption(dtype);
  result.gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return { webgpu: !!adapter, shaderF16: !!adapter?.features.has('shader-f16') };
  });
  if (!result.gpu.webgpu || (dtype === 'q4f16' && !result.gpu.shaderF16)) {
    result.status = 'not-run';
    result.reason = `${selectedModel.label} / ${dtype}に必要なGPU機能がありません。実モデルは取得せず、推論は未検証です。`;
    process.exitCode = 2;
  } else {
    await page.waitForFunction(() => document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
    await step('download', 'ダウンロードして保存', 'ダウンロード・保存完了', 600000);
    await page.reload();
    await step('online load', 'モデルを読み込む', '生成可能', 600000);
    if (await page.locator('#model').isEnabled()) throw new Error('Model selection must be locked while loaded');
    await generate('online generate');
    await context.setOffline(true);
    await page.reload();
    await page.getByLabel('保存済みモデルのみ使用', { exact: false }).check();
    await step('offline load', 'モデルを読み込む', '生成可能');
    await generate('offline generate');
    if (result.errors.length) throw new Error('Unhandled browser errors');
    result.status = 'passed';
  }
} catch (error) {
  result.errors.push(error.message);
  process.exitCode = 1;
} finally {
  mkdirSync('test-results', { recursive: true });
  const artifact = `test-results/inference-${modelKey}-${dtype}`;
  writeFileSync(`${artifact}.json`, JSON.stringify(result, null, 2));
  writeFileSync(`${artifact}-log.txt`, await page.locator('#logs').textContent().catch(() => ''));
  await page.screenshot({ path: `${artifact}.png`, fullPage: true }).catch(() => {});
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
