const SHELL = 'bosai-ai-shell-__BUILD__';
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch(new URL('shell.json', self.registration.scope), { cache: 'no-store' });
  if (!response.ok) throw new Error('shell manifest unavailable');
  const files = await response.json();
  const cache = await caches.open(SHELL);
  await cache.addAll(files.map(path => new URL(path, self.registration.scope).href));
  await self.skipWaiting();
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
      try { return await fetch(event.request); } catch { return await cache.match(new URL('index.html', self.registration.scope), { ignoreVary: true }); }
    }
    return await cache.match(event.request, { ignoreVary: true }) || fetch(event.request);
  })());
});
