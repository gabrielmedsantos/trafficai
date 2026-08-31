// TrafficAI — Service Worker
// Estratégia: network-first pra API/HTML, cache-first pra assets estáticos.
// Não faz cache agressivo — só o suficiente pra o "Instalar App" funcionar e pra dar
// uma experiência offline mínima (mostra tela cacheada se o servidor cair).

const CACHE = 'trafficai-v2';
const ESSENTIAL = [
  '/',
  '/agenda',
  '/rotina',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ESSENTIAL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: 'TrafficAI', body: event.data.text() }; }

  const title = payload.title || 'TrafficAI';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'trafficai-alert',
    data: { url: payload.url || '/alerts' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/alerts';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clientList.length > 0 && 'focus' in clientList[0]) {
        clientList[0].navigate(url);
        return clientList[0].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignora requisições non-GET e cross-origin
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API/auth NUNCA cacheia — sempre rede
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/data/')) {
    return;
  }

  // Assets estáticos: cache-first
  if (url.pathname.startsWith('/_next/static/') || /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }))
    );
    return;
  }

  // Documentos HTML: network-first com fallback pro cache
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('/agenda')))
    );
  }
});
