import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, pinnedModelUrl, REVISION } from '../src/config.js';
test('end-to-end speed includes first token latency; decode speed excludes it', () => {
  assert.deepEqual(metrics(11, 0, 1000, 2000), { tokens: 11, elapsedMs: 2000, ttftMs: 1000, tokensPerSecond: 5.5, decodeTokensPerSecond: 10 });
});
test('no token and single token produce no decode speed', () => {
  assert.equal(metrics(0, 0, null, 500).ttftMs, null);
  assert.equal(metrics(1, 0, 500, 500).decodeTokensPerSecond, null);
});
test('tokenizer discovery uses the fixed revision online and offline', () => {
  const root = 'https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/resolve/';
  assert.equal(pinnedModelUrl(root + 'main/tokenizer_config.json'), root + REVISION + '/tokenizer_config.json');
  assert.equal(pinnedModelUrl(root + REVISION + '/tokenizer.json'), root + REVISION + '/tokenizer.json');
  assert.equal(pinnedModelUrl('https://example.org/main/config.json'), 'https://example.org/main/config.json');
});
