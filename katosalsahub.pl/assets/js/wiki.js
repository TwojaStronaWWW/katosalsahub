/**
 * KATO SALSA HUB - SALSOPEDIA WIKI ENGINE (v18 - Modular Core, Search Relevance & Cross-Linking)
 * Rdzeń Bazy Wiedzy, Wyszukiwania z Rankingiem Trafności, Renderowania Kart i Auto-Linkowania.
 * Edytor Salsopedia Studio, Visual Diff oraz Panel Moderacji RBAC wydzielono do wiki-studio.js.
 * Zero-dependency Vanilla JS, Platform-First Architecture (ISO 27001).
 */

(function () {
'use strict';

if (typeof window === 'undefined') {
    globalThis.window = globalThis;
}

if (!window.kshWikiStudio && typeof require === 'function') {
    try {
        window.kshWikiStudio = require('./wiki-studio.js');
    } catch {
        // Ignoruj, jeśli ładowane asynchronicznie w przeglądarce
    }
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

const inFlightMutations = new Set();

async function runGuardedMutation(lockKey, action, payload, onSuccess, errorPrefix = 'Błąd') {
    if (inFlightMutations.has(lockKey)) return;
    inFlightMutations.add(lockKey);
    try {
        const { data: result } = await postWikiApi(action, payload);
        if (result && result.success) {
            await onSuccess(result);
        } else {
            alert(`${errorPrefix}: ` + ((result && result.error) || 'Nieznany'));
        }
    } catch (err) {
        console.error(`${errorPrefix}:`, err);
    } finally {
        inFlightMutations.delete(lockKey);
    }
}

function wt(key, fallback, vars) {
    if (typeof window !== 'undefined' && window.kshI18n && typeof window.kshI18n.t === 'function') {
        const res = window.kshI18n.t(key, undefined, vars);
        if (res && res !== key) return res;
    }
    if (vars && typeof fallback === 'string') {
        return fallback.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
    }
    return fallback;
}

function getCategoryLabel(cat) {
    if (cat === 'all') {
        return wt('wiki.filterAll', CATEGORY_NAMES.all);
    }
    return wt('wiki.cat.' + cat, CATEGORY_NAMES[cat] || cat);
}

function getSubcategoryLabel(sub) {
    return wt('wiki.sub.' + sub, SUBCATEGORY_NAMES[sub] || sub);
}

function refreshWikiLanguage() {
    if (typeof document === 'undefined' || !document.getElementById('wikiGrid')) return;
    const badge = document.getElementById('activeFilterBadge');
    if (badge && AppState.viewMode === 'live') {
        badge.textContent = getCategoryLabel(AppState.activeCategory);
    }
    renderCurrentView();
}

// --- Delegacja do Silnika Porównywania Zmian (Visual Word Diff z wiki-studio.js) ---

function computeWordDiff(oldText, newText) {
    if (window.kshWikiStudio && typeof window.kshWikiStudio.computeWordDiff === 'function') {
        return window.kshWikiStudio.computeWordDiff(oldText, newText);
    }
    return { hasChanges: false, html: escapeHtml(newText || ''), addedCount: 0, removedCount: 0 };
}

function buildTermDiffHtml(originalTerm, proposedTerm) {
    if (window.kshWikiStudio && typeof window.kshWikiStudio.buildTermDiffHtml === 'function') {
        return window.kshWikiStudio.buildTermDiffHtml(originalTerm, proposedTerm);
    }
    return '';
}

// --- Inicjalizacja i Montowanie ---

async function mountWiki() {
    const root = document.getElementById('wikiGrid');
    if (!root || root.dataset.wikiMounted === '1') return;
    root.dataset.wikiMounted = '1';

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
        if (!AppState.isAdmin && typeof window.openAdminLoginModal === 'function') {
            window.openAdminLoginModal();
        }
    }
}

async function postWikiApi(action, payload = {}, includeCsrf = true) {
    const csrf = includeCsrf ? AppState.csrfToken : '';
    const headers = { 'Content-Type': 'application/json' };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const bodyObj = csrf && payload && typeof payload === 'object' && !('csrf_token' in payload)
        ? { csrf_token: csrf, ...payload }
        : payload;
    const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(bodyObj)
    });
    return { ok: res.ok, data: await res.json() };
}

async function verifyExistingAdminSession(cachedCsrf) {
    try {
        AppState.csrfToken = cachedCsrf;
        const { ok, data } = await postWikiApi('check_auth', {});
        if (ok && data && data.success && data.authenticated) {
            AppState.isAdmin = true;
            AppState.userRole = data.role || 'admin';
            AppState.userName = data.user_name || 'Moderator';
            AppState.userEmail = data.user_email || '';
            AppState.forcePasswordChange = Boolean(data.force_change);
            AppState.csrfToken = data.csrf_token || cachedCsrf;
            sessionStorage.setItem('kato_csrf_token', AppState.csrfToken);
            return;
        }
    } catch {
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
        const { ok, data } = await postWikiApi('pending', {});
        if (ok && Array.isArray(data)) {
            AppState.pending = data;
            updateAdminBadges();
        }
    } catch (err) {
        console.warn('[Salsopedia] Nie udało się pobrać kolejki moderacji:', err.message);
    }
}

// --- Zarządzanie Zdarzeniami DOM ---

let studioController = null;

function ensureStudioController() {
    if (!studioController && window.kshWikiStudio && typeof window.kshWikiStudio.createStudioController === 'function') {
        studioController = window.kshWikiStudio.createStudioController({
            AppState,
            CATEGORY_NAMES,
            SUBCATEGORY_NAMES,
            inFlightMutations,
            runGuardedMutation,
            postWikiApi,
            resetAuthState,
            notifyKnowledgeUpdated,
            fetchTerms,
            fetchPendingTerms,
            switchViewMode,
            renderCurrentView,
            findOriginalLiveTerm,
            sortAndFilterTermsByQuery,
            computeSearchRelevance,
            updateCategoryCounters,
            updateAdminBadges,
            updateAdminToolbar,
            showMessage,
            linkifyDefinition
        });
    }
    return studioController;
}

function setupEventListeners() {
    const root = document.getElementById('wikiGrid');
    if (!root || root.dataset.wikiListenersBound === '1') return;
    root.dataset.wikiListenersBound = '1';

    const ctrl = ensureStudioController();
    bindSearchAndCategoryEvents();
    if (ctrl) {
        ctrl.bindAdminAndTeamEvents();
        ctrl.bindStudioEditorEvents();
    }
    bindGridAndModalDelegationEvents();
}

function bindSearchAndCategoryEvents() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const trackSearchDebounced = debounce((query) => {
        if (query && query.length >= 3 && typeof window.trackCookielessSearch === 'function') {
            window.trackCookielessSearch(query);
        }
    }, 1000);
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            AppState.searchQuery = e.target.value.trim().toLowerCase();
            if (clearBtn) clearBtn.classList.toggle('is-hidden', !AppState.searchQuery);
            renderCurrentView();
            trackSearchDebounced(AppState.searchQuery);
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

    const categoryList = document.getElementById('categoryList');
    if (categoryList) {
        categoryList.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-category]');
            if (li) setActiveCategory(li.dataset.category);
        });
    }

    const resetFilterBtn = document.getElementById('resetFilterBtn');
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener('click', () => setActiveCategory('all'));
    }

    ['sidebarAddBtn', 'addTermBtn', 'noResultsAddBtn'].forEach((btnId) => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener('click', () => window.openModal && window.openModal('new'));
    });
}

function bindGridAndModalDelegationEvents() {
    const closeButtons = [
        ['wikiModalCloseBtn', () => window.closeModal && window.closeModal()],
        ['cancelWikiModalBtn', () => window.closeModal && window.closeModal()],
        ['adminLoginModalCloseBtn', () => window.closeAdminLoginModal && window.closeAdminLoginModal()],
        ['cancelAdminLoginBtn', () => window.closeAdminLoginModal && window.closeAdminLoginModal()],
        ['teamModalCloseBtn', () => window.closeTeamModal && window.closeTeamModal()]
    ];
    closeButtons.forEach(([id, handler]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    });

    const grid = document.getElementById('wikiGrid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const { action, id, cat } = target.dataset;
            if (action === 'filter-cat' && cat) setActiveCategory(cat);
            else if (action === 'toggle-expand') {
                const card = target.closest('.wiki-card');
                if (card) {
                    const isExpanded = card.classList.toggle('is-expanded');
                    target.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
                    const labelEl = target.querySelector('.btn-expand-label');
                    const iconEl = target.querySelector('i');
                    if (labelEl) {
                        labelEl.textContent = isExpanded
                            ? wt('wiki.collapseBtn', 'Zwiń opis')
                            : wt('wiki.expandBtn', 'Rozwiń pełny opis');
                    }
                    if (iconEl) {
                        iconEl.className = isExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
                    }
                }
            }
            else if (action === 'jump-term' && id) { e.preventDefault(); jumpToTermCard(id); }
            else if (action === 'verify' && id && window.openVerifyModal) window.openVerifyModal(id);
            else if (action === 'quick-verify' && id && window.quickVerifyTerm) window.quickVerifyTerm(id);
            else if (action === 'unverify' && id && window.unverifyTerm) window.unverifyTerm(id);
            else if (action === 'approve' && id && window.approvePendingTerm) window.approvePendingTerm(id);
            else if (action === 'reject' && id && window.rejectPendingTerm) window.rejectPendingTerm(id);
            else if (action === 'edit-pending' && id && window.openEditPendingModal) window.openEditPendingModal(id);
            else if (action === 'edit-live' && id && window.openEditLiveModal) window.openEditLiveModal(id);
            else if (action === 'delete-live' && id && window.deleteLiveTerm) window.deleteLiveTerm(id);
            else if (action === 'switch-live') switchViewMode('live');
            else if (action === 'retry-fetch') fetchTerms();
        });
    }

    ['wikiModal', 'adminLoginModal', 'teamModal'].forEach((modalId) => {
        const el = document.getElementById(modalId);
        if (el) {
            el.addEventListener('click', (e) => {
                if (e.target === el) {
                    if (modalId === 'teamModal' && window.closeTeamModal) window.closeTeamModal();
                    else el.classList.remove('open', 'is-open');
                }
            });
        }
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
        badge.textContent = prefix + getCategoryLabel(cat);
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
            filterBadge.textContent = `🔍 Hasła do weryfikacji merytorycznej (${getCategoryLabel(AppState.activeCategory)})`;
        } else {
            filterBadge.textContent = getCategoryLabel(AppState.activeCategory);
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

function normalizeSearchString(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .trim();
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPolishStem(normWord) {
    if (!normWord || normWord.length < 4) return normWord;
    return normWord.replace(/(ach|ami|owi|iem|om|ie|ow|ej|ym|im|ia|iu|ek|ka|ki|ce|ke|y|a|e|i|u|o)$/, '');
}

/**
 * Oblicza wynik trafności wyszukiwania (Search Relevance Score):
 * - 100 pkt: dokładne dopasowanie całego tytułu (np. "Timba" === "timba")
 * -  90 pkt: dokładne dopasowanie głównego członu tytułu przed nawiasem/ukośnikiem/myślnikiem (np. "Clave (Rytm)" dla "clave")
 * -  80 pkt: tytuł zaczyna się od szukanej frazy (Prefix Match, np. "Timbales (Pailas)" dla "timba")
 * -  75 pkt: tytuł zaczyna się od rdzenia fleksyjnego szukanej frazy (np. "Timbero / Timbera" dla "timba")
 * -  70 pkt: szukana fraza występuje jako pełne słowo w głównym tytule (przed nawiasem)
 * -  65 pkt: szukana fraza występuje bezpośrednio w tytule (w tym wewnątrz nawiasu)
 * -  60 pkt: rdzeń fleksyjny szukanej frazy występuje w tytule (np. "Perkusja w Timbie" dla "timba")
 * -  25 pkt: szukana fraza występuje w definicji oraz w podkategorii
 * -  20 pkt: szukana fraza występuje w treści definicji (definition) lub autorze (author)
 * -   0 pkt: brak dopasowania
 */
function computeSearchRelevance(item, rawQuery) {
    if (!item || !rawQuery) return 0;
    const qRaw = String(rawQuery).trim().toLowerCase();
    const qNorm = normalizeSearchString(qRaw);
    if (!qNorm) return 0;

    const qStem = getPolishStem(qNorm);

    const termRaw = String(item.term || '').trim().toLowerCase();
    const termNorm = normalizeSearchString(termRaw);
    const baseTermNorm = termNorm.split(/[(\/—–-]/)[0].trim();

    if (termRaw === qRaw || termNorm === qNorm) {
        return 100;
    }

    if (baseTermNorm && baseTermNorm === qNorm) {
        return 90;
    }

    if (termRaw.startsWith(qRaw) || termNorm.startsWith(qNorm)) {
        return 80;
    }

    if (qStem && qStem.length >= 4 && termNorm.startsWith(qStem)) {
        return 75;
    }

    const wordRegex = new RegExp(`(?:^|[\\s(\\/„"'-])${escapeRegExp(qNorm)}(?:$|[\\s)\\/”"',.-])`, 'i');
    if (baseTermNorm && wordRegex.test(baseTermNorm)) {
        return 70;
    }

    if (termRaw.includes(qRaw) || termNorm.includes(qNorm)) {
        return 65;
    }

    if (qStem && qStem.length >= 4 && termNorm.includes(qStem)) {
        return 60;
    }

    const defRaw = String(item.definition || '').toLowerCase();
    const defNorm = normalizeSearchString(defRaw);
    const authorNorm = normalizeSearchString(item.author || '');
    const inDefOrAuthor = defRaw.includes(qRaw) || defNorm.includes(qNorm) || authorNorm.includes(qNorm);

    if (inDefOrAuthor) {
        const subs = Array.isArray(item.subcategory)
            ? item.subcategory
            : (item.subcategory ? [item.subcategory] : []);
        const subMatch = subs.some(s => {
            const sNorm = normalizeSearchString(SUBCATEGORY_NAMES[s] || s);
            return sNorm.includes(qNorm) || normalizeSearchString(s).includes(qNorm);
        });
        return subMatch ? 25 : 20;
    }

    return 0;
}

function sortAndFilterTermsByQuery(terms, rawQuery) {
    const list = Array.isArray(terms) ? [...terms] : [];
    const q = String(rawQuery || '').trim();

    if (!q) {
        return list.sort((a, b) => (a.term || '').localeCompare(b.term || '', 'pl', { sensitivity: 'base' }));
    }

    const scored = [];
    for (const item of list) {
        const score = computeSearchRelevance(item, q);
        if (score > 0) {
            scored.push({ item, score });
        }
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return (a.item.term || '').localeCompare(b.item.term || '', 'pl', { sensitivity: 'base' });
    });

    return scored.map(entry => entry.item);
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

    list = sortAndFilterTermsByQuery(list, AppState.searchQuery);

    if (countEl) {
        countEl.textContent = AppState.viewMode === 'unverified'
            ? wt('wiki.resultsUnverified', 'Do weryfikacji w tym widoku: {shown} haseł', { shown: list.length })
            : wt('wiki.resultsShown', 'Wyświetlono: {shown} z {total} haseł', { shown: list.length, total: AppState.terms.length });
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
    } else if (!isPending) {
        const unvLabel = escapeHtml(wt('wiki.unverifiedBadge', 'Niezweryfikowane'));
        const unvTitle = escapeHtml(wt('wiki.unverifiedTitle', 'Szablonowa odpowiedź oczekująca na weryfikację merytoryczną'));
        verifiedHtml = `<span class="status-unverified-badge" title="${unvTitle}">${unvLabel}</span>`;
    }

    let badgesHtml = '';
    const cats = Array.isArray(item.category) ? item.category : [item.category];
    cats.forEach(c => {
        if (!c) return;
        const safeCat = escapeHtml(c);
        const safeCatName = escapeHtml(getCategoryLabel(c));
        badgesHtml += `<span class="cat-badge main-cat" data-action="filter-cat" data-cat="${safeCat}">${safeCatName}</span>`;
    });

    const subs = Array.isArray(item.subcategory) ? item.subcategory : (item.subcategory ? [item.subcategory] : []);
    subs.forEach(s => {
        if (!s) return;
        badgesHtml += `<span class="cat-badge sub-cat">${escapeHtml(getSubcategoryLabel(s))}</span>`;
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

    const safeAuthor = escapeHtml(item.author || wt('wiki.unverifiedBadge', 'Niezweryfikowane'));
    const authorPrefix = escapeHtml(wt('wiki.authorLabel', 'Autor:'));
    let authorHtml = `<span class="author-meta">${authorPrefix} <strong>${safeAuthor}</strong></span>`;
    if (isSafeHttpUrl(item.author_link)) {
        authorHtml = `<span class="author-meta">${authorPrefix} <a href="${escapeHtml(item.author_link.trim())}" target="_blank" rel="noopener noreferrer"><strong>${safeAuthor}</strong> <i class="fas fa-link"></i></a></span>`;
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
               </button>
               <button type="button" class="btn-edit-admin" data-action="unverify" data-id="${safeId}" title="Cofnij status do Niezweryfikowane">
                   <i class="fas fa-undo"></i>
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
        const verifyTitle = escapeHtml(wt('wiki.verifyTitle', 'Zaproponuj poprawkę lub uzupełnienie do tego hasła'));
        const verifyLabel = escapeHtml(wt('wiki.verifyBtn', 'Zgłoś poprawkę'));
        actionsHtml = `
            <button type="button" class="btn-verify" data-action="verify" data-id="${safeId}" title="${verifyTitle}">
                <i class="fas fa-pencil-alt"></i> ${verifyLabel}
            </button>`;
    }

    const rawDefText = String(item.definition || '').trim();
    const isLongDef = !isPending && rawDefText.length > 200;
    const expandBtnHtml = isLongDef
        ? `<button type="button" class="btn-expand-def" data-action="toggle-expand" aria-expanded="false">
               <span class="btn-expand-label">${escapeHtml(wt('wiki.expandBtn', 'Rozwiń pełny opis'))}</span>
               <i class="fas fa-chevron-down" aria-hidden="true"></i>
           </button>`
        : '';

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
        ${expandBtnHtml}
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
        const expandBtn = card.querySelector('[data-action="toggle-expand"]');
        if (expandBtn && !card.classList.contains('is-expanded')) {
            card.classList.add('is-expanded');
            expandBtn.setAttribute('aria-expanded', 'true');
            const labelEl = expandBtn.querySelector('.btn-expand-label');
            const iconEl = expandBtn.querySelector('i');
            if (labelEl) labelEl.textContent = wt('wiki.collapseBtn', 'Zwiń opis');
            if (iconEl) iconEl.className = 'fas fa-chevron-up';
        }
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
    'Ziemek i Olita (La Clave)': ['Ziemek i Olita', 'Ziemek & Olita', 'Ziemowit Mazur'],
    'Klaudia i Adriano (La Clave)': ['Klaudia i Adriano', 'Klaudia & Adriano'],
    'Marzena i Tomek (La Clave)': ['Marzena i Tomek', 'Marzena & Tomek'],
    'Maciek Zahorodny (La Clave)': ['Maciek Zahorodny', 'Maćka Zahorodnego'],
    'Justyna Sarzyńska (La Clave)': ['Justyna Sarzyńska', 'Justyny Sarzyńskiej'],
    'Claudio Mineo (La Clave / Good Mood)': ['Claudio Mineo'],
    'Judyta „Niyaf” Mężyk i Joanna Fujawa (La Clave / Good Mood)': ['Judyta „Niyaf” Mężyk', 'Judyta Mężyk „Niyaf”', 'Judyta Niyaf', 'Joanna Fujawa'],
    'Kuba Tracz (La Clave)': ['Kuba Tracz', 'Kuby Tracza', 'Kubą Traczem'],
    'Dominik i Natalia (La Clave)': ['Dominik i Natalia', 'Dominik & Natalia'],
    'Martica Zaldivar (La Clave)': ['Martica Zaldivar'],
    'Piotr i Ela (La Clave)': ['Piotr i Ela', 'Ela & Piotr'],
    'Dawid Bawor (La Clave)': ['Dawid Bawor', 'Dawida Bawora'],
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
    'Suzy Q (Susie Q)': ['Suzy Q', 'Susie Q']
};

const GEO_IGNORE_TOKENS = new Set([
    'katowice', 'kuba', 'śląsk', 'gliwice / tychy', 'bielsko-biała',
    'katowice / śląsk', 'kuba / katowice', 'katowice / sosnowiec',
    'w salsie', 'orishas', '70', '7', '71', 'la clave', 'la clave / good mood', 'good mood', 'mil pasos',
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

        const aliases = POLISH_KEYWORD_ALIASES[t.term];
        if (Array.isArray(aliases)) {
            aliases.forEach(a => addEntry(a, t));
        }

        const parenMatch = t.term.match(/^([^(—]+?)\s*(?:\(([^)]+)\)|—\s*(.+))$/);
        if (parenMatch) {
            addEntry(parenMatch[1], t);
            if (parenMatch[2] && !GEO_IGNORE_TOKENS.has(parenMatch[2].trim().toLowerCase())) {
                addEntry(parenMatch[2], t);
            }
        }

        if (t.term.includes('/')) {
            t.term.split('/').forEach(part => {
                const cleaned = part.replace(/\([^)]*\)/g, '').trim();
                addEntry(cleaned, t);
            });
        }
    });

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
    window.refreshWikiLanguage = refreshWikiLanguage;
    window.linkifyDefinition = linkifyDefinition;
    window.jumpToTermCard = jumpToTermCard;
    window.computeWordDiff = computeWordDiff;
    window.buildTermDiffHtml = buildTermDiffHtml;
    window.computeSearchRelevance = computeSearchRelevance;
    window.sortAndFilterTermsByQuery = sortAndFilterTermsByQuery;
    window.escapeHtml = escapeHtml;
    window.isSafeHttpUrl = isSafeHttpUrl;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AppState,
        notifyKnowledgeUpdated,
        computeWordDiff,
        buildTermDiffHtml,
        computeSearchRelevance,
        sortAndFilterTermsByQuery,
        linkifyDefinition,
        buildKeywordEntries,
        escapeHtml,
        isSafeHttpUrl
    };
}
})();
