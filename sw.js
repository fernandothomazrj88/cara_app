const CACHE_VERSION = 'cara-app-v50';

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
  './banner-fundamento-ministerios.png',
  './banner-midia.png',
  './banner-estudos.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

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

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          cached => cached || caches.match('./index.html')
        )
      )
  );
});


// Push: o provedor de envio precisa ser configurado separadamente no servidor.
self.addEventListener('push', event => {
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch(e) { data = {title:'C.A.R.A.', body:event.data ? event.data.text() : 'Você tem um novo aviso.'}; }
  const title = data.title || 'C.A.R.A. — Novo aviso';
  const options = { body:data.body || 'Você tem uma notificação da comunidade.', icon:'./icon-192.png', badge:'./icon-192.png', data:{url:data.url || './index.html'}, tag:data.tag || 'cara-aviso', renotify:false };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close(); const target = new URL((event.notification.data && event.notification.data.url) || './index.html', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if(c.url.startsWith(self.location.origin) && 'focus' in c){c.navigate(target);return c.focus();}}return self.clients.openWindow(target);}));
});
