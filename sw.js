const CACHE_VERSION = 'cara-app-v6';

const APP_SHELL = [
  './',
  './index.html',
  './agenda.html',
  './louvor.html',
  './ministerios.html',
  './manifest.webmanifest',
  './logo-cara.png',
  './banner-louvor.png',
  './banner-agenda.png',
  './banner-ministerios.png',
  './banner-fundamento-ministerios-corrigido.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.hostname === 'script.google.com' && url.pathname.includes('/macros/s/')) {
    event.respondWith(fetch(event.request, {credentials:'omit', redirect:'follow'}));
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
