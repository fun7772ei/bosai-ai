import { Wllama, CacheManager } from '@wllama/wllama/esm/index.js';
import compatCode from '@wllama/wllama-compat/wasm/wllama.js?raw';
import { CpuSession, CPU_LOAD_PARAMS } from './cpu-session.js';
import { getModel, modelFileUrl } from './config.js';
import { openModelStore } from './model-storage.js';
import { workerError } from './worker-errors.js';

const wasm = import.meta.env.DEV
  ? new URL('/node_modules/@wllama/wllama-compat/wasm/wllama.wasm', self.location.origin).href
  : new URL('runtime/wllama-compat/wllama.wasm', self.location.origin + import.meta.env.BASE_URL).href;

// Force the same local Asyncify/MEMORY32 path on Safari and Chromium tests.
// getWorkerResources() is a public method; this overrides resource selection,
// not private native state. No CDN or OPFS model download is used.
class CpuWllama extends Wllama {
  getWorkerResources() { return { wasmPath: wasm, jsPath: { code: compatCode }, compat: true, noWebGPU: true }; }
}
const blocked = async () => { throw new Error('CPU推論時のモデル取得は許可されていません。先に保存してください。'); };
function createEngine() {
  const cacheManager = new CacheManager([{ isSupported: () => true, read: blocked, write: blocked, list: blocked, delete: blocked, getSize: blocked }]);
  return new CpuWllama({ default: wasm }, { cacheManager, suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error(...args) { send('runtime-log', { message: args.map(String).join(' ').slice(0, 1500) }); } } });
}
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
      session = new CpuSession(createEngine, activeModel.weightBytes.q4_k_m);
      send('stage', { stage: 'CPUモデル初期化（WASM・1スレッド）' });
      const settings = await session.load(blob);
      send('ready', { loadMs: performance.now() - started, dtype: 'q4_k_m', settings, loadParams: CPU_LOAD_PARAMS, wllama: '3.8.1', libllama: Wllama.getLibllamaVersion() });
    } else if (data.type === 'generate') {
      send('stage', { stage: '日本語生成（CPU・履歴なし）' });
      if (!session) throw new Error('先にCPUモデルを読み込んでください。');
      const result = await session.generate(data.prompt, data.maxTokens, result => send('update', result));
      send('complete', { ...result, dtype: 'q4_k_m', settings: CPU_LOAD_PARAMS });
    }
  } catch (error) {
    await session?.dispose().catch(() => {});
    send('error', workerError(error, { operation: data.type, stage }));
  } finally { store?.close(); busy = false; }
};
