const CACHE_NAME = 'snake-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './snake.js',
    './favicons/favicon.ico',
    './favicons/favicon-16x16.png',
    './favicons/favicon-32x32.png',
    './favicons/apple-touch-icon.png',
    './favicons/android-chrome-192x192.png',
    './favicons/android-chrome-512x512.png',
    './favicons/site.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
