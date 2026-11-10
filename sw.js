const CACHE_NAME = 'verso-prosa-abertura-v1';
const APP_FILES = [
 './','./index.html','./style.css?v=4.0.0','./app.js','./manifest.json',
 './assets/brand/verso-emblema.svg','./assets/brand/verso-prosa-logo.svg','./assets/logo-livro-pena.png',
 './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/icon-192-maskable.png','./assets/icons/icon-512-maskable.png','./assets/icons/apple-touch-icon.png',
 './assets/scenes/entrance-room.webp','./assets/scenes/lamp-books.webp','./assets/scenes/shelf-wall.webp','./assets/scenes/typewriter-desk.webp','./assets/scenes/open-book.webp','./assets/scenes/discover-authors.webp','./assets/scenes/lamp-stack.webp','./assets/scenes/welcome-approved.webp'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('verso-prosa-')&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;const shell=r.mode==='navigate'||/\/(index\.html|app\.js|style\.css|manifest\.json|sw\.js)$/.test(u.pathname);if(shell){e.respondWith((async()=>{const c=await caches.open(CACHE_NAME);try{const fresh=await fetch(new Request(r,{cache:'no-store'}));if(fresh&&fresh.ok)await c.put(r,fresh.clone());return fresh;}catch(err){return await c.match(r)||await c.match('./index.html')||Promise.reject(err);}})());return;}e.respondWith((async()=>{const c=await caches.open(CACHE_NAME);const hit=await c.match(r);if(hit)return hit;const fresh=await fetch(r);if(fresh&&fresh.ok)await c.put(r,fresh.clone());return fresh;})());});
