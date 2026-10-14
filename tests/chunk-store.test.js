import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openChunkStore } from '../src/chunk-store.js';
import { IDBObjectStore } from 'fake-indexeddb';

const url = 'https://example.org/model.onnx';
const value = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function edit(name, action) {
  const db = await value(indexedDB.open(name, 1));
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['files', 'chunks'], 'readwrite');
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      action(tx);
    });
  } finally { db.close(); }
}

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

test('declared-length mismatch and empty bodies never commit, preserving previous save', async () => {
  const store = await openChunkStore('length-validation', 4);
  await store.put(url, new Response('original'));
  await assert.rejects(store.put(url, new Response('short', { headers: { 'content-length': '10' } })), /取得サイズが一致/);
  assert.equal(await (await store.match(url)).text(), 'original');
  await assert.rejects(store.put(url, new Response('')), /取得サイズが一致/);
  assert.equal(await (await store.match(url)).text(), 'original');
  await store.put(url, new Response('new'));
  assert.equal(await (await store.match(url)).text(), 'new');
  store.close();
});

for (const failedStore of ['chunks', 'files']) {
  test(`transaction abort after ${failedStore} put succeeds does not publish or delete prior save`, async () => {
    const name = `abort-${failedStore}`, store = await openChunkStore(name, 4);
    await store.put(url, new Response('original'));
    const originalPut = IDBObjectStore.prototype.put;
    let injected = false;
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      if (!injected && this.name === failedStore && this.transaction.db.name === name) {
        injected = true;
        request.addEventListener('success', () => this.transaction.abort());
      }
      return request;
    };
    try {
      await assert.rejects(store.put(url, new Response('replacement')), error => error.name === 'AbortError' || /transaction failed/.test(error.message));
      assert.equal(injected, true);
      assert.equal(await (await store.match(url)).text(), 'original');
    } finally { IDBObjectStore.prototype.put = originalPut; }
    await store.put(url, new Response('retry'));
    assert.equal(await (await store.match(url)).text(), 'retry');
    store.close();
  });
}

test('missing or non-sequential chunk keys invalidate completion without reading weights', async () => {
  const name = 'missing-chunk', store = await openChunkStore(name, 4);
  await store.put(url, new Response('abcdefghij'));
  await edit(name, tx => {
    const request = tx.objectStore('files').get(url);
    request.onsuccess = () => {
      const generation = request.result.generation;
      tx.objectStore('chunks').delete([url, generation, 1]);
      tx.objectStore('chunks').put(new Uint8Array([5, 6, 7, 8]), [url, generation, 9]);
    };
  });
  const originalGet = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (...args) {
    if (this.name === 'chunks') throw new Error('Metadata checks must not read model bytes');
    return originalGet.apply(this, args);
  };
  try { assert.equal(await store.match(url), undefined); }
  finally { IDBObjectStore.prototype.get = originalGet; }
  await store.put(url, new Response('repaired'));
  assert.equal(await (await store.match(url)).text(), 'repaired');
  store.close();
});

test('wrong chunk byte size fails during reading rather than silently returning truncated data', async () => {
  const name = 'wrong-chunk-size', store = await openChunkStore(name, 4);
  await store.put(url, new Response('abcdefgh'));
  await edit(name, tx => {
    const request = tx.objectStore('files').get(url);
    request.onsuccess = () => tx.objectStore('chunks').put(new Uint8Array([1]), [url, request.result.generation, 1]);
  });
  await assert.rejects((await store.match(url)).arrayBuffer(), /サイズが一致/);
  store.close();
});

test('old v1 records remain readable and abandoned chunks are cleaned only on retry', async () => {
  const name = 'legacy-chunk-layout', store = await openChunkStore(name, 4);
  await edit(name, tx => {
    tx.objectStore('files').put({ url, bytes: 4, chunks: 1, headers: [['content-length', '4']] });
    tx.objectStore('chunks').put(new Uint8Array([1, 2, 3, 4]), [url, 0]);
    tx.objectStore('chunks').put(new Uint8Array([9]), [url, 'abandoned', 0]);
  });
  store.close();
  const reopened = await openChunkStore(name, 4);
  assert.deepEqual([...new Uint8Array(await (await reopened.match(url)).arrayBuffer())], [1, 2, 3, 4]);
  await reopened.put(url, new Response('new-model'));
  const db = await value(indexedDB.open(name, 1));
  assert.equal(await value(db.transaction('chunks').objectStore('chunks').count()), 3);
  assert.equal(await (await reopened.match(url)).text(), 'new-model');
  db.close(); reopened.close();
});

test('simulated abrupt termination has no completion record and can be retried', async () => {
  const name = 'abandoned-download', store = await openChunkStore(name, 4);
  await edit(name, tx => tx.objectStore('chunks').put(new Uint8Array([1, 2, 3, 4]), [url, 'terminated-worker', 0]));
  assert.equal(await store.match(url), undefined);
  assert.deepEqual(await store.keys(), []);
  await store.put(url, new Response('retry'));
  assert.equal(await (await store.match(url)).text(), 'retry');
  const db = await value(indexedDB.open(name, 1));
  assert.equal(await value(db.transaction('chunks').objectStore('chunks').count()), 2);
  db.close(); store.close();
});

test('concurrent writes in one realm commit a single complete generation', async () => {
  const name = 'concurrent-writes', first = await openChunkStore(name, 4), second = await openChunkStore(name, 4);
  await Promise.all([first.put(url, new Response('first-model')), second.put(url, new Response('second-model'))]);
  assert.equal(await (await first.match(url)).text(), 'second-model');
  const db = await value(indexedDB.open(name, 1));
  assert.equal(await value(db.transaction('chunks').objectStore('chunks').count()), 3);
  db.close(); first.close(); second.close();
});

test('GGUF Blob reads exact saved chunks and rejects corruption without full arrayBuffer assembly', async () => {
  const name = 'blob-read', store = await openChunkStore(name, 4);
  await store.put(url, new Response('GGUFabcdefghij'));
  store.close();
  const reopened = await openChunkStore(name, 4);
  assert.equal(await (await reopened.blob(url)).text(), 'GGUFabcdefghij');
  await edit(name, tx => {
    const request = tx.objectStore('files').get(url);
    request.onsuccess = () => tx.objectStore('chunks').put(new Uint8Array([1]), [url, request.result.generation, 1]);
  });
  await assert.rejects(reopened.blob(url), /サイズが一致/);
  reopened.close();
});

test('quota failure cancels the source and preserves an existing completed file', async () => {
  const name = 'quota-failure', store = await openChunkStore(name, 4);
  await store.put(url, new Response('original'));
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); },
    cancel() { cancelled = true; },
  }));
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'chunks' && this.transaction.db.name === name) throw new DOMException('Storage full', 'QuotaExceededError');
    return originalPut.apply(this, args);
  };
  try {
    await assert.rejects(store.put(url, response), { name: 'QuotaExceededError' });
    assert.equal(cancelled, true);
    assert.equal(response.body.locked, false);
    assert.equal(await (await store.match(url)).text(), 'original');
  } finally { IDBObjectStore.prototype.put = originalPut; store.close(); }
});
