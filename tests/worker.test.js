import test from 'node:test';
import assert from 'node:assert/strict';
import { workerError } from '../src/worker-errors.js';
import { bootWorker } from '../src/worker-bootstrap.js';
import { createWorkerClient } from '../src/worker-client.js';

test('Safari empty and non-enumerable ErrorEvents produce useful JSON', () => {
  const event = Object.create({ message: 'script failed', filename: 'worker.js', lineno: 3, colno: 8 });
  const error = JSON.parse(JSON.stringify(workerError(event, { stage: 'Worker起動' })));
  assert.equal(error.message, 'script failed');
  assert.equal(error.filename, 'worker.js');
  assert.equal(error.lineno, 3);
  assert.equal(error.colno, 8);
  assert.match(workerError({}).message, /詳細を取得できません/);
});

test('module import errors are reported and readiness requires successful evaluation', async () => {
  const messages = [], target = { postMessage: data => messages.push(data) };
  await bootWorker('download', { download: async () => { throw new SyntaxError('dependency failed'); } }, target);
  assert.equal(messages[0].type, 'error');
  assert.equal(messages[0].name, 'SyntaxError');
  assert.equal(messages[0].stage, 'Workerモジュールの読み込み');
  assert.equal(messages[0].message, 'dependency failed');
  await bootWorker('download', { download: async () => {} }, target);
  assert.equal(messages[1].type, 'worker-ready');
});

function fixture() {
  const sent = [], received = [], failures = [];
  let terminated = false;
  const raw = { postMessage: data => sent.push(data), terminate: () => { terminated = true; } };
  return { raw, sent, received, failures, get terminated() { return terminated; } };
}

test('work waits for ready and reset ignores late messages', () => {
  const f = fixture();
  const client = createWorkerClient(() => f.raw, 'download', event => f.received.push(event.data), error => f.failures.push(error));
  client.postMessage({ dtype: 'q4f16' });
  assert.deepEqual(f.sent, [{ kind: 'download' }]);
  f.raw.onmessage({ data: { type: 'worker-ready' } });
  assert.deepEqual(f.sent[1], { dtype: 'q4f16' });
  client.terminate();
  f.raw.onmessage({ data: { type: 'downloaded' } });
  assert.equal(f.received.length, 1);
  assert.equal(f.terminated, true);
});

test('missing Worker startup response fails once and terminates', async () => {
  const f = fixture();
  await new Promise(resolve => {
    createWorkerClient(() => f.raw, 'download', () => {}, error => { f.failures.push(error); resolve(); }, 5);
  });
  f.raw.onerror({});
  assert.equal(f.failures.length, 1);
  assert.equal(f.failures[0].stage, 'Worker起動待ち');
  assert.equal(f.terminated, true);
});

test('synchronous creation and message decoding failures are recoverable', () => {
  assert.throws(() => createWorkerClient(() => { throw new Error('constructor failed'); }, 'download', () => {}, () => {}), /constructor failed/);
  const f = fixture();
  createWorkerClient(() => f.raw, 'download', () => {}, error => f.failures.push(error));
  f.raw.onmessageerror({});
  assert.equal(f.failures[0].stage, 'Workerメッセージの受信');
  assert.match(f.failures[0].message, /詳細を取得できません/);
  assert.equal(f.terminated, true);
});

test('CPU shutdown waits for child-worker disposal and suppresses late generation', async () => {
  const f = fixture();
  const client = createWorkerClient(() => f.raw, 'cpu-inference', event => f.received.push(event.data), error => f.failures.push(error));
  f.raw.onmessage({ data: { type: 'worker-ready' } });
  const disposed = client.shutdown();
  assert.deepEqual(f.sent.at(-1), { type: 'dispose' });
  assert.equal(f.terminated, false);
  f.raw.onmessage({ data: { type: 'complete' } });
  assert.equal(f.received.length, 1);
  f.raw.onmessage({ data: { type: 'disposed' } });
  await disposed;
  assert.equal(f.terminated, true);
});
