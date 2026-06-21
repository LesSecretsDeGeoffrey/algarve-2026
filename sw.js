const CACHE_NAME = 'algarve-2026-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700&display=swap'
];

const RUNTIME_PATTERNS = [
  /basemaps\.cartocdn\.com/,
  /commons\.wikimedia\.org/,
  /upload\.wikimedia\.org/,
  /fonts\.gstatic\.com/
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(err => console.warn('Partial cache:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // La PAGE (index.html / navigation) = NETWORK-FIRST :
  // on récupère toujours la dernière version en ligne, et on retombe sur le cache hors-ligne.
  const isHTML = request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || (url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('/')));

  if (isHTML) {
    event.respondWith(
      fetch(request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
        return resp;
      }).catch(() =>
        caches.match(request).then(c => c || caches.match('./index.html') || caches.match('./'))
      )
    );
    return;
  }

  const isStatic = STATIC_ASSETS.some(asset => request.url.includes(asset.replace('./', '')));
  const isRuntime = RUNTIME_PATTERNS.some(pattern => pattern.test(request.url));

  if (isStatic) {
    // assets stables (icône, manifeste, Leaflet, fonts) = cache-first
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return resp;
        })
      )
    );
  } else if (isRuntime) {
    // tuiles carte + photos = stale-while-revalidate
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
