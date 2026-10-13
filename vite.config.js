import { defineConfig } from 'vite';
import { readdirSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default defineConfig({
  base: '/bosai-ai/',
  build: { target: 'safari18', chunkSizeWarningLimit: 2500 },
  plugins: [{
    name: 'offline-runtime',
    closeBundle() {
      mkdirSync('dist/runtime', { recursive: true });
      for (const name of readdirSync('node_modules/onnxruntime-web/dist')) {
        if (/^ort-wasm-simd-threaded\.asyncify\.(wasm|mjs)$/.test(name)) copyFileSync(`node_modules/onnxruntime-web/dist/${name}`, `dist/runtime/${name}`);
      }
      const files = [];
      function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = `${dir}/${entry.name}`;
          if (entry.isDirectory()) walk(path);
          else if (!['sw.js', 'shell.json'].includes(entry.name) && !path.startsWith('dist/assets/ort-wasm')) files.push(path.replace('dist/', './'));
        }
      }
      walk('dist');
      writeFileSync('dist/shell.json', JSON.stringify(files));
      const hash = createHash('sha256');
      for (const file of files) hash.update(readFileSync(`dist/${file.slice(2)}`));
      writeFileSync('dist/sw.js', readFileSync('public/sw.js', 'utf8').replace('__BUILD__', hash.digest('hex').slice(0, 16)));
    },
  }],
});
