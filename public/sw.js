// VSA Vet Media — Service Worker
// SAFETY: Only caches static, public assets. NEVER caches authenticated API
// responses (Supabase REST/auth/storage/functions) — that would leak PII
// across users on shared browsers.
const CACHE_NAME = 'vsa-v2';
const PRECACHE = [
  '/',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
];

// Hostnames whose responses must never be cached (contain user data / tokens).
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
];

// Path prefixes on same-origin that must never be cached.
const NEVER_CACHE_PATHS = ['/api/', '/functions/', '/auth/', '/rest/'];

function shouldBypassCache(url) {
  try {
    const u = new URL(url);
    if (NEVER_CACHE_HOSTS.some((h) => u.hostname.endsWith(h))) return true;
    if (NEVER_CACHE_PATHS.some((p) => u.pathname.startsWith(p))) return true;
    return false;
  } catch {
    return true;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Allow the app to clear all caches on logout.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Bypass anything sensitive entirely — straight to network, no cache touch.
  if (shouldBypassCache(req.url) || req.headers.get('authorization')) {
    return; // let the browser handle it normally
  }

  // Only cache same-origin static assets.
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Only cache successful, basic responses
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
