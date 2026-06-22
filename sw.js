// Minimal offline support: cache the core game files on install, then serve
// from cache instantly while quietly refreshing the cache in the background
// (stale-while-revalidate). Bump CACHE_NAME whenever a core asset changes so
// old caches get cleared out on the next visit.
const CACHE_NAME = 'snake-cache-v1';
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './snake.js',
    './favicons/site.webmanifest',
    './favicons/favicon.ico',
    './favicons/favicon-16x16.png',
    './favicons/favicon-32x32.png',
    './favicons/apple-touch-icon.png',
    './favicons/android-chrome-192x192.png',
    './favicons/android-chrome-512x512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                })
                .catch(() => cached); // offline — fall back to whatever's cached
            return cached || network;
        })
    );
});
