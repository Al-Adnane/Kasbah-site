self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('kasbah-v3').then(c => c.addAll([
    '/', '/index.html', '/style.css', '/app.js',
    '/kasbah-logo.png', '/kasbah-hero.png', '/og.png',
    '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});