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
        .register('sw.js?v=4', { updateViaCache: 'none' })
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

  // Lekka analityka Cookieless zgodna z RODO (#22 - kompatybilna z Umami / Plausible)
  function trackCookielessPageview(pagePath) {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
      return;
    }

    // Jeśli skonfigurowano instancję Umami, przekaż zdarzenie bez użycia ciasteczek
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track((props) => ({
        ...props,
        url: pagePath || window.location.pathname
      }));
    }
  }

  trackCookielessPageview(window.location.pathname);

  document.addEventListener('page:loaded', (e) => {
    const targetPath = (e && e.detail && e.detail.url) || window.location.pathname;
    trackCookielessPageview(targetPath);
  });
})();
