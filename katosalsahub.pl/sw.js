/**
 * Kato Salsa Hub - Service Worker (PWA & Offline Shell)
 * Caches static UI assets and Salsopedia read-only dictionary for offline browsing,
 * while bypassing live audio streams and dynamic PHP API mutations.
 */

const CACHE_NAME = 'ksh-pwa-v19';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/grafik.html',
  '/salsopedia.html',
  '/privacy.html',
  '/manifest.json',
  '/assets/css/style.css?v=4.3',
  '/assets/css/components.css?v=4.3',
  '/assets/css/sections.css?v=4.3',
  '/assets/css/radio.css?v=4.3',
  '/assets/css/wiki.css?v=4.4',
  '/assets/css/schedule.css?v=4.3',
  '/assets/js/router.js?v=3.9',
  '/assets/js/home.js?v=3.9',
  '/assets/js/radio.js?v=3.9',
  '/assets/js/wiki.js?v=3.9',
  '/assets/js/schedule.js?v=3.9',
  '/assets/js/contact.js?v=3.9',
  '/assets/js/cookies.js?v=3.9',
  '/assets/js/ai-widget.js?v=4.3',
  '/assets/data/salsopedia.json',
  '/assets/data/schedule.json',
  '/assets/data/events.json',
  '/assets/data/kato-salsa-hub-mapa.kml',
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

  // Never intercept cross-origin requests (live radio streams on zeno.fm / surfernetwork.com, AI router, maps) or dynamic PHP API endpoints
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('zeno.fm') ||
    url.hostname.includes('surfernetwork.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('twojastronawww.pl') ||
    url.pathname.endsWith('.php')
  ) {
    return;
  }

  // Network-First for HTML pages, CSS, JS and salsopedia.json so UI/KB updates are immediately visible,
  // with full offline fallback when network is unavailable
  const isHtmlNav =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');

  if (
    isHtmlNav ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('/salsopedia.json')
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
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
