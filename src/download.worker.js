import { openModelStore } from './model-storage.js';
import { downloadModel } from './download.js';
self.onmessage = async ({ data }) => {
  let cache;
  try {
    cache = await openModelStore();
    await downloadModel(cache, data.dtype, progress => self.postMessage({ type: 'progress', progress }));
    self.postMessage({ type: 'downloaded' });
  } catch (error) { self.postMessage({ type: 'error', operation: 'download', message: error.message, stack: error.stack }); }
  finally { cache?.close(); }
};
