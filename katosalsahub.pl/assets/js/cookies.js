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

  // Rejestracja Service Workera dla PWA (#21) z ochroną aktywnego odtwarzania radia
  // oraz automatycznym czyszczeniem cache na lokalnym Live Serverze
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    const isLocalLiveServer =
      window.location.port === '5500' ||
      window.location.port === '5501' ||
      window.location.pathname.includes('/katosalsahub.pl/');

    if (isLocalLiveServer) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {});
      }
    } else {
      let swRefreshing = false;
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || swRefreshing) return;
        const radioActive =
          (document.body && document.body.classList.contains('radio-playing')) ||
          Boolean(
            window.kshRadio &&
              typeof window.kshRadio.getState === 'function' &&
              (window.kshRadio.getState().isPlaying ||
                window.kshRadio.getState().isLoading ||
                window.kshRadio.getState().userRequestedPlay)
          );
        if (radioActive) return;
        swRefreshing = true;
        window.location.reload();
      });

      const registerFreshServiceWorker = () => {
        navigator.serviceWorker
          .register('sw.js?v=28', { updateViaCache: 'none' })
          .then((reg) => {
            if (reg && typeof reg.update === 'function') {
              reg.update().catch(() => {});
            }
          })
          .catch(() => {
            // Ciche pominięcie w środowisku deweloperskim bez HTTPS
          });
      };

      if (document.readyState === 'complete') {
        registerFreshServiceWorker();
      } else {
        window.addEventListener('load', registerFreshServiceWorker);
      }
    }
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

  window.__TSW_ANALYTICS_ACTIVE__ = true;

  let lcpMeasured = 0;
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries && entries.length > 0) {
          lcpMeasured = Math.round(entries[entries.length - 1].startTime || 0);
        }
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    }
  } catch {
    // Brak wsparcia PerformanceObserver
  }

  function trackCookielessPageview(pagePath, includeLcp) {
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

    const payload = {
      type: 'pageview',
      path: rawPath,
      referrer: document.referrer || '',
      utm_source: utmSource,
      term: searchTerm,
    };
    if (includeLcp && lcpMeasured > 0) {
      payload.lcp_ms = lcpMeasured;
    }
    sendAnalyticsBeacon(payload);

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

  setTimeout(() => {
    trackCookielessPageview(window.location.pathname + (window.location.hash || ''), true);
  }, 500);

  setTimeout(() => {
    if (document.visibilityState !== 'hidden') {
      sendAnalyticsBeacon({ type: 'engaged' });
    }
  }, 15000);

  document.addEventListener('page:loaded', (e) => {
    const targetPath = (e && e.detail && e.detail.url) || window.location.pathname;
    trackCookielessPageview(targetPath, false);
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash) {
      trackCookielessPageview((window.location.pathname || '/') + window.location.hash, false);
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target && e.target.closest ? e.target : null;
    if (!target) return;
    const link = target.closest('a[href]');
    if (link) {
      const href = String(link.getAttribute('href') || '');
      if (href.startsWith('tel:')) {
        sendAnalyticsBeacon({ type: 'event', event: 'cta_phone_click' });
      } else if (href.startsWith('mailto:')) {
        sendAnalyticsBeacon({ type: 'event', event: 'cta_email_click' });
      }
    }
    const radioBtn = target.closest('#header-radio-play, #radio-play, #radio-toggle, .radio-toggle, [data-radio-toggle], #radioPlayBtn');
    if (radioBtn) {
      sendAnalyticsBeacon({ type: 'event', event: 'radio_play' });
    }
    const chatBtn = target.closest('.tsw-ai-btn');
    if (chatBtn) {
      sendAnalyticsBeacon({ type: 'event', event: 'chat_open' });
    }
    const chipBtn = target.closest('.tsw-ai-chip');
    if (chipBtn) {
      sendAnalyticsBeacon({ type: 'event', event: 'quick_prompt_click' });
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.id !== 'tsw-ai-form' && (form.id === 'contactForm' || (form.classList && form.classList.contains('contact-form')))) {
      sendAnalyticsBeacon({ type: 'event', event: 'contact_form_submit' });
    }
  });
})();

