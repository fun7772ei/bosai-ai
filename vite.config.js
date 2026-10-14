import { defineConfig } from 'vite';
import { readdirSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const research = process.env.BOSAI_RESEARCH === '1';
const sourceFiles = [...readdirSync('src').sort().map(name => `src/${name}`), 'package-lock.json', 'vite.config.js', 'public/sw.js', 'index.html'];
const buildId = createHash('sha256');
for (const file of sourceFiles) buildId.update(file).update(readFileSync(file));
export default defineConfig({
  base: '/bosai-ai/',
  define: { __APP_BUILD__: JSON.stringify(buildId.digest('hex').slice(0, 12)) },
  worker: { format: 'es' },
  build: { target: 'safari18', outDir: research ? 'research-dist' : 'dist', rollupOptions: { input: research ? 'research.html' : 'index.html' }, chunkSizeWarningLimit: 2500 },
  plugins: [{
    name: 'offline-runtime',
    closeBundle() {
      const out = research ? 'research-dist' : 'dist';
      mkdirSync(`${out}/runtime`, { recursive: true });
      if (research) { mkdirSync(`${out}/runtime/wllama-compat`, { recursive: true });
      copyFileSync('node_modules/@wllama/wllama-compat/wasm/wllama.wasm', `${out}/runtime/wllama-compat/wllama.wasm`); }
      for (const name of readdirSync('node_modules/onnxruntime-web/dist')) {
        if (/^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/.test(name)) copyFileSync(`node_modules/onnxruntime-web/dist/${name}`, `${out}/runtime/${name}`);
      }
      if (research) copyFileSync(`${out}/research.html`, `${out}/index.html`);
      const files = [];
      function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = `${dir}/${entry.name}`;
          if (entry.isDirectory()) walk(path);
          else if (!['sw.js', 'shell.json', ...(research ? [] : ['research.html'])].includes(entry.name) && !path.startsWith(`${out}/assets/ort-wasm`)) files.push(path.replace(`${out}/`, './'));
        }
      }
      walk(out);
      writeFileSync(`${out}/shell.json`, JSON.stringify(files));
      const hash = createHash('sha256');
      for (const file of files) hash.update(readFileSync(`${out}/${file.slice(2)}`));
      writeFileSync(`${out}/sw.js`, readFileSync('public/sw.js', 'utf8').replace('__BUILD__', hash.digest('hex').slice(0, 16)));
    },
  }],
});
