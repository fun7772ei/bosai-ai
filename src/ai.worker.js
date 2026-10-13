import { AutoTokenizer, AutoModelForCausalLM, TextStreamer, InterruptableStoppingCriteria, env } from '@huggingface/transformers';
import { MODEL_ID, REVISION, MODEL_CACHE, metrics, pinnedModelUrl } from './config.js';
env.allowLocalModels = false;
env.cacheKey = MODEL_CACHE;
env.backends.onnx.wasm.numThreads = 1;
// Vite emits the worker under assets/. Resolve runtime relative to the app base, not worker location.
const runtime = import.meta.env.DEV
  ? new URL('/node_modules/onnxruntime-web/dist/', self.location.origin)
  : new URL('runtime/', self.location.origin + import.meta.env.BASE_URL);
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', runtime).href,
  wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', runtime).href,
};
let tokenizer, model, busy = false;
const stopping = new InterruptableStoppingCriteria();
const send = (type, data = {}) => self.postMessage({ type, ...data });
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopping.interrupt(); return; }
  if (busy) return;
  busy = true;
  try {
    if (data.type === 'load') {
      const start = performance.now();
      if (!navigator.gpu) throw new Error('WebGPUが利用できません。Safari 26以降・HTTPSで確認してください。');
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('WebGPUアダプターを取得できません。');
      if (data.dtype === 'q4f16' && !adapter.features.has('shader-f16')) throw new Error('shader-f16非対応です。q4を選んで比較してください。');
      const cache = await caches.open(MODEL_CACHE);
      env.useCustomCache = true;
      env.customCache = {
        match: key => cache.match(pinnedModelUrl(key), { ignoreVary: true }),
        put: async (key, response) => {
          try { await cache.put(pinnedModelUrl(key), response); }
          catch (error) { send('cache-error', { message: error.message }); throw error; }
        },
      };
      env.fetch = async (url, options) => {
        url = pinnedModelUrl(url);
        const saved = await cache.match(url, { ignoreVary: true });
        if (saved) return options?.method === 'HEAD' ? new Response(null, { headers: saved.headers, status: saved.status }) : saved;
        if (data.cachedOnly) throw new Error(`保存済みファイルが不足しています: ${url}`);
        return fetch(url, options);
      };
      const progressTimes = new Map();
      const options = { revision: REVISION, progress_callback: progress => {
        const key = progress.file || progress.name;
        const now = performance.now();
        const frequent = progress.status === 'progress' || progress.status === 'progress_total';
        if (frequent && now - (progressTimes.get(key) || 0) < 200) return;
        progressTimes.set(key, now); send('progress', { progress });
      } };
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, options);
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, { ...options, device: 'webgpu', dtype: data.dtype });
      send('warming');
      await model.generate({ ...tokenizer('こんにちは'), max_new_tokens: 1, do_sample: false });
      send('ready', { loadMs: performance.now() - start, dtype: data.dtype });
    } else if (data.type === 'generate') {
      if (!model || !tokenizer) throw new Error('先にモデルを読み込んでください。');
      stopping.reset();
      const started = performance.now(); let first = null, tokens = 0, text = '';
      const inputs = tokenizer.apply_chat_template([
        { role: 'system', content: 'あなたは日本語の動作検証用アシスタントです。日本語で簡潔に答えてください。' },
        { role: 'user', content: data.prompt.slice(0, 500) },
      ], { add_generation_prompt: true, return_dict: true, enable_thinking: false });
      const streamer = new TextStreamer(tokenizer, { skip_prompt: true, skip_special_tokens: true,
        token_callback_function: ids => { first ??= performance.now(); tokens += ids.length; },
        callback_function: chunk => { text += chunk; send('update', { text, ...metrics(tokens, started, first, performance.now()) }); },
      });
      await model.generate({ ...inputs, max_new_tokens: Math.min(256, Math.max(1, data.maxTokens)), do_sample: false, streamer, stopping_criteria: stopping });
      send('complete', { text, ...metrics(tokens, started, first, performance.now()) });
    }
  } catch (error) {
    send('error', { operation: data.type, message: error.message, stack: error.stack });
  } finally { busy = false; }
};
