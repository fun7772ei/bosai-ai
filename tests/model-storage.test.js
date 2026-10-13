import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFiles, modelFileUrl } from '../src/config.js';
import { modelStorageStatus, selectStoredDtype } from '../src/model-storage.js';

test('q4 saved files are not mistaken for missing q4f16 after reload', async () => {
  const keys = new Set(modelFiles('q4').map(file => modelFileUrl(file)));
  const cache = { match: async key => keys.has(key) ? new Response('fixture') : undefined };
  const q4 = await modelStorageStatus(cache, 'q4');
  const q4f16 = await modelStorageStatus(cache, 'q4f16');
  assert.equal(q4.complete, true);
  assert.deepEqual(q4f16.missing, ['onnx/model_q4f16.onnx']);
  assert.equal(selectStoredDtype('q4f16', [q4f16, q4]), 'q4');
});
test('keep a valid selected format and never claim an incomplete cache is usable', () => {
  assert.equal(selectStoredDtype('q4f16', [{ dtype: 'q4f16', complete: true }, { dtype: 'q4', complete: true }]), 'q4f16');
  assert.equal(selectStoredDtype('q4f16', [{ dtype: 'q4f16', complete: false }, { dtype: 'q4', complete: false }]), 'q4f16');
});
