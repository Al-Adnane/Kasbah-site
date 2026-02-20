self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clear all caches
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    // Unregister THIS service worker
    await self.registration.unregister();
    // Take control then do nothing else
    await self.clients.claim();
  })());
});
// No fetch handler on purpose.
