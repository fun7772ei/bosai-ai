import { openModelStore } from './model-storage.js';
import { downloadModel } from './download.js';
import { workerError } from './worker-errors.js';
self.onmessage = async ({ data }) => {
  let cache;
  let stage = '保存領域の確認';
  try {
    self.postMessage({ type: 'stage', stage });
    cache = await openModelStore();
    await downloadModel(cache, data.dtype, progress => {
      if (progress.status === 'initiate') stage = `ダウンロード・保存: ${progress.file}`;
      self.postMessage({ type: 'progress', progress });
    }, fetch, data.modelKey);
    self.postMessage({ type: 'downloaded' });
  } catch (error) { self.postMessage({ type: 'error', ...workerError(error, { operation: 'download', stage }) }); }
  finally { cache?.close(); }
};
