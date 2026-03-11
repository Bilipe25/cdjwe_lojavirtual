/// <reference lib="webworker" />

const CACHE_NAME = 'cdjwe-v1'
const STATIC_ASSETS = [
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
]

declare const self: ServiceWorkerGlobalScope

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

// Fetch — network-first strategy for API, cache-first for static
self.addEventListener('fetch', (event) => {
    const { request } = event
    const url = new URL(request.url)

    // Skip non-GET requests
    if (request.method !== 'GET') return

    // Skip Supabase API calls and Next.js internal
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/_next')) return

    // Network-first for HTML pages
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
                    return response
                })
                .catch(() => caches.match(request).then((r) => r || caches.match('/catalog')))
        )
        return
    }

    // Cache-first for static assets (images, fonts, etc.)
    if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|woff2?|ttf|css|js)$/)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached
                return fetch(request).then((response) => {
                    const clone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
                    return response
                })
            })
        )
    }
})

export {}
