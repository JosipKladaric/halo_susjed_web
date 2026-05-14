const CACHE_NAME = 'halo-susjed-v8';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/assets/js/auth.js',
  '/assets/js/chat.js',
  '/assets/js/config.js',
  '/assets/js/feed.js',
  '/assets/js/imageUtils.js',
  '/assets/js/location.js',
  '/assets/js/state.js',
  '/assets/js/utils.js',
  '/manifest.json',
  '/assets/icons/icon-192.png'
];

// Install event - caching local assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Let browser handle external assets (like Google Fonts) normally if not in cache
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request); // Don't .catch() and return undefined
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        );
      })
    ])
  );
});
