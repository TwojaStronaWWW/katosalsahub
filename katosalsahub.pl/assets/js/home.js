/**
 * Home Page Logic (Event Driven & Cloudflare Rocket Loader Safe)
 */

(function () {
'use strict';

function activateMapZone(triggerBtn, doc = document) {
    if (!triggerBtn) return;
    const mapIframe = doc.getElementById('ksh-map-iframe');
    if (!mapIframe) return;

    const targetSrc = triggerBtn.getAttribute('data-map-src');
    if (!targetSrc) return;

    const targetZone = triggerBtn.getAttribute('data-zone');
    const targetLabel = triggerBtn.getAttribute('data-label');
    const targetParkingUrl = triggerBtn.getAttribute('data-parking-url');

    const tabButtons = doc.querySelectorAll('.map-tab-btn') || [];
    const spotCards = doc.querySelectorAll('.map-spot-card') || [];
    const activeLabel = doc.getElementById('map-active-label');
    const mainParkingBtn = doc.getElementById('map-main-parking-btn');

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

    if (mainParkingBtn && targetParkingUrl) {
        mainParkingBtn.setAttribute('href', targetParkingUrl);
    }

    if (mapIframe.getAttribute('src') !== targetSrc) {
        mapIframe.setAttribute('src', targetSrc);
        if ('src' in mapIframe) {
            mapIframe.src = targetSrc;
        }
    }
}

function initMapTabs(doc = document) {
    const mapIframe = doc.getElementById('ksh-map-iframe');
    const tabButtons = doc.querySelectorAll('.map-tab-btn');
    const focusButtons = doc.querySelectorAll('.map-focus-btn') || [];
    if (!mapIframe || !tabButtons || tabButtons.length === 0) return;

    tabButtons.forEach((btn) => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => activateMapZone(btn, doc));
    });

    focusButtons.forEach((btn) => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => activateMapZone(btn, doc));
    });

    if (doc.body && doc.body.dataset && doc.body.dataset.mapDelegated !== '1') {
        doc.body.dataset.mapDelegated = '1';
        doc.body.addEventListener('click', (e) => {
            if (!e || !e.target || typeof e.target.closest !== 'function') return;
            if (e.target.closest('a.map-nav-btn, a.map-tool-btn')) return;

            const directBtn = e.target.closest('.map-tab-btn, .map-focus-btn');
            if (directBtn) {
                activateMapZone(directBtn, doc);
                return;
            }

            const card = e.target.closest('.map-spot-card');
            if (card) {
                const focusBtn = card.querySelector('.map-focus-btn');
                if (focusBtn) activateMapZone(focusBtn, doc);
            }
        });
    }
}

function initHome() {
    // Update Year in Footer
    const rok = document.getElementById('rok');
    if (rok) rok.textContent = new Date().getFullYear();

    // Initialize interactive map view tabs
    initMapTabs(document);
}

if (typeof document !== 'undefined') {
    if (document.readyState !== 'loading') {
        initHome();
    } else {
        document.addEventListener('DOMContentLoaded', initHome);
    }

    document.addEventListener('page:loaded', () => {
        initHome();
    });
}

if (typeof window !== 'undefined') {
    window.kshHome = { initHome, initMapTabs, activateMapZone };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initHome, initMapTabs, activateMapZone };
}
})();

