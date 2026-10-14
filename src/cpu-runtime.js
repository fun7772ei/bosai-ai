import { Wllama, CacheManager } from '@wllama/wllama/esm/index.js';
import compatCode from '@wllama/wllama-compat/wasm/wllama.js?raw';
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
export function createEngine(report = () => {}) {
  const cacheManager = new CacheManager([{ isSupported: () => true, read: blocked, write: blocked, list: blocked, delete: blocked, getSize: blocked }]);
  return new CpuWllama({ default: wasm }, { cacheManager, suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error(...args) { report(args.map(String).join(' ').slice(0, 1500)); } } });
}
