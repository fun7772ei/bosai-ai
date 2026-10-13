import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openModelStore } from '../src/model-storage.js';

test('broken Safari legacy cache does not prevent saving and reusing IndexedDB models', async () => {
  const original = globalThis.caches;
  globalThis.caches = { open: async () => ({ match: async () => { throw new Error('Internal error'); }, keys: async () => { throw new Error('Internal error'); } }) };
  let store;
  try {
    store = await openModelStore();
    const url = 'https://example.org/model.onnx';
    assert.equal(await store.match(url), undefined);
    await store.put(url, new Response('saved-model'));
    store.close(); store = await openModelStore();
    const saved = await store.match(url);
    assert.equal(saved.storageBackend, 'indexeddb-chunks');
    assert.equal(await saved.text(), 'saved-model');
    assert.equal((await store.keys()).length, 1);
  } finally { store?.close(); globalThis.caches = original; }
});
