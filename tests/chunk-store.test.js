import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openChunkStore } from '../src/chunk-store.js';

test('model chunks survive database close and reopen with exact bytes', async () => {
  const name = 'chunks-reopen-test', url = 'https://example.org/model.onnx';
  let store = await openChunkStore(name, 4);
  await store.put(url, new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])));
  store.close(); store = await openChunkStore(name, 4);
  const response = await store.match(url);
  assert.equal(response.storedChunks, 3);
  assert.equal(response.headers.get('content-length'), '10');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  await store.clear(); assert.equal(await store.match(url), undefined); store.close();
});
test('failed streams never appear as completed files, and can be retried', async () => {
  const store = await openChunkStore('chunks-incomplete-test', 4), url = 'https://example.org/model.onnx';
  let pulls = 0;
  await assert.rejects(store.put(url, new Response(new ReadableStream({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(new Uint8Array([1, 2, 3, 4, 5]));
    else controller.error(new Error('download interrupted'));
  } }))), /download interrupted/);
  assert.equal(await store.match(url), undefined);
  assert.deepEqual(await store.keys(), []);
  await store.put(url, new Response('replacement'));
  assert.equal(await (await store.match(url)).text(), 'replacement');
  store.close();
});

async function mutate(name, action) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['files', 'chunks'], 'readwrite');
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    action(tx);
  });
  db.close();
}

test('truncated or empty downloads never publish completion, successful siblings remain', async () => {
  const store = await openChunkStore('truncated-test', 4);
  const good = 'https://example.org/config.json', bad = 'https://example.org/model.onnx';
  await store.put(good, new Response('config'));
  await assert.rejects(store.put(bad, new Response('short', { headers: { 'content-length': '10' } })), /サイズ/);
  await assert.rejects(store.put(bad, new Response('')), /サイズ/);
  assert.equal(await store.match(bad), undefined);
  assert.equal(await (await store.match(good)).text(), 'config');
  store.close();
});

test('missing chunks invalidate completion without deleting data; wrong sizes fail streaming read', async () => {
  const name = 'corrupt-test', url = 'https://example.org/model.onnx';
  const store = await openChunkStore(name, 4);
  await store.put(url, new Response('0123456789'));
  await mutate(name, tx => tx.objectStore('chunks').delete([url, 1]));
  assert.equal(await store.match(url), undefined);
  await store.put(url, new Response('0123456789'));
  await mutate(name, tx => tx.objectStore('chunks').put(new Uint8Array([1]), [url, 1]));
  await assert.rejects((await store.match(url)).arrayBuffer(), /サイズ/);
  store.close();
});

test('hard termination leftovers without a manifest remain invisible and retry removes them', async () => {
  const name = 'orphan-test', url = 'https://example.org/model.onnx';
  const store = await openChunkStore(name, 4);
  await mutate(name, tx => tx.objectStore('chunks').put(new Uint8Array(4), [url, 50]));
  store.close();
  const reopened = await openChunkStore(name, 4);
  assert.equal(await reopened.match(url), undefined);
  await reopened.put(url, new Response('retry'));
  assert.equal(await (await reopened.match(url)).text(), 'retry');
  reopened.close();
});

test('aborted chunk and manifest transactions reject and permit retry', async () => {
  const original = IDBDatabase.prototype.transaction;
  for (const failingStore of ['chunks', 'files']) {
    const store = await openChunkStore(`abort-${failingStore}`, 4);
    let writes = 0;
    IDBDatabase.prototype.transaction = function(names, mode, ...rest) {
      const tx = original.call(this, names, mode, ...rest);
      // Skip initial remove, then abort either a chunk or completion write.
      if (mode === 'readwrite' && ++writes > 1 && names.length === 1 && names[0] === failingStore) {
        queueMicrotask(() => tx.abort());
      }
      return tx;
    };
    try {
      await assert.rejects(store.put('https://example.org/model.onnx', new Response('01234567')), /transaction failed/);
      assert.equal(await store.match('https://example.org/model.onnx'), undefined);
    } finally { IDBDatabase.prototype.transaction = original; }
    await store.put('https://example.org/model.onnx', new Response('retry'));
    assert.equal(await (await store.match('https://example.org/model.onnx')).text(), 'retry');
    store.close();
  }
});

test('previous v1 manifests remain readable without a migration or clearing', async () => {
  const name = 'compat-test', url = 'https://example.org/model.onnx';
  const store = await openChunkStore(name, 4);
  await mutate(name, tx => {
    tx.objectStore('chunks').put(new Uint8Array([1, 2, 3]), [url, 0]);
    tx.objectStore('files').put({ url, bytes: 3, chunks: 1, headers: [['content-length', '3']] });
  });
  assert.deepEqual([...new Uint8Array(await (await store.match(url)).arrayBuffer())], [1, 2, 3]);
  store.close();
});
