import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { getModel, modelFileUrl } from '../src/config.js';

// Opt-in: real GGUF remains outside Git and is served only by the local preview.
// A loopback-only fixture server streams the pinned file with CORS headers.
// Avoid Playwright buffering a 229 MB body across its browser protocol.
// It is never added to dist/shell.json or shipped in the Pages artifact.
const model = getModel('lfm2-cpu');
const file = process.argv[2] || 'test-results/lfm2-q4-k-m.gguf';
if (statSync(file).size !== model.weightBytes.q4_k_m) throw new Error('Wrong GGUF size');
const hash = createHash('sha256');
for await (const bytes of createReadStream(file)) hash.update(bytes);
if (hash.digest('hex') !== '7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4') throw new Error('Wrong pinned GGUF hash');
const server = createServer((request, response) => {
  response.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-private-network': 'true', 'content-type': 'application/octet-stream', 'content-length': String(model.weightBytes.q4_k_m) });
  createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/model.gguf`;
const browser = await chromium.launch();
const result = { browser: `${process.platform} Chromium (not iPad Safari)`, model: model.id, revision: model.revision, dtype: 'q4_k_m', gpuDisabled: true, status: 'failed', samples: [], errors: [] };
const context = await browser.newContext();
await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined }));
let modelRequests = 0;
await context.route('https://huggingface.co/**', async route => {
  if (route.request().url() === modelFileUrl(model.file, model.key)) {
    modelRequests++;
    await route.fulfill({ status: 302, headers: { location: fixtureUrl, 'access-control-allow-origin': '*' } });
  } else { result.errors.push(`Unexpected external request: ${route.request().url()}`); await route.abort(); }
});
const page = await context.newPage();
page.on('pageerror', error => result.errors.push(error.message));
async function finish(expected, timeout = 180000) {
  await page.waitForFunction(() => /ダウンロード・保存完了|生成可能|生成終了|エラー:/.test(document.querySelector('#status').textContent), null, { timeout });
  const status = await page.locator('#status').textContent();
  if (!status.startsWith(expected)) throw new Error(status);
}
async function diagnostic() {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  return JSON.parse(readFileSync(await download.path(), 'utf8'));
}
async function load() { await page.locator('#load').click(); await finish('生成可能'); }
async function generate(prompt) {
  await page.locator('#prompt').fill(prompt);
  await page.locator('#generate').click(); await finish('生成終了');
  const data = await diagnostic(), run = data.runs.at(-1);
  if (run?.modelKey !== model.key || !run.text?.trim() || !run.tokensKnown || run.tokens <= 0) throw new Error('No measured CPU generation');
  result.samples.push(run);
}
try {
  await page.goto('http://localhost:4173/bosai-ai/');
  await page.waitForFunction(() => document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
  await page.locator('#model').selectOption(model.key);
  if (await page.locator('#tokens').inputValue() !== '32') throw new Error('CPU default must be 32 tokens');
  if (await page.locator('#dtype').inputValue() !== 'q4_k_m') throw new Error('Wrong CPU dtype');
  await page.locator('#download').click(); await finish('ダウンロード・保存完了');
  await page.reload(); await load();
  await page.locator('#tokens').selectOption('32');
  const loaded = await diagnostic();
  result.appBuild = loaded.appBuild;
  const ready = loaded.logs.find(log => log.message === 'モデル準備完了')?.data;
  if (ready?.settings?.gpuLayers !== 0 || ready.settings.threads !== 1 || ready.settings.contextTokens !== 512 || !ready.settings.compat) throw new Error('CPU settings were not confirmed');
  result.ready = ready;
  for (const prompt of [
    '日本語で1から5まで数えてください。数字だけで答えてください。',
    '「今日は晴れです。」をそのまま書いてください。説明は不要です。',
    'りんご、みかん、バナナを、それぞれ別の行に書いてください。',
    '次の文章を1文で短くしてください。「集合は午前9時、図書館の入口です。」',
    '「集合場所は公園です。」この文に集合時刻がなければ「記載なし」と答えてください。',
  ]) { await generate(prompt); console.log(`sample ${result.samples.length}:`, result.samples.at(-1).text); }
  // Stop mid-stream, then request again in the same native context.
  await page.locator('#tokens').selectOption('64');
  await page.locator('#prompt').fill('架空のピクニックの準備を20項目のチェックリストにしてください。');
  await page.locator('#generate').click();
  await page.waitForFunction(() => document.querySelector('#output').textContent.length > 0 && !document.querySelector('#stop').disabled);
  await page.locator('#stop').click(); await finish('生成終了');
  result.stopped = (await diagnostic()).runs.at(-1).stopped;
  if (!result.stopped) throw new Error('Stop was not observed');
  await page.locator('#tokens').selectOption('32'); await generate('日本語で1から3まで数えてください。');
  await page.locator('#reset').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('リセット済み'));
  await load(); await page.locator('#tokens').selectOption('32'); await generate('「再読み込み成功」とだけ書いてください。');
  // Browser network-off emulation, not iPad airplane mode.
  await context.setOffline(true); await page.reload();
  await page.locator('#cachedOnly').check(); await load();
  await page.locator('#tokens').selectOption('32'); await generate('日本語で1から3まで数えてください。');
  result.modelRequests = modelRequests;
  if (modelRequests !== 1 || result.errors.length) throw new Error(`Unexpected network requests (${modelRequests}) or browser errors`);
  result.offlineReloadAndGeneration = true;
  result.status = 'passed';
} catch (error) {
  result.errors.push(error.message); process.exitCode = 1;
} finally {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/cpu-inference-check.json', JSON.stringify(result, null, 2));
  writeFileSync('test-results/cpu-inference-log.txt', await page.locator('#logs').textContent().catch(() => ''));
  await page.screenshot({ path: 'test-results/cpu-inference.png', fullPage: true }).catch(() => {});
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
