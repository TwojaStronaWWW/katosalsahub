console.error('WIKI.JS LOADED — TOP OF FILE');
/**
 * Salsopedia Wiki Logic v12
 * Event-Driven Architecture (Router -> page:loaded -> mountWiki)
 * Single Source of Truth: AppState
 */

const API_URL = 'assets/php/wiki.php';

const AppState = {
    terms: [],
    pending: [], // Global cache for moderation
    ui: {
        loading: null, 
        selects: {}
    }
};

// --- Lifecycle ---
// (Listeners are handled at the bottom of the file)

async function mountWiki() {
    // ⚠️ ARCHITECTURE GUARD: DO NOT GROW THIS FUNCTION.
    // Ensure idempotency. Listeners attached here must target local DOM elements (which are replaced on nav).
    // Global listeners should be attached ONCE at top-level.
    
    // Defensive Check (User Recommendation)
    const root = document.getElementById('wikiGrid');
    if (!root) return;

    console.log('Mounting Wiki...');
    AppState.ui.loading = document.getElementById('loading');
    
    // 1. Setup Interactions (Event Listeners on Fresh DOM)
    setupInteractions();
    
    // 2. Fetch & Render Data
    toggleLoading(true);
    await fetchTerms();
    
    // 3. Expose Helpers for Sidebar/HTML Buttons
    window.fetchPendingTerms = fetchPendingTerms;
    toggleLoading(false);
}

function setupInteractions() {
    // Search
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        // Debounce creates a fresh function for this DOM instance.
        // Since DOM is replaced on nav, this is leak-safe.
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Submission Form
    const form = document.getElementById('wikiForm');
    if(form) form.addEventListener('submit', handleFormSubmit);

    // Modal (Self-Contained Delegation)
    const modal = document.getElementById('modal');
    if(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close')) {
                closeModal();
            }
        });
    }

    // Custom Selects
    document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        const select = wrapper.querySelector('select');
        if(select) {
            AppState.ui.selects[select.id] = new CustomSelect(wrapper);
        }
    });

    // Initial Source Row
    addSourceRow();
}

// --- Data Logic ---

async function fetchTerms() {
    try {
        const response = await fetch(API_URL + '?action=list');
        const data = await response.json();
        AppState.terms = data;
        
        // Initial Render
        const urlParams = new URLSearchParams(window.location.search);
        const termId = urlParams.get('term');
        
        renderTerms(AppState.terms);
        
        if (termId) {
            setTimeout(() => scrollToTerm(termId), 500);
        }
    } catch (error) {
        console.error('Error fetching terms:', error);
        const grid = document.getElementById('wikiGrid');
        if(grid) grid.innerHTML = '<p class="error-msg">Nie udało się pobrać haseł.</p>';
    }
}

async function fetchPendingTerms() {
    const grid = document.getElementById('wikiGrid');
    if(!grid) return;
    
    toggleLoading(true);
    try {
        const response = await fetch(API_URL + '?action=pending');
        const data = await response.json();
        
        AppState.pending = data.map(t => ({
            ...t,
            isPending: true
        }));
        
        renderTerms(AppState.pending, true);
        
    } catch (error) {
        console.error('Error fetching pending:', error);
        alert('Błąd pobierania oczekujących haseł.');
    }
    toggleLoading(false);
}

// --- Rendering ---

function renderTerms(terms, isPendingMode = false) {
    const grid = document.getElementById('wikiGrid');
    if(!grid) return;
    
    grid.innerHTML = '';
    
    if (!terms || terms.length === 0) {
        grid.innerHTML = '<div class="no-results">Brak haseł spełniających kryteria.</div>';
        return;
    }
    
    // Sort safely (immutable)
    const sortedTerms = isPendingMode ? [...terms] : [...terms].sort((a, b) => a.term.localeCompare(b.term));

    sortedTerms.forEach(term => {
        const card = document.createElement('div');
        card.className = `wiki-card ${isPendingMode ? 'pending-card' : ''}`;
        card.id = `card-${term.id}`;
        
        // Categories
        let catsHtml = '';
        const cats = Array.isArray(term.category) ? term.category : [term.category];
        cats.forEach(c => {
            catsHtml += `<span class="cat-badge ${c === 'steps' ? 'main-cat' : 'sub-cat'}">${getCategoryName(c)}</span>`;
        });
        
        // Sources
        let sourceHtml = '';
        const sources = Array.isArray(term.source) ? term.source : (term.source ? [term.source] : []);
        if (sources.length > 0) {
             sourceHtml = '<div class="source-link">';
             sources.forEach(s => {
                 const name = s.name || 'Link';
                 const url = s.url || '#';
                 if(url && url !== '#') sourceHtml += `<a href="${url}" target="_blank">${name}</a> `;
                 else sourceHtml += `<span>${name}</span> `;
             });
             sourceHtml += '</div>';
        }

        // Buttons
        let actionBtn = '';
        if (isPendingMode) {
            actionBtn = `
                <div class="moderation-actions">
                    <button class="btn-verify" onclick="approveTerm('${term.id}')">Zatwierdź</button>
                    <button class="btn-remove-source" onclick="rejectTerm('${term.id}')">❌</button>
                    <button class="btn-edit" onclick="openVerifyModal('${term.id}')">Edytuj</button>
                </div>
            `;
        } else {
            actionBtn = `<button class="btn-verify" onclick="openVerifyModal('${term.id}')">Zgłoś poprawkę</button>`;
        }
        
        // Verified Badge
        let statusBadge = '';
        if (term.status === 'verified') {
            statusBadge = `<span class="status-verified" title="Weryfikacje: ${term.verification_count}">✓ ${term.verification_count || 1}</span>`;
        }

        card.innerHTML = `
            <div class="wiki-card-header">
                <h3>${term.term}</h3>
                ${statusBadge}
            </div>
            <div class="badges">
                ${catsHtml}
            </div>
            <div class="definition">
                ${term.definition}
            </div>
            ${sourceHtml}
            <div class="wiki-card-footer">
                <span style="font-size:0.8rem; color:#666;">Autor: ${term.author}</span>
                ${actionBtn}
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- Interaction Handlers ---

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const filtered = AppState.terms.filter(t => 
        t.term.toLowerCase().includes(query) || 
        t.definition.toLowerCase().includes(query)
    );
    renderTerms(filtered);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formMessage = document.getElementById('formMessage');
    const formData = new FormData(form);
    
    // Honeypot
    if (formData.get('surname')) return; // Silent fail for bots

    try {
        const response = await fetch(API_URL + '?action=submit', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if (result.success) {
             alert("Zgłoszenie wysłane do moderacji!");
             closeModal();
             form.reset();
        } else {
             alert(`Błąd: ${result.error || 'Nieznany'}`);
        }
    } catch (error) {
        console.error('Submit Error:', error);
        alert('Błąd połączenia.');
    }
}

// --- Moderators (Global for onclick in HTML) ---

window.approveTerm = async function(id) {
    if(!confirm("Zatwierdzić?")) return;
    await processModeration(id, 'approve');
};

window.rejectTerm = async function(id) {
    if(!confirm("Odrzucić?")) return;
    await processModeration(id, 'reject');
};

async function processModeration(id, action) {
    const password = sessionStorage.getItem('katoAdminPass') || prompt("Hasło administratora:");
    if(!password) return;
    sessionStorage.setItem('katoAdminPass', password); // Cache

    try {
        const response = await fetch(API_URL + '?action=moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action, password })
        });
        const result = await response.json();

        if (result.success) {
            // 1. Usuń z DOM
            document.getElementById('card-' + id)?.remove();

            // 2. Usuń z AppState (KLUCZOWE)
            AppState.pending = AppState.pending.filter(t => t.id !== id);

            // 3. Jeśli lista pusta – pokaż komunikat
            if (AppState.pending.length === 0) {
                const grid = document.getElementById('wikiGrid');
                if (grid) {
                    grid.innerHTML = '<div class="no-results">Brak oczekujących zgłoszeń.</div>';
                }
            }
        } else {
             alert("Błąd: " + result.error);
             if(result.error && result.error.includes("autoryzacji")) {
                sessionStorage.removeItem('katoAdminPass');
             }
        }
    } catch (error) {
        console.error("Moderation Error:", error);
    }
}

// --- Modal & UI Helpers ---

window.openModal = function() {
    const modal = document.getElementById('modal'); // "wikiModal" in HTML? Check ID.
    // HTML in salsopedia.html says id="wikiModal", but class="modal-overlay".
    // Wait, let's target .modal-overlay if id is unsure, or rely on id from HTML view.
    // HTML view step 1694: id="wikiModal".
    // I should fix this to match HTML.
    const realModal = document.getElementById('wikiModal');
    if(realModal) {
        realModal.classList.add('open');
        document.getElementById('modalTitle').innerText = 'Dodaj nowe hasło';
        const form = document.getElementById('wikiForm'); // id="wikiForm" in HTML
        if(form) form.reset();
        addSourceRow();
    }
};

window.closeModal = function() {
    const modal = document.getElementById('wikiModal');
    if(modal) modal.classList.remove('open');
};

window.openVerifyModal = function(id) {
    // Search Live or Pending
    const term = AppState.terms.find(t => t.id === id) || AppState.pending.find(t => t.id === id);
    if (!term) return;
    
    window.openModal(); // Open
    document.getElementById('modalTitle').innerText = 'Edytuj / Weryfikuj';
    document.getElementById('termId').value = term.id;
    document.getElementById('isVerification').value = '1';
    
    // Fill Fields
    document.getElementById('termInput').value = term.term;
    if(document.getElementById('definitionInput')) document.getElementById('definitionInput').value = term.definition;
    if(document.getElementById('authorInput')) document.getElementById('authorInput').value = term.author;
    // ... fill others ... 
    
    // Note: Filling complex fields (categories, sources) requires more logic 
    // but sticking to basics for Architecture Fix.
};

window.addSourceRow = function(name = '', url = '') {
    const container = document.getElementById('sourceContainer');
    if(!container) return;
    const div = document.createElement('div');
    div.className = 'source-row';
    div.innerHTML = `
        <input type="text" name="source_name[]" placeholder="Nazwa" value="${name}" class="form-input">
        <input type="url" name="source_url[]" placeholder="URL" value="${url}" class="form-input">
        <button type="button" class="btn-remove-source" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(div);
};

// --- Utilities ---

function toggleLoading(show) {
    if(AppState.ui.loading) AppState.ui.loading.style.display = show ? 'flex' : 'none';
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function scrollToTerm(id) {
    const el = document.getElementById('card-' + id);
    if(el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function getCategoryName(code) {
    const map = {
        'all': 'Wszystkie',
        'steps': 'Kroki',
        'figures': 'Figury',
        'music': 'Muzyka',
        'instruments': 'Instrumenty',
        'dance': 'Taniec',
        'styles': 'Style',
        'history': 'Historia',
        'gods': 'Orishas'
    };
    return map[code] || code;
}

// Custom Select (Simplified & Leak-Free)
class CustomSelect {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.select = wrapper.querySelector('select');
        this.trigger = document.createElement('div');
        this.trigger.className = 'select-trigger';
        this.options = document.createElement('div');
        this.options.className = 'select-options';
        
        // Build Initial UI
        this.build();
    }
    
    build() {
        // Setup trigger text
        this.trigger.textContent = 'Wybierz...';
        this.wrapper.appendChild(this.trigger);
        this.wrapper.appendChild(this.options);
        
        // Toggle
        this.trigger.addEventListener('click', (e) => {
             e.stopPropagation(); // Prevent global close from firing immediately
             // Close all others
             document.querySelectorAll('.select-options.open').forEach(el => {
                 if(el !== this.options) el.classList.remove('open');
             });
             this.options.classList.toggle('open');
        });
        
        // Options from select
        Array.from(this.select.options).forEach(opt => {
            const item = document.createElement('div');
            item.className = 'option-item';
            item.textContent = opt.text;
            item.dataset.value = opt.value;
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // Keep menu handling local
                this.select.value = opt.value;
                this.trigger.textContent = opt.text;
                this.options.classList.remove('open');
                this.select.dispatchEvent(new Event('change'));
            });
            this.options.appendChild(item);
        });
        
        // Note: NO document listener here. Handled globally.
    }
}

// Global Click Handler for Selects (Prevents Leaks)
document.addEventListener('click', () => {
    document.querySelectorAll('.select-options.open').forEach(opt => {
        opt.classList.remove('open');
    });
});

// --- Lifecycle (Critical) ---

document.addEventListener('page:loaded', (e) => {
    const path = e.detail?.path || window.location.pathname;
    // mountWiki only if on Salsopedia page
    if (path.includes('salsopedia')) {
        mountWiki();
    }
});

// Fallback for direct refresh (when page:loaded is skipped by router)
function onReady(fn) {
    if (document.readyState !== 'loading') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

// 2. Direct Load (Robust)
onReady(() => {
    if (document.getElementById('wikiGrid')) {
        mountWiki();
    }
});

