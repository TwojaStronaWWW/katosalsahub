(function() {
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies');

    if (!cookieBanner || !acceptBtn) return;

    if (!localStorage.getItem('cookiesAccepted')) {
        setTimeout(() => {
            cookieBanner.classList.add('active');
        }, 1000);
    }

    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('cookiesAccepted', 'true');
        cookieBanner.classList.remove('active');
        // Dodatkowe zabezpieczenie - ukrycie po animacji
        setTimeout(() => {
            cookieBanner.style.display = 'none';
        }, 500);
    });
})();
