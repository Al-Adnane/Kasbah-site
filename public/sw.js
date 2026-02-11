self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('kasbah-v1').then(c => c.addAll([
    '/', '/index.html', '/style.css', '/app.js', '/manifest.webmanifest', '/kasbah-logo.png'
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
