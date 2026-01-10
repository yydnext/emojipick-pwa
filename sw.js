const CACHE_NAME = "yd-quick-entry-v2";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const fresh = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, fresh.clone());
      return fresh;
    } catch (e) {
      return caches.match("./index.html");
    }
  })());
});
