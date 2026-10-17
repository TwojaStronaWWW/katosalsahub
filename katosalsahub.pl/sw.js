/**
 * Kato Salsa Hub - Service Worker (PWA & Offline Shell)
 * Caches static UI assets and Salsopedia read-only dictionary for offline browsing,
 * while bypassing live audio streams and dynamic PHP API mutations.
 */

const CACHE_NAME = 'ksh-pwa-v5';
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
  '/assets/js/ai-widget.js',
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

  // Never intercept live radio streams, AI router requests or dynamic PHP API endpoints
  if (
    url.hostname.includes('zeno.fm') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('twojastronawww.pl') ||
    url.pathname.endsWith('.php')
  ) {
    return;
  }

  // Network-First for HTML pages, CSS, ai-widget.js and salsopedia.json so UI/KB updates are immediately visible,
  // with full offline fallback when network is unavailable
  const isHtmlNav =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');

  if (
    isHtmlNav ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/salsopedia.json') ||
    url.pathname.endsWith('/ai-widget.js')
  ) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Stale-while-revalidate for static assets
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
