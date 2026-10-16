const SHELL = "bosai-ai-shell-__BUILD__";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const response = await fetch(
        new URL("shell.json", self.registration.scope),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("shell manifest unavailable");
      const files = await response.json();
      const cache = await caches.open(SHELL);
      await cache.addAll(
        files.map((path) => new URL(path, self.registration.scope).href),
      );
      // Keep the current worker and its shell while existing tabs still use it.
      // Immediate activation would delete the hashed Worker/modules referenced by
      // an already-open page. Closing the old tabs permits normal activation.
    })(),
  ),
);
// Active windows announce their entry assets. Unknown/legacy clients conservatively pin
// every old shell until they close. Heartbeats reclaim unneeded shells after that point.
const clientAssets = new Map();
const updatePending=()=>!!self.registration.installing||!!self.registration.waiting||self.registration.active?.state!=="activated";
async function collectShells() {
  // An unused cache may belong to the next worker, not an obsolete release.
  if(updatePending())return;
  const clients = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter(client=>client.url.startsWith(self.registration.scope)),
    live = new Set(clients.map((c) => c.id));
  for (const id of clientAssets.keys())
    if (!live.has(id)) clientAssets.delete(id);
  if (clients.some((c) => !clientAssets.has(c.id))) return;
  const keys = (await caches.keys()).filter((k) =>
      k.startsWith("bosai-ai-shell-"),
    ),
    keep = new Set([SHELL]);
  for (const client of clients) {
    const assets = clientAssets.get(client.id);
    if (!assets.length) return;
    for (const url of assets) {
      let found = false;
      for (const key of keys)
        if (await (await caches.open(key)).match(url, { ignoreVary: true })) {
          keep.add(key);
          found = true;
        }
      if (!found) return; // A window using a not-yet-cached version cannot be safely classified.
    }
  }
  for (const key of keys) {if(updatePending())return;if (!keep.has(key)) await caches.delete(key);}
}
self.addEventListener("message", (event) => {
  if (event.data?.type === "APPLY_UPDATE") self.skipWaiting();
  if (event.data?.type === "CLIENT_READY" && event.source?.id) {
    const assets = Array.isArray(event.data.assets)
      ? event.data.assets.filter(
          (url) =>
            typeof url === "string" &&
            url.startsWith(self.registration.scope + "assets/"),
        )
      : [];
    clientAssets.set(event.source.id, assets);
    event.waitUntil(collectShells().then(()=>event.ports[0]?.postMessage("ready")));
  }
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await collectShells();
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const reqUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || reqUrl.origin !== self.location.origin)
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      if (event.request.mode === "navigate") {
        // All controlled navigations use isolation. The first network document
        // cannot gain COOP from clients.claim(); first-use voice may navigate once.
        let response;
        try {
          response = await fetch(event.request);
        } catch {
          response = await cache.match(
            new URL("index.html", self.registration.scope),
            { ignoreVary: true },
          );
        }
        if (!response) return Response.error();
        if (
          !response.ok
        )
          return response;
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        headers.set("Cross-Origin-Embedder-Policy", "require-corp");
        // The body may be streamed; the header from the origin is no longer valid.
        headers.delete("content-length");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      // A module Worker needs COEP on its own top-level script response,
      // not only on the document that spawned it. Limit this to Moonshine SDK
      // assets; ordinary Ruri runtime/files stay byte-for-byte unchanged.
      if (
        reqUrl.pathname.startsWith(
          new URL("moonshine/", self.registration.scope).pathname,
        )
      ) {
        // Optional SDK cache is populated only on use, never during shell install.
        // Keep the pinned key separate from shell upgrades and model caches.
        let sdkCache, response;
        try {
          sdkCache = await caches.open("bosai-ai-moonshine-sdk-0.1.5");
          response = await sdkCache.match(event.request, { ignoreVary: true });
        } catch {}
        if (!response) {
          response = await fetch(event.request);
          // Storage/quota failure must not disable online voice or clear saved data.
          if (response.ok && sdkCache)
            try {
              await sdkCache.put(event.request, response.clone());
            } catch {}
        }
        if (!/\.(?:js|mjs)$/.test(reqUrl.pathname)) return response;
        if (!response.ok) return response;
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Embedder-Policy", "require-corp");
        headers.set("Cross-Origin-Resource-Policy", "same-origin");
        headers.delete("content-length");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      const response =
        (await cache.match(event.request, { ignoreVary: true })) ||
        (/\/assets\//.test(reqUrl.pathname)
          ? await caches.match(event.request, { ignoreVary: true })
          : null) ||
        (await fetch(event.request));
      // Ruri must also start after voice in an isolated document. A module
      // worker inherits isolation only when its own response permits it.
      if (
        /\/assets\/ruri\.worker-[^/]+\.js$/.test(reqUrl.pathname) &&
        response.ok
      ) {
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Embedder-Policy", "require-corp");
        headers.set("Cross-Origin-Resource-Policy", "same-origin");
        headers.delete("content-length");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    })(),
  );
});
