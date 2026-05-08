const CACHE_NAME = 'halo-susjed-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/assets/js/app.js',
  '/manifest.json',
  '/assets/icons/icon-192.png'
];

// Install event - caching local assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch event - better handling of cross-origin requests
self.addEventListener('fetch', (event) => {
  // Skip caching for non-GET requests (like Supabase POST/INSERT)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached asset if found, otherwise fetch from network
      return response || fetch(event.request).catch(() => {
        // Fallback if network fails and not in cache
        console.log('Network fetch failed for:', event.request.url);
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});
