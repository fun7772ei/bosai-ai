import { modelFiles, modelFileUrl } from './config.js';

// Do not arrayBuffer(), clone(), or collect weight chunks. The model store consumes
// this stream in bounded IndexedDB chunks instead of a large Cache API entry.
export async function downloadModel(cache, dtype, report, fetcher = fetch) {
  for (const file of modelFiles(dtype)) {
    const url = modelFileUrl(file);
    if (await cache.match(url, { ignoreVary: true })) {
      report({ file, status: 'done', progress: 100, reused: true }); continue;
    }
    report({ file, status: 'initiate' });
    const response = await fetcher(url);
    if (!response.ok || !response.body) throw new Error(`${file}: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const total = Number(response.headers.get('content-length')) || undefined;
    let loaded = 0, lastReport = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          loaded += value.byteLength;
          controller.enqueue(value);
          if (performance.now() - lastReport >= 250) {
            lastReport = performance.now();
            report({ file, status: 'progress', loaded, total, progress: total ? Math.min(99, loaded / total * 100) : undefined });
          }
        } catch (error) { controller.error(error); }
      },
      cancel(reason) { return reader.cancel(reason); },
    });
    const headers = new Headers(response.headers);
    if (headers.has('content-encoding')) { headers.delete('content-encoding'); headers.delete('content-length'); }
    try { await cache.put(url, new Response(stream, { status: 200, headers })); }
    catch (error) { await reader.cancel().catch(() => {}); throw error; }
    report({ file, status: 'done', progress: 100, loaded, total: loaded });
  }
}
