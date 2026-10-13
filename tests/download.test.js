import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadModel } from '../src/download.js';
import { modelFiles } from '../src/config.js';
import 'fake-indexeddb/auto';
import { openChunkStore } from '../src/chunk-store.js';

test('download streams each file into cache and reuses completed files', async () => {
  const saved = new Map(), reports = []; let fetches = 0;
  const cache = {
    match: async key => saved.get(key),
    put: async (key, response) => {
      const reader = response.body.getReader(); let bytes = 0;
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; }
      assert.equal(bytes, 6); saved.set(key, new Response('stored'));
    },
  };
  const fetcher = async () => {
    fetches++;
    let n = 0;
    const response = new Response(new ReadableStream({ pull(controller) {
      if (n++ < 3) controller.enqueue(new Uint8Array([1, 2])); else controller.close();
    } }), { headers: { 'content-length': '6' } });
    response.arrayBuffer = () => { throw new Error('Must not buffer the model'); };
    response.clone = () => { throw new Error('Must not tee the model'); };
    return response;
  };
  await downloadModel(cache, 'q4f16', p => reports.push(p), fetcher);
  assert.equal(fetches, modelFiles('q4f16').length);
  assert.equal(reports.filter(p => p.status === 'done').length, 5);
  await downloadModel(cache, 'q4f16', () => {}, fetcher);
  assert.equal(fetches, 5);
});

test('compressed transfer length is not mistaken for decoded model size', async () => {
  const cache = await openChunkStore('compressed-transfer', 4);
  try {
    await downloadModel(cache, 'q4f16', () => {}, async () => new Response('decoded', { headers: { 'content-encoding': 'gzip', 'content-length': '2' } }));
    const response = await cache.match((await cache.keys())[0].url);
    assert.equal(response.headers.get('content-length'), '7');
    assert.equal(response.headers.has('content-encoding'), false);
    assert.equal(await response.text(), 'decoded');
  } finally { cache.close(); }
});
test('storage failure is surfaced and stops later downloads', async () => {
  let fetched = 0;
  await assert.rejects(downloadModel({ match: async () => undefined, put: async () => { throw new Error('QuotaExceeded'); } }, 'q4f16', () => {}, async () => { fetched++; return new Response('bytes'); }), /QuotaExceeded/);
  assert.equal(fetched, 1);
});
