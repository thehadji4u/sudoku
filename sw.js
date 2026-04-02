/* Service Worker — network-first para HTML, cache-first para assets — build:20260401-14 */
const CACHE = 'sudoku-v110';
const ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './sudoku-generator.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  /* Network-first para tudo: sempre busca versão nova, cai no cache só se offline.
     Garante que atualizações de app.js/style.css apareçam imediatamente após reload. */
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
