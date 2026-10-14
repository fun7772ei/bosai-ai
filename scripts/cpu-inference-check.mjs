import { browserMemory } from './browser-memory.mjs';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, createReadStream, statSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { getModel, modelFileUrl } from '../src/config.js';

// Opt-in: real GGUF remains outside Git and is served only by the local preview.
// A loopback-only fixture server streams the pinned file with CORS headers.
// Avoid Playwright buffering a 229 MB body across its browser protocol.
// It is never added to dist/shell.json or shipped in the Pages artifact.
const smoke = process.argv.includes('--smoke');
const modelKey = process.argv.find(arg => arg.startsWith('--model='))?.split('=')[1] || 'lfm2-cpu';
const model = getModel(modelKey);
const file = process.argv.slice(2).find(arg => !arg.startsWith('--')) || (modelKey === 'lfm2-cpu' ? 'test-results/lfm2-q4-k-m.gguf' : `test-results/${modelKey}.gguf`);
if (statSync(file).size !== model.weightBytes.q4_k_m) throw new Error('Wrong GGUF size');
const hash = createHash('sha256');
for await (const bytes of createReadStream(file)) hash.update(bytes);
if (hash.digest('hex') !== model.sha256) throw new Error('Wrong pinned GGUF hash');
const server = createServer((request, response) => {
  response.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-private-network': 'true', 'content-type': 'application/octet-stream', 'content-length': String(model.weightBytes.q4_k_m) });
  createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/model.gguf`;
mkdirSync('test-results', { recursive: true });
const profile = mkdtempSync('test-results/cpu-app-profile-');
const context = await chromium.launchPersistentContext(profile);
const browser = context.browser();
const cdp = await browser.newBrowserCDPSession();
const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
const browserPid = processInfo.find(process => process.type === 'browser').id;
await cdp.detach();
const result = { browser: `${process.platform} Chromium (not iPad Safari)`, model: model.id, revision: model.revision, dtype: 'q4_k_m', gpuDisabled: true, profileMode: 'persistent on workspace disk, no quota override', smoke, status: 'failed', samples: [], errors: [] };
let phase = 'page';
result.memory = { method: '500ms PPid browser-tree PSS, full browser and renderer role; not Safari', baseline: browserMemory(browserPid), peaks: {}, rendererPeaks: {}, incompleteSamples: 0 };
const sampleMemory = () => {
  const memory = browserMemory(browserPid);
  if (!memory.complete) { result.memory.incompleteSamples++; return; }
  if (!result.memory.peaks[phase] || memory.pssMiB > result.memory.peaks[phase].pssMiB) result.memory.peaks[phase] = memory;
  if (!result.memory.rendererPeaks[phase] || memory.rendererPssMiB > result.memory.rendererPeaks[phase].rendererPssMiB) result.memory.rendererPeaks[phase] = memory;
};
const memoryTimer = setInterval(sampleMemory, 500);
await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined }));
let modelRequests = 0;
await context.route('https://huggingface.co/**', async route => {
  if (route.request().url() === modelFileUrl(model.file, model.key)) {
    modelRequests++;
    await route.fulfill({ status: 302, headers: { location: fixtureUrl, 'access-control-allow-origin': '*' } });
  } else { result.errors.push(`Unexpected external request: ${route.request().url()}`); await route.abort(); }
});
const page = context.pages()[0] || await context.newPage();
page.on('pageerror', error => result.errors.push(error.message));
async function finish(expected, timeout = 180000) {
  await page.waitForFunction(() => /ダウンロード・保存完了|生成可能|生成終了|エラー:/.test(document.querySelector('#status').textContent), null, { timeout });
  const status = await page.locator('#status').textContent();
  if (!status.startsWith(expected)) throw new Error(status);
}
async function diagnostic() {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const path = `test-results/cpu-app-${modelKey}-diagnostic.json`;
  mkdirSync('test-results', { recursive: true }); await download.saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function load() { phase = 'load'; await page.locator('#load').click(); await finish('生成可能'); }
async function generate(prompt) {
  phase = 'generate';
  await page.locator('#prompt').fill(prompt);
  await page.locator('#generate').click(); await finish('生成終了');
  const data = await diagnostic(), run = data.runs.at(-1);
  if (run?.modelKey !== model.key || !run.text?.trim() || !run.tokensKnown || run.tokens <= 0) throw new Error('No measured CPU generation');
  if (model.noThinking && /<think>|<\/think>/.test(run.text)) throw new Error('Thinking output in Qwen app run');
  result.samples.push(run);
}
try {
  await page.goto('http://localhost:4173/bosai-ai/');
  await page.waitForFunction(() => document.querySelector('#logs').textContent.includes('アプリ本体のオフライン保存完了'));
  await page.locator('#model').selectOption(model.key);
  if (await page.locator('#tokens').inputValue() !== '32') throw new Error('CPU default must be 32 tokens');
  if (await page.locator('#dtype').inputValue() !== 'q4_k_m') throw new Error('Wrong CPU dtype');
  phase = 'download';
  await page.locator('#download').click(); await finish('ダウンロード・保存完了');
  phase = 'reopen';
  await page.reload(); await load();
  await page.locator('#tokens').selectOption('32');
  const loaded = await diagnostic();
  result.appBuild = loaded.appBuild;
  const ready = loaded.logs.find(log => log.message === 'モデル準備完了')?.data;
  if (ready?.settings?.gpuLayers !== 0 || ready.settings.threads !== 1 || ready.settings.contextTokens !== 512 || !ready.settings.compat) throw new Error('CPU settings were not confirmed');
  if (model.noThinking && (ready.loadParams?.jinja !== true || ready.loadParams?.default_template_kwargs?.enable_thinking !== false)) throw new Error('Thinking was not disabled in loaded Qwen policy');
  result.ready = ready;
  for (const prompt of smoke ? ['「集合は午後3時、公園の入口です。」から、時刻と場所だけを書いてください。'] : [
    '日本語で1から5まで数えてください。数字だけで答えてください。',
    '「今日は晴れです。」をそのまま書いてください。説明は不要です。',
    'りんご、みかん、バナナを、それぞれ別の行に書いてください。',
    '次の文章を1文で短くしてください。「集合は午前9時、図書館の入口です。」',
    '「集合場所は公園です。」この文に集合時刻がなければ「記載なし」と答えてください。',
  ]) { await generate(prompt); console.log(`sample ${result.samples.length}:`, result.samples.at(-1).text); }
  if (!smoke) {
  // A deliberately long response must identify the native length limit in the UI.
  await generate('架空のピクニックに持っていく物を、理由付きで20個挙げてください。');
  const limited = result.samples.at(-1);
  if (limited.finishReason !== 'length' || !limited.outputLimitReached || !(await page.locator('#status').textContent()).includes('出力上限')) throw new Error('Native output limit was not surfaced');
  result.outputLimitWarning = true;
  }
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
  sampleMemory(); clearInterval(memoryTimer);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/cpu-inference-${modelKey}.json`, JSON.stringify(result, null, 2));
  if (modelKey === 'lfm2-cpu') writeFileSync('test-results/cpu-inference-check.json', JSON.stringify(result, null, 2));
  writeFileSync(`test-results/cpu-inference-${modelKey}-log.txt`, await page.locator('#logs').textContent().catch(() => ''));
  await page.screenshot({ path: `test-results/cpu-inference-${modelKey}.png`, fullPage: true }).catch(() => {});
  console.log(JSON.stringify(result, null, 2));
  await context.close(); rmSync(profile, { recursive: true, force: true });
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
