// Service Worker "kill switch": clears caches and unregisters itself.
// Keep this file so any previously-registered SW at this URL updates and removes itself.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      // ignore
    }

    try {
      await self.registration.unregister();
    } catch (e) {
      // ignore
    }

    // Nudge open tabs to reload
    try {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsArr) {
        try { client.navigate(client.url); } catch (e) {}
      }
    } catch (e) {
      // ignore
    }
  })());
});

// No fetch handler: let the network work normally.
