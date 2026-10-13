import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics } from '../src/config.js';
test('end-to-end speed includes first token latency; decode speed excludes it', () => {
  assert.deepEqual(metrics(11, 0, 1000, 2000), { tokens: 11, elapsedMs: 2000, ttftMs: 1000, tokensPerSecond: 5.5, decodeTokensPerSecond: 10 });
});
test('no token and single token produce no decode speed', () => {
  assert.equal(metrics(0, 0, null, 500).ttftMs, null);
  assert.equal(metrics(1, 0, 500, 500).decodeTokensPerSecond, null);
});
