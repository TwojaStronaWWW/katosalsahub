/**
 * Home Page Logic (Event Driven)
 */

function initMapTabs(doc = document) {
    const mapIframe = doc.getElementById('ksh-map-iframe');
    const tabButtons = doc.querySelectorAll('.map-tab-btn');
    const focusButtons = doc.querySelectorAll('.map-focus-btn') || [];
    const spotCards = doc.querySelectorAll('.map-spot-card') || [];
    const activeLabel = doc.getElementById('map-active-label');
    if (!mapIframe || !tabButtons || tabButtons.length === 0) return;

    const activateZone = (triggerBtn) => {
        const targetSrc = triggerBtn.getAttribute('data-map-src');
        if (!targetSrc) return;

        const targetZone = triggerBtn.getAttribute('data-zone');
        const targetLabel = triggerBtn.getAttribute('data-label');

        tabButtons.forEach((b) => {
            const isMatch = targetZone
                ? b.getAttribute('data-zone') === targetZone
                : b === triggerBtn;
            if (isMatch) {
                b.classList.add('is-active');
                b.setAttribute('aria-pressed', 'true');
            } else {
                b.classList.remove('is-active');
                b.setAttribute('aria-pressed', 'false');
            }
        });

        spotCards.forEach((card) => {
            if (targetZone && targetZone !== 'all' && card.getAttribute('data-zone') === targetZone) {
                card.classList.add('is-active');
            } else {
                card.classList.remove('is-active');
            }
        });

        if (activeLabel && targetLabel) {
            activeLabel.textContent = targetLabel;
        }

        if (mapIframe.getAttribute('src') !== targetSrc) {
            mapIframe.setAttribute('src', targetSrc);
        }
    };

    tabButtons.forEach((btn) => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => activateZone(btn));
    });

    focusButtons.forEach((btn) => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => activateZone(btn));
    });
}

function initHome() {
    console.log('Initializing Home Page...');

    // Update Year in Footer
    const rok = document.getElementById("rok");
    if (rok) rok.textContent = new Date().getFullYear();

    // Initialize interactive map view tabs
    initMapTabs(document);
}

if (typeof document !== 'undefined') {
    document.addEventListener('page:loaded', (e) => {
        const path = e.detail.path;
        if (path === '' || path === 'index.html') {
            initHome();
        }
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initHome, initMapTabs };
}

