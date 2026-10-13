import './style.css';
import { MODEL_ID, REVISION, MODEL_CACHE } from './config.js';
const $ = id => document.getElementById(id);
const logs = [], runs = [], files = new Map();
let worker, ready = false, busy = false, repeats = 0, activePrompt = '', loadedDtype;
const log = (message, data) => {
  logs.push({ time: new Date().toISOString(), message, data });
  if (logs.length > 400) logs.shift();
  $('logs').textContent = logs.map(x => `${x.time} ${x.message}${x.data ? ' ' + JSON.stringify(x.data) : ''}`).join('\n');
  $('logs').scrollTop = $('logs').scrollHeight;
};
function controls() {
  $('load').disabled = busy || ready; $('generate').disabled = busy || !ready;
  $('repeat').disabled = busy || !ready; $('stop').disabled = !busy || !ready;
  $('dtype').disabled = busy || ready; $('cachedOnly').disabled = busy || ready;
  $('clear').disabled = busy || ready; $('reset').disabled = !worker;
}
function reset() {
  worker?.terminate(); worker = null; ready = false; busy = false; repeats = 0;
  $('status').textContent = 'リセット済み。モデルを再読み込みできます。'; controls();
}
function updateMetrics(data) {
  $('ttft').textContent = data.ttftMs === null ? '—' : `${(data.ttftMs / 1000).toFixed(2)} 秒`;
  $('speed').textContent = `${data.tokensPerSecond.toFixed(2)} tokens/sec`;
  $('count').textContent = `${data.tokens} / ${(data.elapsedMs / 1000).toFixed(2)} 秒`;
}
function generate() {
  const prompt = $('prompt').value.trim(); if (!prompt) return;
  activePrompt = prompt; busy = true; $('output').textContent = ''; $('status').textContent = '生成中…';
  controls(); worker.postMessage({ type: 'generate', prompt, maxTokens: Number($('tokens').value) });
}
function makeWorker() {
  worker = new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });
  worker.onerror = event => {
    log('Workerエラー', { message: event.message }); reset(); $('status').textContent = `実行エラー: ${event.message}`;
  };
  worker.onmessage = async ({ data }) => {
    switch (data.type) {
      case 'progress': {
        const p = data.progress;
        files.set(p.file || p.name || 'model', p);
        $('progress').replaceChildren(...Array.from(files, ([name, item]) => {
          const box = document.createElement('div'), label = document.createElement('p'), bar = document.createElement('progress');
          label.textContent = `${name}: ${item.status} ${item.loaded ? (item.loaded / 1048576).toFixed(1) + ' MB' : ''}`;
          bar.max = 100; if (item.progress !== undefined) bar.value = item.progress; else if (item.status === 'done') bar.value = 100;
          box.append(label, bar); return box;
        }));
        if (p.status !== 'progress') log('モデルファイル', p); break;
      }
      case 'warming': $('status').textContent = 'シェーダーを準備中（初回推論）…'; log('ウォームアップ'); break;
      case 'cache-error': log('端末保存失敗（オフライン再利用不可の可能性）', data); break;
      case 'ready': ready = true; busy = false; loadedDtype = data.dtype; $('status').textContent = '生成可能'; $('loadTime').textContent = `${(data.loadMs / 1000).toFixed(2)} 秒`; log('モデル準備完了', data); controls(); await inspect(); break;
      case 'update': $('output').textContent = data.text; updateMetrics(data); break;
      case 'complete':
        $('output').textContent = data.text; updateMetrics(data); busy = false;
        runs.push({ ...data, prompt: activePrompt, dtype: loadedDtype, time: new Date().toISOString() });
        if (runs.length > 100) runs.shift();
        $('status').textContent = '生成終了（停止要求時は途中結果）'; log('生成終了', data); controls();
        if (repeats > 0 && --repeats > 0) setTimeout(generate, 250); break;
      case 'error':
        log('実行エラー', data); reset(); $('status').textContent = `エラー: ${data.message}`; break;
    }
  };
}
async function inspect() {
  try {
    const cache = await caches.open(MODEL_CACHE), keys = await cache.keys();
    const estimate = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    const weights = keys.filter(key => /\.onnx(?:_data)?$/.test(key.url));
    $('storage').textContent = `モデル関連の保存: ${keys.length}ファイル（重み${weights.length}）。オリジン使用量: ${estimate?.usage ? (estimate.usage / 1048576).toFixed(1) + ' MB' : '不明'} / 容量 ${estimate?.quota ? (estimate.quota / 1048576).toFixed(0) + ' MB' : '不明'}。永続保存: ${persisted ? '許可' : '未許可'}。再起動・オフライン推論で保存の有効性を確認してください。`;
    log('保存状態', { urls: keys.map(key => key.url), estimate, persisted });
  } catch (error) { $('storage').textContent = `保存確認エラー: ${error.message}`; log('保存エラー', { message: error.message }); }
}
$('load').onclick = () => {
  busy = true; files.clear(); $('progress').replaceChildren(); makeWorker(); controls();
  $('status').textContent = 'モデルを読み込み中… 初回は数百MBを取得します。';
  log('読み込み開始', { dtype: $('dtype').value, cachedOnly: $('cachedOnly').checked });
  worker.postMessage({ type: 'load', dtype: $('dtype').value, cachedOnly: $('cachedOnly').checked });
};
$('generate').onclick = generate;
$('repeat').onclick = () => { if (!$('prompt').value.trim()) return; repeats = 10; generate(); };
$('stop').onclick = () => { repeats = 0; worker?.postMessage({ type: 'stop' }); log('停止要求'); };
$('reset').onclick = () => { reset(); log('Workerを終了'); };
$('inspect').onclick = inspect;
$('persist').onclick = async () => { try { log('永続保存リクエスト', { allowed: await navigator.storage?.persist?.() }); await inspect(); } catch (error) { log('永続保存エラー', { message: error.message }); } };
$('clear').onclick = async () => { try { await caches.delete(MODEL_CACHE); log('モデルキャッシュを削除'); await inspect(); } catch (error) { log('削除エラー', { message: error.message }); } };
$('export').onclick = () => {
  const result = { model: MODEL_ID, revision: REVISION, transformers: '4.3.1', userAgent: navigator.userAgent, secureContext: isSecureContext, generatedAt: new Date().toISOString(), runs, logs, deviceVerification: 'User must record actual device; no iPad verification claimed' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'bosai-ai-phase1.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const connectivity = () => { $('connection').textContent = navigator.onLine ? 'オンライン（接続表示は目安）' : 'オフライン'; };
addEventListener('online', connectivity); addEventListener('offline', connectivity); connectivity();
(async () => {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    const info = { userAgent: navigator.userAgent, secureContext: isSecureContext, webgpu: !!adapter, shaderF16: adapter?.features.has('shader-f16'), limits: adapter ? { maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize } : null };
    $('environment').textContent = adapter ? `WebGPU利用可能 / shader-f16: ${info.shaderF16 ? '対応' : '非対応'}` : 'WebGPU利用不可。Safari 26以降とHTTPSを確認してください。'; log('環境', info);
  } catch (error) { $('environment').textContent = `環境確認エラー: ${error.message}`; log('環境エラー', { message: error.message }); }
  await inspect();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      await navigator.serviceWorker.ready;
      log('アプリ本体のオフライン保存完了');
    } catch (error) { log('アプリ本体の保存エラー', { message: error.message }); }
  }
})();
