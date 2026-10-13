import { workerError } from './worker-errors.js';

export function createWorkerClient(factory, kind, onMessage, onFailure, timeoutMs = 30000) {
  let raw, started = false, ended = false;
  const pending = [];
  let timer;
  const client = {
    postMessage(data) {
      if (ended) return;
      try { if (started) raw.postMessage(data); else pending.push(data); }
      catch (error) { fail(error, 'Workerメッセージの送信'); }
    },
    terminate() { ended = true; clearTimeout(timer); pending.length = 0; raw?.terminate(); },
  };
  const fail = (error, stage) => {
    if (ended) return;
    client.terminate();
    onFailure(workerError(error, { kind, stage }));
  };
  try {
    raw = factory();
    raw.onerror = event => { event.preventDefault?.(); fail(event, started ? 'Worker実行' : 'Worker起動'); };
    raw.onmessageerror = event => fail(event, 'Workerメッセージの受信');
    raw.onmessage = event => {
      if (ended) return;
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
