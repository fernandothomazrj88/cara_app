const CACHE_VERSION = 'cara-app-v5';

const APP_SHELL = [
  './',
  './index.html',
  './louvor.html',
  './manifest.webmanifest',
  './logo-cara.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
  );
});


self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_VERSION)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});


self.addEventListener('fetch', event => {

  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);


  /*
   * =====================================================
   * APPS SCRIPT — APIs DO C.A.R.A.
   * =====================================================
   *
   * Louvor + API Central.
   *
   * Faz chamadas públicas sem cookies da sessão Google.
   * Isso evita o problema que tivemos no Chrome.
   */

  if (
    url.hostname === 'script.google.com' &&
    url.pathname.includes('/macros/s/')
  ) {

    event.respondWith(
      fetch(event.request, {
        credentials: 'omit',
        redirect: 'follow'
      })
    );

    return;
  }


  /*
   * =====================================================
   * OUTRAS ORIGENS EXTERNAS
   * =====================================================
   */

  if (url.origin !== self.location.origin) {
    return;
  }


  /*
   * =====================================================
   * ARQUIVOS DO C.A.R.A.
   * REDE PRIMEIRO → CACHE COMO FALLBACK
   * =====================================================
   */

  event.respondWith(

    fetch(event.request)

      .then(response => {

        if (response && response.ok) {

          const copy = response.clone();

          caches.open(CACHE_VERSION)
            .then(cache =>
              cache.put(event.request, copy)
            );

        }

        return response;

      })

      .catch(() =>

        caches.match(event.request)

          .then(cached =>
            cached ||
            caches.match('./index.html')
          )

      )

  );

});
