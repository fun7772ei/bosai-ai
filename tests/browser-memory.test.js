import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { browserMemory, browserRole } from '../scripts/browser-memory.mjs';

test('browser memory includes child processes even when task children files are unavailable', { skip: process.platform !== 'linux' }, async () => {
  const child = spawn(process.execPath, ['-e', "console.log('ready');setTimeout(()=>{},10000)"], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await once(child.stdout, 'data');
    const sample = browserMemory(process.pid);
    assert.equal(sample.complete, true);
    assert.ok(sample.processes >= 2, 'Root-only memory is not a browser tree measurement');
    assert.ok(sample.pssMiB > 0);
    assert.ok(sample.rssMiB >= sample.pssMiB);
  } finally { child.kill(); await once(child, 'exit'); }
});

test('renderer roles are recognized with both null-separated and space-separated proc command lines', () => {
  assert.equal(browserRole('chrome\0--type=renderer\0--no-sandbox'), 'renderer');
  assert.equal(browserRole('chrome --type=renderer --no-sandbox'), 'renderer');
  assert.equal(browserRole('chrome --remote-debugging-pipe', true), 'browser');
});
