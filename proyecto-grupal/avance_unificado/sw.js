const CACHE = 'ksi-studio-v2';
const SHELL = [
  './',
  'index.html',
  'index2.html',
  'styles.css',
  'shell.js',
  'app.js',
  'pwa.js',
  'vitals.js',
  'jquery.min.js',
  'purify.min.js',
  'productos.json',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const red = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => hit || caches.match('index.html'));
      return hit || red;
    })
  );
});
