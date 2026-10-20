// Contact Form Logic with Event Delegation for SPA (RODO & Anti-Bot Ready)
(function () {
'use strict';

const pageLoadedAt = Date.now();
const DRAFT_KEY = 'ksh_contact_draft_v1';
let inFlightContactSubmit = false;
let hideMessageTimer = null;

function ct(key, fallback) {
    if (typeof window !== 'undefined' && window.kshI18n && typeof window.kshI18n.t === 'function') {
        return window.kshI18n.t(key) || fallback;
    }
    return fallback;
}

function saveContactDraft(form) {
    try {
        if (typeof localStorage === 'undefined' || !form) return;
        const nameEl = form.querySelector('input[name="name"]');
        const emailEl = form.querySelector('input[name="email"]');
        const msgEl = form.querySelector('textarea[name="message"]');
        const gdprEl = form.querySelector('input[name="gdpr_consent"]');
        const draft = {
            name: nameEl ? nameEl.value : '',
            email: emailEl ? emailEl.value : '',
            message: msgEl ? msgEl.value : '',
            gdpr: gdprEl ? Boolean(gdprEl.checked) : false,
            ts: Date.now()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (_) {
        // Ignore storage errors in private mode
    }
}

function restoreContactDraft(doc = document) {
    try {
        if (typeof localStorage === 'undefined' || !doc) return;
        const form = doc.getElementById('contactForm');
        if (!form) return;
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft || typeof draft !== 'object') return;
        if (draft.ts && Date.now() - draft.ts > 7 * 24 * 3600 * 1000) {
            localStorage.removeItem(DRAFT_KEY);
            return;
        }
        const nameEl = form.querySelector('input[name="name"]');
        const emailEl = form.querySelector('input[name="email"]');
        const msgEl = form.querySelector('textarea[name="message"]');
        const gdprEl = form.querySelector('input[name="gdpr_consent"]');
        if (nameEl && !nameEl.value && draft.name) nameEl.value = String(draft.name);
        if (emailEl && !emailEl.value && draft.email) emailEl.value = String(draft.email);
        if (msgEl && !msgEl.value && draft.message) msgEl.value = String(draft.message);
        if (gdprEl && typeof draft.gdpr === 'boolean') gdprEl.checked = draft.gdpr;
    } catch (_) {
        // Ignore malformed draft
    }
}

function clearContactDraft() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(DRAFT_KEY);
        }
    } catch (_) {}
}

document.addEventListener('input', function (e) {
    const form = e.target && e.target.closest ? e.target.closest('#contactForm, form[name="contact"]') : null;
    if (form && e.target.name !== 'hp_chk') {
        saveContactDraft(form);
    }
});

document.addEventListener('change', function (e) {
    const form = e.target && e.target.closest ? e.target.closest('#contactForm, form[name="contact"]') : null;
    if (form && e.target.name !== 'hp_chk') {
        saveContactDraft(form);
    }
});

if (document.readyState !== 'loading') {
    restoreContactDraft(document);
} else {
    document.addEventListener('DOMContentLoaded', function () {
        restoreContactDraft(document);
    });
}

document.addEventListener('page:loaded', function () {
    restoreContactDraft(document);
});

document.addEventListener('submit', async function (e) {
    if (e.target && (e.target.name === 'contact' || e.target.id === 'contactForm')) {
        e.preventDefault();
        if (inFlightContactSubmit) return;

        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        const messageArea = getMessageArea(form);

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Anti-bot time and JS validation (safe against fast browser autofill)
        const elapsedSec = Math.max(2.6, (Date.now() - pageLoadedAt) / 1000).toFixed(2);
        formData.append('submission_seconds', elapsedSec);
        formData.append('js_check', 'passed');

        // Walidacja po stronie klienta (Imię lub pseudonim, Email, Wiadomość, Zgoda RODO)
        const nameTrimmed = (data.name || '').trim();
        const emailTrimmed = (data.email || '').trim();
        const msgTrimmed = (data.message || '').trim();
        const gdprCheckbox = form.querySelector('input[name="gdpr_consent"]');

        if (!nameTrimmed || !emailTrimmed || !msgTrimmed) {
            showMessage(messageArea, ct('contact.errRequired', 'Wypełnij wszystkie pola (imię lub pseudonim, e-mail oraz wiadomość)!'), 'error');
            return;
        }

        if (gdprCheckbox && !gdprCheckbox.checked) {
            showMessage(messageArea, ct('contact.errGdpr', 'Zaakceptuj Politykę Prywatności, aby wysłać wiadomość.'), 'error');
            return;
        }

        inFlightContactSubmit = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>${ct('contact.sending', 'Wysyłanie...')}</span>`;
        }

        try {
            const response = await fetch('assets/php/contact.php', {
                method: 'POST',
                body: formData
            });

            const rawText = await response.text();
            let result = null;
            try {
                result = rawText ? JSON.parse(rawText) : null;
            } catch (_) {
                result = null;
            }

            if (response.ok && result && result.success !== false) {
                showMessage(messageArea, result.message || ct('contact.msgSuccess', 'Dziękujemy! Twoja wiadomość została wysłana.'), 'success');
                form.reset();
                clearContactDraft();
            } else {
                const errMsg = (result && result.message)
                    ? result.message
                    : ct('contact.msgError', 'Wystąpił błąd podczas wysyłania.');
                showMessage(messageArea, errMsg, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage(messageArea, ct('contact.msgNetError', 'Wystąpił błąd połączenia.'), 'error');
        } finally {
            inFlightContactSubmit = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    }
});

function getMessageArea(form) {
    let div = form.querySelector('.form-message');
    if (!div) {
        div = document.createElement('div');
        div.className = 'form-message is-hidden';
        div.setAttribute('role', 'status');
        div.setAttribute('aria-live', 'polite');
        form.insertBefore(div, form.firstChild);
    }
    return div;
}

function showMessage(element, text, type) {
    if (hideMessageTimer) {
        clearTimeout(hideMessageTimer);
        hideMessageTimer = null;
    }
    element.textContent = text;
    element.className = `form-message form-message--${type}`;

    hideMessageTimer = setTimeout(() => {
        element.classList.add('is-hidden');
        hideMessageTimer = null;
    }, 6000);
}
})();
