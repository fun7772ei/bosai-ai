export const MODEL_DB = 'bosai-ai-model-chunks-v1';
export const CHUNK_BYTES = 4 * 1024 * 1024;
const writes = new Map();

// Web Locks serialize tabs/workers too. The fallback serializes this JS realm.
function exclusive(name, action) {
  if (globalThis.navigator?.locks) return navigator.locks.request(name, action);
  const next = (writes.get(name) || Promise.resolve()).catch(() => {}).then(action);
  writes.set(name, next);
  return next.finally(() => { if (writes.get(name) === next) writes.delete(name); });
}

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
    let requestError;
    tx.onerror = event => { requestError = event.target.error; };
    tx.onabort = () => reject(tx.error || requestError || new Error('IndexedDB transaction failed'));
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
  const lock = `bosai-ai-model-write:${name}`;
  // Old records use [url, index]; new records use [url, generation, index].
  // Keep the database version and both formats readable without deleting saves.
  const range = url => IDBKeyRange.bound([url], [url, []]);
  const key = (file, index) => file.generation ? [file.url, file.generation, index] : [file.url, index];
  const generationRange = file => file.generation
    ? IDBKeyRange.bound(key(file, 0), key(file, Number.MAX_SAFE_INTEGER))
    : IDBKeyRange.bound([file.url, 0], [file.url, Number.MAX_SAFE_INTEGER]);
  async function metadata(url) {
    const tx = db.transaction(['files', 'chunks']);
    const file = await requestValue(tx.objectStore('files').get(url));
    if (!file || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !Number.isSafeInteger(file.chunks) || file.chunks <= 0) return undefined;
    // A new transaction after await avoids Safari's transaction auto-commit.
    const keys = await requestValue(db.transaction('chunks').objectStore('chunks').getAllKeys(generationRange(file)));
    if (keys.length !== file.chunks || keys.some((item, index) => JSON.stringify(item) !== JSON.stringify(key(file, index)))) return undefined;
    if (file.chunkBytes && Math.ceil(file.bytes / file.chunkBytes) !== file.chunks) return undefined;
    return file;
  }
  // Remove abandoned generations on an explicit retry, retaining the committed
  // file. Do not clear the database when the app starts or updates.
  async function removeAbandoned(url, committed) {
    await write(db, ['chunks'], tx => {
      const request = tx.objectStore('chunks').openKeyCursor(range(url));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const keep = committed && (committed.generation
          ? cursor.key[1] === committed.generation
          : cursor.key.length === 2 && typeof cursor.key[1] === 'number');
        if (!keep) tx.objectStore('chunks').delete(cursor.primaryKey);
        cursor.continue();
      };
    });
  }
  return {
    close: () => db.close(),
    async delete(url) { await exclusive(lock, () => write(db, ['files', 'chunks'], tx => { tx.objectStore('files').delete(String(url)); tx.objectStore('chunks').delete(range(String(url))); })); },
    async keys() { return (await requestValue(db.transaction('files').objectStore('files').getAll())).map(file => new Request(file.url)); },
    async clear() { await exclusive(lock, () => write(db, ['files', 'chunks'], tx => { tx.objectStore('files').clear(); tx.objectStore('chunks').clear(); })); },
    async match(url) {
      url = String(url);
      const file = await metadata(url);
      if (!file) return undefined;
      let index = 0, received = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            if (index === file.chunks) {
              if (received !== file.bytes) throw new Error(`保存データのサイズが一致しません: ${url}`);
              controller.close(); return;
            }
            const position = index++;
            const chunk = await requestValue(db.transaction('chunks').objectStore('chunks').get(key(file, position)));
            if (!(chunk instanceof Uint8Array) || !chunk.byteLength) throw new Error(`保存データが不足しています: ${url}`);
            if (file.chunkBytes && chunk.byteLength !== Math.min(file.chunkBytes, file.bytes - position * file.chunkBytes)) throw new Error(`保存データのサイズが一致しません: ${url}`);
            received += chunk.byteLength;
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
      return exclusive(lock, async () => {
        if (!response.ok || !response.body) throw new Error('保存するレスポンスがありません');
        const committed = await requestValue(db.transaction('files').objectStore('files').get(url));
        await removeAbandoned(url, committed);
        const generation = crypto.randomUUID();
        const candidate = { url, generation };
        const reader = response.body.getReader();
        const expected = response.headers.has('content-encoding') ? null : response.headers.get('content-length');
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
                await write(db, ['chunks'], tx => tx.objectStore('chunks').put(buffer, key(candidate, current)));
                used = 0;
              }
            }
          }
          if (!bytes || (expected !== null && Number(expected) !== bytes)) throw new Error(`取得サイズが一致しません: ${url}（予定 ${expected ?? '不明'} / 取得 ${bytes} bytes）`);
          if (used) await write(db, ['chunks'], tx => tx.objectStore('chunks').put(buffer.slice(0, used), key(candidate, index++)));
          buffer = null;
          const headers = new Headers(response.headers);
          headers.delete('content-encoding'); headers.set('content-length', String(bytes));
          // A file is visible only after every chunk transaction has committed.
          await write(db, ['files', 'chunks'], tx => {
            tx.objectStore('files').put({ ...candidate, chunks: index, bytes, chunkBytes, headers: [...headers] });
            if (committed) tx.objectStore('chunks').delete(generationRange(committed));
          });
        } catch (error) {
          await reader.cancel().catch(() => {});
          await write(db, ['chunks'], tx => tx.objectStore('chunks').delete(generationRange(candidate))).catch(() => {});
          throw error;
        } finally { reader.releaseLock(); }
      });
    },
  };
}
