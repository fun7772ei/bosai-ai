/**
 * Fetch a pinned copy of Moonshine's browser SDK from npm at build time.
 * The default WASM build requires cross-origin isolation. Hosting its compiled
 * modules next to the app avoids cross-origin Safari worker imports.
 * Model weights are not included; Moonshine downloads them on user request.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const version = '0.1.5';
const out = 'node_modules/.cache/bosai-moonshine-' + version;
const required = ['index.js', 'mic-transcriber.js', 'stt-worker.js', 'moonshine.mjs', 'moonshine.wasm'];
if (required.every(file => existsSync(join(out, file)))) {
  console.log('Moonshine ' + version + ' package already prepared');
  process.exit(0);
}
const tmp = mkdtempSync(join(tmpdir(), 'bosai-moonshine-'));
try {
  const archiveName = execFileSync('npm', ['pack', '@moonshine-ai/moonshine-wasm@' + version, '--pack-destination', tmp, '--silent'], { encoding: 'utf8' }).trim().split(/\r?\n/).pop();
  if (!archiveName || !archiveName.endsWith('.tgz')) throw Error('Unexpected npm pack output: ' + archiveName);
  execFileSync('tar', ['-xzf', join(tmp, archiveName), '-C', tmp]);
  const source = join(tmp, 'package', 'dist');
  for (const file of required) if (!existsSync(join(source, file))) throw Error('Missing Moonshine SDK file: ' + file);
  mkdirSync(out, { recursive: true });
  cpSync(source, out, { recursive: true });
  console.log('Prepared same-origin Moonshine WASM SDK ' + version + '; STT model weights remain external');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
