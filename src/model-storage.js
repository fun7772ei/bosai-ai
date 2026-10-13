import { modelFiles, modelFileUrl, MODEL_CACHE, pinnedModelUrl } from './config.js';
import { openChunkStore } from './chunk-store.js';

export async function openModelStore() {
  const chunks = await openChunkStore();
  let legacy;
  try { legacy = await caches.open(MODEL_CACHE); } catch {}
  return {
    close: chunks.close,
    async match(key) {
      key = pinnedModelUrl(key);
      const saved = await chunks.match(key);
      if (saved) return saved;
      // Keep working files from the previous release, but tolerate Safari's
      // Cache API Internal error instead of making the new store unusable.
      try {
        const response = await legacy?.match(key, { ignoreVary: true });
        if (response) response.storageBackend = 'legacy-cache';
        return response;
      } catch { return undefined; }
    },
    put: (key, response) => chunks.put(pinnedModelUrl(key), response),
    async keys() {
      const result = new Map((await chunks.keys()).map(key => [key.url, key]));
      try { for (const key of await legacy?.keys() || []) if (!result.has(key.url)) result.set(key.url, key); } catch {}
      return [...result.values()];
    },
    async clear() { await chunks.clear(); await caches.delete(MODEL_CACHE); },
  };
}

export async function modelStorageStatus(cache, dtype) {
  const missing = [], present = [], details = [];
  for (const file of modelFiles(dtype)) {
    const response = await cache.match(modelFileUrl(file), { ignoreVary: true });
    if (response) {
      present.push(file);
      details.push({ file, backend: response.storageBackend || 'unknown', bytes: response.storedBytes ?? (Number(response.headers.get('content-length')) || null), chunks: response.storedChunks || null });
    }
    else missing.push(file);
  }
  return { dtype, present, missing, details, complete: missing.length === 0 };
}

export function selectStoredDtype(selected, statuses) {
  if (statuses.some(item => item.dtype === selected && item.complete)) return selected;
  const complete = statuses.filter(item => item.complete);
  return complete.length === 1 ? complete[0].dtype : selected;
}
