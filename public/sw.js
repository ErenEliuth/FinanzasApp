const CACHE_NAME = 'finanzas-app-v3';
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

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
