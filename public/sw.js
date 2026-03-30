const CACHE_NAME = 'cdjwe-v3'
const STATIC_ASSETS = [
    '/manifest.webmanifest',
    '/icons/icon-72.png',
    '/icons/icon-96.png',
    '/icons/icon-128.png',
    '/icons/icon-144.png',
    '/icons/icon-152.png',
    '/icons/icon-192.png',
    '/icons/icon-384.png',
    '/icons/icon-512.png',
]

// Install — precache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS)
        })
    )
    self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    )
    self.clients.claim()
})

// Allow app to force immediate activation of a newly installed worker.
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }
})

// Fetch — network-first strategy for API, cache-first for static
self.addEventListener('fetch', (event) => {
    const { request } = event
    const url = new URL(request.url)
    const isSameOrigin = url.origin === self.location.origin

    // Skip non-GET requests
    if (request.method !== 'GET') return

    // Skip browser extension protocols
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return

    // Do not intercept third-party requests (maps tiles, CDNs, external APIs).
    // This prevents noisy fetch errors and CORS/cache side effects.
    if (!isSameOrigin) return

    // Skip API calls and Next.js internals
    if (
        url.pathname.startsWith('/api') ||
        url.pathname.startsWith('/_next')
    ) return

    // Network-first for HTML pages
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
                    return response
                })
                .catch(async () => {
                    const cached = await caches.match(request)
                    if (cached) return cached
                    const catalog = await caches.match('/catalog')
                    if (catalog) return catalog
                    return new Response('Offline', { status: 503, statusText: 'Offline' })
                })
        )
        return
    }

    // Cache-first for static assets (images, fonts, etc.)
    if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|woff2?|ttf|css|js)$/)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached
                return fetch(request)
                    .then((response) => {
                        if (response.ok) {
                            const clone = response.clone()
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
                        }
                        return response
                    })
                    .catch(() => new Response('', { status: 503, statusText: 'Offline asset' }))
            })
        )
        return
    }

    // Default for other same-origin GETs: network-first with cache fallback
    event.respondWith(
        fetch(request).catch(async () => {
            const cached = await caches.match(request)
            return cached || new Response('Offline', { status: 503, statusText: 'Offline' })
        })
    )
})

// ==================== PUSH NOTIFICATIONS ====================

// Handle incoming push notification
self.addEventListener('push', (event) => {
    if (!event.data) return

    try {
        const data = event.data.json()
        const options = {
            body: data.body || '',
            icon: data.icon || '/icons/icon-192.png',
            badge: '/icons/icon-96.png',
            data: { url: data.url || '/' },
            vibrate: [100, 50, 100],
            actions: [
                { action: 'open', title: 'Abrir' },
                { action: 'close', title: 'Fechar' },
            ],
        }

        event.waitUntil(
            self.registration.showNotification(data.title || 'Nova notificação', options)
        )
    } catch {
        // Silent
    }
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const url = event.notification.data?.url || '/'
    if (event.action === 'close') return

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(url)
                    return client.focus()
                }
            }
            return self.clients.openWindow(url)
        })
    )
})
