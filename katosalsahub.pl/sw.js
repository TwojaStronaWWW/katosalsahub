/**
 * Kato Salsa Hub - Service Worker (PWA & Offline Shell)
 * Caches static UI assets and Salsopedia read-only dictionary for offline browsing,
 * while bypassing live audio streams and dynamic PHP API mutations.
 */

const CACHE_NAME = 'ksh-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/salsopedia.html',
  '/privacy.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/css/components.css',
  '/assets/css/sections.css',
  '/assets/css/radio.css',
  '/assets/css/wiki.css',
  '/assets/js/router.js',
  '/assets/js/home.js',
  '/assets/js/radio.js',
  '/assets/js/wiki.js',
  '/assets/js/contact.js',
  '/assets/js/cookies.js',
  '/assets/data/salsopedia.json',
  '/assets/images/logo.jpg',
  '/assets/images/logo.webp',
  '/assets/images/hero.webp',
  '/assets/images/hero.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore individual missing optional assets during initial install
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept live radio streams or external analytics/maps
  if (
    url.hostname.includes('zeno.fm') ||
    url.hostname.includes('google.com') ||
    url.pathname.endsWith('.php')
  ) {
    return;
  }

  // Stale-while-revalidate for static assets and salsopedia.json
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            url.origin === self.location.origin
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
