import { metrics } from './config.js';

export const CPU_LOAD_PARAMS = Object.freeze({
  n_gpu_layers: 0, n_threads: 1, n_ctx: 512, n_batch: 64, n_ubatch: 64,
  n_parallel: 1, offload_kqv: false, no_kv_offload: true,
  warmup: false, ctx_shift: false, cache_idle_slots: false, reasoning: false,
});
export function cpuRequest(prompt, maxTokens) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 200) throw new Error('CPU比較の入力は1〜200文字にしてください。');
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 64) throw new Error('CPU比較の生成上限は64トークンです。');
  return {
    messages: [
      { role: 'system', content: '日本語で簡潔に答えてください。' },
      { role: 'user', content: prompt.trim() },
    ],
    max_tokens: maxTokens, temperature: 0, cache_prompt: false,
    stream: true, timings_per_token: true,
    stream_options: { include_usage: true },
  };
}

export class CpuSession {
  constructor(createEngine, expectedBytes) { this.createEngine = createEngine; this.expectedBytes = expectedBytes; }
  async load(blob) {
    if (this.disposed || this.engine) throw new Error('CPU推論はリセットしてから読み込んでください。');
    if (!blob || blob.size !== this.expectedBytes) throw new Error('GGUF保存サイズが一致しません。保存状態を確認してください。');
    if (await blob.slice(0, 4).text() !== 'GGUF') throw new Error('保存ファイルはGGUF形式ではありません。');
    const engine = await this.createEngine();
    if (this.disposed) { await engine.exit(); throw new Error('CPU読み込みを中断しました。'); }
    this.engine = engine;
    try { await engine.loadModel([blob], CPU_LOAD_PARAMS); }
    catch (error) { await engine.exit(); this.engine = null; throw error; }
    if (this.disposed) throw new Error('CPU読み込みを中断しました。');
    const info = engine.getLoadedContextInfo();
    if (engine.getNumThreads() !== 1 || engine.isMultithread() || info.n_ctx !== 512) {
      await this.dispose(); throw new Error('CPU比較の固定設定を確認できませんでした。');
    }
    return { threads: 1, contextTokens: info.n_ctx, batchTokens: info.n_batch, gpuLayers: 0, compat: true };
  }
  async generate(prompt, maxTokens, update) {
    const options = cpuRequest(prompt, maxTokens);
    if (!this.engine || this.disposed) throw new Error('先にCPUモデルを読み込んでください。');
    if (this.generating) throw new Error('CPU生成は一度に1件です。');
    this.generating = true;
    this.abort = new AbortController();
    const started = performance.now();
    let text = '', first = null, tokens = 0, tokensKnown = false, stopped = false;
    const snapshot = () => ({ text, ...metrics(tokens, started, first, performance.now()), tokensKnown, stopped });
    try {
      await this.engine.createChatCompletion({ ...options, abortSignal: this.abort.signal, onData: chunk => {
        if (this.disposed) return;
        const count = chunk.usage?.completion_tokens ?? chunk.timings?.predicted_n;
        if (Number.isInteger(count)) { tokens = count; tokensKnown = true; }
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta || tokens > 0) first ??= performance.now();
        text += delta;
        update(snapshot());
      } });
    } catch (error) {
      if (!this.abort.signal.aborted) throw error;
      stopped = true;
    } finally { this.generating = false; }
    return snapshot();
  }
  stop() { this.abort?.abort(); }
  async dispose() {
    this.disposed = true; this.stop();
    const engine = this.engine; this.engine = null;
    // Public exit() terminates wllama's child Worker, including during load.
    // Do not await a pending native task after terminating its Worker.
    await engine?.exit();
  }
}
