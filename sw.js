// EmojiPick SW reset (v9)
// Clears old caches and unregisters itself to avoid stale UI issues.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}

    try {
      await self.clients.claim();
    } catch (e) {}

    // Tell open pages we cleaned caches
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) {
        c.postMessage({ type: 'SW_CLEANED' });
      }
    } catch (e) {}

    // Unregister self so future loads are plain-network (no SW)
    try {
      await self.registration.unregister();
    } catch (e) {}
  })());
});
