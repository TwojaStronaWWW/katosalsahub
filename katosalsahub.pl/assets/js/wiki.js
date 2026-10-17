/**
 * KATO SALSA HUB - SALSOPEDIA WIKI ENGINE (v17 - Salsopedia Studio, Visual Diff & Multi-Role RBAC)
 * Moduł Bazy Wiedzy, Wyszukiwania, Społecznościowego Zgłaszania, Porównywarki Zmian (Diff) i Moderacji
 * Zero-dependency Vanilla JS, Platform-First Architecture (ISO 27001 & Raricart Patterns).
 */

if (typeof window === 'undefined') {
    globalThis.window = globalThis;
}

const API_URL = 'assets/php/wiki.php';
const STATIC_FALLBACK_URL = 'assets/data/salsopedia.json';

const AppState = {
    terms: [],
    pending: [],
    moderators: [],
    activeCategory: 'all',
    searchQuery: '',
    viewMode: 'live', // 'live' | 'unverified' | 'pending'
    isAdmin: false,
    userRole: 'guest', // 'guest' | 'moderator' | 'admin'
    userName: '',
    userEmail: '',
    forcePasswordChange: false,
    csrfToken: '',
    isInitialized: false,
    currentModalMode: 'new', // 'new' | 'verify' | 'admin_edit_live' | 'admin_edit_pending'
    editingOriginalTerm: null
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

const SUBCATEGORY_NAMES = {
    'lead': 'Prowadzenie',
    'follow': 'Podążanie',
    'partnerwork': 'W parach',
    'shines': 'Solo / Shines',
    'technique': 'Technika',
    'rhythm': 'Rytmika'
};

// --- Inicjalizacja i Montowanie ---

async function mountWiki() {
    const root = document.getElementById('wikiGrid');
    if (!root) return;

    // Sprawdź aktywną sesję moderatora/administratora przez ciasteczko HttpOnly i token CSRF
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
                AppState.userRole = data.role || 'admin';
                AppState.userName = data.user_name || 'Moderator';
                AppState.userEmail = data.user_email || '';
                AppState.forcePasswordChange = Boolean(data.force_change);
                AppState.csrfToken = data.csrf_token || cachedCsrf;
                sessionStorage.setItem('kato_csrf_token', AppState.csrfToken);
                return;
            }
        }
    } catch (e) {
        // Ignoruj błąd połączenia w trybie statycznym
    }
    resetAuthState();
}

function resetAuthState() {
    AppState.isAdmin = false;
    AppState.userRole = 'guest';
    AppState.userName = '';
    AppState.userEmail = '';
    AppState.forcePasswordChange = false;
    AppState.csrfToken = '';
    sessionStorage.removeItem('kato_csrf_token');
}

// --- Pobieranie Danych ---

function notifyKnowledgeUpdated() {
    if (typeof window !== 'undefined') {
        window.__SALSOPEDIA_TERMS__ = AppState.terms;
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('salsopedia:updated', {
                detail: { terms: AppState.terms }
            }));
        }
        try {
            if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
                localStorage.setItem('ksh_salsopedia_sync', JSON.stringify({
                    ts: Date.now(),
                    count: Array.isArray(AppState.terms) ? AppState.terms.length : 0
                }));
            }
        } catch { /* ignoruj blokadę storage */ }
    }
}

async function fetchTerms() {
    try {
        let data = null;
        try {
            const res = await fetch(API_URL + '?action=list', { credentials: 'same-origin', cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                if (Array.isArray(json)) data = json;
            }
        } catch (e) {
            console.warn('[Salsopedia] Backend PHP niedostępny, używam bazy statycznej JSON:', e.message);
        }

        if (!data) {
            const fallbackRes = await fetch(STATIC_FALLBACK_URL, { cache: 'no-store' });
            if (fallbackRes.ok) {
                data = await fallbackRes.json();
            }
        }

        if (Array.isArray(data)) {
            AppState.terms = data;
            notifyKnowledgeUpdated();
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

    // 6. Przyciski Admin/Moderator Toolbara
    const btnShowLive = document.getElementById('btnShowLive');
    if (btnShowLive) {
        btnShowLive.addEventListener('click', () => switchViewMode('live'));
    }

    const btnShowUnverified = document.getElementById('btnShowUnverified');
    if (btnShowUnverified) {
        btnShowUnverified.addEventListener('click', () => switchViewMode('unverified'));
    }

    const btnShowPending = document.getElementById('btnShowPending');
    if (btnShowPending) {
        btnShowPending.addEventListener('click', () => switchViewMode('pending'));
    }

    const btnAdminAdd = document.getElementById('btnAdminAdd');
    if (btnAdminAdd) {
        btnAdminAdd.addEventListener('click', () => window.openModal('admin_direct'));
    }

    const btnManageTeam = document.getElementById('btnManageTeam');
    if (btnManageTeam) {
        btnManageTeam.addEventListener('click', () => window.openTeamModal());
    }

    const btnLogoutAdmin = document.getElementById('btnLogoutAdmin');
    if (btnLogoutAdmin) {
        btnLogoutAdmin.addEventListener('click', () => logoutAdmin());
    }

    // 7. Obsługa chipów kategorii w modalu + aktualizacja podglądu na żywo
    setupChipsInteractions('categoryChips');
    setupChipsInteractions('subcategoryChips');

    // 8. Formularz zgłaszania/edycji hasła + Live Preview i Diff
    const wikiForm = document.getElementById('wikiForm');
    if (wikiForm) {
        wikiForm.addEventListener('submit', handleFormSubmit);
        wikiForm.addEventListener('input', () => {
            updateStudioLivePreviewAndDiff();
        });
    }

    // Pomocnik wstawiania linków wewnętrznych [Hasło]
    const insertWikiLinkBtn = document.getElementById('insertWikiLinkBtn');
    const closeWikiLinkPickerBtn = document.getElementById('closeWikiLinkPickerBtn');
    const wikiLinkPicker = document.getElementById('wikiLinkPicker');
    const wikiLinkSearchInput = document.getElementById('wikiLinkSearchInput');
    const wikiLinkSuggestions = document.getElementById('wikiLinkSuggestions');

    if (insertWikiLinkBtn && wikiLinkPicker) {
        insertWikiLinkBtn.addEventListener('click', () => {
            const isHidden = wikiLinkPicker.classList.toggle('is-hidden');
            if (!isHidden && wikiLinkSearchInput) {
                wikiLinkSearchInput.value = '';
                renderWikiLinkSuggestions('');
                wikiLinkSearchInput.focus();
            }
        });
    }

    if (closeWikiLinkPickerBtn && wikiLinkPicker) {
        closeWikiLinkPickerBtn.addEventListener('click', () => {
            wikiLinkPicker.classList.add('is-hidden');
        });
    }

    if (wikiLinkSearchInput) {
        wikiLinkSearchInput.addEventListener('input', (e) => {
            renderWikiLinkSuggestions(e.target.value);
        });
    }

    if (wikiLinkSuggestions) {
        wikiLinkSuggestions.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-insert-term]');
            if (!btn) return;
            insertTermTagIntoDefinition(btn.dataset.insertTerm);
        });
    }

    // Obsługa ostrzeżenia o duplikacie hasła
    const dupWarn = document.getElementById('termDuplicateWarning');
    if (dupWarn) {
        dupWarn.addEventListener('click', (e) => {
            const switchBtn = e.target.closest('[data-action="switch-to-existing"]');
            if (!switchBtn) return;
            const existingId = switchBtn.dataset.id;
            const existingTerm = AppState.terms.find(t => t.id === existingId);
            if (existingTerm) {
                window.openModal(AppState.isAdmin ? 'admin_edit_live' : 'verify', existingTerm);
            }
        });
    }

    // 9. Formularz logowania administratora / moderatora
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);
    }

    // 10. Formularze w modalu Kont i Haseł (#teamModal)
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);
    }

    const addModeratorForm = document.getElementById('addModeratorForm');
    if (addModeratorForm) {
        addModeratorForm.addEventListener('submit', handleSaveModeratorSubmit);
    }

    const moderatorsListContainer = document.getElementById('moderatorsListContainer');
    if (moderatorsListContainer) {
        moderatorsListContainer.addEventListener('click', (e) => {
            const delBtn = e.target.closest('[data-action="delete-moderator"]');
            if (delBtn && delBtn.dataset.email) {
                deleteModeratorAccount(delBtn.dataset.email);
            }
            const editModBtn = e.target.closest('[data-action="fill-moderator"]');
            if (editModBtn) {
                const emailEl = document.getElementById('modEmailInput');
                const nameEl = document.getElementById('modNameInput');
                const roleEl = document.getElementById('modRoleSelect');
                if (emailEl) emailEl.value = editModBtn.dataset.email || '';
                if (nameEl) nameEl.value = editModBtn.dataset.name || '';
                if (roleEl) roleEl.value = editModBtn.dataset.role || 'moderator';
            }
        });
    }

    // 11. Przyciski zamykania i anulowania modali
    const wikiModalCloseBtn = document.getElementById('wikiModalCloseBtn');
    if (wikiModalCloseBtn) wikiModalCloseBtn.addEventListener('click', () => window.closeModal());

    const cancelWikiModalBtn = document.getElementById('cancelWikiModalBtn');
    if (cancelWikiModalBtn) cancelWikiModalBtn.addEventListener('click', () => window.closeModal());

    const adminLoginModalCloseBtn = document.getElementById('adminLoginModalCloseBtn');
    if (adminLoginModalCloseBtn) adminLoginModalCloseBtn.addEventListener('click', () => window.closeAdminLoginModal());

    const cancelAdminLoginBtn = document.getElementById('cancelAdminLoginBtn');
    if (cancelAdminLoginBtn) cancelAdminLoginBtn.addEventListener('click', () => window.closeAdminLoginModal());

    const teamModalCloseBtn = document.getElementById('teamModalCloseBtn');
    if (teamModalCloseBtn) teamModalCloseBtn.addEventListener('click', () => window.closeTeamModal());

    const addSourceRowBtn = document.getElementById('addSourceRowBtn');
    if (addSourceRowBtn) {
        addSourceRowBtn.addEventListener('click', () => {
            window.addSourceRow();
            updateStudioLivePreviewAndDiff();
        });
    }

    // 12. Delegacja usuwania wierszy źródeł
    const sourceContainer = document.getElementById('sourceContainer');
    if (sourceContainer) {
        sourceContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-source"]');
            if (btn) {
                const row = btn.closest('.source-row');
                if (row) {
                    row.remove();
                    updateStudioLivePreviewAndDiff();
                }
            }
        });
    }

    // 13. Delegacja akcji w siatce haseł (Zero inline handlers)
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
            } else if (action === 'quick-verify' && id) {
                window.quickVerifyTerm(id);
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

    // 14. Zamykanie modali kliknięciem w tło
    ['wikiModal', 'adminLoginModal', 'teamModal'].forEach(modalId => {
        const el = document.getElementById(modalId);
        if (el) {
            el.addEventListener('click', (e) => {
                if (e.target === el) {
                    if (modalId === 'teamModal') {
                        window.closeTeamModal();
                    } else {
                        el.classList.remove('open', 'is-open');
                    }
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
        updateStudioLivePreviewAndDiff();
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
    if (badge) {
        const prefix = AppState.viewMode === 'unverified' ? '🔍 Do weryfikacji: ' : '';
        badge.textContent = prefix + (CATEGORY_NAMES[cat] || cat);
    }

    const resetBtn = document.getElementById('resetFilterBtn');
    if (resetBtn) resetBtn.classList.toggle('is-hidden', cat === 'all' && AppState.viewMode === 'live');

    renderCurrentView();
}

function switchViewMode(mode) {
    AppState.viewMode = mode;

    const btnLive = document.getElementById('btnShowLive');
    const btnUnverified = document.getElementById('btnShowUnverified');
    const btnPending = document.getElementById('btnShowPending');

    if (btnLive) btnLive.classList.toggle('active', mode === 'live');
    if (btnUnverified) btnUnverified.classList.toggle('active', mode === 'unverified');
    if (btnPending) btnPending.classList.toggle('active', mode === 'pending');

    const filterBadge = document.getElementById('activeFilterBadge');
    if (filterBadge) {
        if (mode === 'pending') {
            filterBadge.textContent = '⏳ Kolejka Moderacji (Oczekujące Zgłoszenia Społeczności)';
        } else if (mode === 'unverified') {
            filterBadge.textContent = `🔍 Hasła do weryfikacji merytorycznej (${CATEGORY_NAMES[AppState.activeCategory] || 'Wszystkie'})`;
        } else {
            filterBadge.textContent = CATEGORY_NAMES[AppState.activeCategory] || 'Wszystkie hasła';
        }
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

    if (AppState.viewMode === 'unverified') {
        list = list.filter(item => item.status !== 'verified');
    }

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
        countEl.textContent = AppState.viewMode === 'unverified'
            ? `Do weryfikacji w tym widoku: ${list.length} haseł`
            : `Wyświetlono: ${list.length} z ${AppState.terms.length} haseł`;
    }

    if (list.length === 0) {
        if (AppState.viewMode === 'unverified') {
            if (noResults) noResults.classList.add('is-hidden', 'hidden');
            grid.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-check-double fa-3x no-results-icon"></i>
                    <h3>Wszystkie hasła w tej kategorii są już zweryfikowane!</h3>
                    <p>Świetna robota! Możesz przełączyć się na pełną bazę wiedzy lub wybrać inną kategorię.</p>
                    <button class="btn btn-secondary btn-sm" data-action="switch-live">Wróć do pełnej bazy</button>
                </div>`;
            return;
        }
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
    if (noResults) noResults.classList.add('is-hidden', 'hidden');

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

function findOriginalLiveTerm(pendingOrEditItem) {
    if (!pendingOrEditItem) return null;
    const lookupId = pendingOrEditItem.target_id || pendingOrEditItem.id;
    if (lookupId) {
        const byId = AppState.terms.find(t => t.id === lookupId);
        if (byId) return byId;
    }
    if (pendingOrEditItem.term) {
        const lower = pendingOrEditItem.term.trim().toLowerCase();
        return AppState.terms.find(t => t.term && t.term.trim().toLowerCase() === lower) || null;
    }
    return null;
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
    let inlineDiffHtml = '';

    if (isPending) {
        const originalTerm = findOriginalLiveTerm(item);
        const act = item.pending_action || (originalTerm ? 'edit' : 'new');
        const label = act === 'verify'
            ? 'Propozycja poprawki do hasła'
            : (act === 'edit' || originalTerm ? 'Edycja istniejącego hasła' : 'Nowe hasło od społeczności');
        const submittedDate = item.submitted_at ? ` • ${escapeHtml(item.submitted_at)}` : '';
        ribbonHtml = `<span class="pending-ribbon"><i class="fas fa-clock"></i> ${label}${submittedDate}</span>`;

        if (originalTerm) {
            inlineDiffHtml = `
                <div class="card-diff-box">
                    <div class="card-diff-header">
                        <i class="fas fa-exchange-alt"></i> Porównanie z obecną wersją w bazie (Przed vs Po):
                    </div>
                    ${buildTermDiffHtml(originalTerm, item)}
                </div>`;
        } else if (item.change_note) {
            inlineDiffHtml = `
                <div class="card-diff-box">
                    <div class="card-diff-header"><i class="fas fa-comment-dots"></i> Komentarz zgłaszającego:</div>
                    <p class="diff-note-text">${escapeHtml(item.change_note)}</p>
                </div>`;
        }
    }

    let verifiedHtml = '';
    if (item.status === 'verified') {
        const count = Number.parseInt(item.verification_count, 10) || 1;
        const verifier = item.verified_by ? ` (ost. ${escapeHtml(item.verified_by)})` : '';
        verifiedHtml = `<span class="status-verified" title="Zweryfikowane merytorycznie (${count}x)${verifier}"><i class="fas fa-check"></i> ${count}</span>`;
    } else if (AppState.isAdmin && !isPending) {
        verifiedHtml = `<span class="status-unverified-badge" title="Hasło oczekuje na potwierdzenie merytoryczne instruktora/moderatora">Niezweryfikowane</span>`;
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
        badgesHtml += `<span class="cat-badge sub-cat">${escapeHtml(SUBCATEGORY_NAMES[s] || s)}</span>`;
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
                <button type="button" class="btn-approve" data-action="approve" data-id="${safeId}" title="Zatwierdź i opublikuj w bazie">
                    <i class="fas fa-check"></i> Zatwierdź
                </button>
                <button type="button" class="btn-edit-admin" data-action="edit-pending" data-id="${safeId}" title="Otwórz w Studio (Podgląd Diff i edycja przed zatwierdzeniem)">
                    <i class="fas fa-sliders-h"></i> Edytuj / Diff
                </button>
                <button type="button" class="btn-reject" data-action="reject" data-id="${safeId}" title="Odrzuć propozycję">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
    } else if (AppState.isAdmin) {
        const quickVerifyBtn = item.status !== 'verified'
            ? `<button type="button" class="btn-quick-verify" data-action="quick-verify" data-id="${safeId}" title="Potwierdź poprawność tego hasła 1-klikiem">
                   <i class="fas fa-check"></i> Zweryfikuj
               </button>`
            : `<button type="button" class="btn-quick-verify is-verified-plus" data-action="quick-verify" data-id="${safeId}" title="Dodaj kolejne potwierdzenie instruktorskie (+1)">
                   <i class="fas fa-plus"></i> +1
               </button>`;

        // Tylko główny Admin może bezpowrotnie usuwać hasła z bazy (RBAC)
        const deleteBtn = AppState.userRole === 'admin'
            ? `<button type="button" class="btn-delete-admin" data-action="delete-live" data-id="${safeId}" title="Usuń z bazy (tylko Admin)">
                   <i class="fas fa-trash-alt"></i>
               </button>`
            : '';

        actionsHtml = `
            <div class="moderation-actions">
                ${quickVerifyBtn}
                <button type="button" class="btn-edit-admin" data-action="edit-live" data-id="${safeId}" title="Edytuj hasło w Salsopedia Studio">
                    <i class="fas fa-edit"></i> Edytuj
                </button>
                ${deleteBtn}
            </div>`;
    } else {
        actionsHtml = `
            <button type="button" class="btn-verify" data-action="verify" data-id="${safeId}" title="Zaproponuj poprawkę lub uzupełnienie do tego hasła">
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
        ${inlineDiffHtml}
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

// --- Silnik Porównywania Zmian (Visual Word Diff: Przed vs Po) ---

function tokenizeForDiff(text) {
    if (!text) return [];
    return String(text).split(/(\s+)/).filter(t => t.length > 0);
}

function computeWordDiff(oldText, newText) {
    const oldStr = String(oldText || '').trim();
    const newStr = String(newText || '').trim();
    if (oldStr === newStr) {
        return {
            hasChanges: false,
            html: `<span class="diff-unchanged">${escapeHtml(newStr)}</span>`,
            addedCount: 0,
            removedCount: 0
        };
    }

    const a = tokenizeForDiff(oldStr);
    const b = tokenizeForDiff(newStr);
    const n = a.length;
    const m = b.length;

    // Zabezpieczenie wydajności dla bardzo długich tekstów
    if (n * m > 90000) {
        return {
            hasChanges: true,
            html: `<del class="diff-removed">${escapeHtml(oldStr)}</del> <ins class="diff-added">${escapeHtml(newStr)}</ins>`,
            addedCount: 1,
            removedCount: 1
        };
    }

    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            if (a[i] === b[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    let i = 0;
    let j = 0;
    const parts = [];
    let addedCount = 0;
    let removedCount = 0;

    while (i < n && j < m) {
        if (a[i] === b[j]) {
            parts.push({ type: 'same', val: a[i] });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            parts.push({ type: 'del', val: a[i] });
            if (a[i].trim()) removedCount++;
            i++;
        } else {
            parts.push({ type: 'add', val: b[j] });
            if (b[j].trim()) addedCount++;
            j++;
        }
    }
    while (i < n) {
        parts.push({ type: 'del', val: a[i] });
        if (a[i].trim()) removedCount++;
        i++;
    }
    while (j < m) {
        parts.push({ type: 'add', val: b[j] });
        if (b[j].trim()) addedCount++;
        j++;
    }

    // Grupowanie sąsiadujących operacji tego samego typu dla czytelnego HTML
    let html = '';
    let idx = 0;
    while (idx < parts.length) {
        const currentType = parts[idx].type;
        let chunk = '';
        while (idx < parts.length && parts[idx].type === currentType) {
            chunk += parts[idx].val;
            idx++;
        }
        if (currentType === 'same') {
            html += escapeHtml(chunk);
        } else if (currentType === 'del') {
            html += `<del class="diff-removed">${escapeHtml(chunk)}</del>`;
        } else if (currentType === 'add') {
            html += `<ins class="diff-added">${escapeHtml(chunk)}</ins>`;
        }
    }

    return {
        hasChanges: true,
        html,
        addedCount,
        removedCount
    };
}

function formatSourcesSummary(sourceField) {
    const arr = Array.isArray(sourceField) ? sourceField : (sourceField ? [sourceField] : []);
    return arr.map(s => {
        if (typeof s === 'object' && s !== null) {
            return s.url ? `${s.name || 'Link'} (${s.url})` : (s.name || '');
        }
        return String(s);
    }).filter(Boolean).join(', ');
}

function buildTermDiffHtml(originalTerm, proposedTerm) {
    if (!originalTerm || !proposedTerm) return '';

    const rows = [];
    let totalChanges = 0;

    // 1. Porównanie nazwy pojęcia
    if ((originalTerm.term || '').trim() !== (proposedTerm.term || '').trim()) {
        totalChanges++;
        rows.push(`
            <div class="diff-field-row">
                <span class="diff-field-label">Nazwa hasła:</span>
                <del class="diff-removed">${escapeHtml(originalTerm.term || '')}</del>
                <i class="fas fa-arrow-right diff-arrow"></i>
                <ins class="diff-added">${escapeHtml(proposedTerm.term || '')}</ins>
            </div>`);
    }

    // 2. Porównanie definicji (Word-by-Word LCS Diff)
    const defDiff = computeWordDiff(originalTerm.definition || '', proposedTerm.definition || '');
    if (defDiff.hasChanges) {
        totalChanges++;
        rows.push(`
            <div class="diff-field-row diff-definition-row">
                <div class="diff-field-meta">
                    <span class="diff-field-label">Zmiany w definicji:</span>
                    <span class="diff-stats">
                        <span class="diff-stat-add">+${defDiff.addedCount} słów</span>
                        <span class="diff-stat-del">-${defDiff.removedCount} słów</span>
                    </span>
                </div>
                <div class="diff-text-body">${defDiff.html}</div>
            </div>`);
    }

    // 3. Porównanie kategorii
    const oldCats = (Array.isArray(originalTerm.category) ? originalTerm.category : [originalTerm.category]).filter(Boolean).sort().join(', ');
    const newCats = (Array.isArray(proposedTerm.category) ? proposedTerm.category : [proposedTerm.category]).filter(Boolean).sort().join(', ');
    if (oldCats !== newCats) {
        totalChanges++;
        rows.push(`
            <div class="diff-field-row">
                <span class="diff-field-label">Kategorie:</span>
                <del class="diff-removed">${escapeHtml(oldCats || 'brak')}</del>
                <i class="fas fa-arrow-right diff-arrow"></i>
                <ins class="diff-added">${escapeHtml(newCats || 'brak')}</ins>
            </div>`);
    }

    // 4. Porównanie źródeł
    const oldSrc = formatSourcesSummary(originalTerm.source);
    const newSrc = formatSourcesSummary(proposedTerm.source);
    if (oldSrc !== newSrc) {
        totalChanges++;
        rows.push(`
            <div class="diff-field-row">
                <span class="diff-field-label">Źródła:</span>
                <del class="diff-removed">${escapeHtml(oldSrc || 'brak')}</del>
                <i class="fas fa-arrow-right diff-arrow"></i>
                <ins class="diff-added">${escapeHtml(newSrc || 'brak')}</ins>
            </div>`);
    }

    // 5. Notatka od autora poprawki
    if (proposedTerm.change_note) {
        rows.push(`
            <div class="diff-field-row diff-note-row">
                <span class="diff-field-label"><i class="fas fa-comment-alt"></i> Opis poprawki:</span>
                <span class="diff-note-text">${escapeHtml(proposedTerm.change_note)}</span>
            </div>`);
    }

    if (totalChanges === 0 && !proposedTerm.change_note) {
        return `<div class="diff-empty-msg"><i class="fas fa-check-circle"></i> Treść identyczna z aktualną wersją w bazie (brak różnic tekstowych).</div>`;
    }

    return `<div class="diff-fields-list">${rows.join('')}</div>`;
}

// --- Liczniki w Sidebarze i Pasku ---

function updateCategoryCounters() {
    const counts = { 'all': AppState.terms.length };
    let unverifiedCount = 0;

    AppState.terms.forEach(term => {
        if (term.status !== 'verified') {
            unverifiedCount++;
        }
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

    const unverifiedBadge = document.getElementById('unverifiedCountBadge');
    if (unverifiedBadge) unverifiedBadge.textContent = unverifiedCount;
}

function updateAdminBadges() {
    const pendingBadge = document.getElementById('pendingCountBadge');
    if (pendingBadge) pendingBadge.textContent = AppState.pending.length;
}

function updateAdminToolbar() {
    const toolbar = document.getElementById('adminToolbar');
    if (!toolbar) return;
    toolbar.classList.toggle('is-hidden', !AppState.isAdmin);

    const roleBadge = document.getElementById('adminRoleBadge');
    if (roleBadge) {
        roleBadge.innerHTML = AppState.userRole === 'admin'
            ? '<i class="fas fa-crown"></i> Administrator'
            : '<i class="fas fa-user-check"></i> Moderator';
    }

    const userInfo = document.getElementById('adminUserInfo');
    if (userInfo) {
        userInfo.textContent = AppState.userName
            ? `Zalogowano: ${AppState.userName}`
            : 'Aktywna sesja moderacji';
    }
}

// --- Obsługa Zgłoszeń i Salsopedia Studio (Modal + Live Preview + Diff) ---

window.openModal = function (mode = 'new', termData = null) {
    AppState.currentModalMode = mode;
    AppState.editingOriginalTerm = null;

    const modal = document.getElementById('wikiModal');
    const form = document.getElementById('wikiForm');
    const title = document.getElementById('modalTitle');
    const subtitle = document.getElementById('modalSubtitle');
    const msgBox = document.getElementById('formMessage');
    const submitBtn = document.getElementById('submitTermBtn');
    const changeNoteGroup = document.getElementById('changeNoteGroup');
    const modNote = document.getElementById('formModerationNote');
    const dupWarn = document.getElementById('termDuplicateWarning');
    const linkPicker = document.getElementById('wikiLinkPicker');

    if (!modal || !form) return;

    form.reset();
    if (msgBox) msgBox.className = 'form-message-box is-hidden';
    if (dupWarn) dupWarn.classList.add('is-hidden');
    if (linkPicker) linkPicker.classList.add('is-hidden');

    const sourceContainer = document.getElementById('sourceContainer');
    if (sourceContainer) sourceContainer.innerHTML = '';

    resetChips('categoryChips');
    resetChips('subcategoryChips');

    document.getElementById('termId').value = '';
    document.getElementById('isVerification').value = '';
    document.getElementById('formAdminDirect').value = '';

    if (mode === 'new' || mode === 'admin_direct') {
        const isDirect = mode === 'admin_direct' || AppState.isAdmin;
        title.innerHTML = isDirect
            ? '<i class="fas fa-plus-circle"></i> Dodaj nowe hasło do Salsopedii'
            : '<i class="fas fa-plus-circle"></i> Zaproponuj nowe hasło';
        if (subtitle) {
            subtitle.textContent = 'Wprowadź treść po lewej stronie — po prawej widzisz podgląd karty na żywo wraz z automatycznymi linkami.';
        }
        submitBtn.innerHTML = isDirect
            ? '<i class="fas fa-save"></i> Opublikuj bezpośrednio w bazie'
            : '<i class="fas fa-paper-plane"></i> Wyślij do moderacji';
        if (changeNoteGroup) changeNoteGroup.classList.add('is-hidden');
        if (modNote) modNote.classList.toggle('is-hidden', isDirect);

        if (AppState.isAdmin && AppState.userName) {
            const authorInput = document.getElementById('authorInput');
            if (authorInput && !authorInput.value) authorInput.value = AppState.userName;
        }

        activateChips('categoryChips', ['dance']);
        window.addSourceRow();
        if (isDirect) {
            AppState.currentModalMode = 'admin_edit_live';
        }
    } else if (mode === 'verify' && termData) {
        AppState.editingOriginalTerm = findOriginalLiveTerm(termData) || termData;
        title.innerHTML = '<i class="fas fa-pencil-alt"></i> Zgłoś poprawkę do hasła';
        if (subtitle) {
            subtitle.textContent = 'Zmodyfikuj treść poniżej. W prawej kolumnie na żywo widzisz porównanie Twoich poprawek z obecną wersją (Przed vs Po).';
        }
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Prześlij propozycję poprawki';
        if (changeNoteGroup) changeNoteGroup.classList.remove('is-hidden');
        if (modNote) modNote.classList.remove('is-hidden');
        populateModalWithTerm(termData);
        document.getElementById('isVerification').value = '1';
    } else if (mode === 'admin_edit_live' && termData) {
        AppState.editingOriginalTerm = { ...termData };
        title.innerHTML = '<i class="fas fa-sliders-h"></i> Edycja hasła w Studio (Live)';
        if (subtitle) {
            subtitle.textContent = 'Wszystkie wprowadzone zmiany są porównywane po prawej stronie i po zapisaniu od razu aktualizują bazę.';
        }
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Zapisz i opublikuj zmiany';
        if (changeNoteGroup) changeNoteGroup.classList.add('is-hidden');
        if (modNote) modNote.classList.add('is-hidden');
        document.getElementById('formAdminDirect').value = '1';
        populateModalWithTerm(termData);
    } else if (mode === 'admin_edit_pending' && termData) {
        AppState.editingOriginalTerm = findOriginalLiveTerm(termData);
        title.innerHTML = '<i class="fas fa-check-double"></i> Weryfikacja zgłoszenia w Studio (Diff)';
        if (subtitle) {
            subtitle.textContent = 'Przejrzyj różnice (Przed vs Po), w razie potrzeby dopracuj definicję i zatwierdź publikację w bazie.';
        }
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Zatwierdź i opublikuj w bazie';
        if (changeNoteGroup) changeNoteGroup.classList.remove('is-hidden');
        if (modNote) modNote.classList.add('is-hidden');
        populateModalWithTerm(termData);
    }

    updateStudioLivePreviewAndDiff();
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
    const changeNoteEl = document.getElementById('changeNoteInput');
    if (changeNoteEl) changeNoteEl.value = term.change_note || '';

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

function getDraftTermFromForm() {
    const form = document.getElementById('wikiForm');
    const sources = [];
    if (form) {
        const nameInputs = form.querySelectorAll('input[name="source_name[]"]');
        const urlInputs = form.querySelectorAll('input[name="source_url[]"]');
        for (let i = 0; i < nameInputs.length; i++) {
            const sName = nameInputs[i].value.trim();
            const sUrl = urlInputs[i].value.trim();
            if (sName || sUrl) {
                sources.push({ name: sName, url: sUrl });
            }
        }
    }

    return {
        id: document.getElementById('termId')?.value.trim() || 'preview_draft',
        term: document.getElementById('termInput')?.value.trim() || 'Nazwa pojęcia...',
        definition: document.getElementById('definitionInput')?.value.trim() || 'Tutaj pojawi się podgląd definicji wraz z automatycznym podświetleniem powiązanych haseł...',
        author: document.getElementById('authorInput')?.value.trim() || 'Społeczność KSH',
        author_link: document.getElementById('authorLinkInput')?.value.trim() || '',
        user_category: document.getElementById('userCategoryInput')?.value.trim() || '',
        change_note: document.getElementById('changeNoteInput')?.value.trim() || '',
        category: getActiveChips('categoryChips'),
        subcategory: getActiveChips('subcategoryChips'),
        source: sources
    };
}

function updateStudioLivePreviewAndDiff() {
    const draft = getDraftTermFromForm();
    const rawDef = document.getElementById('definitionInput')?.value || '';

    // 1. Licznik znaków
    const charCounter = document.getElementById('definitionCharCount');
    if (charCounter) {
        charCounter.textContent = `${rawDef.length} zn.`;
    }

    // 2. Sprawdzenie duplikatu nazwy hasła przy dodawaniu nowego pojęcia
    const dupWarn = document.getElementById('termDuplicateWarning');
    const rawTermName = document.getElementById('termInput')?.value.trim() || '';
    if (dupWarn) {
        if (!AppState.editingOriginalTerm && rawTermName.length >= 2) {
            const existing = AppState.terms.find(
                t => t.term && t.term.trim().toLowerCase() === rawTermName.toLowerCase()
            );
            if (existing) {
                dupWarn.innerHTML = `
                    <span><i class="fas fa-exclamation-circle"></i> Hasło <strong>„${escapeHtml(existing.term)}”</strong> już istnieje w bazie!</span>
                    <button type="button" class="btn-switch-existing" data-action="switch-to-existing" data-id="${escapeHtml(existing.id)}">
                        Przejdź do edycji tego hasła &rarr;
                    </button>`;
                dupWarn.classList.remove('is-hidden');
            } else {
                dupWarn.classList.add('is-hidden');
            }
        } else {
            dupWarn.classList.add('is-hidden');
        }
    }

    // 3. Renderowanie Podglądu Karty na Żywo
    const previewContainer = document.getElementById('livePreviewContainer');
    const linksBadge = document.getElementById('previewLinksCount');
    if (previewContainer) {
        const linkedDefHtml = linkifyDefinition(draft.definition, draft.id);
        const linkMatches = linkedDefHtml.match(/class="wiki-inline-link"/g);
        const linkCount = linkMatches ? linkMatches.length : 0;
        if (linksBadge) {
            linksBadge.textContent = `${linkCount} powiązań wiki`;
        }

        let badgesHtml = '';
        (draft.category.length ? draft.category : ['dance']).forEach(c => {
            badgesHtml += `<span class="cat-badge main-cat">${escapeHtml(CATEGORY_NAMES[c] || c)}</span>`;
        });
        draft.subcategory.forEach(s => {
            badgesHtml += `<span class="cat-badge sub-cat">${escapeHtml(SUBCATEGORY_NAMES[s] || s)}</span>`;
        });

        let sourcesHtml = '';
        if (draft.source.length > 0) {
            sourcesHtml = '<div class="source-container-preview">';
            draft.source.forEach(src => {
                if (src.url && src.url.startsWith('http')) {
                    sourcesHtml += `<span class="source-pill"><i class="fas fa-external-link-alt"></i> ${escapeHtml(src.name || 'Link')}</span>`;
                } else if (src.name) {
                    sourcesHtml += `<span class="source-pill"><i class="fas fa-book-open"></i> ${escapeHtml(src.name)}</span>`;
                }
            });
            sourcesHtml += '</div>';
        }

        previewContainer.innerHTML = `
            <div class="wiki-card preview-wiki-card">
                <div class="wiki-card-header">
                    <h3>${escapeHtml(draft.term)}</h3>
                    <span class="status-verified"><i class="fas fa-check"></i> Podgląd</span>
                </div>
                <div class="badges">${badgesHtml}</div>
                <div class="definition">${linkedDefHtml}</div>
                ${sourcesHtml}
                <div class="wiki-card-footer">
                    <span class="author-meta">Autor: <strong>${escapeHtml(draft.author)}</strong></span>
                </div>
            </div>`;
    }

    // 4. Renderowanie Porównania „Przed vs Po” (Diff)
    const diffBox = document.getElementById('studioDiffBox');
    const diffContent = document.getElementById('studioDiffContent');
    if (diffBox && diffContent) {
        if (AppState.editingOriginalTerm) {
            diffBox.classList.remove('is-hidden');
            diffContent.innerHTML = buildTermDiffHtml(AppState.editingOriginalTerm, {
                ...draft,
                term: rawTermName || AppState.editingOriginalTerm.term,
                definition: rawDef
            });
        } else {
            diffBox.classList.add('is-hidden');
            diffContent.innerHTML = '';
        }
    }
}

function renderWikiLinkSuggestions(query) {
    const container = document.getElementById('wikiLinkSuggestions');
    if (!container) return;
    const q = (query || '').trim().toLowerCase();
    const matches = AppState.terms
        .filter(t => !q || (t.term && t.term.toLowerCase().includes(q)))
        .slice(0, 12);

    if (matches.length === 0) {
        container.innerHTML = '<span class="label-hint">Brak pasujących haseł w bazie.</span>';
        return;
    }

    container.innerHTML = matches.map(t =>
        `<button type="button" class="link-suggestion-chip" data-insert-term="${escapeHtml(t.term)}">
            <i class="fas fa-plus"></i> [${escapeHtml(t.term)}]
        </button>`
    ).join('');
}

function insertTermTagIntoDefinition(termTitle) {
    const textarea = document.getElementById('definitionInput');
    const picker = document.getElementById('wikiLinkPicker');
    if (!textarea || !termTitle) return;

    const tag = `[${termTitle}]`;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);

    textarea.value = before + tag + after;
    textarea.focus();
    const newCursor = start + tag.length;
    textarea.setSelectionRange(newCursor, newCursor);

    if (picker) picker.classList.add('is-hidden');
    updateStudioLivePreviewAndDiff();
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
        <input type="text" name="source_name[]" placeholder="Nazwa (np. Standard Rueda, Instruktor...)" value="${escapeHtml(name)}" class="form-input">
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
        change_note: document.getElementById('changeNoteInput')?.value.trim() || '',
        category: categories,
        subcategory: getActiveChips('subcategoryChips'),
        source: sources,
        verification_request: document.getElementById('isVerification').value === '1'
    };

    if (submitBtn) submitBtn.disabled = true;

    try {
        // Scenariusz 1: Moderator/Administrator bezpośrednio edytuje lub dodaje w bazie live
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
                showMessage(msgBox, 'success', 'Hasło zostało pomyślnie zapisane i zweryfikowane w bazie!');
                await fetchTerms();
                setTimeout(() => window.closeModal(), 900);
            } else {
                showMessage(msgBox, 'error', result.error || 'Błąd zapisu');
            }
            return;
        }

        // Scenariusz 2: Moderator/Administrator poprawia zgłoszenie przed zatwierdzeniem
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
                showMessage(msgBox, 'success', 'Zgłoszenie poprawione i pomyślnie opublikowane!');
                await fetchTerms();
                await fetchPendingTerms();
                setTimeout(() => {
                    window.closeModal();
                    renderCurrentView();
                }, 900);
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
            showMessage(msgBox, 'success', 'Dziękujemy! Twoja propozycja trafiła do kolejki moderacji.');
            form.reset();
            setTimeout(() => window.closeModal(), 1400);
        }
    } catch (err) {
        console.error('[Salsopedia] Submit error:', err);
        showMessage(msgBox, 'error', 'Błąd połączenia z serwerem. Spróbuj ponownie.');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- Akcje Moderatora / Administratora i Zarządzanie Kontami (Wzorzec Raricart) ---

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
    const emailInput = document.getElementById('adminEmailInput');
    const passInput = document.getElementById('adminPasswordInput');
    const email = emailInput ? emailInput.value.trim() : '';
    const pass = passInput ? passInput.value.trim() : '';
    const msg = document.getElementById('adminLoginMessage');

    try {
        const res = await fetch(API_URL + '?action=check_auth', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        const result = await res.json();
        if (result.success && result.authenticated) {
            AppState.isAdmin = true;
            AppState.userRole = result.role || 'admin';
            AppState.userName = result.user_name || 'Moderator';
            AppState.userEmail = result.user_email || email;
            AppState.forcePasswordChange = Boolean(result.force_change);
            AppState.csrfToken = result.csrf_token || '';
            if (AppState.csrfToken) {
                sessionStorage.setItem('kato_csrf_token', AppState.csrfToken);
            }
            if (passInput) passInput.value = '';
            updateAdminToolbar();
            window.closeAdminLoginModal();
            await fetchPendingTerms();

            if (AppState.forcePasswordChange) {
                window.openTeamModal(true);
            } else {
                switchViewMode(AppState.pending.length > 0 ? 'pending' : 'live');
            }
        } else {
            showMessage(msg, 'error', result.error || 'Niepoprawne dane logowania!');
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
    resetAuthState();
    updateAdminToolbar();
    switchViewMode('live');
}

window.openTeamModal = async function (isForced = false) {
    const modal = document.getElementById('teamModal');
    if (!modal) return;

    const banner = document.getElementById('forcePasswordChangeBanner');
    if (banner) {
        banner.classList.toggle('is-hidden', !isForced && !AppState.forcePasswordChange);
    }

    const summary = document.getElementById('currentAccountSummary');
    if (summary) {
        const roleLabel = AppState.userRole === 'admin' ? 'Administrator (Pełne uprawnienia)' : 'Moderator (Edycja i Weryfikacja)';
        summary.textContent = `${AppState.userName || 'Moderator'} (${AppState.userEmail || 'konto główne'}) — Rola: ${roleLabel}`;
    }

    const cpMsg = document.getElementById('changePasswordMessage');
    if (cpMsg) cpMsg.className = 'form-message-box is-hidden';

    const addModMsg = document.getElementById('addModeratorMessage');
    if (addModMsg) addModMsg.className = 'form-message-box is-hidden';

    const adminSection = document.getElementById('adminTeamSection');
    if (adminSection) {
        const isFullAdmin = AppState.userRole === 'admin';
        adminSection.classList.toggle('is-hidden', !isFullAdmin);
        if (isFullAdmin) {
            await fetchModeratorsList();
        }
    }

    modal.classList.add('is-open', 'open');
};

window.closeTeamModal = function () {
    if (AppState.forcePasswordChange) {
        const msg = document.getElementById('changePasswordMessage');
        showMessage(msg, 'error', 'Najpierw ustaw swoje nowe hasło docelowe przed przejściem do panelu moderacji.');
        return;
    }
    const modal = document.getElementById('teamModal');
    if (modal) modal.classList.remove('is-open', 'open');
};

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('cpOldPass')?.value || '';
    const newPassword = document.getElementById('cpNewPass')?.value || '';
    const confirmPassword = document.getElementById('cpConfirmPass')?.value || '';
    const msg = document.getElementById('changePasswordMessage');

    try {
        const res = await fetch(API_URL + '?action=change_password', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({
                csrf_token: AppState.csrfToken,
                old_password: oldPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });
        const result = await res.json();
        if (result.success) {
            AppState.forcePasswordChange = false;
            const banner = document.getElementById('forcePasswordChangeBanner');
            if (banner) banner.classList.add('is-hidden');
            document.getElementById('changePasswordForm')?.reset();
            showMessage(msg, 'success', result.message || 'Hasło zostało zmienione!');
        } else {
            showMessage(msg, 'error', result.error || 'Błąd zmiany hasła.');
        }
    } catch (err) {
        showMessage(msg, 'error', 'Błąd połączenia z serwerem.');
    }
}

async function fetchModeratorsList() {
    if (AppState.userRole !== 'admin') return;
    const container = document.getElementById('moderatorsListContainer');
    if (!container) return;

    try {
        const res = await fetch(API_URL + '?action=list_moderators', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({ csrf_token: AppState.csrfToken })
        });
        const result = await res.json();
        if (result.success && Array.isArray(result.users)) {
            AppState.moderators = result.users;
            if (result.users.length === 0) {
                container.innerHTML = '<p class="label-hint">Brak dodatkowych kont w pliku moderators.json (aktywne tylko główne konto z .env).</p>';
                return;
            }
            container.innerHTML = result.users.map(u => `
                <div class="moderator-row-item">
                    <div class="moderator-row-info">
                        <strong>${escapeHtml(u.name)}</strong>
                        <span class="mod-email-pill">${escapeHtml(u.email)}</span>
                        <span class="mod-role-pill ${u.role === 'admin' ? 'is-admin' : 'is-mod'}">${u.role === 'admin' ? 'Admin' : 'Moderator'}</span>
                        ${u.force_change ? '<span class="mod-force-pill">Wymagana zmiana hasła</span>' : ''}
                    </div>
                    <div class="moderator-row-actions">
                        <button type="button" class="btn-edit-admin" data-action="fill-moderator" data-email="${escapeHtml(u.email)}" data-name="${escapeHtml(u.name)}" data-role="${escapeHtml(u.role)}" title="Edytuj konto / zresetuj hasło">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button type="button" class="btn-reject" data-action="delete-moderator" data-email="${escapeHtml(u.email)}" title="Usuń konto moderatora">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        container.innerHTML = '<p class="label-hint">Nie udało się pobrać listy kont.</p>';
    }
}

async function handleSaveModeratorSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('modEmailInput')?.value.trim() || '';
    const name = document.getElementById('modNameInput')?.value.trim() || '';
    const role = document.getElementById('modRoleSelect')?.value || 'moderator';
    const password = document.getElementById('modPassInput')?.value || '';
    const forceChange = Boolean(document.getElementById('modForceChangeCheckbox')?.checked);
    const msg = document.getElementById('addModeratorMessage');

    try {
        const res = await fetch(API_URL + '?action=save_moderator', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({
                csrf_token: AppState.csrfToken,
                email,
                name,
                role,
                password,
                force_change: forceChange
            })
        });
        const result = await res.json();
        if (result.success) {
            showMessage(msg, 'success', result.message || 'Zapisano konto moderatora!');
            document.getElementById('addModeratorForm')?.reset();
            await fetchModeratorsList();
        } else {
            showMessage(msg, 'error', result.error || 'Błąd zapisu konta moderatora.');
        }
    } catch (err) {
        showMessage(msg, 'error', 'Błąd połączenia z serwerem.');
    }
}

async function deleteModeratorAccount(email) {
    if (!confirm(`Czy na pewno chcesz usunąć konto moderatora: ${email}?`)) return;
    try {
        const res = await fetch(API_URL + '?action=delete_moderator', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': AppState.csrfToken
            },
            body: JSON.stringify({
                csrf_token: AppState.csrfToken,
                email
            })
        });
        const result = await res.json();
        if (result.success) {
            await fetchModeratorsList();
        } else {
            alert('Błąd: ' + (result.error || 'Nie udało się usunąć konta'));
        }
    } catch (err) {
        console.error('Błąd usuwania konta moderatora:', err);
    }
}

window.quickVerifyTerm = async function (id) {
    try {
        const res = await fetch(API_URL + '?action=quick_verify', {
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
        if (result.success && result.entry) {
            const idx = AppState.terms.findIndex(t => t.id === id);
            if (idx !== -1) {
                AppState.terms[idx] = result.entry;
            }
            notifyKnowledgeUpdated();
            updateCategoryCounters();
            renderCurrentView();
        } else {
            alert('Błąd weryfikacji: ' + (result.error || 'Nieznany'));
        }
    } catch (err) {
        console.error('Błąd szybkiej weryfikacji:', err);
    }
};

window.approvePendingTerm = async function (id) {
    if (!confirm('Czy na pewno chcesz zatwierdzić to zgłoszenie i opublikować je w bazie Salsopedii?')) return;
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
    if (AppState.userRole !== 'admin') {
        alert('Tylko główny Administrator może bezpowrotnie usuwać hasła z bazy.');
        return;
    }
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
            notifyKnowledgeUpdated();
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
        if (AppState.viewMode !== 'live') {
            AppState.viewMode = 'live';
        }
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

if (typeof document !== 'undefined') {
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
}

if (typeof window !== 'undefined') {
    window.mountWiki = mountWiki;
    window.fetchTerms = fetchTerms;
    window.notifyKnowledgeUpdated = notifyKnowledgeUpdated;
    window.switchViewMode = switchViewMode;
    window.setActiveCategory = setActiveCategory;
    window.linkifyDefinition = linkifyDefinition;
    window.jumpToTermCard = jumpToTermCard;
    window.computeWordDiff = computeWordDiff;
    window.buildTermDiffHtml = buildTermDiffHtml;
    window.escapeHtml = escapeHtml;
    window.isSafeHttpUrl = isSafeHttpUrl;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AppState,
        notifyKnowledgeUpdated,
        computeWordDiff,
        buildTermDiffHtml,
        linkifyDefinition,
        buildKeywordEntries,
        escapeHtml,
        isSafeHttpUrl
    };
}
