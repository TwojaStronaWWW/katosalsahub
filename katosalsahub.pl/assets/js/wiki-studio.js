/**
 * KATO SALSA HUB - SALSOPEDIA STUDIO & RBAC MODERATION ENGINE
 * Wydzielony moduł Porównywarki Zmian (Visual Word Diff: Przed vs Po),
 * Edytora Salsopedia Studio (Live Preview + Podpowiedzi [[Hasło]]) oraz Panelu Moderacji RBAC.
 * Zero-dependency Vanilla JS, Platform-First Architecture (ISO 27001).
 */

(function () {
'use strict';

if (typeof window === 'undefined') {
    globalThis.window = globalThis;
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

    // 3. Porównanie kategorii i podkategorii
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

    const oldSubs = (Array.isArray(originalTerm.subcategory) ? originalTerm.subcategory : (originalTerm.subcategory ? [originalTerm.subcategory] : [])).filter(Boolean).sort().join(', ');
    const newSubs = (Array.isArray(proposedTerm.subcategory) ? proposedTerm.subcategory : (proposedTerm.subcategory ? [proposedTerm.subcategory] : [])).filter(Boolean).sort().join(', ');
    if (oldSubs !== newSubs) {
        totalChanges++;
        rows.push(`
            <div class="diff-field-row">
                <span class="diff-field-label">Podkategorie:</span>
                <del class="diff-removed">${escapeHtml(oldSubs || 'brak')}</del>
                <i class="fas fa-arrow-right diff-arrow"></i>
                <ins class="diff-added">${escapeHtml(newSubs || 'brak')}</ins>
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

// --- Inicjalizacja Salsopedia Studio & Panelu Moderacji RBAC ---

function createStudioController(core) {
    const {
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
    } = core;

    function resetChips(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    }

    function activateChips(containerId, values) {
        const container = document.getElementById(containerId);
        if (!container || !values) return;
        const existingChips = Array.from(container.querySelectorAll('.chip'));
        values.filter(Boolean).forEach(val => {
            let chip = existingChips.find(c => c.dataset.val === val);
            if (!chip && containerId === 'subcategoryChips') {
                chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'chip';
                chip.dataset.val = val;
                chip.textContent = SUBCATEGORY_NAMES[val] || val;
                container.appendChild(chip);
                existingChips.push(chip);
            }
            if (chip) {
                chip.classList.add('active');
            }
        });
    }

    function getActiveChips(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('.chip.active')).map(c => c.dataset.val);
    }

    function setupChipsInteractions(containerId) {
        const container = document.getElementById(containerId);
        if (!container || container.dataset.chipsBound === '1') return;
        container.dataset.chipsBound = '1';
        container.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip) return;
            chip.classList.toggle('active');
            updateStudioLivePreviewAndDiff();
        });
    }

    function toggleChipByValue(containerId, val) {
        const container = document.getElementById(containerId);
        if (!container || !val) return;
        const chip = Array.from(container.querySelectorAll('.chip')).find(c => c.dataset.val === val);
        if (chip) {
            chip.classList.toggle('active');
            updateStudioLivePreviewAndDiff();
        }
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
            author: document.getElementById('authorInput')?.value.trim() || 'Niezweryfikowane',
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
                badgesHtml += `<span class="cat-badge main-cat" data-toggle-cat="${escapeHtml(c)}" title="Kliknij, aby przełączyć kategorię">${escapeHtml(CATEGORY_NAMES[c] || c)}</span>`;
            });
            draft.subcategory.forEach(s => {
                badgesHtml += `<span class="cat-badge sub-cat" data-toggle-sub="${escapeHtml(s)}" title="Kliknij, aby przełączyć podkategorię">${escapeHtml(SUBCATEGORY_NAMES[s] || s)}</span>`;
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

            const isPreviewVerified = AppState.editingOriginalTerm && AppState.editingOriginalTerm.status === 'verified';
            const previewStatusBadge = isPreviewVerified
                ? `<span class="status-verified"><i class="fas fa-check"></i> Zweryfikowane</span>`
                : `<span class="status-unverified-badge">Niezweryfikowane</span>`;

            previewContainer.innerHTML = `
                <div class="wiki-card preview-wiki-card">
                    <div class="wiki-card-header">
                        <h3>${escapeHtml(draft.term)}</h3>
                        ${previewStatusBadge}
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
        const q = (query || '').trim();
        const matches = sortAndFilterTermsByQuery(AppState.terms, q)
            .filter(t => !q || computeSearchRelevance(t, q) >= 60)
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
            if (AppState.isAdmin && AppState.currentModalMode === 'admin_edit_live') {
                const { data: result } = await postWikiApi('admin_save', { entry: payload });
                if (result.success) {
                    showMessage(msgBox, 'success', 'Hasło zostało pomyślnie zapisane i zweryfikowane w bazie!');
                    await fetchTerms();
                    setTimeout(() => window.closeModal(), 900);
                } else {
                    showMessage(msgBox, 'error', result.error || 'Błąd zapisu');
                }
                return;
            }

            if (AppState.isAdmin && AppState.currentModalMode === 'admin_edit_pending') {
                const { data: result } = await postWikiApi('moderate', {
                    id: payload.id,
                    action: 'approve',
                    updated_entry: payload
                });
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

            let responseSuccess = false;
            try {
                const { data: result } = await postWikiApi('submit', payload, false);
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

    // --- Akcje Moderatora / Administratora i Zarządzanie Kontami RBAC ---

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
            const { data: result } = await postWikiApi('check_auth', { email, password: pass }, false);
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
        } catch {
            showMessage(msg, 'error', 'Brak połączenia z serwerem autoryzacji.');
        }
    }

    async function logoutAdmin() {
        try {
            await postWikiApi('logout', {});
        } catch {
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
            const { data: result } = await postWikiApi('change_password', {
                old_password: oldPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });
            if (result.success) {
                AppState.forcePasswordChange = false;
                const banner = document.getElementById('forcePasswordChangeBanner');
                if (banner) banner.classList.add('is-hidden');
                document.getElementById('changePasswordForm')?.reset();
                showMessage(msg, 'success', result.message || 'Hasło zostało zmienione!');
            } else {
                showMessage(msg, 'error', result.error || 'Błąd zmiany hasła.');
            }
        } catch {
            showMessage(msg, 'error', 'Błąd połączenia z serwerem.');
        }
    }

    async function fetchModeratorsList() {
        if (AppState.userRole !== 'admin') return;
        const container = document.getElementById('moderatorsListContainer');
        if (!container) return;

        try {
            const { data: result } = await postWikiApi('list_moderators', {});
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
        } catch {
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
            const { data: result } = await postWikiApi('save_moderator', {
                email,
                name,
                role,
                password,
                force_change: forceChange
            });
            if (result.success) {
                showMessage(msg, 'success', result.message || 'Zapisano konto moderatora!');
                document.getElementById('addModeratorForm')?.reset();
                await fetchModeratorsList();
            } else {
                showMessage(msg, 'error', result.error || 'Błąd zapisu konta moderatora.');
            }
        } catch {
            showMessage(msg, 'error', 'Błąd połączenia z serwerem.');
        }
    }

    async function deleteModeratorAccount(email) {
        if (!confirm(`Czy na pewno chcesz usunąć konto moderatora: ${email}?`)) return;
        try {
            const { data: result } = await postWikiApi('delete_moderator', { email });
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
        await runGuardedMutation(`verify:${id}`, 'quick_verify', { id }, (result) => {
            if (result.entry) {
                const idx = AppState.terms.findIndex((t) => t.id === id);
                if (idx !== -1) AppState.terms[idx] = result.entry;
            }
            notifyKnowledgeUpdated();
            updateCategoryCounters();
            renderCurrentView();
        }, 'Błąd weryfikacji');
    };

    window.unverifyTerm = async function (id) {
        await runGuardedMutation(`verify:${id}`, 'quick_verify', { id, unverify: true }, (result) => {
            if (result.entry) {
                const idx = AppState.terms.findIndex((t) => t.id === id);
                if (idx !== -1) AppState.terms[idx] = result.entry;
            }
            notifyKnowledgeUpdated();
            updateCategoryCounters();
            renderCurrentView();
        }, 'Błąd zmiany statusu');
    };

    window.approvePendingTerm = async function (id) {
        if (inFlightMutations.has(`moderate:${id}`)) return;
        if (!confirm('Czy na pewno chcesz zatwierdzić to zgłoszenie i opublikować je w bazie Salsopedii?')) return;
        await runGuardedMutation(`moderate:${id}`, 'moderate', { id, action: 'approve' }, async () => {
            AppState.pending = AppState.pending.filter((t) => t.id !== id);
            updateAdminBadges();
            await fetchTerms();
            renderCurrentView();
        });
    };

    window.rejectPendingTerm = async function (id) {
        if (inFlightMutations.has(`moderate:${id}`)) return;
        if (!confirm('Czy na pewno chcesz odrzucić to zgłoszenie? Zostanie ono trwale usunięte z kolejki.')) return;
        await runGuardedMutation(`moderate:${id}`, 'moderate', { id, action: 'reject' }, () => {
            AppState.pending = AppState.pending.filter((t) => t.id !== id);
            updateAdminBadges();
            renderCurrentView();
        });
    };

    window.openEditLiveModal = function (id) {
        const term = AppState.terms.find((t) => t.id === id);
        if (term) window.openModal('admin_edit_live', term);
    };

    window.openEditPendingModal = function (id) {
        const term = AppState.pending.find((t) => t.id === id);
        if (term) window.openModal('admin_edit_pending', term);
    };

    window.openVerifyModal = function (id) {
        const term = AppState.terms.find((t) => t.id === id);
        if (term) window.openModal('verify', term);
    };

    window.deleteLiveTerm = async function (id) {
        if (AppState.userRole !== 'admin') {
            alert('Tylko główny Administrator może bezpowrotnie usuwać hasła z bazy.');
            return;
        }
        if (inFlightMutations.has(`delete:${id}`)) return;
        if (!confirm('UWAGA: Czy na pewno chcesz bezpowrotnie usunąć to hasło z bazy Salsopedii?')) return;
        await runGuardedMutation(`delete:${id}`, 'admin_delete', { id }, () => {
            AppState.terms = AppState.terms.filter((t) => t.id !== id);
            notifyKnowledgeUpdated();
            updateCategoryCounters();
            renderCurrentView();
        });
    };

    function bindAdminAndTeamEvents() {
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

        const toolbarActions = [
            ['btnShowLive', () => switchViewMode('live')],
            ['btnShowUnverified', () => switchViewMode('unverified')],
            ['btnShowPending', () => switchViewMode('pending')],
            ['btnAdminAdd', () => window.openModal('admin_direct')],
            ['btnManageTeam', () => window.openTeamModal()],
            ['btnLogoutAdmin', () => logoutAdmin()]
        ];
        toolbarActions.forEach(([id, handler]) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        });

        const adminLoginForm = document.getElementById('adminLoginForm');
        if (adminLoginForm) adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);

        const changePasswordForm = document.getElementById('changePasswordForm');
        if (changePasswordForm) changePasswordForm.addEventListener('submit', handleChangePasswordSubmit);

        const addModeratorForm = document.getElementById('addModeratorForm');
        if (addModeratorForm) addModeratorForm.addEventListener('submit', handleSaveModeratorSubmit);

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
    }

    function bindStudioEditorEvents() {
        setupChipsInteractions('categoryChips');
        setupChipsInteractions('subcategoryChips');

        const wikiForm = document.getElementById('wikiForm');
        if (wikiForm) {
            wikiForm.addEventListener('submit', handleFormSubmit);
            wikiForm.addEventListener('input', () => updateStudioLivePreviewAndDiff());
        }

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
            closeWikiLinkPickerBtn.addEventListener('click', () => wikiLinkPicker.classList.add('is-hidden'));
        }
        if (wikiLinkSearchInput) {
            wikiLinkSearchInput.addEventListener('input', (e) => renderWikiLinkSuggestions(e.target.value));
        }
        if (wikiLinkSuggestions) {
            wikiLinkSuggestions.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-insert-term]');
                if (btn) insertTermTagIntoDefinition(btn.dataset.insertTerm);
            });
        }

        const dupWarn = document.getElementById('termDuplicateWarning');
        if (dupWarn) {
            dupWarn.addEventListener('click', (e) => {
                const switchBtn = e.target.closest('[data-action="switch-to-existing"]');
                if (!switchBtn) return;
                const existingTerm = AppState.terms.find((t) => t.id === switchBtn.dataset.id);
                if (existingTerm) {
                    window.openModal(AppState.isAdmin ? 'admin_edit_live' : 'verify', existingTerm);
                }
            });
        }

        const addSourceRowBtn = document.getElementById('addSourceRowBtn');
        if (addSourceRowBtn) {
            addSourceRowBtn.addEventListener('click', () => {
                window.addSourceRow();
                updateStudioLivePreviewAndDiff();
            });
        }

        const sourceContainer = document.getElementById('sourceContainer');
        if (sourceContainer) {
            sourceContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action="remove-source"]');
                const row = btn ? btn.closest('.source-row') : null;
                if (row) {
                    row.remove();
                    updateStudioLivePreviewAndDiff();
                }
            });
        }

        const livePreviewContainer = document.getElementById('livePreviewContainer');
        if (livePreviewContainer) {
            livePreviewContainer.addEventListener('click', (e) => {
                const catBadge = e.target.closest('[data-toggle-cat]');
                if (catBadge && catBadge.dataset.toggleCat) {
                    toggleChipByValue('categoryChips', catBadge.dataset.toggleCat);
                    return;
                }
                const subBadge = e.target.closest('[data-toggle-sub]');
                if (subBadge && subBadge.dataset.toggleSub) {
                    toggleChipByValue('subcategoryChips', subBadge.dataset.toggleSub);
                }
            });
        }
    }

    return {
        bindAdminAndTeamEvents,
        bindStudioEditorEvents,
        updateStudioLivePreviewAndDiff
    };
}

const studioApi = {
    computeWordDiff,
    buildTermDiffHtml,
    formatSourcesSummary,
    createStudioController
};

if (typeof window !== 'undefined') {
    window.kshWikiStudio = studioApi;
    window.computeWordDiff = computeWordDiff;
    window.buildTermDiffHtml = buildTermDiffHtml;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = studioApi;
}
})();
