/**
 * VSPRO Service Worker — Offline Resilience
 * Strategy: Network-first for API calls, cache fallback when offline.
 * Caches GET responses for KDS, products, orders.
 * Queues POST/PATCH/DELETE for background sync.
 */

const CACHE_NAME = 'vspro-offline-v1';
const API_CACHE_PATHS = [
  '/products',
  '/orders',
  '/production/queue',
  '/production/stats',
  '/dashboard/stats',
  '/delivery/drivers',
  '/delivery/active',
  '/customers',
  '/ai/config',
];

// Install — pre-cache app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first with cache fallback for API GETs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle API requests
  if (!url.pathname.startsWith('/api') && !url.hostname.includes('api.vspro.app')) {
    return;
  }

  // Only cache GET requests
  if (event.request.method !== 'GET') {
    // For mutations, try network; if offline, store in IndexedDB sync queue (handled client-side)
    return;
  }

  // Check if this is a cacheable API path
  const isCacheable = API_CACHE_PATHS.some((p) => url.pathname.includes(p));
  if (!isCacheable) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Network failed — serve from cache
        const cached = await caches.match(event.request);
        if (cached) {
          return cached;
        }
        // No cache — return offline JSON response
        return new Response(
          JSON.stringify({ offline: true, message: 'Sin conexión. Mostrando datos guardados.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
  );
});

// Background sync — process queued mutations when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'vspro-sync-queue') {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  // Sync queue is managed client-side via IndexedDB
  // Notify all clients to process their queues
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_READY' });
  });
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
