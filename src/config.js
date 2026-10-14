export const DEFAULT_MODEL = 'qwen3';
// Keep legacy helper defaults/URLs stable; prefer CPU LFM for new UI selections.
export const PREFERRED_MODEL = 'lfm2-cpu';
export const MODELS = Object.freeze([
  { key: 'lfm2-cpu', label: 'LFM2.5-350M（CPU/WASM比較）', id: 'LiquidAI/LFM2.5-350M-GGUF', revision: '657e078c94084481950a2d555a941481f715536b', engine: 'wllama-cpu', dtypes: ['q4_k_m'], file: 'LFM2.5-350M-Q4_K_M.gguf', sha256: '7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4', weightBytes: { q4_k_m: 229312224 } },
  { key: 'qwen35-cpu', label: 'Qwen3.5-0.8B 日本語SFT v2（CPU/WASM比較）', id: 'Takenoko12345678/Qwen3.5-0.8B-Japanese-SFT-v2-GGUF', revision: 'a5c9ba2dd9220a0163e82af3a08e2ab4e77c343b', engine: 'wllama-cpu', dtypes: ['q4_k_m'], noThinking: true, file: 'Qwen3.5-0.8B-Japanese-SFT-v2-Q4_K_M.gguf', sha256: 'fc3404fe7aa1f9dce8ff88d348308606c73eb6dfbf7c920148fe7a722bf105dc', weightBytes: { q4_k_m: 529296736 } },
  { key: 'qwen3-cpu', label: 'Qwen3-0.6B（CPU/WASM比較）', id: 'bartowski/Qwen_Qwen3-0.6B-GGUF', revision: '60b85c0e3d8fe0f6474f406922a26d12aca4550d', engine: 'wllama-cpu', dtypes: ['q4_k_m'], noThinking: true, file: 'Qwen_Qwen3-0.6B-Q4_K_M.gguf', sha256: '9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14', weightBytes: { q4_k_m: 484220320 } },
  { key: 'lfm2-700m-cpu', label: 'LFM2-700M（CPU/WASM比較）', id: 'LiquidAI/LFM2-700M-GGUF', revision: 'fd39e80d7a5ac61494ffff577e61bbbfddbd0d02', engine: 'wllama-cpu', dtypes: ['q4_k_m'], file: 'LFM2-700M-Q4_K_M.gguf', sha256: '684e8406dc13321452b3f6aeca432776e2a6a7e1ad6c23f7887b8fe3efbe2efa', weightBytes: { q4_k_m: 468624320 } },
  { key: 'lfm2', label: 'LFM2.5-350M', id: 'onnx-community/LFM2.5-350M-ONNX', revision: '7dd4999565b0342c381ba90a3d8fc467d6df19c4', externalData: true, weightBytes: { q4f16: 255148587, q4: 293813394 } },
  { key: 'gemma3', label: 'Gemma 3-270M-it', id: 'onnx-community/gemma-3-270m-it-ONNX', revision: '2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0', externalData: true, weightBytes: { q4f16: 272956893, q4: 323175770 } },
  { key: 'qwen3', label: 'Qwen3-0.6B', id: 'onnx-community/Qwen3-0.6B-ONNX', revision: '1e0a4a196ecabdf9a879664110574563d3f372d3', externalData: false, weightBytes: { q4f16: 569789750, q4: 919096585 } },
]);
export function getModel(key = DEFAULT_MODEL) {
  const model = MODELS.find(item => item.key === key);
  if (!model) throw new Error('Unsupported model');
  return model;
}
// Retain default-model exports and URLs for existing Qwen3 installations.
export const MODEL_ID = getModel().id;
export const REVISION = getModel().revision;
export const MODEL_CACHE = 'bosai-ai-model-v1';
export const modelDtypes = modelKey => getModel(modelKey).dtypes || ['q4f16', 'q4'];
export function modelFiles(dtype, modelKey = DEFAULT_MODEL) {
  if (!modelDtypes(modelKey).includes(dtype)) throw new Error('Unsupported dtype');
  const model = getModel(modelKey);
  if (model.engine === 'wllama-cpu') return [model.file];
  const files = ['tokenizer_config.json', 'tokenizer.json', 'config.json', 'generation_config.json', `onnx/model_${dtype}.onnx`];
  if (model.externalData) files.push(`onnx/model_${dtype}.onnx_data`);
  return files;
}
export function modelFileUrl(file, modelKey = DEFAULT_MODEL) {
  const model = getModel(modelKey);
  return `https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`;
}
// Transformers.js 4.3.1 tokenizer discovery requests main metadata even with revision set.
// Canonicalize those requests and their cache lookups to the pinned revision.
export function pinnedModelUrl(value) {
  const url = value instanceof Request ? value.url : String(value);
  for (const model of MODELS) {
    const root = `https://huggingface.co/${model.id}/resolve/`;
    if (url.startsWith(root + 'main/')) return root + model.revision + url.slice((root + 'main').length);
  }
  return url;
}
export function metrics(tokens, started, first, ended) {
  return { tokens, elapsedMs: ended - started, ttftMs: first === null ? null : first - started,
    tokensPerSecond: tokens / ((ended - started) / 1000),
    decodeTokensPerSecond: tokens > 1 && ended > first ? (tokens - 1) / ((ended - first) / 1000) : null };
}
