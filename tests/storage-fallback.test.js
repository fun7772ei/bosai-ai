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

test('healthy legacy files remain reusable and are not rewritten on app startup', async () => {
  const original = globalThis.caches;
  let writes = 0, deletes = 0;
  globalThis.caches = {
    open: async () => ({ match: async () => new Response('legacy'), keys: async () => [], put: async () => writes++ }),
    delete: async () => deletes++,
  };
  let store;
  try {
    store = await openModelStore();
    const response = await store.match('https://example.org/legacy.json');
    assert.equal(response.storageBackend, 'legacy-cache');
    assert.equal(await response.text(), 'legacy');
    assert.equal(writes, 0); assert.equal(deletes, 0);
  } finally { store?.close(); globalThis.caches = original; }
});
