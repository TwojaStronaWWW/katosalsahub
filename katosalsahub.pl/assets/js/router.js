/**
 * SPA Router (Event Driven, Robust) v3
 * Handles navigation with concurrency control (navToken),
 * origin checks, and context-aware events.
 */

let navToken = 0; // Concurrency Token

document.addEventListener('DOMContentLoaded', () => {
    // Aktualizacja roku w stopce (#rok)
    const rokEl = document.getElementById('rok');
    if (rokEl) {
        rokEl.textContent = String(new Date().getFullYear());
    }

    // Obsługa mobilnego menu (.burger-menu)
    const burger = document.querySelector('.burger-menu');
    const navLinks = document.querySelector('.nav-links');
    if (burger && navLinks) {
        burger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            burger.classList.toggle('active');
        });
    }

    // Intercept Links
    document.body.addEventListener('click', e => {
        // Kliknięcie obsłużone wcześniej (np. link między hasłami Salsopedii)
        if (e.defaultPrevented) return;

        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // Kotwica na bieżącej stronie (#...) – płynne przewinięcie i zamknięcie menu mobilnego
        if (href.startsWith('#')) {
            if (href.length > 1) {
                const target = document.getElementById(href.slice(1));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (navLinks) navLinks.classList.remove('active');
                    if (burger) burger.classList.remove('active');
                }
            }
            return;
        }

        // Ignore special targets
        if (link.target === '_blank' || link.hasAttribute('download') || link.relList.contains('external')) return;

        // Origin Check (Robust)
        try {
            const targetUrl = new URL(href, window.location.origin);
            if (targetUrl.origin !== window.location.origin) return; // External link
        } catch {
            return; // Invalid URL
        }

        // Hash Navigation Check (Internal)
        const currentPath = window.location.pathname.replace(/^\/|\/$/g, '') || 'index.html';
        const targetUrlParts = href.split('#');
        const targetPath = targetUrlParts[0].replace(/^\/|\/$/g, '') || 'index.html';

        // If same page and hash exists, let browser handle it (scroll)
        if (currentPath === targetPath && href.includes('#')) return;

        e.preventDefault();
        navigateTo(href);
    });

    // Handle Back/Forward
    window.addEventListener('popstate', () => {
        loadPage(window.location.pathname + window.location.hash);
    });

    // Initial Event (Context: Initial)
    const initialUrl = window.location.pathname + window.location.hash;
    dispatchPageLoaded(initialUrl, { initial: true });
    updateNavLinks(initialUrl); // Ensure active state on load
});

async function navigateTo(url) {
    history.pushState(null, null, url);
    await loadPage(url);
}

async function loadPage(url) {
    const token = ++navToken; // Increment token
    const appContent = document.getElementById('app-content');
    if (!appContent) return;

    // Fade out for transition via CSS class (SoC)
    appContent.classList.add('is-loading');

    try {
        const fetchUrl = url.split('#')[0] || 'index.html';

        const response = await fetch(fetchUrl);
        if (token !== navToken) return; // Cancelled by newer navigation check 1

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const newContent = doc.getElementById('app-content');

        if (!newContent) {
            window.location.href = url; // Fallback
            return;
        }

        if (token !== navToken) return; // Cancelled by newer navigation check 2

        appContent.innerHTML = newContent.innerHTML;

        // Router is now "Dumb" - Emits Event
        dispatchPageLoaded(url, { initial: false });

        updateNavLinks(url);

        // Scroll Logic
        const hash = url.split('#')[1];
        if (hash) {
             setTimeout(() => {
                 const el = document.getElementById(hash);
                 if (el) el.scrollIntoView();
             }, 100);
        } else {
             window.scrollTo(0, 0);
        }

    } catch (error) {
        if (token !== navToken) return; // Ignore errors from old requests
        console.warn('Navigation fallback:', error);
        window.location.href = url; // Hard fallback
    } finally {
        if (token === navToken) {
            appContent.classList.remove('is-loading');
        }
    }
}

function dispatchPageLoaded(url, meta = {}) {
    const cleanUrl = url.split('#')[0] || 'index.html';
    const path = cleanUrl.replace(/^\//, '');

    document.dispatchEvent(new CustomEvent('page:loaded', {
        detail: {
            url: url,
            path: path,
            hash: url.split('#')[1] || null,
            initial: !!meta.initial
        }
    }));
}

function updateNavLinks(url) {
    const targetFile = url.split('#')[0].split('/').pop() || 'index.html';

    document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.remove('active');

        const linkHref = a.getAttribute('href').split('#')[0] || 'index.html';
        const linkFile = linkHref.split('/').pop() || 'index.html';

        if (targetFile === linkFile) {
            a.classList.add('active');
        }
    });

    // Close Mobile Menu
    const navLinks = document.querySelector('.nav-links');
    const burger = document.querySelector('.burger-menu');
    if (navLinks && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
        if (burger) burger.classList.remove('active');
    }
}
