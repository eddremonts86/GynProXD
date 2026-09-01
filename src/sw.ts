/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare let self: ServiceWorkerGlobalScope

/**
 * The app's own worker (phase 6). The first half recreates exactly what
 * generateSW used to produce — precached shell, cached movement artwork —
 * because switching strategies must not cost anyone their offline gym. The
 * second half is why the file exists: push while the app is closed, and a
 * notification tap that lands on the right screen.
 */

/**
 * A new worker waits instead of taking over the moment it installs.
 *
 * It used to call `skipWaiting()` here, which sounds helpful and is not: every
 * route in this app is loaded on demand, so a worker that activates under a
 * running page — and then runs `cleanupOutdatedCaches()` — deletes the very
 * chunks that page is about to ask for. The next navigation 404s on a build
 * that no longer exists. So it waits, the app offers the update, and the swap
 * happens on a reload we control.
 *
 * It still activates on its own once every tab is closed, which is how a PWA
 * picks up a release without anyone pressing anything.
 */
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  ({ url }) => url.pathname.startsWith('/repdb/'),
  new CacheFirst({
    cacheName: 'movement-artwork',
    plugins: [
      /* One entry per illustration file, and RepDB ships 1,056 of them —
         a cap below that quietly evicts artwork somebody has already seen. */
      new ExpirationPlugin({ maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 180 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// Movement photos, now served first-party through the /exercise-img proxy,
// stay available offline once they have been looked at. (The old direct
// jsdelivr origin is kept too, for any cache warmed before the proxy landed.)
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/exercise-img/') ||
    url.origin === 'https://cdn.jsdelivr.net' ||
    /* wger hosts its own illustrations; we link rather than copy them. */
    url.origin === 'https://wger.de',
  new CacheFirst({
    cacheName: 'movement-photos',
    plugins: [
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() as PushPayload) ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title ?? 'enForma', {
        body: payload.body ?? '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag,
        data: { url: payload.url ?? '/inbox' },
      }),
      /* Open tabs hear about it too, so the inbox refreshes while you look. */
      self.clients
        .matchAll({ type: 'window' })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: 'gym-push' }))),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/inbox'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
