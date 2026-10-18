/**
 * Zarządzanie banerem prywatności, rejestracją PWA Service Workera (#21)
 * oraz lekką analityką Cookieless zgodną z RODO (#22).
 */
(function () {
  const cookieBanner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('accept-cookies');

  if (cookieBanner && acceptBtn) {
    if (!localStorage.getItem('cookiesAccepted')) {
      setTimeout(() => {
        cookieBanner.classList.add('active');
      }, 1000);
    } else {
      cookieBanner.classList.add('is-hidden');
    }

    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('cookiesAccepted', 'true');
      cookieBanner.classList.remove('active');
      setTimeout(() => {
        cookieBanner.classList.add('is-hidden');
      }, 500);
    });
  }

  // Rejestracja Service Workera dla PWA (#21) z wymuszeniem pobrania świeżej wersji
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js?v=5', { updateViaCache: 'none' })
        .then((reg) => {
          if (reg && typeof reg.update === 'function') {
            reg.update().catch(() => {});
          }
        })
        .catch(() => {
          // Ciche pominięcie w środowisku deweloperskim bez HTTPS
        });
    });
  }

  // Lekka analityka Cookieless zgodna z RODO (#22, #34 - Zero-Bloat VPS Collector + kompatybilność z Umami)
  const ANALYTICS_ENDPOINT = 'https://ai.twojastronawww.pl/analytics';
  const SITE_ID = 'katosalsahub';

  function sendAnalyticsBeacon(payload) {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
      return;
    }
    try {
      const body = JSON.stringify({ site_id: SITE_ID, ...payload });
      if (typeof fetch === 'function') {
        fetch(ANALYTICS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
          mode: 'cors',
        }).catch(() => {});
      }
    } catch {
      // Ciche pominięcie w razie braku sieci lub blokady
    }
  }

  function trackCookielessPageview(pagePath) {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
      return;
    }

    const rawPath = pagePath || (window.location.pathname + (window.location.hash || ''));
    let utmSource = '';
    let searchTerm = '';
    try {
      const params = new URLSearchParams(window.location.search || '');
      utmSource = params.get('utm_source') || '';
      searchTerm = params.get('term') || params.get('q') || params.get('utm_term') || '';
    } catch {
      // Ignoruj błędy parsowania query string
    }

    sendAnalyticsBeacon({
      type: 'pageview',
      path: rawPath,
      referrer: document.referrer || '',
      utm_source: utmSource,
      term: searchTerm,
    });

    // Kompatybilność wsteczna z opcjonalnym obiektem window.umami
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track((props) => ({
        ...props,
        url: rawPath,
      }));
    }
  }

  window.trackCookielessSearch = function (term) {
    const clean = String(term || '').trim();
    if (clean.length < 2) return;
    sendAnalyticsBeacon({
      type: 'search',
      path: window.location.pathname || '/salsopedia.html',
      term: clean,
    });
  };

  trackCookielessPageview(window.location.pathname + (window.location.hash || ''));

  document.addEventListener('page:loaded', (e) => {
    const targetPath = (e && e.detail && e.detail.url) || window.location.pathname;
    trackCookielessPageview(targetPath);
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash) {
      trackCookielessPageview((window.location.pathname || '/') + window.location.hash);
    }
  });
})();
