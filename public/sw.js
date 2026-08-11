// Service-worker kill switch. Older app versions cached the application shell,
// which could leave browsers requesting deleted Vite chunks after a deploy.
// Keep this file available so those registrations update, clear themselves,
// and release the page. The application no longer registers a service worker.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      self.registration.unregister(),
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
