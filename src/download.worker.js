import { MODEL_CACHE } from './config.js';
import { downloadModel } from './download.js';
self.onmessage = async ({ data }) => {
  try {
    const cache = await caches.open(MODEL_CACHE);
    await downloadModel(cache, data.dtype, progress => self.postMessage({ type: 'progress', progress }));
    self.postMessage({ type: 'downloaded' });
  } catch (error) { self.postMessage({ type: 'error', operation: 'download', message: error.message, stack: error.stack }); }
};
