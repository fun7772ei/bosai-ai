export const DEFAULT_MODEL = 'qwen3';
// Keep legacy helper defaults/URLs stable; prefer LFM for new UI selections.
export const PREFERRED_MODEL = 'lfm2';
export const MODELS = Object.freeze([
  { key: 'lfm2-cpu', label: 'LFM2.5-350M（CPU/WASM比較）', id: 'LiquidAI/LFM2.5-350M-GGUF', revision: '657e078c94084481950a2d555a941481f715536b', engine: 'wllama-cpu', dtypes: ['q4_k_m'], file: 'LFM2.5-350M-Q4_K_M.gguf', weightBytes: { q4_k_m: 229312224 } },
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
