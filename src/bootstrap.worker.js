import { bootWorker } from './worker-bootstrap.js';

// Catch dependency/module evaluation failures before the operation handler exists.
// Send actual work only after the imported module has installed its handler.
self.onmessage = ({ data }) => bootWorker(data.kind, {
  download: () => import('./download.worker.js'),
  inference: () => import('./ai.worker.js'),
});
