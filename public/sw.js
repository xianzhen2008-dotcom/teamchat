const CACHE_VERSION = 'teamchat-shell-oss-v1';
const SHELL_CACHE = [
  '/manifest.webmanifest',
  '/icons/teamchat-192.png',
  '/icons/teamchat-512.png',
  '/assets/avatars/agent-main.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(async () => {
      const host = self.location.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      if (!isLocal) {
        await self.registration.unregister();
        return;
      }
      await self.clients.claim();
    })
  );
});

function shouldBypass(requestUrl) {
  return requestUrl.pathname.startsWith('/api/')
    || requestUrl.pathname.startsWith('/v1/')
    || requestUrl.pathname.startsWith('/upload')
    || requestUrl.pathname.startsWith('/uploads/')
    || requestUrl.pathname.endsWith('.jsonl');
}

function isAppShellRequest(requestUrl) {
  return requestUrl.pathname === '/'
    || requestUrl.pathname.endsWith('/index.html')
    || requestUrl.pathname.endsWith('.js')
    || requestUrl.pathname.endsWith('.css')
    || requestUrl.pathname.endsWith('.html');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (shouldBypass(requestUrl)) return;

  if (isAppShellRequest(requestUrl)) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok && requestUrl.origin === self.location.origin) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy)));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        event.waitUntil(
          fetch(event.request)
            .then((response) => {
              if (response && response.ok) {
                return caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, response.clone()));
              }
              return null;
            })
            .catch(() => null)
        );
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (response && response.ok && requestUrl.origin === self.location.origin) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy)));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
