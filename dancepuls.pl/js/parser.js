import { parsujDateFB, formatujDatePL } from './utils.js';

/**
 * Parsuje surowy tekst JSON ze schowka i zwraca poprawne obiekty wydarzeń.
 * @param {string} jsonText - Tekst JSON skopiowany przez skraper
 * @returns {Object} Obiekt zawierający { events: [], skippedReasons: [] }
 */
export function parseClipboardData(jsonText) {
    const today = new Date();
    today.setDate(today.getDate() + 1); // Start od jutra, bo tak działa UI
    today.setHours(0, 0, 0, 0);

    let maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 13); // W sumie 14 dni (jutro + 13)
    maxDate.setHours(23, 59, 59, 999);

    let rawEvents;
    try {
        rawEvents = JSON.parse(jsonText);
    } catch (e) {
        throw new Error("Nieprawidłowy JSON.");
    }

    if (!Array.isArray(rawEvents)) {
        throw new Error("To nie jest tablica wydarzeń.");
    }

    const processedUrls = new Set();
    const uniqueRawEvents = [];
    const skippedReasons = [];

    // Deduplikacja na wejściu (po URL)
    rawEvents.forEach(ev => {
         if(!ev.url) return;
         if(processedUrls.has(ev.url)) return; 
         processedUrls.add(ev.url);
         uniqueRawEvents.push(ev);
    });

    const validatedEvents = [];

    uniqueRawEvents.forEach(ev => {
        console.group(`[Parser] Analiza: "${ev.title}"`);
        const candidates = [];
        const sources = [ev.rawDate, ev.description, ev.title];
        
        sources.forEach(src => {
            if (!src || src === "BRAK DATY") return;

            // 1. Próba na CAŁYM bloku
            const dFull = parsujDateFB(src);
            if (dFull) {
                console.log(`[Parser] Znaleziono datę w bloku: ${formatujDatePL(dFull)}`);
                candidates.push(dFull);
            }

            // 2. Próba linia po linii (fallback)
            const lines = src.split('\n');
            lines.forEach(line => {
                const dLine = parsujDateFB(line);
                if (dLine) {
                    console.log(`[Parser] Znaleziono datę w linii: ${formatujDatePL(dLine)} ("${line.trim()}")`);
                    candidates.push(dLine);
                }
            });
        });

        // Oczyszczanie i punktacja dat
        const scoredCandidates = candidates
            .map(d => {
                const cleanD = new Date(d);
                cleanD.setHours(0,0,0,0);
                return cleanD;
            })
            .filter(d => d >= today) // Tylko przyszłe/dzisiejsze
            .map(d => ({
                date: d,
                score: (d >= today && d <= maxDate) ? 10 : 0
            }))
            .sort((a, b) => b.score - a.score || a.date - b.date);

        if (scoredCandidates.length === 0) {
             skippedReasons.push(`"${ev.title}": Nie rozpoznano daty`);
             return; 
        }

        const parsedDate = scoredCandidates[0].date;

        if (parsedDate > maxDate) {
            skippedReasons.push(`"${ev.title}": Data poza zakresem (${formatujDatePL(parsedDate)})`);
            return;
        }
        
        ev.parsedDate = parsedDate;
        validatedEvents.push(ev);
        console.groupEnd();
    });

    validatedEvents.sort((a, b) => a.parsedDate - b.parsedDate);

    return {
        events: validatedEvents,
        skippedReasons
    };
}
