import { parsujDateFB, formatujDatePL, toYMD } from './utils.js';

/**
 * Zwraca kanoniczny klucz deduplikacji dla adresu URL wydarzenia (np. fb:891329324066083).
 * @param {string} rawUrl
 * @returns {string}
 */
export function getCanonicalEventKey(rawUrl = '') {
    const str = String(rawUrl || '').trim();
    if (!str) return '';
    const fbMatch = str.match(/facebook\.com\/events\/(?:[^/?#]+\/)*?(\d{8,})/i);
    if (fbMatch) return `fb:${fbMatch[1]}`;
    return str.split('#')[0].split('?')[0].replace(/\/+$/, '').toLowerCase();
}

/**
 * Parsuje surowy tekst JSON ze schowka (wygenerowany przez Universal Event Scraper v3.0)
 * i zwraca zwalidowane obiekty wydarzeń posortowane chronologicznie.
 *
 * Ważenie źródeł daty (zapobiega nadpisaniu właściwej daty wydarzenia przez przypadkowy dzień tygodnia w opisie):
 * - ev.isoDate (JSON-LD / Relay / OpenGraph): 100 pkt
 * - ev.rawDate (dedykowane pole daty karty): 90 pkt
 * - ev.title (nagłówek wydarzenia): 60 pkt
 * - ev.description (opis wydarzenia, bez gołych nazw dni tygodnia): 20 pkt
 *
 * @param {string} jsonText - Tekst JSON skopiowany przez skraper
 * @param {Object} [options] - Opcje ({ now?: Date, horizonDays?: number })
 * @returns {Object} Obiekt zawierający { events: [], skippedReasons: [] }
 */
export function parseClipboardData(jsonText, options = {}) {
    const today = options.now instanceof Date ? new Date(options.now) : new Date();
    today.setHours(0, 0, 0, 0);

    const horizonDays = typeof options.horizonDays === 'number' ? options.horizonDays : 180;
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + horizonDays);
    maxDate.setHours(23, 59, 59, 999);

    let rawEvents;
    try {
        rawEvents = JSON.parse(jsonText);
    } catch {
        throw new Error('Nieprawidłowy JSON.');
    }

    if (!Array.isArray(rawEvents)) {
        throw new Error('To nie jest tablica wydarzeń.');
    }

    const processedKeys = new Set();
    const uniqueRawEvents = [];
    const skippedReasons = [];

    // 1. Deduplikacja na wejściu (po kanonicznym ID wydarzenia FB lub czystym URL + dacie)
    rawEvents.forEach(ev => {
        if (!ev || !ev.url) return;
        const baseKey = getCanonicalEventKey(ev.url);
        const dateHint = String(ev.isoDate || ev.rawDate || '').trim();
        const dedupKey = dateHint ? `${baseKey}::${dateHint}` : baseKey;
        if (processedKeys.has(dedupKey)) return;
        processedKeys.add(dedupKey);
        uniqueRawEvents.push(ev);
    });

    const validatedEvents = [];

    uniqueRawEvents.forEach(ev => {
        const candidates = [];

        const pushCandidate = (d, weight) => {
            if (!d || isNaN(d.getTime())) return;
            const cleanD = new Date(d);
            cleanD.setHours(0, 0, 0, 0);
            candidates.push({ date: cleanD, weight });
        };

        // Warstwa 1: Jawna data ISO ze skrapera v3.0 (najwyższy priorytet: 100 pkt)
        if (ev.isoDate) {
            pushCandidate(parsujDateFB(String(ev.isoDate), { now: today, allowWeekdayOnly: false }), 100);
        }

        // Warstwa 2: Pole rawDate z karty wydarzenia (priorytet: 90 pkt)
        if (ev.rawDate && ev.rawDate !== 'BRAK DATY') {
            pushCandidate(parsujDateFB(String(ev.rawDate), { now: today, allowWeekdayOnly: true }), 90);
        }

        // Warstwa 3: Tytuł wydarzenia (priorytet: 60 pkt, bez samych nazw dni tygodnia)
        if (ev.title) {
            pushCandidate(parsujDateFB(String(ev.title), { now: today, allowWeekdayOnly: false }), 60);
        }

        // Warstwa 4: Opis wydarzenia (priorytet: 20 pkt, wyłącznie konkretne daty dzienne/miesięczne)
        if (ev.description) {
            const descStr = String(ev.description);
            pushCandidate(parsujDateFB(descStr, { now: today, allowWeekdayOnly: false }), 20);
            descStr.split('\n').forEach(line => {
                pushCandidate(parsujDateFB(line, { now: today, allowWeekdayOnly: false }), 15);
            });
        }

        if (candidates.length === 0) {
            skippedReasons.push(`"${ev.title || 'Bez tytułu'}": Nie rozpoznano daty`);
            return;
        }

        // Odfiltruj daty minione (< today), a wśród dzisiejszych/przyszłych wybierz tę o najwyższej wadze źródła
        const activeCandidates = candidates
            .filter(c => c.date >= today)
            .sort((a, b) => b.weight - a.weight || a.date - b.date);

        if (activeCandidates.length === 0) {
            const latestPast = candidates.sort((a, b) => b.date - a.date)[0].date;
            skippedReasons.push(`"${ev.title || 'Bez tytułu'}": Wydarzenie minione (${formatujDatePL(latestPast)})`);
            return;
        }

        const parsedDate = activeCandidates[0].date;

        if (parsedDate > maxDate) {
            skippedReasons.push(`"${ev.title || 'Bez tytułu'}": Data poza zakresem (${formatujDatePL(parsedDate)})`);
            return;
        }

        ev.parsedDate = parsedDate;
        ev.isoDate = toYMD(parsedDate);
        validatedEvents.push(ev);
    });

    validatedEvents.sort((a, b) => a.parsedDate - b.parsedDate);

    return {
        events: validatedEvents,
        skippedReasons
    };
}
