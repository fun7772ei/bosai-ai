export const MODEL_DB = 'bosai-ai-model-chunks-v1';
export const CHUNK_BYTES = 4 * 1024 * 1024;

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function write(db, stores, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    try { action(tx); } catch (error) { tx.abort(); reject(error); }
  });
}

export async function openChunkStore(name = MODEL_DB, chunkBytes = CHUNK_BYTES) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error('Invalid chunk size');
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('files', { keyPath: 'url' });
    request.result.createObjectStore('chunks');
  };
  const db = await requestValue(request);
  db.onversionchange = () => db.close();
  const range = url => IDBKeyRange.bound([url, 0], [url, Number.MAX_SAFE_INTEGER]);
  const remove = url => write(db, ['files', 'chunks'], tx => {
    tx.objectStore('files').delete(url);
    tx.objectStore('chunks').delete(range(url));
  });
  return {
    close: () => db.close(),
    async keys() { return (await requestValue(db.transaction('files').objectStore('files').getAll())).map(file => new Request(file.url)); },
    async clear() { await write(db, ['files', 'chunks'], tx => { tx.objectStore('files').clear(); tx.objectStore('chunks').clear(); }); },
    async match(url) {
      url = String(url);
      const file = await requestValue(db.transaction('files').objectStore('files').get(url));
      if (!file) return undefined;
      // Count keys without loading hundreds of MB just to inspect saved state.
      const count = await requestValue(db.transaction('chunks').objectStore('chunks').count(range(url)));
      if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 ||
          !Number.isSafeInteger(file.chunks) || file.chunks <= 0 || count !== file.chunks) return undefined;
      let index = 0, readBytes = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            if (index === file.chunks) {
              if (readBytes !== file.bytes) throw new Error(`保存サイズが一致しません: ${url}`);
              controller.close(); return;
            }
            const chunk = await requestValue(db.transaction('chunks').objectStore('chunks').get([url, index++]));
            if (!chunk) throw new Error(`保存データが不足しています: ${url}`);
            readBytes += chunk.byteLength;
            const expected = file.chunkBytes && Math.min(file.chunkBytes, file.bytes - (index - 1) * file.chunkBytes);
            if (readBytes > file.bytes || (expected && chunk.byteLength !== expected)) {
              throw new Error(`保存分割のサイズが一致しません: ${url}`);
            }
            controller.enqueue(chunk);
          } catch (error) { controller.error(error); }
        },
      }, { highWaterMark: 0 }); // Existence/metadata checks must not pre-read model chunks.
      const response = new Response(stream, { status: 200, headers: file.headers });
      response.storageBackend = 'indexeddb-chunks';
      response.storedBytes = file.bytes;
      response.storedChunks = file.chunks;
      return response;
    },
    async put(url, response) {
      url = String(url);
      if (!response.ok || !response.body) throw new Error('保存可能なレスポンスがありません');
      const length = response.headers.get('content-length');
      const expectedBytes = !response.headers.has('content-encoding') && length !== null ? Number(length) : null;
      if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0)) {
        throw new Error('ダウンロードサイズが不正です');
      }
      await remove(url); // Only this URL's partial data; never clear unrelated saved models.
      const reader = response.body.getReader();
      let buffer = new Uint8Array(chunkBytes), used = 0, index = 0, bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          let offset = 0;
          while (offset < value.byteLength) {
            const count = Math.min(chunkBytes - used, value.byteLength - offset);
            buffer.set(value.subarray(offset, offset + count), used); used += count; offset += count; bytes += count;
            if (used === chunkBytes) {
              const current = index++;
              await write(db, ['chunks'], tx => tx.objectStore('chunks').put(buffer, [url, current]));
              used = 0;
            }
          }
        }
        if (!bytes || (expectedBytes !== null && bytes !== expectedBytes)) {
          throw new Error(`ダウンロードサイズが一致しません: expected=${expectedBytes}, received=${bytes}`);
        }
        if (used) await write(db, ['chunks'], tx => tx.objectStore('chunks').put(buffer.slice(0, used), [url, index++]));
        buffer = null;
        const headers = new Headers(response.headers);
        headers.delete('content-encoding'); headers.set('content-length', String(bytes));
        // A file is visible only after every chunk transaction has committed.
        await write(db, ['files'], tx => tx.objectStore('files').put({ url, chunks: index, bytes, chunkBytes, headers: [...headers] }));
      } catch (error) {
        await reader.cancel().catch(() => {});
        await remove(url).catch(() => {});
        throw error;
      } finally { reader.releaseLock(); }
    },
  };
}
