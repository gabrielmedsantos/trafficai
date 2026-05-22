// Lowan CRM Service Worker
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    if (event.data) payload = event.data.json()
  } catch { payload = { title: 'Lowan', body: event.data?.text?.() || 'Nova mensagem' } }

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visibleClient = clientList.find(c => c.visibilityState === 'visible')

    // SEMPRE notifica clientes (pra dedup e som imediato)
    clientList.forEach(c => c.postMessage({ type: 'push-received', payload }))

    // Mostra notif OS se NAO tem aba visivel
    // (com aba visivel, frontend cuida — evita ruido)
    if (!visibleClient) {
      const title = payload.title || 'Lowan CRM'
      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: payload.icon || '/icon.png',
        badge: '/icon.png',
        tag: payload.tag || 'lowan',
        renotify: true,
        data: { leadId: payload.leadId || null, url: payload.url || '/', ts: Date.now() },
      })
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.includes(self.location.origin)) {
        c.focus()
        if (data.leadId) c.postMessage({ type: 'open-lead', leadId: data.leadId })
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(data.url || '/')
  })())
})
