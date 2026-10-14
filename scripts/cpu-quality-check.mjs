import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cases, holdouts, improvedSystem, englishSystem, shortSystem, score } from './cpu-quality-cases.mjs';
const file = process.env.CPU_QUALITY_GGUF || 'test-results/lfm2-q4-k-m.gguf';
const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes);
if (hash.digest('hex') !== '7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4') throw Error('Wrong pinned GGUF');
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 4180, strictPort: true, hmr: false, watch: null }, plugins: [{ name: 'quality-fixture', configureServer(server) { server.middlewares.use('/quality-test', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>CPU quality evaluation</title>'); }); server.middlewares.use('/quality-model.gguf', (req, res) => { res.setHeader('Content-Length', '229312224'); createReadStream(file).pipe(res); }); } }] });
await server.listen();
const browser = await chromium.launch(); const page = await browser.newPage();
const result = { browser: 'Linux Chromium, CPU compat, not iPad Safari', createdAt: new Date().toISOString(), baselineCommit: 'b8422348734797879e0b9417b0d097ab4fcaafb1', wllama: '3.8.1', model: 'LiquidAI/LFM2.5-350M-GGUF', revision: '657e078c94084481950a2d555a941481f715536b', modelSha256: '7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4', groups: [], errors: [] };
page.on('pageerror', error => result.errors.push(error.message));
const variants = [
  { id: 'baseline', maxTokens: 32 },
  { id: 'jinja-on', load: { jinja: true }, maxTokens: 32 },
  { id: 'official-system', system: 'You are a helpful assistant trained by Liquid AI.', maxTokens: 32 },
  { id: 'precise-system', system: improvedSystem, maxTokens: 32 },
  { id: 'temperature-0.1', sampling: { temperature: 0.1 }, maxTokens: 32 },
  { id: 'top-k-50', sampling: { temperature: 0.1, top_k: 50 }, maxTokens: 32 },
  { id: 'repeat-native-1.05', sampling: { temperature: 0.1, top_k: 50, repeat_penalty: 1.05 }, maxTokens: 32 },
  { id: 'top-p-native-0.9', sampling: { temperature: 0.1, top_k: 50, repeat_penalty: 1.05, top_p: 0.9 }, maxTokens: 32 },
  { id: 'baseline-64', maxTokens: 64 },
  { id: 'precise-english', system: englishSystem, maxTokens: 32 },
  { id: 'precise-short', system: shortSystem, maxTokens: 32 },
  { id: 'baseline-holdout', holdout: true, maxTokens: 32 },
  { id: 'precise-holdout', system: improvedSystem, holdout: true, maxTokens: 32 },
  { id: 'short-holdout', system: shortSystem, holdout: true, maxTokens: 32 },
  { id: 'recommended-seed43', sampling: { temperature: 0.1, top_k: 50, repeat_penalty: 1.05 }, seed: 43, maxTokens: 32 },
  { id: 'recommended-seed44', sampling: { temperature: 0.1, top_k: 50, repeat_penalty: 1.05 }, seed: 44, maxTokens: 32 },
  { id: 'official-holdout', system: 'You are a helpful assistant trained by Liquid AI.', holdout: true, maxTokens: 32 },
  { id: 'retained-production', maxTokens: 32 },
];
// Optional selected comparisons use the same cases, not app-visible presets.
if (process.argv[2]) variants.splice(0, variants.length, ...JSON.parse(readFileSync(process.argv[2], 'utf8')));
try {
  await page.goto('http://127.0.0.1:4180/quality-test');
  await page.evaluate(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });
    const worker = new Worker('/scripts/cpu-quality.worker.js', { type: 'module' });
    let id = 0; const pending = new Map();
    worker.onmessage = ({ data }) => { const item = pending.get(data.id); if (!item) return; clearTimeout(item.timer); pending.delete(data.id); data.error ? item.reject(Error(data.error)) : item.resolve(data); };
    worker.onerror = event => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(event.message)); } pending.clear(); };
    window.quality = data => new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(Error('Quality worker timeout')); }, 180000); pending.set(key, { resolve, reject, timer }); worker.postMessage({ ...data, id: key }); });
  });
  for (const variant of variants) {
    const loaded = await page.evaluate(variant => window.quality({ type: 'load', variant, seed: variant.seed ?? 42 }), variant);
    result.template = loaded.template;
    const group = { variant, loadMs: loaded.loadMs, settings: loaded.settings, samples: [] }; result.groups.push(group);
    for (const item of variant.holdout ? holdouts : cases) {
      const generated = await page.evaluate(data => window.quality({ type: 'generate', ...data }), { prompt: item.prompt, maxTokens: variant.maxTokens });
      const { id: requestId, ...output } = generated;
      group.samples.push({ ...item, ...output, pass: score(item, generated.text) });
    }
    group.passed = group.samples.filter(sample => sample.pass).length;
    console.log(variant.id, group.passed + '/6', JSON.stringify(group.samples.map(s => ({ id: s.id, text: s.text, finish: s.finishReason }))));
    mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/cpu-quality-check.json', JSON.stringify(result, null, 2));
  }
  await page.evaluate(() => window.quality({ type: 'dispose' }));
  if (result.errors.length) throw Error('Browser errors'); result.status = 'passed';
} catch (error) { result.status = 'failed'; result.errors.push(error.message); process.exitCode = 1; }
finally { mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/cpu-quality-check.json', JSON.stringify(result, null, 2)); await browser.close(); await server.close(); }
