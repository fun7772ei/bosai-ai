import { Wllama, CacheManager } from '@wllama/wllama/esm/index.js';
import compatCode from '@wllama/wllama-compat/wasm/wllama.js?raw';
import { CpuSession } from '../src/cpu-session.js';
const wasm = new URL('/node_modules/@wllama/wllama-compat/wasm/wllama.wasm', self.location.origin).href;
class Engine extends Wllama {
  getWorkerResources() { return { wasmPath: wasm, jsPath: { code: compatCode }, compat: true, noWebGPU: true }; }
}
let session, engine, model, sampling = {}, reasoningCharacters = 0, lastTiming;
const blocked = async () => { throw Error('No library network model download'); };
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { session?.stop(); return; }
  try {
    if (data.type === 'load') {
      await session?.dispose(); model = data.model;
      self.postMessage({ stage: 'fixture-blob' });
      const started = performance.now();
      const blob = await (await fetch('/comparison-model.gguf')).blob();
      const blobMs = performance.now() - started;
      self.postMessage({ stage: 'native-initialize' });
      engine = new Engine({ default: wasm }, { cacheManager: new CacheManager([{ isSupported: () => true, read: blocked, write: blocked, list: blocked, delete: blocked, getSize: blocked }]), suppressNativeLog: true, logger: { debug() {}, log() {}, warn() {}, error(...args) { self.postMessage({ nativeError: args.map(String).join(' ').slice(0, 2000) }); } } });
      const load = engine.loadModel.bind(engine), completion = engine.createChatCompletion.bind(engine);
      engine.loadModel = (blobs, params) => load(blobs, { ...params, ...(model.noThinking ? { jinja: true, default_template_kwargs: { enable_thinking: false } } : {}) });
      engine.createChatCompletion = options => completion({ ...options, seed: 42, ...sampling, ...(model.noThinking ? { chat_template_kwargs: { enable_thinking: false } } : {}), onData(chunk) {
        reasoningCharacters += (chunk.choices?.[0]?.delta?.reasoning_content || '').length;
        if (chunk.timings) lastTiming = chunk.timings;
        options.onData(chunk);
      } });
      session = new CpuSession(() => engine, model.bytes);
      const nativeStart = performance.now(); const settings = await session.load(blob);
      self.postMessage({ id: data.id, blobMs, loadMs: performance.now() - nativeStart, settings, template: engine.getChatTemplate(), libllama: Wllama.getLibllamaVersion(), context: engine.getLoadedContextInfo() });
    } else if (data.type === 'generate') {
      sampling = data.sampling || {}; reasoningCharacters = 0; lastTiming = null;
      const result = await session.generate(data.prompt, data.maxTokens, update => { if (data.stopAfterFirstContent && update.text) session.stop(); });
      if (model.noThinking && (reasoningCharacters || /<think>|<\/think>/.test(result.text))) throw Error('Thinking output detected despite disable flag');
      self.postMessage({ id: data.id, ...result, reasoningCharacters, nativeTiming: lastTiming });
    } else if (data.type === 'dispose') { await session?.dispose(); self.postMessage({ id: data.id }); }
  } catch (error) { self.postMessage({ id: data.id, error: error.message, stack: error.stack }); }
};
