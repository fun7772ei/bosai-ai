export const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX';
export const REVISION = '1e0a4a196ecabdf9a879664110574563d3f372d3';
export const MODEL_CACHE = 'bosai-ai-model-v1';
export function modelFiles(dtype) {
  if (!['q4f16', 'q4'].includes(dtype)) throw new Error('Unsupported dtype');
  return ['tokenizer_config.json', 'tokenizer.json', 'config.json', 'generation_config.json', `onnx/model_${dtype}.onnx`];
}
export const modelFileUrl = file => `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${file}`;
// Transformers.js 4.3.1 tokenizer discovery requests main metadata even with revision set.
// Canonicalize those requests and their cache lookups to the pinned revision.
export function pinnedModelUrl(value) {
  const url = value instanceof Request ? value.url : String(value);
  return url.replace(`https://huggingface.co/${MODEL_ID}/resolve/main/`, `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`);
}
export function metrics(tokens, started, first, ended) {
  return { tokens, elapsedMs: ended - started, ttftMs: first === null ? null : first - started,
    tokensPerSecond: tokens / ((ended - started) / 1000),
    decodeTokensPerSecond: tokens > 1 && ended > first ? (tokens - 1) / ((ended - first) / 1000) : null };
}
