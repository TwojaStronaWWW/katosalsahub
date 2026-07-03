/**
 * SPA Router (Event Driven, Robust) v3
 * Handles navigation with concurrency control (navToken),
 * origin checks, and context-aware events.
 */

let navToken = 0; // Concurrency Token

document.addEventListener('DOMContentLoaded', () => {

    // Intercept Links
    document.body.addEventListener('click', e => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // Ignore special targets
        if (link.target === '_blank' || link.hasAttribute('download') || link.relList.contains('external')) return;

        // Origin Check (Robust)
        try {
            const targetUrl = new URL(href, window.location.origin);
            if (targetUrl.origin !== window.location.origin) return; // External link
        } catch (err) {
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
    
    // Fade out for transition
    appContent.style.opacity = '0.5';

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
        console.error('Navigation Error:', error);
        window.location.href = url; // Hard fallback
    } finally {
        if (token === navToken) {
            appContent.style.opacity = '1';
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
        // a.style.color logic REMOVED. Handled by CSS [data-page="wiki"]
        
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
        if(burger) burger.classList.remove('active');
    }
}
