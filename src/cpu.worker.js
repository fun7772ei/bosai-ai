import { Wllama } from '@wllama/wllama/esm/index.js';
import { createEngine } from './cpu-runtime.js';
import corpus from './bosai-data.json';
import { SEARCH_MODELS } from './bosai-search.js';
import { CpuSession } from './cpu-session.js';
import { getModel, modelFileUrl } from './config.js';
import { openModelStore } from './model-storage.js';
import { workerError } from './worker-errors.js';

let session, activeModel, busy = false, disposed = false, stage;
function send(type, data = {}) {
  if (disposed) return;
  if (type === 'stage') stage = data.stage;
  self.postMessage({ type, modelKey: activeModel?.key, model: activeModel?.id, revision: activeModel?.revision, engine: 'wllama-cpu', ...data });
}
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { session?.stop(); return; }
  if (data.type === 'dispose') {
    disposed = true;
    await session?.dispose();
    self.postMessage({ type: 'disposed' }); return;
  }
  if (busy || disposed) return;
  busy = true;
  let store;
  try {
    if (data.type === 'load') {
      activeModel = getModel(data.modelKey);
      if (activeModel.engine !== 'wllama-cpu' || data.dtype !== 'q4_k_m') throw new Error('CPU比較のモデル・形式が一致しません。');
      const started = performance.now();
      send('stage', { stage: '保存済みGGUFの分割読込' });
      store = await openModelStore();
      const blob = await store.blob(modelFileUrl(activeModel.file, activeModel.key));
      store.close(); store = null;
      session = new CpuSession(() => createEngine(message => send('runtime-log', { message })), activeModel.weightBytes.q4_k_m, { noThinking: activeModel.noThinking === true });
      send('stage', { stage: 'CPUモデル初期化（WASM・1スレッド）' });
      const settings = await session.load(blob);
      send('ready', { loadMs: performance.now() - started, dtype: 'q4_k_m', settings, loadParams: session.loadParams, wllama: '3.8.1', libllama: Wllama.getLibllamaVersion() });
    } else if (data.type === 'search-select') {
      try {
        if (!session || !SEARCH_MODELS.includes(activeModel?.key)) throw Error('検索選別はLFM CPU版を読み込んでください。');
        if (!Array.isArray(data.candidateIds)) throw Error('不正な検索候補です。');
        const candidates = data.candidateIds.map(id => ({ entry: corpus.find(item => item.id === id) }));
        if (candidates.some(item => !item.entry) || new Set(data.candidateIds).size !== candidates.length) throw Error('不正な検索候補です。');
        send('stage', { stage: '検索候補の選別（CPU）' });
        const result = await session.selectSearch(data.query, candidates);
        send('search-complete', { ...result, requestId: data.requestId });
      } catch (error) {
        // A context/format failure must not erase stored models or terminate the loaded engine.
        send('search-complete', { requestId: data.requestId, text: '', error: workerError(error).message });
      }
    } else if (data.type === 'generate') {
      send('stage', { stage: '日本語生成（CPU・履歴なし）' });
      if (!session) throw new Error('先にCPUモデルを読み込んでください。');
      const result = await session.generate(data.prompt, data.maxTokens, result => send('update', result));
      send('complete', { ...result, dtype: 'q4_k_m', settings: session.loadParams });
    }
  } catch (error) {
    await session?.dispose().catch(() => {});
    send('error', workerError(error, { operation: data.type, stage }));
  } finally { store?.close(); busy = false; }
};
