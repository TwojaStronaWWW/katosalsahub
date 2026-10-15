/**
 * KATO SALSA HUB - SALSOPEDIA WIKI ENGINE (v16 - ISO 27001 Secure Session & CSRF)
 * Moduł Bazy Wiedzy, Wyszukiwania, Społecznościowego Zgłaszania i Moderacji
 * Zero-dependency Vanilla JS, Platform-First Architecture.
 */

const API_URL = 'assets/php/wiki.php';
const STATIC_FALLBACK_URL = 'assets/data/salsopedia.json';

const AppState = {
    terms: [],
    pending: [],
    activeCategory: 'all',
    searchQuery: '',
    viewMode: 'live', // 'live' | 'pending'
    isAdmin: false,
    csrfToken: '',
    isInitialized: false,
    currentModalMode: 'new' // 'new' | 'verify' | 'admin_edit_live' | 'admin_edit_pending'
};

const CATEGORY_NAMES = {
    'all': 'Wszystkie hasła',
    'steps': 'Kroki (Podstawy)',
    'figures': 'Figury (Casino / Rueda)',
    'dance': 'Taniec',
    'styles': 'Style Tańca',
    'music': 'Muzyka',
    'instruments': 'Instrumenty',
    'history': 'Historia',
    'gods': 'Bogowie (Orishas)',
    'bands': 'Zespoły i Artyści',
    'instructors': 'Instruktorzy',
    'schools': 'Szkoły Tańca'
};

// --- Inicjalizacja i Montowanie ---

async function mountWiki() {
    const root = document.getElementById('wikiGrid');
    if (!root) return;

    // Sprawdź aktywną sesję administratora przez ciasteczko HttpOnly i token CSRF
    const cachedCsrf = sessionStorage.getItem('kato_csrf_token');
    if (cachedCsrf) {
        await verifyExistingAdminSession(cachedCsrf);
    }

    setupEventListeners();
    updateAdminToolbar();

    // Wczytaj dane
    toggleLoading(true);
    await fetchTerms();

    if (AppState.isAdmin) {
        await fetchPendingTerms();
    }
    toggleLoading(false);

    // Sprawdź parametry URL (?term= lub ?admin=1)
    const urlParams = new URLSearchParams(window.location.search);
    const termId = urlParams.get('term');
    if (termId) {
        setTimeout(() => scrollToTerm(termId), 400);
    }
    if (urlParams.get('admin') === '1' || window.location.hash === '#admin') {
        const modBtn = document.getElementById('showPendingBtn');
        if (modBtn) modBtn.classList.remove('is-hidden');
        if (!AppState.isAdmin) {
            window.openAdminLoginModal();
        }
    }
}

async function verifyExistingAdminSession(cachedCsrf) {
    try {
        const res = await fetch(API_URL + '?action=check_auth', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': cachedCsrf
            },
            body: JSON.stringify({})
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.authenticated) {
                AppState.isAdmin = true;
                AppState.csrfToken = data.csrf_token || cachedCsrf;
                sessionStorage.setItem('kato_csrf_token', AppState.csrfToken);
                return;
            }
        }
    } catch (e) {
        // Ignoruj błąd połączenia w trybie statycznym
    }
    AppState.isAdmin = false;
    AppState.csrfToken = '';
    sessionStorage.removeItem('kato_csrf_token');
}

// --- Pobieranie Danych ---

async function fetchTerms() {
    try {
        let data = null;
        try {
            const res = await fetch(API_URL + '?action=list', { credentials: 'same-origin' });
            if (res.ok) {
                const json = await res.json();
                if (Array.isArray(json)) data = json;
            }
        } catch (e) {
            console.warn('[Salsopedia] Backend PHP niedostępny, używam bazy statycznej JSON:', e.message);
        }

        if (!data) {
            const fallbackRes = await fetch(STATIC_FALLBACK_URL);
            if (fallbackRes.ok) {
                data = await fallbackRes.json();
            }
        }

        if (Array.isArray(data)) {
            AppState.terms = data;
            updateCategoryCounters();
            renderCurrentView();
        } else {
            throw new Error('Nieprawidłowy format bazy danych.');
        }
    } catch (err) {
        console.error('[Salsopedia] Błąd pobierania haseł:', err);
        const grid = document.getElementById('wikiGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="no-results">
                    <p>Nie udało się wczytać bazy haseł.</p>
                    <button class="btn btn-secondary btn-sm" data-action="retry-fetch">Spróbuj ponownie</button>
                </div>`;
        }
    }
}

async function fetchPendingTerms() {
    if (!AppState.isAdmin) return;
    try {
        const res = await fetch(API_URL + '?action=pending', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({ csrf_token: AppState.csrfToken })
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                AppState.pending = data;
                updateAdminBadges();
            }
        }
    } catch (err) {
        console.warn('[Salsopedia] Nie udało się pobrać kolejki moderacji:', err.message);
    }
}

// --- Zarządzanie Zdarzeniami DOM ---

function setupEventListeners() {
    // 1. Wyszukiwarka
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            AppState.searchQuery = e.target.value.trim().toLowerCase();
            if (clearBtn) clearBtn.classList.toggle('is-hidden', !AppState.searchQuery);
            renderCurrentView();
        }, 200));
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            AppState.searchQuery = '';
            clearBtn.classList.add('is-hidden');
            renderCurrentView();
        });
    }

    // 2. Kategorie w Sidebarze
    const categoryList = document.getElementById('categoryList');
    if (categoryList) {
        categoryList.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-category]');
            if (!li) return;
            const cat = li.dataset.category;
            setActiveCategory(cat);
        });
    }

    // 3. Reset filtra
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener('click', () => setActiveCategory('all'));
    }

    // 4. Przyciski otwierające formularz
    const sidebarAddBtn = document.getElementById('sidebarAddBtn');
    if (sidebarAddBtn) sidebarAddBtn.addEventListener('click', () => window.openModal('new'));

    const addTermBtn = document.getElementById('addTermBtn');
    if (addTermBtn) addTermBtn.addEventListener('click', () => window.openModal('new'));

    const noResultsAddBtn = document.getElementById('noResultsAddBtn');
    if (noResultsAddBtn) noResultsAddBtn.addEventListener('click', () => window.openModal('new'));

    // 5. Panel Moderacji / Oczekujące (oraz skrót Ctrl+Shift+M dla moderatora)
    const showPendingBtn = document.getElementById('showPendingBtn');
    if (showPendingBtn) {
        showPendingBtn.addEventListener('click', () => handleModerationButtonClick());
    }

    if (!AppState.isInitialized) {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
                e.preventDefault();
                const modBtn = document.getElementById('showPendingBtn');
                if (modBtn) modBtn.classList.remove('is-hidden');
                handleModerationButtonClick();
            }
        });
        AppState.isInitialized = true;
    }

    // 6. Przyciski Admin Toolbara
    const btnShowLive = document.getElementById('btnShowLive');
    if (btnShowLive) {
        btnShowLive.addEventListener('click', () => switchViewMode('live'));
    }

    const btnShowPending = document.getElementById('btnShowPending');
    if (btnShowPending) {
        btnShowPending.addEventListener('click', () => switchViewMode('pending'));
    }

    const btnAdminAdd = document.getElementById('btnAdminAdd');
    if (btnAdminAdd) {
        btnAdminAdd.addEventListener('click', () => window.openModal('admin_direct'));
    }

    const btnLogoutAdmin = document.getElementById('btnLogoutAdmin');
    if (btnLogoutAdmin) {
        btnLogoutAdmin.addEventListener('click', () => logoutAdmin());
    }

    // 7. Obsługa chipów kategorii w modalu
    setupChipsInteractions('categoryChips');
    setupChipsInteractions('subcategoryChips');

    // 8. Formularz zgłaszania/edycji hasła
    const wikiForm = document.getElementById('wikiForm');
    if (wikiForm) {
        wikiForm.addEventListener('submit', handleFormSubmit);
    }

    // 9. Formularz logowania administratora
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);
    }

    // 10. Przyciski zamykania i anulowania modali
    const wikiModalCloseBtn = document.getElementById('wikiModalCloseBtn');
    if (wikiModalCloseBtn) wikiModalCloseBtn.addEventListener('click', () => window.closeModal());

    const cancelWikiModalBtn = document.getElementById('cancelWikiModalBtn');
    if (cancelWikiModalBtn) cancelWikiModalBtn.addEventListener('click', () => window.closeModal());

    const adminLoginModalCloseBtn = document.getElementById('adminLoginModalCloseBtn');
    if (adminLoginModalCloseBtn) adminLoginModalCloseBtn.addEventListener('click', () => window.closeAdminLoginModal());

    const cancelAdminLoginBtn = document.getElementById('cancelAdminLoginBtn');
    if (cancelAdminLoginBtn) cancelAdminLoginBtn.addEventListener('click', () => window.closeAdminLoginModal());

    const addSourceRowBtn = document.getElementById('addSourceRowBtn');
    if (addSourceRowBtn) addSourceRowBtn.addEventListener('click', () => window.addSourceRow());

    // 11. Delegacja usuwania wierszy źródeł
    const sourceContainer = document.getElementById('sourceContainer');
    if (sourceContainer) {
        sourceContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-source"]');
            if (btn) {
                const row = btn.closest('.source-row');
                if (row) row.remove();
            }
        });
    }

    // 12. Delegacja akcji w siatce haseł (Zero inline handlers)
    const grid = document.getElementById('wikiGrid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            const id = target.dataset.id;
            const cat = target.dataset.cat;

            if (action === 'filter-cat' && cat) {
                setActiveCategory(cat);
            } else if (action === 'jump-term' && id) {
                e.preventDefault();
                jumpToTermCard(id);
            } else if (action === 'verify' && id) {
                window.openVerifyModal(id);
            } else if (action === 'approve' && id) {
                window.approvePendingTerm(id);
            } else if (action === 'reject' && id) {
                window.rejectPendingTerm(id);
            } else if (action === 'edit-pending' && id) {
                window.openEditPendingModal(id);
            } else if (action === 'edit-live' && id) {
                window.openEditLiveModal(id);
            } else if (action === 'delete-live' && id) {
                window.deleteLiveTerm(id);
            } else if (action === 'switch-live') {
                switchViewMode('live');
            } else if (action === 'retry-fetch') {
                fetchTerms();
            }
        });
    }

    // 13. Zamykanie modali kliknięciem w tło
    ['wikiModal', 'adminLoginModal'].forEach(modalId => {
        const el = document.getElementById(modalId);
        if (el) {
            el.addEventListener('click', (e) => {
                if (e.target === el) {
                    el.classList.remove('open', 'is-open');
                }
            });
        }
    });
}

function setupChipsInteractions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        chip.classList.toggle('active');
    });
}

// --- Filtrowanie i Renderowanie ---

function setActiveCategory(cat) {
    AppState.activeCategory = cat;

    if (AppState.viewMode === 'pending') {
        switchViewMode('live');
    }

    document.querySelectorAll('#categoryList li').forEach(li => {
        li.classList.toggle('active', li.dataset.category === cat);
    });

    const badge = document.getElementById('activeFilterBadge');
    if (badge) badge.textContent = CATEGORY_NAMES[cat] || cat;

    const resetBtn = document.getElementById('resetFilterBtn');
    if (resetBtn) resetBtn.classList.toggle('is-hidden', cat === 'all');

    renderCurrentView();
}

function switchViewMode(mode) {
    AppState.viewMode = mode;

    const btnLive = document.getElementById('btnShowLive');
    const btnPending = document.getElementById('btnShowPending');
    if (btnLive && btnPending) {
        btnLive.classList.toggle('active', mode === 'live');
        btnPending.classList.toggle('active', mode === 'pending');
    }

    const filterBadge = document.getElementById('activeFilterBadge');
    if (filterBadge) {
        filterBadge.textContent = mode === 'pending'
            ? '⏳ Kolejka Moderacji (Oczekujące Zgłoszenia)'
            : (CATEGORY_NAMES[AppState.activeCategory] || 'Wszystkie hasła');
    }

    renderCurrentView();
}

function renderCurrentView() {
    const grid = document.getElementById('wikiGrid');
    const noResults = document.getElementById('noResults');
    const countEl = document.getElementById('resultsCount');
    if (!grid) return;

    grid.innerHTML = '';

    if (AppState.viewMode === 'pending') {
        renderPendingTerms(grid, noResults, countEl);
    } else {
        renderLiveTerms(grid, noResults, countEl);
    }
}

function renderLiveTerms(grid, noResults, countEl) {
    let list = [...AppState.terms];

    if (AppState.activeCategory !== 'all') {
        list = list.filter(item => {
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            return cats.includes(AppState.activeCategory);
        });
    }

    if (AppState.searchQuery) {
        const q = AppState.searchQuery;
        list = list.filter(item =>
            (item.term && item.term.toLowerCase().includes(q)) ||
            (item.definition && item.definition.toLowerCase().includes(q)) ||
            (item.author && item.author.toLowerCase().includes(q))
        );
    }

    list.sort((a, b) => (a.term || '').localeCompare(b.term || '', 'pl', { sensitivity: 'base' }));

    if (countEl) {
        countEl.textContent = `Wyświetlono: ${list.length} z ${AppState.terms.length} haseł`;
    }

    if (list.length === 0) {
        if (noResults) noResults.classList.remove('is-hidden', 'hidden');
        return;
    }
    if (noResults) noResults.classList.add('is-hidden', 'hidden');

    list.forEach(item => {
        grid.appendChild(createTermCard(item, false));
    });
}

function renderPendingTerms(grid, noResults, countEl) {
    const list = [...AppState.pending];

    if (countEl) {
        countEl.textContent = `Do moderacji: ${list.length} oczekujących zgłoszeń`;
    }

    if (list.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-check-circle fa-3x no-results-icon"></i>
                <h3>Kolejka moderacji jest pusta</h3>
                <p>Wszystkie nadesłane propozycje haseł zostały zweryfikowane!</p>
                <button class="btn btn-secondary btn-sm" data-action="switch-live">Wróć do bazy wiedzy</button>
            </div>`;
        return;
    }

    list.forEach(item => {
        grid.appendChild(createTermCard(item, true));
    });
}

function isSafeHttpUrl(url) {
    return typeof url === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(url.trim());
}

function createTermCard(item, isPending = false) {
    const rawId = String(item.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeId = escapeHtml(rawId || item.id || '');
    const safeTerm = escapeHtml(item.term || '');

    const card = document.createElement('div');
    card.className = `wiki-card ${isPending ? 'pending-card' : ''}`;
    card.id = `card-${rawId}`;

    let ribbonHtml = '';
    if (isPending) {
        const act = item.pending_action || 'new';
        const label = act === 'verify' ? 'Prośba o weryfikację' : (act === 'edit' ? 'Edycja istniejącego' : 'Nowe hasło');
        ribbonHtml = `<span class="pending-ribbon"><i class="fas fa-clock"></i> ${label}</span>`;
    }

    let verifiedHtml = '';
    if (item.status === 'verified') {
        const count = Number.parseInt(item.verification_count, 10) || 1;
        verifiedHtml = `<span class="status-verified" title="Hasło zweryfikowane merytorycznie przez ${count} instruktorów / moderatorów Kato Salsa Hub"><i class="fas fa-check-circle"></i> ${count}</span>`;
    }

    let badgesHtml = '';
    const cats = Array.isArray(item.category) ? item.category : [item.category];
    cats.forEach(c => {
        if (!c) return;
        const safeCat = escapeHtml(c);
        const safeCatName = escapeHtml(CATEGORY_NAMES[c] || c);
        badgesHtml += `<span class="cat-badge main-cat" data-action="filter-cat" data-cat="${safeCat}">${safeCatName}</span>`;
    });

    const subs = Array.isArray(item.subcategory) ? item.subcategory : (item.subcategory ? [item.subcategory] : []);
    subs.forEach(s => {
        if (!s) return;
        badgesHtml += `<span class="cat-badge sub-cat">${escapeHtml(s)}</span>`;
    });

    let sourcesHtml = '';
    const sources = Array.isArray(item.source) ? item.source : (item.source ? [item.source] : []);
    if (sources.length > 0) {
        sourcesHtml = '<div class="source-container-preview">';
        sources.forEach(src => {
            const name = typeof src === 'object' ? (src.name || 'Źródło') : src;
            const url = typeof src === 'object' ? (src.url || '') : '';
            if (isSafeHttpUrl(url)) {
                const iconClass = url.includes('youtube.com') ? 'fa-play-circle' : 'fa-external-link-alt';
                sourcesHtml += `<a href="${escapeHtml(url.trim())}" target="_blank" rel="noopener noreferrer" class="source-pill" title="Otwórz w nowej karcie: ${escapeHtml(name)}"><i class="fas ${iconClass}"></i> ${escapeHtml(name)}</a>`;
            } else if (name) {
                const ytFallback = `https://www.youtube.com/results?search_query=${encodeURIComponent((item.term || '') + ' Salsa Cubana')}`;
                sourcesHtml += `<a href="${escapeHtml(ytFallback)}" target="_blank" rel="noopener noreferrer" class="source-pill" title="Zobacz prezentację wideo na YouTube: ${safeTerm}"><i class="fas fa-play-circle"></i> ${escapeHtml(name)}</a>`;
            }
        });
        sourcesHtml += '</div>';
    }

    const safeAuthor = escapeHtml(item.author || 'Społeczność');
    let authorHtml = `<span class="author-meta">Autor: <strong>${safeAuthor}</strong></span>`;
    if (isSafeHttpUrl(item.author_link)) {
        authorHtml = `<span class="author-meta">Autor: <a href="${escapeHtml(item.author_link.trim())}" target="_blank" rel="noopener noreferrer"><strong>${safeAuthor}</strong> <i class="fas fa-link"></i></a></span>`;
    }

    let actionsHtml = '';
    if (isPending) {
        actionsHtml = `
            <div class="moderation-actions">
                <button class="btn-approve" data-action="approve" data-id="${safeId}" title="Zatwierdź i opublikuj w bazie">
                    <i class="fas fa-check"></i> Zatwierdź
                </button>
                <button class="btn-edit-admin" data-action="edit-pending" data-id="${safeId}" title="Popraw przed zatwierdzeniem">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="btn-reject" data-action="reject" data-id="${safeId}" title="Odrzuć propozycję">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
    } else if (AppState.isAdmin) {
        actionsHtml = `
            <div class="moderation-actions">
                <button class="btn-edit-admin" data-action="edit-live" data-id="${safeId}" title="Edytuj hasło">
                    <i class="fas fa-edit"></i> Edytuj
                </button>
                <button class="btn-delete-admin" data-action="delete-live" data-id="${safeId}" title="Usuń z bazy">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>`;
    } else {
        actionsHtml = `
            <button class="btn-verify" data-action="verify" data-id="${safeId}" title="Zaproponuj poprawkę do tego hasła">
                <i class="fas fa-pencil-alt"></i> Zgłoś poprawkę
            </button>`;
    }

    card.innerHTML = `
        ${ribbonHtml}
        <div class="wiki-card-header">
            <h3>${safeTerm}</h3>
            ${verifiedHtml}
        </div>
        <div class="badges">
            ${badgesHtml}
        </div>
        <div class="definition">
            ${linkifyDefinition(item.definition || '', rawId)}
        </div>
        ${sourcesHtml}
        <div class="wiki-card-footer">
            ${authorHtml}
            ${actionsHtml}
        </div>
    `;

    return card;
}

// --- Liczniki w Sidebarze i Pasku ---

function updateCategoryCounters() {
    const counts = { 'all': AppState.terms.length };
    AppState.terms.forEach(term => {
        const cats = Array.isArray(term.category) ? term.category : [term.category];
        cats.forEach(c => {
            if (!c) return;
            counts[c] = (counts[c] || 0) + 1;
        });
    });

    Object.keys(CATEGORY_NAMES).forEach(cat => {
        const el = document.getElementById(`count-${cat}`);
        if (el) el.textContent = counts[cat] || 0;
    });

    const liveBadge = document.getElementById('liveCountBadge');
    if (liveBadge) liveBadge.textContent = AppState.terms.length;
}

function updateAdminBadges() {
    const pendingBadge = document.getElementById('pendingCountBadge');
    if (pendingBadge) pendingBadge.textContent = AppState.pending.length;
}

function updateAdminToolbar() {
    const toolbar = document.getElementById('adminToolbar');
    if (!toolbar) return;
    toolbar.classList.toggle('is-hidden', !AppState.isAdmin);
}

// --- Obsługa Zgłoszeń i Formularzy ---

window.openModal = function (mode = 'new', termData = null) {
    AppState.currentModalMode = mode;
    const modal = document.getElementById('wikiModal');
    const form = document.getElementById('wikiForm');
    const title = document.getElementById('modalTitle');
    const msgBox = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitTermBtn');

    if (!modal || !form) return;

    form.reset();
    if (msgBox) {
        msgBox.className = 'form-message-box is-hidden';
    }

    const sourceContainer = document.getElementById('sourceContainer');
    if (sourceContainer) sourceContainer.innerHTML = '';

    resetChips('categoryChips');
    resetChips('subcategoryChips');

    document.getElementById('termId').value = '';
    document.getElementById('isVerification').value = '';
    document.getElementById('formAdminDirect').value = '';

    if (mode === 'new' || mode === 'admin_direct') {
        title.innerHTML = '<i class="fas fa-plus-circle"></i> Zaproponuj nowe hasło';
        submitBtn.innerHTML = AppState.isAdmin
            ? '<i class="fas fa-save"></i> Zapisz bezpośrednio w bazie'
            : '<i class="fas fa-paper-plane"></i> Wyślij do moderacji';
        activateChips('categoryChips', ['dance']);
        window.addSourceRow();
        if (mode === 'admin_direct') {
            AppState.currentModalMode = 'admin_edit_live';
        }
    } else if (mode === 'verify' && termData) {
        title.innerHTML = '<i class="fas fa-pencil-alt"></i> Zgłoś poprawkę do hasła';
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Prześlij propozycję poprawki';
        populateModalWithTerm(termData);
        document.getElementById('isVerification').value = '1';
    } else if (mode === 'admin_edit_live' && termData) {
        title.innerHTML = '<i class="fas fa-user-edit"></i> Edytuj hasło w bazie (Admin)';
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Zapisz zmiany w bazie';
        document.getElementById('formAdminDirect').value = '1';
        populateModalWithTerm(termData);
    } else if (mode === 'admin_edit_pending' && termData) {
        title.innerHTML = '<i class="fas fa-check-double"></i> Popraw przed zatwierdzeniem';
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Zapisz i zatwierdź hasło';
        populateModalWithTerm(termData);
    }

    modal.classList.add('is-open', 'open');
};

window.closeModal = function () {
    const modal = document.getElementById('wikiModal');
    if (modal) modal.classList.remove('is-open', 'open');
};

function populateModalWithTerm(term) {
    document.getElementById('termId').value = term.id || '';
    document.getElementById('termInput').value = term.term || '';
    document.getElementById('definitionInput').value = term.definition || '';
    document.getElementById('authorInput').value = term.author || '';
    document.getElementById('authorLinkInput').value = term.author_link || '';
    document.getElementById('userCategoryInput').value = term.user_category || '';

    const cats = Array.isArray(term.category) ? term.category : [term.category];
    activateChips('categoryChips', cats);

    const subs = Array.isArray(term.subcategory) ? term.subcategory : (term.subcategory ? [term.subcategory] : []);
    activateChips('subcategoryChips', subs);

    const sources = Array.isArray(term.source) ? term.source : (term.source ? [term.source] : []);
    if (sources.length > 0) {
        sources.forEach(s => {
            const name = typeof s === 'object' ? s.name : s;
            const url = typeof s === 'object' ? s.url : '';
            window.addSourceRow(name, url);
        });
    } else {
        window.addSourceRow();
    }
}

function resetChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
}

function activateChips(containerId, values) {
    const container = document.getElementById(containerId);
    if (!container || !values) return;
    container.querySelectorAll('.chip').forEach(chip => {
        if (values.includes(chip.dataset.val)) {
            chip.classList.add('active');
        }
    });
}

function getActiveChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.chip.active')).map(c => c.dataset.val);
}

window.addSourceRow = function (name = '', url = '') {
    const container = document.getElementById('sourceContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'source-row';
    div.innerHTML = `
        <input type="text" name="source_name[]" placeholder="Nazwa (np. Rueda Standard, Książka...)" value="${escapeHtml(name)}" class="form-input">
        <input type="url" name="source_url[]" placeholder="URL (opcjonalnie)" value="${escapeHtml(url)}" class="form-input">
        <button type="button" class="btn-remove-source" data-action="remove-source" title="Usuń źródło">&times;</button>
    `;
    container.appendChild(div);
};

async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const msgBox = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitTermBtn');

    // Honeypot
    const surname = form.querySelector('[name="surname"]')?.value;
    const hpChk = form.querySelector('[name="hp_chk"]')?.value;
    if (surname || hpChk) {
        showMessage(msgBox, 'success', 'Dziękujemy! Hasło zostało przesłane do weryfikacji.');
        setTimeout(() => window.closeModal(), 1200);
        return;
    }

    const categories = getActiveChips('categoryChips');
    if (categories.length === 0) {
        showMessage(msgBox, 'error', 'Wybierz przynajmniej jedną kategorię główną!');
        return;
    }

    const sources = [];
    const nameInputs = form.querySelectorAll('input[name="source_name[]"]');
    const urlInputs = form.querySelectorAll('input[name="source_url[]"]');
    for (let i = 0; i < nameInputs.length; i++) {
        const sName = nameInputs[i].value.trim();
        const sUrl = urlInputs[i].value.trim();
        if (sName || sUrl) {
            sources.push({ name: sName, url: sUrl });
        }
    }

    const payload = {
        id: document.getElementById('termId').value.trim() || undefined,
        term: document.getElementById('termInput').value.trim(),
        definition: document.getElementById('definitionInput').value.trim(),
        author: document.getElementById('authorInput').value.trim(),
        author_link: document.getElementById('authorLinkInput').value.trim(),
        user_category: document.getElementById('userCategoryInput').value.trim(),
        category: categories,
        subcategory: getActiveChips('subcategoryChips'),
        source: sources,
        verification_request: document.getElementById('isVerification').value === '1'
    };

    if (submitBtn) submitBtn.disabled = true;

    try {
        // Scenariusz 1: Administrator bezpośrednio edytuje lub dodaje w bazie live
        if (AppState.isAdmin && AppState.currentModalMode === 'admin_edit_live') {
            const res = await fetch(API_URL + '?action=admin_save', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                body: JSON.stringify({
                    csrf_token: AppState.csrfToken,
                    entry: payload
                })
            });
            const result = await res.json();
            if (result.success) {
                showMessage(msgBox, 'success', 'Hasło zostało pomyślnie zapisane w bazie!');
                await fetchTerms();
                setTimeout(() => window.closeModal(), 1000);
            } else {
                showMessage(msgBox, 'error', result.error || 'Błąd zapisu');
            }
            return;
        }

        // Scenariusz 2: Administrator poprawia zgłoszenie przed zatwierdzeniem
        if (AppState.isAdmin && AppState.currentModalMode === 'admin_edit_pending') {
            const res = await fetch(API_URL + '?action=moderate', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': AppState.csrfToken
                },
                body: JSON.stringify({
                    csrf_token: AppState.csrfToken,
                    id: payload.id,
                    action: 'approve',
                    updated_entry: payload
                })
            });
            const result = await res.json();
            if (result.success) {
                showMessage(msgBox, 'success', 'Zgłoszenie poprawione i pomyślnie zatwierdzone!');
                await fetchTerms();
                await fetchPendingTerms();
                setTimeout(() => {
                    window.closeModal();
                    switchViewMode('live');
                }, 1000);
            } else {
                showMessage(msgBox, 'error', result.error || 'Błąd moderacji');
            }
            return;
        }

        // Scenariusz 3: Normalne zgłoszenie społeczności
        let responseSuccess = false;
        try {
            const res = await fetch(API_URL + '?action=submit', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                responseSuccess = true;
            } else {
                showMessage(msgBox, 'error', result.error || 'Wystąpił błąd podczas wysyłania.');
            }
        } catch (netErr) {
            console.warn('[Salsopedia] Brak aktywnego backendu PHP. Symulacja zapisu lokalnego:', netErr.message);
            responseSuccess = true;
        }

        if (responseSuccess) {
            showMessage(msgBox, 'success', 'Dziękujemy! Twoja propozycja trafiła do moderacji.');
            form.reset();
            setTimeout(() => window.closeModal(), 1500);
        }
    } catch (err) {
        console.error('[Salsopedia] Submit error:', err);
        showMessage(msgBox, 'error', 'Błąd połączenia z serwerem. Spróbuj ponownie.');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- Akcje Moderatora / Administratora ---

function handleModerationButtonClick() {
    if (AppState.isAdmin) {
        switchViewMode(AppState.viewMode === 'pending' ? 'live' : 'pending');
    } else {
        window.openAdminLoginModal();
    }
}

window.openAdminLoginModal = function () {
    const modal = document.getElementById('adminLoginModal');
    const msg = document.getElementById('adminLoginMessage');
    const passInput = document.getElementById('adminPasswordInput');
    if (msg) msg.className = 'form-message-box is-hidden';
    if (passInput) passInput.value = '';
    if (modal) modal.classList.add('is-open', 'open');
};

window.closeAdminLoginModal = function () {
    const modal = document.getElementById('adminLoginModal');
    if (modal) modal.classList.remove('is-open', 'open');
};

async function handleAdminLoginSubmit(e) {
    e.preventDefault();
    const passInput = document.getElementById('adminPasswordInput');
    const pass = passInput ? passInput.value.trim() : '';
    const msg = document.getElementById('adminLoginMessage');

    try {
        const res = await fetch(API_URL + '?action=check_auth', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
        });
        const result = await res.json();
        if (result.success && result.authenticated) {
            AppState.isAdmin = true;
            AppState.csrfToken = result.csrf_token || '';
            if (AppState.csrfToken) {
                sessionStorage.setItem('kato_csrf_token', AppState.csrfToken);
            }
            if (passInput) passInput.value = '';
            updateAdminToolbar();
            window.closeAdminLoginModal();
            await fetchPendingTerms();
            switchViewMode('pending');
        } else {
            showMessage(msg, 'error', result.error || 'Niepoprawne hasło administratora!');
        }
    } catch (err) {
        showMessage(msg, 'error', 'Brak połączenia z serwerem autoryzacji.');
    }
}

async function logoutAdmin() {
    try {
        await fetch(API_URL + '?action=logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': AppState.csrfToken }
        });
    } catch (e) {
        // Ignoruj błędy sieci przy wylogowaniu
    }
    AppState.isAdmin = false;
    AppState.csrfToken = '';
    sessionStorage.removeItem('kato_csrf_token');
    updateAdminToolbar();
    switchViewMode('live');
}

window.approvePendingTerm = async function (id) {
    if (!confirm('Czy na pewno chcesz zatwierdzić to hasło i opublikować je w bazie Salsopedii?')) return;
    try {
        const res = await fetch(API_URL + '?action=moderate', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({
                csrf_token: AppState.csrfToken,
                id,
                action: 'approve'
            })
        });
        const result = await res.json();
        if (result.success) {
            AppState.pending = AppState.pending.filter(t => t.id !== id);
            updateAdminBadges();
            await fetchTerms();
            renderCurrentView();
        } else {
            alert('Błąd: ' + (result.error || 'Nieznany'));
        }
    } catch (err) {
        console.error('Błąd zatwierdzania:', err);
    }
};

window.rejectPendingTerm = async function (id) {
    if (!confirm('Czy na pewno chcesz odrzucić to zgłoszenie? Zostanie ono trwale usunięte z kolejki.')) return;
    try {
        const res = await fetch(API_URL + '?action=moderate', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({
                csrf_token: AppState.csrfToken,
                id,
                action: 'reject'
            })
        });
        const result = await res.json();
        if (result.success) {
            AppState.pending = AppState.pending.filter(t => t.id !== id);
            updateAdminBadges();
            renderCurrentView();
        } else {
            alert('Błąd: ' + (result.error || 'Nieznany'));
        }
    } catch (err) {
        console.error('Błąd odrzucania:', err);
    }
};

window.openEditLiveModal = function (id) {
    const term = AppState.terms.find(t => t.id === id);
    if (!term) return;
    window.openModal('admin_edit_live', term);
};

window.openEditPendingModal = function (id) {
    const term = AppState.pending.find(t => t.id === id);
    if (!term) return;
    window.openModal('admin_edit_pending', term);
};

window.openVerifyModal = function (id) {
    const term = AppState.terms.find(t => t.id === id);
    if (!term) return;
    window.openModal('verify', term);
};

window.deleteLiveTerm = async function (id) {
    if (!confirm('UWAGA: Czy na pewno chcesz bezpowrotnie usunąć to hasło z bazy Salsopedii?')) return;
    try {
        const res = await fetch(API_URL + '?action=admin_delete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({
                csrf_token: AppState.csrfToken,
                id
            })
        });
        const result = await res.json();
        if (result.success) {
            AppState.terms = AppState.terms.filter(t => t.id !== id);
            updateCategoryCounters();
            renderCurrentView();
        } else {
            alert('Błąd: ' + (result.error || 'Nieznany'));
        }
    } catch (err) {
        console.error('Błąd usuwania hasła:', err);
    }
};

// --- Pomocnicze Funkcje UI ---

function toggleLoading(show) {
    const el = document.getElementById('loading');
    if (el) el.classList.toggle('is-hidden', !show);
}

function showMessage(el, type, text) {
    if (!el) return;
    el.className = `form-message-box ${type}`;
    el.textContent = text;
    el.classList.remove('is-hidden');
}

function scrollToTerm(id) {
    const card = document.getElementById(`card-${id}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-highlighted');
        setTimeout(() => {
            card.classList.remove('is-highlighted');
        }, 2000);
    }
}

function jumpToTermCard(id) {
    let card = document.getElementById(`card-${id}`);
    if (!card) {
        // Jeśli hasło jest ukryte przez filtr kategorii lub wyszukiwarkę, zresetuj widok
        AppState.activeCategory = 'all';
        AppState.searchQuery = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.classList.add('is-hidden');
        document.querySelectorAll('#categoryList li').forEach(li => {
            li.classList.toggle('active', li.dataset.category === 'all');
        });
        const badge = document.getElementById('activeFilterBadge');
        if (badge) badge.textContent = CATEGORY_NAMES['all'];
        const resetBtn = document.getElementById('resetFilterBtn');
        if (resetBtn) resetBtn.classList.add('is-hidden');
        renderCurrentView();
    }
    scrollToTerm(id);
}

// --- Silnik Auto-Linkowania Słów Kluczowych (Wikipedia-style Cross-Linking) ---

const POLISH_KEYWORD_ALIASES = {
    'Rueda de Casino': ['Rueda de Casino', 'Rueda', 'Ruedzie', 'Ruedy', 'Ruedę', 'Ruedą'],
    'Casino': ['Salsa Cubana', 'Salsy Kubańskiej', 'Salsie Kubańskiej', 'Salsę Kubańską', 'Casino'],
    'Salsa': ['Salsa', 'Salsy', 'Salsie', 'Salsę', 'Salsą'],
    'Timba': ['Timba', 'Timby', 'Timbie', 'Timbę', 'Timbą'],
    'Son': ['Son Cubano', 'Sonu', 'Sonie', 'Son'],
    'Rumba': ['Rumba', 'Rumby', 'Rumbie', 'Rumbę', 'Rumbą'],
    'Guaguancó': ['Guaguancó', 'Guaguanco'],
    'Columbia': ['Columbia', 'Columbii', 'Columbię'],
    'Yambú': ['Yambú', 'Yambu'],
    'Clave': ['Clave'],
    'Dile Que No (DQN)': ['Dile Que No', 'DQN'],
    'Guapea': ['Guapea', 'Guapei', 'Guapeę'],
    'Enchufla': ['Enchufla', 'Enchufli', 'Enchuflę'],
    'Vacilala': ['Vacilala', 'Vacilali', 'Vacilalę'],
    'Setenta (70)': ['Setenta', 'Setenty', 'Setencie'],
    'Sombrero': ['Sombrero'],
    'Dame (Dame Una)': ['Dame Una', 'Dame Dos', 'Dame'],
    'Adiós (Prima)': ['Adiós', 'Prima'],
    'Orishas': ['Orishas', 'Orisha', 'Oriszów', 'Orisze'],
    'Santería': ['Santería', 'Santerii', 'Santerię', 'Santeria'],
    'Bata': ['Bata', 'Batá'],
    'Conga': ['Conga', 'Congi', 'Cong'],
    'Bongosy': ['Bongosy', 'Bongosów', 'Bongosach'],
    'Timbales': ['Timbales', 'Timbalesy', 'Timbalesów'],
    'Tres': ['Tres'],
    'Güiro': ['Güiro', 'Guiro'],
    'Marakasy': ['Marakasy', 'Marakasów'],
    'Campana': ['Campana', 'Campany'],
    'Despelote': ['Despelote'],
    'Tembleque': ['Tembleque'],
    "P'al Medio (Pa'l Medio)": ["P'al Medio", "Pa'l Medio"],
    'Tarraxa / Tarraxinha': ['Tarraxa', 'Tarraxinha', 'Tarraxinhi'],
    'Saída': ['Saída', 'Saida', 'Saidy'],
    'Semba': ['Semba', 'Semby', 'Sembie', 'Sembę'],
    'Reggaeton': ['Reggaeton', 'Reggaetonu', 'Reggaetonie', 'Cubaton', 'Cubatonu'],
    'Cha-cha-chá': ['Cha-cha-chá', 'Cha-cha', 'Cha-chy'],
    'Mambo': ['Mambo'],
    'Son Montuno': ['Son Montuno', 'Montuno'],
    'Changüí': ['Changüí', 'Changui'],
    'Danzón': ['Danzón', 'Danzon', 'Danzonu'],
    'Contratiempo': ['Contratiempo'],
    'A Tiempo': ['A Tiempo'],
    'Bomba': ['Bomba', 'Bomby'],
    'Pilon': ['Pilon', 'Pilón'],
    'Songo': ['Songo'],
    'Cantante': ['Cantante'],
    'Coro': ['Coro'],
    'Pregón': ['Pregón', 'Pregon'],
    'Tumbao': ['Tumbao'],
    'Musicality': ['Musicality', 'Muzykalność', 'Muzykalności'],
    'La Clave (Katowice)': ['La Clave'],
    'Mil Pasos (Katowice)': ['Mil Pasos'],
    'Salsa Los Amigos (Katowice / Sosnowiec)': ['Salsa Los Amigos'],
    'Nova Szkoła Tańca (Katowice)': ['Nova Szkoła Tańca', 'Novej Szkole Tańca'],
    'Evolution Dance Studio (Katowice)': ['Evolution Dance Studio'],
    'KIZLAB (Katowice)': ['KIZLAB'],
    'VAMULA.pl Akademia Kizomby (Katowice)': ['VAMULA.pl', 'Vamula'],
    'Gravitacja / Dance Plus Plus (Katowice)': ['Gravitacja', 'Gravitacji', 'Dance Plus Plus', 'Punkt 44'],
    'Dolina Trzech Stawów — Kato Salsa Hub (Katowice)': ['Dolina Trzech Stawów', 'Doliny Trzech Stawów', 'Dolinie Trzech Stawów', 'Kato Salsa Hub'],
    'Śląska Szkoła Tańca Dariusz Kurzeja (Katowice / Śląsk)': ['Śląska Szkoła Tańca', 'Śląskiej Szkoły Tańca', 'Śląską Szkołę Tańca'],
    'Szkoła Tańca Mohito (Gliwice / Tychy)': ['Szkoła Tańca Mohito', 'Mohito'],
    'DANCE#LOVEit & Corazon (Bielsko-Biała)': ['DANCE#LOVEit', 'Corazon'],
    'Sebastian Ciosiński (La Clave)': ['Sebastian Ciosiński', 'Sebastiana Ciosińskiego', 'Sebastianem Ciosińskim'],
    'Ania Seruga (La Clave)': ['Ania Seruga', 'Ani Serugi', 'Anią Serugą'],
    'Dariusz „Darek” Gruszczyk (La Clave)': ['Dariusz Gruszczyk', 'Dariusza Gruszczyka', 'Darek Gruszczyk'],
    'Ziemek i Olita (La Clave)': ['Ziemek i Olita', 'Ziemek & Olita'],
    'Klaudia i Adriano (La Clave)': ['Klaudia i Adriano', 'Klaudia & Adriano'],
    'Marzena „Marziiik” i Jacek (La Clave)': ['Marzena „Marziiik” i Jacek', 'Marziiik'],
    'Maciek Zahorodny (La Clave)': ['Maciek Zahorodny', 'Maćka Zahorodnego'],
    'Justyna Sarzyńska (La Clave)': ['Justyna Sarzyńska', 'Justyny Sarzyńskiej'],
    'Daniel Galas (Mil Pasos)': ['Daniel Galas', 'Daniela Galasa', 'Danielem Galasem'],
    'Anita i Grzegorz (Mil Pasos)': ['Anita i Grzegorz'],
    'Iza i Krystian (Mil Pasos)': ['Iza i Krystian'],
    'Wiola i Konrad (Mil Pasos)': ['Wiola i Konrad'],
    'Jędrzej „Jędrek” Górski (Salsa Los Amigos)': ['Jędrzej „Jędrek” Górski', 'Jędrzej Górski', 'Jędrka Górskiego', 'Jędrek Górski'],
    'Iwona (Salsa Los Amigos)': ['Iwona'],
    'Regla Maria Peñalver Hernández (Kuba / Katowice)': ['Regla Maria Peñalver Hernández', 'Regla', 'Regli', 'Reglą'],
    'Daniel Machalica (Katowice)': ['Daniel Machalica', 'Daniela Machalicę', 'Daniela Machalicy'],
    'Dariusz Kurzeja (Śląska Szkoła Tańca)': ['Dariusz Kurzeja', 'Dariusza Kurzei', 'Dariuszem Kurzeją', 'Dariusza Kurzeję'],
    'Pedro y Bella (VAMULA.pl)': ['Pedro y Bella', 'Pedro'],
    'Ela Stępień i Michał Rozewski (KIZLAB)': ['Ela Stępień i Michał Rozewski', 'Ela Stępień', 'Eli Stępień', 'Michał Rozewski', 'Michała Rozewskiego'],
    'Daniel Rojewski i Maja Modliszewska': ['Daniel Rojewski i Maja Modliszewska', 'Daniel Rojewski', 'Maja Modliszewska'],
    'Damian Ratajczak (FeelTheSalsa)': ['Damian Ratajczak', 'Damiana Ratajczaka', 'FeelTheSalsa'],
    'Leidel Portuondo (Kuba)': ['Leidel Portuondo', 'Leidela Portuondo'],
    'Paso Básico (Krok podstawowy)': ['Paso Básico', 'Krok podstawowy', 'kroku podstawowego', 'krok podstawowy'],
    'Lateral (Cucaracha)': ['Cucaracha', 'Lateral'],
    'Punta y Talón': ['Punta y Talón', 'Punta y Talon'],
    'Suzy Q (Susie Q)': ['Suzy Q', 'Susie Q'],
    'Setenta (70)': ['Setenta', 'Setenty', 'Setencie']
};

const GEO_IGNORE_TOKENS = new Set([
    'katowice', 'kuba', 'śląsk', 'gliwice / tychy', 'bielsko-biała',
    'katowice / śląsk', 'kuba / katowice', 'katowice / sosnowiec',
    'w salsie', 'orishas', '70', '7', '71', 'la clave', 'mil pasos',
    'salsa los amigos', 'śląska szkoła tańca', 'kizlab', 'vamula.pl', 'krok podstawowy'
]);

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordEntries(terms) {
    const entries = [];
    const seenPhraseLower = new Set();

    const addEntry = (phrase, termObj) => {
        const clean = (phrase || '').trim();
        if (clean.length < 3) return;
        const lower = clean.toLowerCase();
        if (GEO_IGNORE_TOKENS.has(lower)) return;
        if (seenPhraseLower.has(lower)) return;
        seenPhraseLower.add(lower);
        entries.push({
            phrase: clean,
            lower,
            id: termObj.id,
            term: termObj.term
        });
    };

    (terms || []).forEach(t => {
        if (!t || !t.id || !t.term) return;
        addEntry(t.term, t);

        // Warianty z polskiego słownika odmian fleksyjnych
        const aliases = POLISH_KEYWORD_ALIASES[t.term];
        if (Array.isArray(aliases)) {
            aliases.forEach(a => addEntry(a, t));
        }

        // Nazwa bazowa przed nawiasem lub myślnikiem, np. "La Clave (Katowice)" -> "La Clave"
        const parenMatch = t.term.match(/^([^(—]+?)\s*(?:\(([^)]+)\)|—\s*(.+))$/);
        if (parenMatch) {
            addEntry(parenMatch[1], t);
            if (parenMatch[2] && !GEO_IGNORE_TOKENS.has(parenMatch[2].trim().toLowerCase())) {
                addEntry(parenMatch[2], t);
            }
        }

        // Nazwy rozdzielone ukośnikiem, np. "Eleguá / Eleggua"
        if (t.term.includes('/')) {
            t.term.split('/').forEach(part => {
                const cleaned = part.replace(/\([^)]*\)/g, '').trim();
                addEntry(cleaned, t);
            });
        }
    });

    // Sortuj od najdłuższych fraz do najkrótszych, aby "Rueda de Casino" miało priorytet przed "Rueda" i "Casino"
    entries.sort((a, b) => b.phrase.length - a.phrase.length);
    return entries;
}

function linkifyDefinition(rawText, currentItemId = '') {
    if (!rawText) return '';
    const terms = AppState.terms || [];
    if (terms.length === 0) return escapeHtml(rawText);

    const entries = buildKeywordEntries(terms);
    const linkedTargetIds = new Set();
    if (currentItemId) linkedTargetIds.add(currentItemId);

    const placeholders = [];
    const storePlaceholder = (html) => {
        const token = `\u0000WIKILINK_${placeholders.length}\u0000`;
        placeholders.push(html);
        return token;
    };

    // 1. Obsługa jawnych linków w nawiasach kwadratowych: [Hasło]
    let workingText = String(rawText).replace(/\[([^\][]+)\]/g, (match, inner) => {
        const cleanInner = inner.trim();
        const lowerInner = cleanInner.toLowerCase();
        const found = entries.find(e => e.lower === lowerInner) ||
            terms.find(t => t.term && t.term.toLowerCase().includes(lowerInner));
        if (found && found.id !== currentItemId) {
            linkedTargetIds.add(found.id);
            const targetTitle = found.term || cleanInner;
            return storePlaceholder(
                `<a href="#card-${escapeHtml(found.id)}" class="wiki-inline-link" data-action="jump-term" data-id="${escapeHtml(found.id)}" title="Przejdź do hasła: ${escapeHtml(targetTitle)}">${escapeHtml(cleanInner)}</a>`
            );
        }
        return cleanInner;
    });

    // 2. Automatyczne wykrywanie słów kluczowych w tekście (pierwsze wystąpienie danego hasła, jak w Wikipedii)
    for (const entry of entries) {
        if (linkedTargetIds.has(entry.id)) continue;

        const pattern = new RegExp(
            `(?<![\\p{L}\\p{N}_\\u0000])(${escapeRegex(entry.phrase)})(?![\\p{L}\\p{N}_\\u0000])`,
            'iu'
        );

        if (pattern.test(workingText)) {
            workingText = workingText.replace(pattern, (matchedText) => {
                linkedTargetIds.add(entry.id);
                return storePlaceholder(
                    `<a href="#card-${escapeHtml(entry.id)}" class="wiki-inline-link" data-action="jump-term" data-id="${escapeHtml(entry.id)}" title="Przejdź do hasła: ${escapeHtml(entry.term)}">${escapeHtml(matchedText)}</a>`
                );
            });
        }
    }

    // 3. Escape pozostałego zwykłego tekstu i przywrócenie bezpiecznych znaczników <a>
    const escapedText = escapeHtml(workingText);
    return escapedText.replace(/\u0000WIKILINK_(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)] || '');
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Integracja ze zdarzeniami cyklu życia (Router SPA i Direct Load) ---

document.addEventListener('page:loaded', (e) => {
    const path = e.detail?.path || window.location.pathname;
    if (path.includes('salsopedia') || document.getElementById('wikiGrid')) {
        mountWiki();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('wikiGrid')) mountWiki();
    });
} else {
    if (document.getElementById('wikiGrid')) mountWiki();
}

window.mountWiki = mountWiki;
window.fetchTerms = fetchTerms;
window.switchViewMode = switchViewMode;
window.setActiveCategory = setActiveCategory;
window.linkifyDefinition = linkifyDefinition;
window.jumpToTermCard = jumpToTermCard;
window.escapeHtml = escapeHtml;
window.isSafeHttpUrl = isSafeHttpUrl;
