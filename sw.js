const CACHE_VERSION = 'cara-app-v41';

const APP_SHELL = [
  './',
  './index.html',
  './agenda.html',
  './louvor.html',
  './ministerios.html',
  './midia.html',
  './estudos.html',
  './galeria.html',
  './tesouraria.html',
  './manifest.webmanifest',
  './logo-cara.png',
  './banner-louvor.png',
  './banner-fundamento-louvor.png',
  './banner-agenda.png',
  './banner-fundamento-agenda.png',
  './banner-ministerios.png',
  './banner-fundamento-ministerios-corrigido.png',
  './banner-midia.png',
  './banner-estudos.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(APP_SHELL).catch(error => {
        console.warn('Alguns recursos não foram adicionados ao cache:', error);
      })
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('cara-app-') && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Nunca armazenar em cache as chamadas da API do Google Apps Script.
  if (url.hostname === 'script.google.com' && url.pathname.includes('/macros/s/')) {
    event.respondWith(
      fetch(event.request, {
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store'
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Rede primeiro: serve a versão atual do GitHub Pages e guarda cópia para uso offline.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(
        cached => cached || caches.match('./index.html')
      ))
  );
});
