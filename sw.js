const CACHE = 'migasto-shell-v1.3.2';
const SCOPE = self.registration.scope;
const scoped = path => new URL(path, SCOPE).href;
const INDEX = scoped('index.html');
const CORE = [
  '', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'js/db.js', 'js/utils.js', 'js/analytics.js', 'js/backup.js',
  'fonts/Inter-Regular.woff2', 'fonts/Inter-SemiBold.woff2',
  'fonts/Inter-Bold.woff2', 'fonts/Inter-ExtraBold.woff2',
  'icons/icon.svg', 'icons/icon-192-v2.png', 'icons/icon-512-v2.png',
  'icons/maskable-192.png', 'icons/maskable-512.png', 'og.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async path => {
      const request = new Request(scoped(path), { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`No se pudo almacenar ${path}`);
      await cache.put(request, response);
    }));
    if (!await cache.match(INDEX)) throw new Error('La pantalla principal no pudo guardarse');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('migasto-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(INDEX, response.clone());
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(event.request, { ignoreSearch: true }) || await caches.match(INDEX) || await caches.match(scoped(''));
        return cached || new Response('MiGasto no pudo abrirse sin conexión.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) (await caches.open(CACHE)).put(event.request, response.clone());
      return response;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
