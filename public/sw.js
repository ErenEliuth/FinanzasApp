const CACHE_NAME = 'finanzas-app-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png'
];

// Supabase API base URL detection
const SUPABASE_API_PATTERN = /supabase\.co\/rest\/v1/;

// ── Install ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ──
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

// ── Fetch: Network-First for Supabase, Cache-First for assets ──
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Exclude local API endpoints from Service Worker intercept
  if (url.includes('/api/')) {
    return;
  }

  // Strategy: Network-First with Cache Fallback for Supabase API requests
  if (SUPABASE_API_PATTERN.test(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200 || response.status === 201) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(JSON.stringify({ error: "Sin conexión. Datos no disponibles offline." }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Standard Strategy: Cache First for static assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
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

// ── Message Handler: Local Notification Scheduler ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url } = event.data;
    self.registration.showNotification(title || 'Zenly', {
      body: body || 'Tienes un recordatorio financiero.',
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [100, 50, 100],
      tag: 'zenly-reminder',
      renotify: true,
      data: { url: url || '/' }
    });
  }

  if (event.data && event.data.type === 'SCHEDULE_DAILY') {
    // Store schedule config for the periodic check
    const { hour, minute } = event.data;
    self._dailySchedule = { hour: hour || 9, minute: minute || 0 };
  }
});

// ── Push Event (for future server-side push) ──
self.addEventListener('push', (event) => {
  let data = { title: 'Zenly', body: 'Tienes una nueva actualización financiera.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Zenly', body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/goals' }
    })
  );
});

// ── Notification Click Handler ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url 
    ? event.notification.data.url 
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
