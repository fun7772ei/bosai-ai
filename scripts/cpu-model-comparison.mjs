import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createReadStream, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { comparisonModels } from './cpu-comparison-models.mjs';
import { cases, holdouts, score } from './cpu-quality-cases.mjs';
import { disasterCases } from './cpu-disaster-cases.mjs';
import { browserMemory } from './browser-memory.mjs';
const probeOnly = process.argv.includes('--probe');
const timingOnly = process.argv.includes('--timing-only');
const profileFilter = process.argv.find(arg => arg.startsWith('--profile='))?.split('=')[1];
const selected = process.argv.find(arg => arg.startsWith('--model='))?.split('=')[1];
if (selected && !comparisonModels.some(model => model.key === selected)) throw Error('Unknown comparison model: ' + selected);
let activeModel;
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 4181, strictPort: true, hmr: false, watch: null }, plugins: [{ name: 'comparison-fixture', configureServer(server) {
  server.middlewares.use('/comparison-test', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>CPU model comparison</title>'); });
  server.middlewares.use('/comparison-model.gguf', (req, res) => { res.setHeader('Content-Length', String(activeModel.bytes)); createReadStream(activeModel.localFile).pipe(res); });
} }] });
await server.listen();
const output = { createdAt: new Date().toISOString(), runtime: 'wllama/compat 3.8.1, libllama b11364-46ca246', browser: 'Linux Chromium, not iPad Safari', memoryMethod: '500ms sampled sum of PSS over Chromium process descendants discovered from PPid status, including browser baseline; RSS also recorded and double-counts shared pages. Node/Vite/fixture server excluded. Not JS heap or Safari memory.', cpu: '1 native thread, context512, batch/ubatch64, GPU layers0, no prompt cache/history', models: [] };
const save = () => { mkdirSync('test-results', { recursive: true }); writeFileSync(`test-results/cpu-model-${probeOnly ? 'probe' : timingOnly ? 'timing' : ((selected || 'comparison') + (profileFilter ? '-' + profileFilter : ''))}.json`, JSON.stringify(output, null, 2)); };
try {
 for (const model of comparisonModels.filter(model => !selected || model.key === selected)) {
  activeModel = model;
  const result = { model, samples: [], loads: [], notices: [], status: 'not-run' }; output.models.push(result);
  const hash = createHash('sha256'); for await (const bytes of createReadStream(model.localFile)) hash.update(bytes);
  if (statSync(model.localFile).size !== model.bytes || hash.digest('hex') !== model.sha256) throw Error('Wrong pinned GGUF: ' + model.key);
  const browserServer = await chromium.launchServer();
  const browser = await chromium.connect(browserServer.wsEndpoint());
  const page = await browser.newPage();
  let phase = 'baseline';
  const baseline = browserMemory(browserServer.process().pid);
  result.memory = { baseline, peaks: {}, sampleCount: 0 };
  const sampleMemory = () => { const memory = browserMemory(browserServer.process().pid); result.memory.sampleCount++; if (!memory.complete) result.memory.incompleteSamples = (result.memory.incompleteSamples || 0) + 1; const prior = result.memory.peaks[phase]; if (!prior || memory.pssMiB > prior.pssMiB) result.memory.peaks[phase] = memory; };
  const timer = setInterval(sampleMemory, 500); sampleMemory();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('comparisonNotice', notice => { result.notices.push(notice); if (notice.stage) phase = notice.stage; });
  try {
    await page.goto('http://127.0.0.1:4181/comparison-test');
    await page.evaluate(() => {
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });
      let worker;
      let counter = 0; const pending = new Map();
      const startWorker = () => {
      worker = new Worker('/scripts/cpu-model-comparison.worker.js', { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (data.stage || data.nativeError) { window.comparisonNotice(data); return; }
        const item = pending.get(data.id); if (!item) return;
        clearTimeout(item.timer); pending.delete(data.id); data.error ? item.reject(Error(data.error)) : item.resolve(data);
      };
      worker.onerror = event => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(event.message)); } pending.clear(); };
      };
      startWorker();
      window.restartComparisonWorker = () => { worker.terminate(); startWorker(); };
      window.comparison = data => new Promise((resolve, reject) => { const id = ++counter; const timer = setTimeout(() => { pending.delete(id); reject(Error('comparison-timeout-180s')); }, 180000); pending.set(id, { resolve, reject, timer }); worker.postMessage({ ...data, id }); });
    });
    const load = async () => { phase = 'load'; const ready = await page.evaluate(model => window.comparison({ type: 'load', model }), model); sampleMemory(); result.loads.push(ready); console.log(model.key, 'loaded', Math.round(ready.loadMs), 'ms'); };
    await load();
    phase = 'probe';
    const probe = await page.evaluate(() => window.comparison({ type: 'generate', prompt: '日本語で1から3まで数えてください。', maxTokens: 32 }));
    if (!probe.text?.trim() || !probe.tokensKnown || !probe.tokens) throw Error('No measured nonempty probe generation');
    result.probe = probe; result.compatible = true; console.log(model.key, 'probe', JSON.stringify(probe.text));
    if (!probeOnly) {
      const groups = [ { name: 'common32', maxTokens: 32, sampling: {} }, { name: 'common64', maxTokens: 64, sampling: {} }, { name: 'recommended32', maxTokens: 32, sampling: model.recommended } ];
      if (profileFilter) {
        if (profileFilter !== 'presence-off' || model.key !== 'qwen35-cpu') throw Error('Unknown model/profile combination');
        groups.splice(0, groups.length, { name: 'recommended-presence-off32', maxTokens: 32, sampling: { ...model.recommended, presence_penalty: 0 } });
      }
      for (const group of timingOnly ? [] : groups) {
        phase = group.name;
        for (const item of [...cases, ...holdouts, ...disasterCases]) {
          const generated = await page.evaluate(data => window.comparison({ type: 'generate', ...data }), { prompt: item.prompt, maxTokens: group.maxTokens, sampling: group.sampling });
          const { id, ...metrics } = generated;
          result.samples.push({ caseId: item.id, prompt: item.prompt, group: group.name, maxTokens: group.maxTokens, sampling: group.sampling, expected: item.expected, required: item.required, ...metrics, pass: score(item, generated.text) });
          console.log(model.key, group.name, item.id, Math.round(generated.elapsedMs), 'ms', JSON.stringify(generated.text)); save();
        }
      }
      result.lengthBenchmarks = [];
      for (const maxTokens of timingOnly ? [32, 64] : []) {
        phase = `length-${maxTokens}`;
        const generated = await page.evaluate(maxTokens => window.comparison({ type: 'generate', prompt: '架空のピクニックの準備を20項目のチェックリストにしてください。', maxTokens }), maxTokens);
        result.lengthBenchmarks.push({ maxTokens, ...generated });
        console.log(model.key, 'length', maxTokens, 'actual', generated.tokens, Math.round(generated.elapsedMs), 'ms'); save();
      }
      if (!timingOnly) {
      phase = 'stop';
      const stop = await page.evaluate(() => window.comparison({ type: 'generate', prompt: '架空のピクニックの持ち物を、理由を付けて20項目列挙してください。', maxTokens: 64, stopAfterFirstContent: true }));
      result.stop = stop;
      await page.evaluate(async () => { await window.comparison({ type: 'dispose' }); window.restartComparisonWorker(); });
      await load(); phase = 'reload-generation';
      result.afterReload = await page.evaluate(() => window.comparison({ type: 'generate', prompt: '「再開」をそのまま書いてください。', maxTokens: 32 }));
      }
    }
    phase = 'dispose'; await page.evaluate(() => window.comparison({ type: 'dispose' })); sampleMemory();
    if (errors.length) throw Error(errors.join('; ')); result.status = 'passed';
  } catch (error) { result.status = result.compatible ? 'partial-failure' : 'failed-probe'; result.failure = { phase, message: error.message }; console.log(model.key, 'FAILED', phase, error.message); }
  finally { clearInterval(timer); result.errors = errors; sampleMemory(); await browser.close(); await browserServer.close(); save(); }
 }
  output.status = output.models.every(model => model.status === 'passed') ? 'passed' : 'completed-with-failures';
  if (output.status !== 'passed') process.exitCode = 1;
} finally { await server.close(); save(); }
