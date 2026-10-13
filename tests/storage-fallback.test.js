import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openModelStore } from '../src/model-storage.js';
import { downloadModel } from '../src/download.js';
import { modelFiles, modelFileUrl } from '../src/config.js';

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

test('healthy legacy Cache API files are reused without rewriting or downloading', async () => {
  const original = globalThis.caches;
  const saved = new Map(modelFiles('q4f16').map(file => [modelFileUrl(file), new Response('legacy-file')]));
  globalThis.caches = { open: async () => ({
    match: async key => saved.get(key)?.clone(),
    keys: async () => [...saved.keys()].map(url => new Request(url)),
  }) };
  let store;
  try {
    store = await openModelStore();
    store.put = () => { throw new Error('Legacy files must not be rewritten'); };
    await downloadModel(store, 'q4f16', () => {}, () => { throw new Error('Legacy files must not be downloaded'); });
    const response = await store.match(modelFileUrl('onnx/model_q4f16.onnx'));
    assert.equal(response.storageBackend, 'legacy-cache');
    assert.equal(await response.text(), 'legacy-file');
  } finally { store?.close(); globalThis.caches = original; }
});
