/**
 * Formatuje obiekt Date na ciąg znaków DD.MM
 * @param {Date} date - Obiekt daty do sformatowania
 * @returns {string} Sformatowana data (np. "05.02")
 */
export function formatujDatePL(date) {
    const d = date.getDate().toString().padStart(2, '0')
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    return `${d}.${m}`
}

/**
 * Zwraca datę w formacie YYYY-MM-DD (lokalny czas)
 * @param {Date} date 
 * @returns {string} np. "2024-02-05"
 */
export function toYMD(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Dodaje określoną liczbę dni do podanej daty
 * @param {Date|string} date - Data wejściowa
 * @param {number} ile - Liczba dni do dodania
 * @returns {Date} Nowy obiekt Date
 */
export function dodajDni(date, ile) {
    const d = new Date(date)
    d.setDate(d.getDate() + ile)
    return d
}

/**
 * Generuje listę obiektów reprezentujących kolejne dni, zaczynając od jutra
 * @param {number} ileDni - Ile dni wygenerować
 * @param {string[]} dniTygodnia - Nazwy dni tygodnia (z configu)
 * @returns {Object[]} Tablica obiektów {date, label, dzienTygIndex}
 */
export function generujDniOdJutra(ileDni, dniTygodnia) {
    const dzis = new Date()
    dzis.setHours(0, 0, 0, 0)
    const start = dodajDni(dzis, 0) // Start od dzisiaj (aby pokazywać dzisiejsze i późniejsze wydarzenia)
    const result = []
    for (let i = 0; i < ileDni; i++) {
        const d = dodajDni(start, i)
        const dzienTyg = dniTygodnia[d.getDay()]
        result.push({
            date: d,
            ymd: toYMD(d),
            label: `${dzienTyg} (${formatujDatePL(d)})`,
            dzienTygIndex: d.getDay(),
        })
    }
    return result
}

/**
 * Główny parser daty (v3.0). Rozpoznaje formaty ISO, OpenGraph FB ("października 25 2026"),
 * zakresy wielodniowe ("24–25.10.2026", "24-25 października"), daty relatywne ("dzisiaj", "jutro"),
 * formaty z kropką/ukośnikiem oraz kombinacje dnia miesiąca i dnia tygodnia.
 * @param {string} text - Tekst zawierający datę
 * @param {Object} [options] - Opcje parsowania ({ now?: Date, allowWeekdayOnly?: boolean })
 * @returns {Date|null} Obiekt Date (w czasie lokalnym 00:00:00) lub null, jeśli nie rozpoznano
 */
export function parsujDateFB(text, options = {}) {
    if (!text || typeof text !== 'string') return null;
    const raw = text.trim();
    if (!raw || raw.toUpperCase() === 'BRAK DATY') return null;

    const now = options.now instanceof Date ? new Date(options.now) : new Date();
    now.setHours(0, 0, 0, 0);
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();

    // 1. Format ISO YYYY-MM-DD (z JSON-LD, schema.org lub Relay) — parsowany w czasie lokalnym
    const isoMatch = raw.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
    if (isoMatch) {
        return new Date(
            parseInt(isoMatch[1], 10),
            parseInt(isoMatch[2], 10) - 1,
            parseInt(isoMatch[3], 10)
        );
    }

    const upper = raw.toUpperCase();

    // 2. Daty relatywne
    if (/\b(DZISIAJ|DZIŚ|TODAY)\b/i.test(upper)) return new Date(now);
    if (/\b(JUTRO|TOMORROW)\b/i.test(upper)) return dodajDni(now, 1);
    if (/\bPOJUTRZE\b/i.test(upper)) return dodajDni(now, 2);

    const miesiacMap = {
        STYCZNIA: 0, STYCZEŃ: 0, STY: 0, JANUARY: 0, JAN: 0,
        LUTEGO: 1, LUTY: 1, LUT: 1, FEBRUARY: 1, FEB: 1,
        MARCA: 2, MARZEC: 2, MAR: 2, MARCH: 2,
        KWIETNIA: 3, KWIECIEŃ: 3, KWI: 3, APRIL: 3, APR: 3,
        MAJA: 4, MAJ: 4, MAY: 4,
        CZERWCA: 5, CZERWIEC: 5, CZE: 5, JUNE: 5, JUN: 5,
        LIPCA: 6, LIPIEC: 6, LIP: 6, JULY: 6, JUL: 6,
        SIERPNIA: 7, SIERPIEŃ: 7, SIE: 7, AUGUST: 7, AUG: 7,
        WRZEŚNIA: 8, WRZESNIA: 8, WRZESIEŃ: 8, WRZ: 8, SEPTEMBER: 8, SEP: 8,
        PAŹDZIERNIKA: 9, PAZDZIERNIKA: 9, PAŹDZIERNIK: 9, PAŹ: 9, PAZ: 9, OCTOBER: 9, OCT: 9,
        LISTOPADA: 10, LISTOPAD: 10, LIS: 10, NOVEMBER: 10, NOV: 10,
        GRUDNIA: 11, GRUDZIEŃ: 11, GRU: 11, DECEMBER: 11, DEC: 11
    };

    const resolveYear = (monthIndex, explicitYearStr) => {
        if (explicitYearStr) {
            let y = parseInt(explicitYearStr, 10);
            if (y < 100) y += 2000;
            return y;
        }
        return monthIndex < currentMonthIndex - 2 ? currentYear + 1 : currentYear;
    };

    // 3. Format OpenGraph FB (miesiąc przed dniem): "października 25 2026" lub "October 25, 2026"
    const regexMonthFirst = /\b(STYCZNIA|LUTEGO|MARCA|KWIETNIA|MAJA|CZERWCA|LIPCA|SIERPNIA|WRZEŚNIA|WRZESNIA|PAŹDZIERNIKA|PAZDZIERNIKA|LISTOPADA|GRUDNIA|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})(?:[,\s]+(20\d{2}))?\b/i;
    const matchMonthFirst = upper.match(regexMonthFirst);
    if (matchMonthFirst) {
        const monthIndex = miesiacMap[matchMonthFirst[1].toUpperCase()];
        const day = parseInt(matchMonthFirst[2], 10);
        if (monthIndex !== undefined && day >= 1 && day <= 31) {
            return new Date(resolveYear(monthIndex, matchMonthFirst[3]), monthIndex, day);
        }
    }

    // 4. Dzień (lub zakres dni) + nazwa miesiąca (+ opcjonalny rok): "24–25 października 2026", "6 LUTEGO", "6 LUT"
    const regexDayMonth = /\b(\d{1,2})(?:\s*[–-]\s*\d{1,2})?[\s.\n\r]+(STYCZNIA|STYCZEŃ|STY|LUTEGO|LUTY|LUT|MARCA|MARZEC|MAR|KWIETNIA|KWIECIEŃ|KWI|MAJA|MAJ|CZERWCA|CZERWIEC|CZE|LIPCA|LIPIEC|LIP|SIERPNIA|SIERPIEŃ|SIE|WRZEŚNIA|WRZESNIA|WRZESIEŃ|WRZ|PAŹDZIERNIKA|PAZDZIERNIKA|PAŹDZIERNIK|PAŹ|PAZ|LISTOPADA|LISTOPAD|LIS|GRUDNIA|GRUDZIEŃ|GRU|JANUARY|JAN|FEBRUARY|FEB|MARCH|APRIL|APR|MAY|JUNE|JUN|JULY|JUL|AUGUST|AUG|SEPTEMBER|SEP|OCTOBER|OCT|NOVEMBER|NOV|DECEMBER|DEC)\b(?:[\s,]+(20\d{2}))?/i;
    const matchMonth = upper.match(regexDayMonth);
    if (matchMonth) {
        const day = parseInt(matchMonth[1], 10);
        const monthStr = matchMonth[2].toUpperCase();
        const monthIndex = miesiacMap[monthStr];
        if (monthIndex !== undefined && day >= 1 && day <= 31) {
            return new Date(resolveYear(monthIndex, matchMonth[3]), monthIndex, day);
        }
    }

    // 5. Format kropkowy / ukośnikowy (z obsługą zakresów "24–25.10.2026", "31.01", "31/01/2026" i wykluczeniem godzin "20.00")
    const regexDot = /\b(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?[./](\d{1,2})(?:[./](\d{2,4}))?\b/g;
    let matchDot;
    while ((matchDot = regexDot.exec(upper)) !== null) {
        const day = parseInt(matchDot[1], 10);
        const monthNum = parseInt(matchDot[3], 10);
        const rawMonthToken = matchDot[3];
        const yearToken = matchDot[4];
        // Wyklucz zapisy godzinowe typu "20.00" lub "21.30" (gdy brak roku, a część po kropce to 00/15/30/45)
        if (!yearToken && (monthNum === 0 || monthNum > 12 || (day >= 18 && rawMonthToken === '00'))) {
            continue;
        }
        if (day >= 1 && day <= 31 && monthNum >= 1 && monthNum <= 12) {
            const monthIndex = monthNum - 1;
            return new Date(resolveYear(monthIndex, yearToken), monthIndex, day);
        }
    }

    const dniMap = {
        NIEDZIELA: 0, NIE: 0, ND: 0, NIEDZ: 0,
        PONIEDZIAŁEK: 1, PONIEDZIALEK: 1, PON: 1, PN: 1,
        WTOREK: 2, WTO: 2, WT: 2,
        ŚRODA: 3, SRODA: 3, ŚRO: 3, SR: 3, ŚR: 3,
        CZWARTEK: 4, CZW: 4, CZ: 4,
        PIĄTEK: 5, PIATEK: 5, PIĄ: 5, PT: 5,
        SOBOTA: 6, SOB: 6, SB: 6
    };

    // 6. Kombinacja Dzień Miesiąca + Dzień Tygodnia: "25 NIEDZIELA" lub "NIEDZIELA, 25"
    const regexDayWeekday = /\b(\d{1,2})[\s,.\n\r]+\b(NIEDZIELA|NIEDZ|NIE|ND|PONIEDZIAŁEK|PONIEDZIALEK|PON|PN|WTOREK|WTO|WT|ŚRODA|SRODA|ŚRO|SR|ŚR|CZWARTEK|CZW|PIĄTEK|PIATEK|PIĄ|PT|SOBOTA|SOB|SB)\b/i;
    const regexWeekdayDay = /\b(NIEDZIELA|NIEDZ|NIE|ND|PONIEDZIAŁEK|PONIEDZIALEK|PON|PN|WTOREK|WTO|WT|ŚRODA|SRODA|ŚRO|SR|ŚR|CZWARTEK|CZW|PIĄTEK|PIATEK|PIĄ|PT|SOBOTA|SOB|SB)[,\s.\n\r]+(\d{1,2})\b(?!\s*[:.])/i;
    const matchDW = upper.match(regexDayWeekday);
    const matchWD = !matchDW ? upper.match(regexWeekdayDay) : null;

    if (matchDW || matchWD) {
        const day = parseInt(matchDW ? matchDW[1] : matchWD[2], 10);
        const weekdayStr = (matchDW ? matchDW[2] : matchWD[1]).toUpperCase();
        const targetWeekday = dniMap[weekdayStr];

        if (day >= 1 && day <= 31 && targetWeekday !== undefined) {
            const candidate = new Date(now);
            for (let i = 0; i < 120; i++) {
                if (candidate.getDate() === day && candidate.getDay() === targetWeekday) {
                    return new Date(candidate);
                }
                candidate.setDate(candidate.getDate() + 1);
            }
        }
    }

    // 7. Sam dzień tygodnia ("SOBOTA") — dozwolony wyłącznie dla krótkich etykiet daty lub gdy jawnie włączono allowWeekdayOnly,
    // aby opis typu "zapisy do środy" nie nadpisywał właściwej daty wydarzenia.
    const allowWeekdayOnly = options.allowWeekdayOnly !== undefined
        ? Boolean(options.allowWeekdayOnly)
        : raw.length <= 28;

    if (allowWeekdayOnly) {
        const regexWeekdayOnly = /\b(NIEDZIELA|NIEDZ|NIE|ND|PONIEDZIAŁEK|PONIEDZIALEK|PON|PN|WTOREK|WTO|WT|ŚRODA|SRODA|ŚRO|SR|ŚR|CZWARTEK|CZW|PIĄTEK|PIATEK|PIĄ|PT|SOBOTA|SOB|SB)\b/i;
        const matchW = upper.match(regexWeekdayOnly);
        if (matchW) {
            const targetDay = dniMap[matchW[1].toUpperCase()];
            if (targetDay !== undefined) {
                const todayDay = now.getDay();
                let diff = targetDay - todayDay;
                if (diff < 0) diff += 7;
                return dodajDni(now, diff);
            }
        }
    }

    return null;
}
