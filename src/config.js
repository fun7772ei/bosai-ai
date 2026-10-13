export const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX';
export const REVISION = '1e0a4a196ecabdf9a879664110574563d3f372d3';
export const MODEL_CACHE = 'bosai-ai-model-v1';
export function metrics(tokens, started, first, ended) {
  return { tokens, elapsedMs: ended - started, ttftMs: first === null ? null : first - started,
    tokensPerSecond: tokens / ((ended - started) / 1000),
    decodeTokensPerSecond: tokens > 1 && ended > first ? (tokens - 1) / ((ended - first) / 1000) : null };
}
