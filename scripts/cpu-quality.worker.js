import { Wllama, CacheManager } from '@wllama/wllama/esm/index.js';
import compatCode from '@wllama/wllama-compat/wasm/wllama.js?raw';
import { CpuSession } from '../src/cpu-session.js';
import { getModel } from '../src/config.js';
const wasm = new URL('/node_modules/@wllama/wllama-compat/wasm/wllama.wasm', self.location.origin).href;
class Engine extends Wllama {
  getWorkerResources() { return { wasmPath: wasm, jsPath: { code: compatCode }, compat: true, noWebGPU: true }; }
}
let session, engine, variant, finishReason, blob;
const blocked = async () => { throw new Error('No library downloads allowed'); };
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await session?.dispose();
      variant = data.variant;
      blob ||= await (await fetch('/quality-model.gguf')).blob();
      engine = new Engine({ default: wasm }, { cacheManager: new CacheManager([{ isSupported: () => true, read: blocked, write: blocked, list: blocked, delete: blocked, getSize: blocked }]), suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error(...args) { console.error(...args); } } });
      const load = engine.loadModel.bind(engine), completion = engine.createChatCompletion.bind(engine);
      engine.loadModel = (blobs, params) => load(blobs, { ...params, ...variant.load });
      engine.createChatCompletion = options => completion({ ...options, seed: data.seed ?? 42, ...variant.sampling,
        messages: options.messages.map(message => message.role === 'system' && variant.system ? { ...message, content: variant.system } : message),
        onData(chunk) { for (const choice of chunk.choices || []) if (choice.finish_reason) finishReason = choice.finish_reason; options.onData(chunk); },
      });
      session = new CpuSession(() => engine, getModel('lfm2-cpu').weightBytes.q4_k_m);
      const started = performance.now();
      const settings = await session.load(blob);
      self.postMessage({ id: data.id, settings, loadMs: performance.now() - started, template: engine.getChatTemplate() });
    } else if (data.type === 'generate') {
      finishReason = null;
      const result = await session.generate(data.prompt, data.maxTokens, () => {});
      self.postMessage({ id: data.id, ...result, finishReason });
    } else if (data.type === 'dispose') { await session.dispose(); self.postMessage({ id: data.id }); }
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
