const SHELL = 'bosai-ai-shell-__BUILD__';
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch(new URL('shell.json', self.registration.scope), { cache: 'no-store' });
  if (!response.ok) throw new Error('shell manifest unavailable');
  const files = await response.json();
  const cache = await caches.open(SHELL);
  await cache.addAll(files.map(path => new URL(path, self.registration.scope).href));
  // Keep the current worker and its shell while existing tabs still use it.
  // Immediate activation would delete the hashed Worker/modules referenced by
  // an already-open page. Closing the old tabs permits normal activation.
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('bosai-ai-shell-') && key !== SHELL) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    if (event.request.mode === 'navigate') {
      // GitHub Pages cannot configure COOP/COEP itself. Opt in only on
      // ?voice_iso=1 so existing Ruri pages and offline storage are untouched.
      let response;
      try { response = await fetch(event.request); }
      catch { response = await cache.match(new URL('index.html', self.registration.scope), { ignoreVary: true }); }
      if (!response) return Response.error();
      if (new URL(event.request.url).searchParams.get('voice_iso') !== '1' || !response.ok) return response;
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      // The body may be streamed; the header from the origin is no longer valid.
      headers.delete('content-length');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return await cache.match(event.request, { ignoreVary: true }) || fetch(event.request);
  })());
});
