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
