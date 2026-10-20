// Contact Form Logic with Event Delegation for SPA (RODO & Anti-Bot Ready)
(function () {
'use strict';

const pageLoadedAt = Date.now();

function ct(key, fallback) {
    if (typeof window !== 'undefined' && window.kshI18n && typeof window.kshI18n.t === 'function') {
        return window.kshI18n.t(key) || fallback;
    }
    return fallback;
}

document.addEventListener('submit', async function (e) {
    if (e.target && (e.target.name === 'contact' || e.target.id === 'contactForm')) {
        e.preventDefault();
        e.stopPropagation();
        const form = e.target;

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        const messageArea = getMessageArea(form);

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Anti-bot time and JS validation
        const elapsedSec = Math.round((Date.now() - pageLoadedAt) / 1000);
        formData.append('submission_seconds', elapsedSec.toString());
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

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>${ct('contact.sending', 'Wysyłanie...')}</span>`;
        }

        try {
            const response = await fetch('assets/php/contact.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.success !== false) {
                showMessage(messageArea, result.message || ct('contact.msgSuccess', 'Dziękujemy! Twoja wiadomość została wysłana.'), 'success');
                form.reset();
            } else {
                showMessage(messageArea, result.message || ct('contact.msgError', 'Wystąpił błąd podczas wysyłania.'), 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage(messageArea, ct('contact.msgNetError', 'Wystąpił błąd połączenia.'), 'error');
        } finally {
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
        form.insertBefore(div, form.firstChild);
    }
    return div;
}

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = `form-message form-message--${type}`;

    setTimeout(() => {
        element.classList.add('is-hidden');
    }, 5000);
}
})();
