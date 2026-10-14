import { workerError } from './worker-errors.js';

export function createWorkerClient(factory, kind, onMessage, onFailure, timeoutMs = 30000) {
  let raw, started = false, ended = false;
  const pending = [];
  let timer;
  let closing = false, closeTimer, closePromise, closeResolve;
  const client = {
    postMessage(data) {
      if (ended || closing) return;
      try { if (started) raw.postMessage(data); else pending.push(data); }
      catch (error) { fail(error, 'Workerメッセージの送信'); }
    },
    terminate() { ended = true; clearTimeout(timer); clearTimeout(closeTimer); pending.length = 0; raw?.terminate(); closeResolve?.(); },
    shutdown() {
      if (ended) return Promise.resolve();
      if (!started) { client.terminate(); return Promise.resolve(); }
      if (closePromise) return closePromise;
      closing = true;
      closePromise = new Promise(resolve => { closeResolve = resolve; });
      closeTimer = setTimeout(() => client.terminate(), 5000);
      try { raw.postMessage({ type: 'dispose' }); } catch { client.terminate(); }
      return closePromise;
    },
  };
  const fail = (error, stage) => {
    if (ended) return;
    const wasClosing = closing;
    client.terminate();
    if (wasClosing) return;
    onFailure(workerError(error, { kind, stage }));
  };
  try {
    raw = factory();
    raw.onerror = event => { event.preventDefault?.(); fail(event, started ? 'Worker実行' : 'Worker起動'); };
    raw.onmessageerror = event => fail(event, 'Workerメッセージの受信');
    raw.onmessage = event => {
      if (ended) return;
      if (closing) { if (event.data.type === 'disposed') client.terminate(); return; }
      if (event.data.type === 'worker-ready') {
        started = true; clearTimeout(timer);
        onMessage(event);
        for (const data of pending.splice(0)) client.postMessage(data);
      } else onMessage(event);
    };
    timer = setTimeout(() => fail(new Error('Workerの起動応答が30秒以内にありません。保存を削除せず、ページを再読み込みして診断JSONを保存してください。'), 'Worker起動待ち'), timeoutMs);
    raw.postMessage({ kind });
  } catch (error) {
    client.terminate();
    throw error;
  }
  return client;
}
