const CACHE_NAME = 'finanzas-app-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/FinanzasApp/',
  '/FinanzasApp/index.html',
  '/FinanzasApp/manifest.json',
  '/FinanzasApp/assets/images/favicon.png',
  '/FinanzasApp/assets/images/icon.png'
];

// Supabase API base URL detection
const SUPABASE_API_PATTERN = /supabase\.co\/rest\/v1/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Strategy: Network-First with Cache Fallback for Supabase API requests
  if (SUPABASE_API_PATTERN.test(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If successful response, save clone to cache
          if (response.status === 200 || response.status === 201) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline/Network error fallback: Retrieve from cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return standard offline error if not in cache
            return new Response(JSON.stringify({ error: "No internet connection. Data unavailable offline." }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Standard Strategy: Cache First for assets/static files
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        // Cache dynamically fetched local assets (excluding external APIs or POSTs)
        if (
          fetchResponse.status === 200 &&
          event.request.method === 'GET' &&
          !url.includes('chrome-extension') &&
          !url.includes('supabase.co')
        ) {
          const responseClone = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return fetchResponse;
      });
    })
  );
});

// ── Web Push Event Listener ──
self.addEventListener('push', (event) => {
  let data = { title: 'Zenly', body: 'Tienes una nueva actualización financiera.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Zenly', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/FinanzasApp/assets/images/icon.png',
    badge: '/FinanzasApp/assets/images/favicon.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/FinanzasApp/goals'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data.url;

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
