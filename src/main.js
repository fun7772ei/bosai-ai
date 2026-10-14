import './style.css';
import { MODELS, PREFERRED_MODEL, getModel } from './config.js';
import { readSelection, readDtype, saveSelection } from './model-preferences.js';
import { modelStorageStatus, selectStoredDtype, openModelStore } from './model-storage.js';
import { createWorkerClient } from './worker-client.js';
import { workerError } from './worker-errors.js';
const $ = id => document.getElementById(id);
$('build').textContent = `アプリ版: ${__APP_BUILD__}`;
$('model').replaceChildren(...MODELS.map(model => new Option(model.label, model.key)));
$('model').value = PREFERRED_MODEL;
const logs = [], runs = [], files = new Map();
let worker, ready = false, busy = false, repeats = 0, activePrompt = '', loadedDtype, loadedModel, loadMs;
const CHECKPOINT = 'bosai-ai-active-stage';
try {
  const saved = readSelection(localStorage);
  $('model').value = saved.modelKey; $('dtype').value = saved.dtype;
} catch {}
const currentModel = () => getModel($('model').value);
function selection() {
  const model = currentModel();
  return { modelKey: model.key, model: model.id, revision: model.revision, dtype: $('dtype').value };
}
function modelInfo() {
  const model = currentModel();
  const notes = {
    lfm2: '第一候補。ユーザー提供の実機ログでq4f16の短い生成10回完了を確認。長時間・再起動後オフラインは未確認です。',
    gemma3: 'ユーザーから10回連続テスト中のクラッシュ報告があります。',
    qwen3: 'iPadで初期化中のクラッシュ報告があります。',
  };
  $('modelInfo').textContent = `${model.label}: ${$('dtype').value}の重みは約${Math.round(model.weightBytes[$('dtype').value] / 1000000)} MB（Tokenizer等は別）。必要メモリはこの値より大きくなります。${notes[model.key]}`;
}
function saveDtype() {
  try { saveSelection(localStorage, { modelKey: currentModel().key, dtype: $('dtype').value }); } catch {}
}
$('dtype').onchange = () => { saveDtype(); modelInfo(); inspect(); };
$('model').onchange = () => {
  $('dtype').value = 'q4f16';
  try { $('dtype').value = readDtype(localStorage, currentModel().key); } catch {}
  saveDtype(); modelInfo(); files.clear(); $('progress').replaceChildren();
  for (const id of ['loadTime', 'ttft', 'speed', 'count']) $(id).textContent = '—';
  $('output').textContent = '生成結果がここに表示されます。';
  $('status').textContent = `${currentModel().label}を選択しました。保存状態を確認中…`;
  inspect(true);
};
modelInfo();
let previousAttempt;
try { previousAttempt = JSON.parse(localStorage.getItem(CHECKPOINT) || 'null'); } catch {}
if (previousAttempt) $('recovery').textContent = `前回は「${previousAttempt.stage}」の完了前にページが終了・再読み込みされました。原因はまだ特定できません。`;
function checkpoint(stage) {
  try {
    if (stage) localStorage.setItem(CHECKPOINT, JSON.stringify({ stage, ...selection(), time: new Date().toISOString() }));
    else localStorage.removeItem(CHECKPOINT);
  } catch {}
}
const log = (message, data) => {
  logs.push({ time: new Date().toISOString(), message, data: { ...selection(), ...data } });
  if (logs.length > 400) logs.shift();
  $('logs').textContent = logs.map(x => `${x.time} ${x.message}${x.data ? ' ' + JSON.stringify(x.data) : ''}`).join('\n');
  $('logs').scrollTop = $('logs').scrollHeight;
};
function controls() {
  $('load').disabled = busy || ready; $('generate').disabled = busy || !ready;
  $('download').disabled = busy || ready || $('cachedOnly').checked;
  $('repeat').disabled = busy || !ready; $('stop').disabled = !busy || !ready;
  $('dtype').disabled = busy || ready; $('cachedOnly').disabled = busy || ready;
  $('model').disabled = busy || ready;
  $('clear').disabled = busy || ready; $('reset').disabled = !worker;
}
function reset() {
  worker?.terminate(); worker = null; ready = false; busy = false; repeats = 0;
  $('status').textContent = 'リセット済み。モデルを再読み込みできます。'; controls();
  checkpoint(null);
}
function updateMetrics(data) {
  $('ttft').textContent = data.ttftMs === null ? '—' : `${(data.ttftMs / 1000).toFixed(2)} 秒`;
  $('speed').textContent = `${data.tokensPerSecond.toFixed(2)} tokens/sec`;
  $('count').textContent = `${data.tokens} / ${(data.elapsedMs / 1000).toFixed(2)} 秒`;
}
function generate() {
  if (!ready || busy || !worker) return;
  const prompt = $('prompt').value.trim(); if (!prompt) return;
  activePrompt = prompt; busy = true; $('output').textContent = ''; $('status').textContent = '生成中…';
  checkpoint('日本語生成');
  controls(); worker.postMessage({ type: 'generate', prompt, maxTokens: Number($('tokens').value) });
}
function makeWorker(download = false) {
  const failed = data => {
    let lastStage;
    try { lastStage = JSON.parse(localStorage.getItem(CHECKPOINT) || 'null'); } catch {}
    log('Workerエラー', { ...data, lastStage }); reset(); $('status').textContent = `エラー: ${data.message}`;
  };
  const onMessage = async ({ data }) => {
    switch (data.type) {
      case 'worker-ready': log('Worker起動完了', { kind: data.kind }); break;
      case 'progress': {
        const p = data.progress;
        if (download && p.status === 'initiate') checkpoint(`ダウンロード・保存: ${p.file}`);
        files.set(p.file || p.name || 'model', p);
        $('progress').replaceChildren(...Array.from(files, ([name, item]) => {
          const box = document.createElement('div'), label = document.createElement('p'), bar = document.createElement('progress');
          label.textContent = `${name}: ${item.status} ${item.loaded ? (item.loaded / 1048576).toFixed(1) + ' MB' : ''}`;
          bar.max = 100; if (item.progress !== undefined) bar.value = item.progress; else if (item.status === 'done') bar.value = 100;
          box.append(label, bar); return box;
        }));
        if (p.status !== 'progress' && p.status !== 'progress_total') log('モデルファイル', p); break;
      }
      case 'stage': checkpoint(data.stage); $('status').textContent = data.stage; log('処理段階', { stage: data.stage }); break;
      case 'downloaded':
        reset(); $('status').textContent = 'ダウンロード・保存完了。いったんページを再読み込みし、「モデルを読み込む」を押してください。';
        log('ダウンロード・保存完了'); await inspect(); break;
      case 'cache-error': log('端末保存失敗（オフライン再利用不可の可能性）', data); break;
      case 'ready': checkpoint(null); ready = true; busy = false; loadedDtype = data.dtype; loadedModel = getModel(data.modelKey); loadMs = data.loadMs; $('status').textContent = '生成可能'; $('loadTime').textContent = `${(data.loadMs / 1000).toFixed(2)} 秒`; log('モデル準備完了', data); controls(); await inspect(); break;
      case 'update': $('output').textContent = data.text; updateMetrics(data); break;
      case 'complete':
        checkpoint(null);
        $('output').textContent = data.text; updateMetrics(data); busy = false;
        runs.push({ ...data, modelKey: loadedModel.key, model: loadedModel.id, revision: loadedModel.revision, loadMs, prompt: activePrompt, dtype: loadedDtype, time: new Date().toISOString() });
        if (runs.length > 100) runs.shift();
        $('status').textContent = '生成終了（停止要求時は途中結果）'; log('生成終了', data); controls();
        if (repeats > 0 && --repeats > 0) setTimeout(generate, 250); break;
      case 'error':
        failed(data); break;
    }
  };
  try {
    worker?.terminate();
    worker = createWorkerClient(
      () => new Worker(new URL('./bootstrap.worker.js', import.meta.url), { type: 'module' }),
      download ? 'download' : 'inference', onMessage, failed,
    );
    return true;
  } catch (error) { failed(workerError(error, { stage: 'Worker作成' })); return false; }
}
async function inspect(restoreSelection = false) {
  let cache;
  const model = currentModel();
  try {
    cache = await openModelStore();
    const keys = await cache.keys();
    const estimate = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    const weights = keys.filter(key => /\.onnx(?:_data)?$/.test(key.url));
    const statuses = await Promise.all(['q4f16', 'q4'].map(dtype => modelStorageStatus(cache, dtype, model.key)));
    if (currentModel().key !== model.key) return;
    if (restoreSelection && !busy && !ready) {
      const dtype = selectStoredDtype($('dtype').value, statuses);
      if (dtype !== $('dtype').value) log('保存済み形式を復元', { dtype });
      $('dtype').value = dtype; saveDtype(); modelInfo();
    }
    const selected = statuses.find(item => item.dtype === $('dtype').value);
    const modelWeights = selected.details.filter(item => /\.onnx(?:_data)?$/.test(item.file));
    const weight = modelWeights.find(item => item.file.endsWith('.onnx_data')) || modelWeights[0];
    const totalWeightBytes = modelWeights.reduce((sum, item) => sum + (item.bytes || 0), 0);
    $('storage').textContent = `モデル関連の保存: ${keys.length}ファイル（重み${weights.length}）。${model.label} / 選択中の${selected.dtype}: ${selected.present.length}/${selected.required}ファイル保存済み${selected.complete ? '（必要ファイルあり）' : `。不足: ${selected.missing.join(', ')}`}。モデル本体: ${weight ? `${weight.backend === 'indexeddb-chunks' ? `IndexedDB・${weight.chunks}分割` : '旧Cache API'}${totalWeightBytes ? ` / 合計${(totalWeightBytes / 1048576).toFixed(1)} MiB` : ''}` : '未保存'}。オリジン使用量: ${estimate?.usage ? (estimate.usage / 1048576).toFixed(1) + ' MiB' : '不明'} / 容量 ${estimate?.quota ? (estimate.quota / 1048576).toFixed(0) + ' MiB' : '不明'}。永続保存: ${persisted ? '許可' : '未許可'}。`;
    if (restoreSelection && !busy && !ready && selected.complete) $('status').textContent = `保存済みモデル（${selected.dtype}）が見つかりました。${model.label}の「モデルを読み込む」で推論を準備できます。`;
    log('保存状態', { selectedDtype: selected.dtype, statuses, urls: keys.map(key => key.url), estimate, persisted });
  } catch (error) { $('storage').textContent = `保存確認エラー: ${error.message}`; log('保存エラー', { message: error.message }); }
  finally { cache?.close(); }
}
$('download').onclick = () => {
  saveDtype();
  busy = true; files.clear(); $('progress').replaceChildren();
  checkpoint('ダウンロード・保存'); $('status').textContent = 'ダウンロードして端末に保存中… 推論用の初期化は行いません。';
  log('ダウンロード開始', { dtype: $('dtype').value });
  if (!makeWorker(true)) return;
  controls();
  worker.postMessage({ modelKey: currentModel().key, dtype: $('dtype').value });
};
$('cachedOnly').onchange = controls;
$('load').onclick = async () => {
  busy = true; controls();
  let cache;
  try {
    cache = await openModelStore();
    const { missing } = await modelStorageStatus(cache, $('dtype').value, currentModel().key);
    if (missing.length) throw new Error(`モデル保存が未完了です。先に「ダウンロードして保存」を押してください。不足: ${missing.join(', ')}`);
  } catch (error) { busy = false; controls(); $('status').textContent = `エラー: ${error.message}`; log('保存確認エラー', { message: error.message }); return; }
  finally { cache?.close(); }
  files.clear(); $('progress').replaceChildren();
  checkpoint('保存済みモデルの読み込み'); $('status').textContent = '保存済みモデルを読み込み中…';
  log('読み込み開始', { dtype: $('dtype').value, cachedOnly: $('cachedOnly').checked });
  if (!makeWorker()) return;
  controls();
  worker.postMessage({ type: 'load', modelKey: currentModel().key, dtype: $('dtype').value, cachedOnly: $('cachedOnly').checked });
};
$('generate').onclick = generate;
$('repeat').onclick = () => { if (!$('prompt').value.trim()) return; repeats = 10; generate(); };
$('stop').onclick = () => { repeats = 0; worker?.postMessage({ type: 'stop' }); log('停止要求'); };
$('reset').onclick = () => { reset(); log('Workerを終了'); };
$('inspect').onclick = () => inspect();
$('persist').onclick = async () => { try { log('永続保存リクエスト', { allowed: await navigator.storage?.persist?.() }); await inspect(); } catch (error) { log('永続保存エラー', { message: error.message }); } };
$('clear').onclick = async () => {
  const model = currentModel();
  busy = true; controls();
  let cache;
  try {
    cache = await openModelStore(); const result = await cache.clear(model.key);
    log(result?.legacyWarning ? 'IndexedDB保存を削除・旧Cache APIの削除は未完了' : '選択モデルの保存を削除', result);
    $('status').textContent = result?.legacyWarning ? `${model.label}: 旧Cache APIの削除が未完了です。` : `${model.label}の保存を削除しました。`;
    await inspect();
  }
  catch (error) { log('削除エラー', { message: error.message }); }
  finally { cache?.close(); busy = false; controls(); }
};
$('export').onclick = () => {
  const result = { appBuild: __APP_BUILD__, ...selection(), modelCatalog: MODELS, transformers: '4.3.1', userAgent: navigator.userAgent, secureContext: isSecureContext, generatedAt: new Date().toISOString(), previousAttempt, runs, logs, deviceVerification: 'User must record actual device; no iPad verification claimed' };
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
  await inspect(true);
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      await navigator.serviceWorker.ready;
      log('アプリ本体のオフライン保存完了');
    } catch (error) { log('アプリ本体の保存エラー', { message: error.message }); }
  }
})();
