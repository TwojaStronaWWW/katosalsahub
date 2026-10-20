import { parsujDateFB, formatujDatePL, toYMD } from './utils.js';
import { miejscaWgMiasta, adresyMap, adresMiastoSztywne, styleKeywords } from './config.js';

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

/**
 * Importuje wydarzenia ze schowka (format JSON wygenerowany przez fb_scraper.js)
 * bezpośrednio do formularza kalendarza kuratora DancePuls.
 */
export async function importujZFacebooka(silent = false, { ensureDayBlock, zapiszStan, generujPost } = {}) {
    let jsonText;
    try {
        jsonText = await navigator.clipboard.readText();
        console.log('[Import] Surowe dane ze schowka:', jsonText ? jsonText.substring(0, 100) + '...' : 'PUSTY');
    } catch {
        if (!silent) alert('Błąd odczytu schowka! (Może wymagane kliknięcie w stronę?)');
        return;
    }

    if (!jsonText || !jsonText.trim()) {
        if (!silent) alert('Schowek jest pusty!');
        return;
    }

    if (!jsonText.trim().startsWith('[')) {
        if (!silent) {
            alert(
                'Dane w schowku nie wyglądają na format FB (brak nawiasu [ ).\nUpewnij się, że użyłeś skrapera w konsoli.'
            );
        }
        return;
    }

    try {
        const { events, skippedReasons } = parseClipboardData(jsonText);

        let importedCount = 0;
        let duplicateCount = 0;
        let noSpaceCount = 0;

        const getIds = url => {
            if (!url) return [];
            return url.match(/\d{8,}/g) || [];
        };

        const cityInflectionRegexMap = {
            Katowice: /\bkatowic[a-ząćęłńóśźż]*\b/i,
            Kraków: /\b(krak[oó]w[a-ząćęłńóśźż]*|cracow|cracovia)\b/i,
            Gliwice: /\bgliwic[a-ząćęłńóśźż]*\b/i,
            Tychy: /\btych(y|ach|ów|om)\b/i,
            'Bielsko-Biała': /\bbielsk[a-ząćęłńóśźż-]*\b/i,
            Częstochowa: /\bcz[eę]stochow[a-ząćęłńóśźż]*\b/i,
            Chorzów: /\bchorz[oó]w[a-ząćęłńóśźż]*\b/i,
            Bytom: /\bbytom[a-ząćęłńóśźż]*\b/i,
            Świętochłowice: /\b[sś]wi[eę]toch[lł]owic[a-ząćęłńóśźż]*\b/i,
            Rybnik: /\brybnik[a-ząćęłńóśźż]*\b/i,
            Siewierz: /\bsiewierz[a-ząćęłńóśźż]*\b/i,
            Hucisko: /\bhucisk[a-ząćęłńóśźż]*\b/i,
            'Piekary Śląskie': /\bpiekar[a-ząćęłńóśźż]*\b/i,
            'Tarnowskie Góry': /\btarnowski[a-ząćęłńóśźż\s]*g[oó]r[a-ząćęłńóśźż]*\b/i,
            'Dąbrowa Górnicza': /\bd[aą]brow[a-ząćęłńóśźż\s]*g[oó]rnicz[a-ząćęłńóśźż]*\b/i,
            Szczyrk: /\bszczyrk[a-ząćęłńóśźż]*\b/i,
            Wisła: /\bwi[sś]l(a|e|ą)\b/i,
        };

        events.forEach(ev => {
            const parsedDate = ev.parsedDate;
            const evYMD = toYMD(parsedDate);
            console.log(`[Import] Przetwarzanie: "${ev.title}" na dzień ${evYMD}`);
            const dayBlock = typeof ensureDayBlock === 'function' ? ensureDayBlock(evYMD) : null;

            if (!dayBlock) {
                skippedReasons.push(`"${ev.title}": Nieprawidłowa data ${evYMD}`);
                return;
            }

            const newIds = getIds(ev.url);
            const alreadyExists = Array.from(dayBlock.querySelectorAll('.event-block')).some(eb => {
                if (eb.classList.contains('is-hidden')) return false;
                const linkVal = eb.querySelector('.link').value || '';
                if (linkVal && linkVal === ev.url) return true;
                const existingIds = getIds(linkVal);
                if (newIds.length > 0 && existingIds.length > 0) {
                    if (newIds.some(id => existingIds.includes(id))) return true;
                }
                return false;
            });

            if (alreadyExists) {
                console.warn(`[Import] Pominięto duplikat: "${ev.title}"`);
                duplicateCount++;
                return;
            }

            let emptySlot = Array.from(dayBlock.querySelectorAll('.event-block')).find(eb => {
                return eb.classList.contains('is-hidden') && !eb.querySelector('.link').value;
            });
            if (!emptySlot && dayBlock._createEventContainer) {
                const newIdx = dayBlock.querySelectorAll('.event-container').length;
                const newContainer = dayBlock._createEventContainer(dayBlock, newIdx);
                dayBlock.appendChild(newContainer);
                emptySlot = newContainer.querySelector('.event-block');
            }

            if (emptySlot) {
                const container = emptySlot.parentElement;
                const eventBlock = emptySlot;

                const mainCheckbox = container.querySelector('.toggle-checkbox');
                mainCheckbox.checked = true;
                mainCheckbox.dispatchEvent(new Event('change'));
                eventBlock.querySelector('.link').value = ev.url;

                const tytulInput = eventBlock.querySelector('.tytul-wydarzenia');
                if (tytulInput && ev.title && ev.title !== 'Wydarzenie bez tytułu') {
                    tytulInput.value = ev.title;
                }

                const miastoSelect = eventBlock.querySelector('.miasto');
                const miejsceSelect = eventBlock.querySelector('.miejsce');
                const miastoInne = eventBlock.querySelector('.miasto-inne');

                let bestCity = 'Katowice';
                let bestPlace = null;

                const primaryText = ((ev.title || '') + ' ' + (ev.description || '')).toLowerCase();
                const locationText = (ev.location || '').toLowerCase();
                const fullText = primaryText + ' ' + locationText;

                let matchedAddr = null;
                for (const [addr, place] of Object.entries(adresyMap || {})) {
                    if (primaryText.includes(addr)) {
                        bestPlace = place;
                        matchedAddr = addr;
                        break;
                    }
                }

                if (!bestPlace) {
                    for (const [addr, place] of Object.entries(adresyMap || {})) {
                        if (locationText.includes(addr)) {
                            bestPlace = place;
                            matchedAddr = addr;
                            break;
                        }
                    }
                }

                if (!bestPlace) {
                    for (const city of Object.keys(miejscaWgMiasta || {})) {
                        const cityRe = cityInflectionRegexMap[city];
                        const matchesCity = cityRe ? cityRe.test(fullText) : fullText.includes(city.toLowerCase());
                        if (matchesCity) {
                            bestCity = city;
                            const places = miejscaWgMiasta[city];
                            for (const p of places) {
                                if (fullText.includes(p.toLowerCase())) {
                                    bestPlace = p;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                } else if (matchedAddr && adresMiastoSztywne[matchedAddr]) {
                    bestCity = adresMiastoSztywne[matchedAddr];
                } else {
                    for (const [city, places] of Object.entries(miejscaWgMiasta || {})) {
                        if (places.includes(bestPlace)) {
                            bestCity = city;
                            break;
                        }
                    }
                }

                if (bestPlace) {
                    miastoSelect.value = bestCity;
                    miastoSelect.dispatchEvent(new Event('change'));
                    miejsceSelect.value = bestPlace;
                } else if (ev.location) {
                    miastoSelect.value = 'Inne';
                    miastoSelect.dispatchEvent(new Event('change'));
                    miastoInne.value = ev.location;
                } else {
                    miastoSelect.value = 'Katowice';
                    miastoSelect.dispatchEvent(new Event('change'));
                }

                const checkboxes = eventBlock.querySelectorAll('input.styl');
                checkboxes.forEach(cb => (cb.checked = false));
                Object.entries(styleKeywords || {}).forEach(([key, val]) => {
                    if (fullText.includes(key)) {
                        const cb = Array.from(checkboxes).find(c => c.value === val);
                        if (cb) cb.checked = true;
                    }
                });

                if (
                    fullText.includes('promowane') ||
                    fullText.includes('kato salsa hub') ||
                    bestPlace === 'Wolni Ludzie' ||
                    bestPlace === 'Dolina Trzech Stawów'
                ) {
                    const promoteCb = container.querySelector('.promowane');
                    if (promoteCb) {
                        promoteCb.checked = true;
                        promoteCb.dispatchEvent(new Event('change'));
                    }
                }

                importedCount++;
            } else {
                noSpaceCount++;
            }
        });

        if (importedCount > 0) {
            alert(`✅ Zaimportowano ${importedCount} wydarzeń!`);
            if (typeof zapiszStan === 'function') zapiszStan();
            if (typeof generujPost === 'function') generujPost();
        } else if (!silent) {
            let msg = '❌ Nie zaimportowano żadnych nowych wydarzeń.';
            if (duplicateCount > 0) msg += `\n- Pominięto ${duplicateCount} duplikatów (są już na liście).`;
            if (noSpaceCount > 0) msg += `\n- Brak wolnych slotów na wybrane dni dla ${noSpaceCount} wydarzeń!`;

            if (skippedReasons.length > 0) {
                msg += '\n\nInne powody:\n' + skippedReasons.slice(0, 3).join('\n');
            }
            alert(msg);
        }
    } catch (e) {
        console.error('Import Error:', e);
        if (!silent) alert('Błąd importu: ' + e.message);
    }
}
