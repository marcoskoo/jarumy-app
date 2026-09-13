/* ============================================================
 * JARUMY APP — Service Worker (PWA offline).
 * Estrategia:
 *   · Estáticos (/_next/static, iconos, logo): cache-first
 *   · Navegación (documento /): network-first con respaldo offline
 *   · /api/*: SIEMPRE red (nunca se cachean datos de sesión/planos)
 * El plano en sí lo persiste el auto-guardado en localStorage,
 * por lo que la app funciona sin conexión tras la primera visita.
 * ============================================================ */

const CACHE = 'jarumy-v3'
const OFFLINE_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/logo-jarumy.png', '/logo.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // solo mismo origen; las API siempre van a la red
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (req.method !== 'GET') return

  // estáticos de Next: cache-first (inmutables por hash)
  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|jpg|jpeg|webp|webmanifest|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      }).catch(() => hit))
    )
    return
  }

  // navegación: network-first + respaldo de caché
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    )
  }
})
