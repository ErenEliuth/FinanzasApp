const CACHE_NAME = 'finanzas-app-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/FinanzasApp/',
  '/FinanzasApp/index.html',
  '/FinanzasApp/manifest.json',
  '/FinanzasApp/assets/images/favicon.png',
  '/FinanzasApp/assets/images/icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
