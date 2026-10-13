import { workerError } from './worker-errors.js';

export async function bootWorker(kind, loaders, target = self) {
  try {
    if (!loaders[kind]) throw new Error(`Unknown worker: ${kind}`);
    await loaders[kind]();
    target.postMessage({ type: 'worker-ready', kind });
  } catch (error) {
    target.postMessage({ type: 'error', ...workerError(error, { operation: kind, stage: 'Workerモジュールの読み込み' }) });
  }
}
