/* Service Worker — network-first para HTML, cache-first para assets */
const CACHE = 'sudoku-v14';
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
  const isHTML = e.request.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    /* Network-first para HTML: sempre busca versão nova, usa cache só se offline */
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    /* Cache-first para CSS/JS/imagens */
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
