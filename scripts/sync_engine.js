/**
 * KATO SALSA HUB & DANCEPULS — UNIFIED SYNC & REPORT ENGINE
 *
 * Automates:
 * 1. Fetching Google Forms submissions (CSV)
 * 2. Parsing and maintaining katosalsahub.pl/assets/data/events_database.md
 * 3. Delegating venue GPS normalization to scripts/venue-dictionary.js and web scrapers to scripts/event-scrapers.js
 * 4. Generating katosalsahub.pl/assets/data/events.json for the web app (including future weeks)
 * 5. Generating the complete, dynamic 6-section Kato Salsa Hub report (latest_report.md)
 * 6. Syncing to remote LH.pl hosting (katosalsahub.pl/assets/data)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const {
    VENUE_MAP,
    KRAJOWNIK_CITY_SLUGS,
    expandSourceUrl,
    normalizeStreetAddress,
    normalizeLocation
} = require('./venue-dictionary.js');

const {
    getTodayIsoDate,
    parseEventDateInfo,
    extractShortEventTitle,
    deduplicateEvents,
    fetchUrl,
    inferEventStyles,
    parseMilPasosEventsHtml,
    parseLoftodanceEventsHtml,
    parseFacebookEventHtml,
    fetchFacebookEventDetails,
    extractFacebookEventUrlFromHtml,
    parseKrajownikEventsHtml,
    parseSabakiEventsHtml,
    parseOnlyDanceEventsHtml,
    parseAirdanciaEventsHtml,
    checkRemoteEventSources
} = require('./event-scrapers.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data');
const DB_PATH = path.join(DATA_DIR, 'events_database.md');
const JSON_PATH = path.join(DATA_DIR, 'events.json');
const REPORT_PATH = path.join(DATA_DIR, 'latest_report.md');

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/export?format=csv&gid=1833510316';

const MAIN_POST_FOOTER = `---
🌴 SALSA KATOWICE – KATO SALSA HUB 🌴
Szukasz informacji, gdzie tańczyć salsę w Katowicach i na Śląsku?
📍 Interaktywna mapa miejscówek i darmowych parkingów (Wolni Ludzie ul. Mariacka 2, Dolina Trzech Stawów, NOSPR), słownik ponad 200 figur Salsopedia oraz kubańskie radio 24/7 bez reklam czekają na naszej oficjalnej stronie:
👉 https://katosalsahub.pl/
📅 Aktualny rozkład wszystkich kursów, porównanie cenników szkół tańca (kalkulator karnetów i kart sportowych) oraz kalendarz imprez tanecznych na Śląsku:
👉 https://katosalsahub.pl/grafik.html

#SalsaKatowice #KatoSalsaHub #SalsaCubana #Katowice #TaniecKatowice #RuedaDeCasino #Timba #WolniLudzie`;

const FOOTER = `@wszyscy Do zobaczenia na parkiecie! 💃🕺

☕ PS1: Podoba Ci się to, co robimy? Jeśli chcesz, możesz postawić nam wirtualną kawę – to daje nam mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub`;

function toBoldUnicode(text) {
    const chars = {
        a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡', i: '𝐢', j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦',
        n: '𝐧', o: '𝐨', p: '𝐩', q: '𝐪', r: '𝐫', s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱', y: '𝐲', z: '𝐳',
        A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇', I: '𝐈', J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌',
        N: '𝐍', O: '𝐎', P: '𝐏', Q: '𝐐', R: '𝐑', S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗', Y: '𝐘', Z: '𝐙',
        0: '𝟎', 1: '𝟏', 2: '𝟐', 3: '𝟑', 4: '𝟒', 5: '𝟓', 6: '𝟔', 7: '𝟕', 8: '𝟖', 9: '𝟗',
        ą: '𝐚̨', ć: '𝐜́', ę: '𝐞̨', ł: 'ł', ń: '𝐧́', ó: '𝐨́', ś: '𝐬́', ź: '𝐳́', ż: '𝐳̇',
        Ą: '𝐀̨', Ć: '𝐂́', Ę: '𝐄̨', Ł: 'Ł', Ń: '𝐍́', Ó: '𝐎́', Ś: '𝐒́', Ź: '𝐙́', Ż: '𝐙̇',
    };
    return String(text || '')
        .split('')
        .map(c => chars[c] || c)
        .join('');
}

/**
 * Buduje tekst miejsca i stylów dla Ankiety (Sekcja 3) i Komentarza 1 (Sekcja 4).
 */
function buildVenueAndStyleLabel(event, sameDayVenueCount = 1) {
    let venuePart = event.venue;
    if (sameDayVenueCount > 1 && event.title) {
        const shortTitle = extractShortEventTitle(event.title);
        if (shortTitle && !venuePart.toLowerCase().includes(shortTitle.toLowerCase())) {
            venuePart = `${venuePart}, ${shortTitle}`;
        }
    }
    const isSoldOut = Boolean(event.notes && /wyprzedane/i.test(event.notes));
    const soldOutSuffix = isSoldOut ? ' - WYPRZEDANE' : '';
    return `${venuePart} (${event.styles})${soldOutSuffix}`;
}

// 1. Fetch & Check Google Form Submissions
async function checkFormSubmissions(existingDatabaseText) {
    console.log('🔍 [1/5] Sprawdzanie zgłoszeń z formularza Google (CSV)...');
    try {
        const csv = await fetchUrl(GOOGLE_SHEET_URL);
        const lines = csv.split('\n').map(l => l.trim()).filter(l => l);
        const submissions = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
            const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
            if (clean.length >= 2) {
                const timestamp = clean[0];
                const link = clean[1];
                const date = clean[2] || '';
                const day = clean[3] || '';

                if (!/^https?:\/\//i.test(link)) continue;
                if (/202[0-5]|^\d{1,2}\.0[1-9]\.2026/.test(timestamp) || /202[0-5]|^\d{1,2}\.0[1-9]\.2026/.test(date)) {
                    continue;
                }

                const idMatch = link.match(/\d{8,}/);
                const isKnown = existingDatabaseText.includes(link) || Boolean(idMatch && existingDatabaseText.includes(idMatch[0]));
                submissions.push({ timestamp, link, date, day, isKnown });
            }
        }

        const newSubmissions = submissions.filter(s => !s.isKnown);
        console.log(`   Pobrano ${submissions.length} aktualnych zgłoszeń. Nowe (nieznane w bazie): ${newSubmissions.length}`);
        return { submissions, newSubmissions };
    } catch (e) {
        console.warn('   ⚠️ Nie udało się pobrać arkusza CSV:', e.message);
        return { submissions: [], newSubmissions: [] };
    }
}

// 2. Parse events_database.md
function parseDatabase(mdContent) {
    console.log('📖 [2/5] Parsowanie bazy events_database.md...');
    const sections = {
        meta: {
            reportDate: '15.10.2026',
            weekendRange: '16–18.10.2026',
            weekendShort: '16-18.10'
        },
        postNarrative: {
            PIĄTEK: '',
            SOBOTA: '',
            NIEDZIELA: ''
        },
        currentWeekend: [],
        thisWeekMid: [],
        future: [],
        uncertain: [],
        archive: []
    };

    let currentSection = null;
    const lines = mdContent.split('\n');

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        const updateMatch = line.match(/^Ostatnia aktualizacja:\s*(\d{2}\.\d{2}\.\d{4})/i);
        if (updateMatch) {
            sections.meta.reportDate = updateMatch[1];
            return;
        }

        if (line.startsWith('## OPIS POSTA')) {
            currentSection = 'postNarrative';
            return;
        } else if (line.startsWith('## BIEŻĄCY WEEKEND')) {
            currentSection = 'currentWeekend';
            const rangeMatch = line.match(/\((\d{2}[–-]\d{2}\.\d{2})(?:\.(\d{4}))?\)/);
            if (rangeMatch) {
                const yr = rangeMatch[2] || '2026';
                sections.meta.weekendRange = `${rangeMatch[1].replace('-', '–')}.${yr}`;
                sections.meta.weekendShort = rangeMatch[1].replace('–', '-');
            }
            return;
        } else if (line.startsWith('## PN–CZ BIEŻĄCEGO TYGODNIA')) {
            currentSection = 'thisWeekMid';
            return;
        } else if (line.startsWith('## DALSZE TERMINY')) {
            currentSection = 'future';
            return;
        } else if (line.startsWith('## NIEPEWNE TROPY')) {
            currentSection = 'uncertain';
            return;
        } else if (line.startsWith('## ARCHIWUM MINIONE')) {
            currentSection = 'archive';
            return;
        } else if (line.startsWith('#')) {
            return;
        }

        if (!currentSection || !line.includes('|')) return;

        if (currentSection === 'postNarrative') {
            const [dayKey, ...rest] = line.split('|');
            const cleanDay = (dayKey || '').trim().toUpperCase();
            const text = rest.join('|').trim();
            if (cleanDay && text) {
                sections.postNarrative[cleanDay] = text;
            }
            return;
        }

        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 4) return;

        let [dateStr, venueRaw, name, styles, source, notes] = parts;
        styles = styles || '';
        source = expandSourceUrl(source || '');
        notes = notes || '';

        const normalizedLoc = normalizeLocation(venueRaw);
        const { city, venue, address, lat, lng } = normalizedLoc;
        const dateInfo = parseEventDateInfo(dateStr);

        const isKSH = Boolean(
            (notes && notes.includes('KATO SALSA HUB')) ||
            (name && name.includes('KATO SALSA HUB')) ||
            (venue && venue.includes('Trzy Stawy')) ||
            (venue && venue.includes('Trzech Stawów'))
        );

        sections[currentSection].push({
            rawDate: dateStr,
            isoStartDate: dateInfo.isoStartDate,
            isoEndDate: dateInfo.isoEndDate,
            startDayMonth: dateInfo.startDayMonth,
            weekdayPL: dateInfo.weekdayPL,
            futureHeaderLabel: dateInfo.futureHeaderLabel,
            sortTimestamp: dateInfo.sortTimestamp,
            city,
            venue,
            address,
            lat,
            lng,
            rawVenue: venueRaw,
            title: name,
            styles,
            url: source,
            notes,
            isKSH
        });
    });

    sections.currentWeekend = deduplicateEvents(sections.currentWeekend);
    sections.thisWeekMid = deduplicateEvents(sections.thisWeekMid);
    sections.future = deduplicateEvents(sections.future).sort((a, b) => (a.sortTimestamp || 0) - (b.sortTimestamp || 0));
    sections.uncertain = deduplicateEvents(sections.uncertain);
    sections.archive = deduplicateEvents(sections.archive);

    console.log(
        `   Rozpoznano sekcje (po deduplikacji): Weekend: ${sections.currentWeekend.length}, Pn-Cz: ${sections.thisWeekMid.length}, Kolejne tygodnie: ${sections.future.length}, Niepewne: ${sections.uncertain.length}, Archiwum: ${sections.archive.length}`
    );
    return sections;
}

// Atomowy zapis pliku JSON/MD z izolacją PID przeciw wyścigom procesów (zgodnie z ISO 27001 / AGENTS.md 4.3)
function writeFileAtomically(filePath, content) {
    const uniqueSuffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const tmpPath = `${filePath}.${uniqueSuffix}.tmp`;
    try {
        fs.writeFileSync(tmpPath, content, 'utf8');
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) { /* ignore cleanup error */ }
        throw err;
    }
}

// 3. Generate katosalsahub.pl/assets/data/events.json
function generateEventsJson(sections, options = {}) {
    console.log('⚡ [3/5] Generowanie struktury JSON dla DancePuls...');

    const currentYear = new Date().getFullYear();
    const minDateIso =
        options.includePast === true
            ? ''
            : typeof options.minDateIso === 'string'
                ? options.minDateIso
                : getTodayIsoDate();
    const resultByDate = {};
    let skippedPastCount = 0;

    function addEvent(ev, defaultYear = currentYear) {
        let isoDate = ev.isoStartDate || '';
        let isoEndDate = ev.isoEndDate || '';
        if (!isoDate) {
            const parsedInfo = parseEventDateInfo(ev.rawDate || '', defaultYear);
            isoDate = parsedInfo.isoStartDate || '';
            isoEndDate = parsedInfo.isoEndDate || isoDate;
        }

        if (!isoDate) return;
        const effectiveEndDate = isoEndDate || isoDate;

        if (minDateIso && effectiveEndDate < minDateIso) {
            skippedPastCount++;
            return;
        }

        if (!resultByDate[isoDate]) {
            resultByDate[isoDate] = [];
        }

        const stylesArray = ev.styles.split(/[\/,]/).map(s => s.trim()).filter(s => s);
        const cleanPublicDesc = String(ev.title || '').replace(/\s*,\s*/g, ', ').trim();
        const isSoldOut = Boolean(ev.notes && /wyprzedane/i.test(ev.notes));

        resultByDate[isoDate].push({
            checked: true,
            promote: ev.isKSH,
            miasto: ev.city || 'Inne',
            miastoInne: ev.city ? '' : ev.city,
            miejsce: ev.venue || 'Inne',
            miejsceInne: ev.address ? `${ev.venue} (${ev.address})` : ev.venue,
            adres: ev.address || '',
            lat: ev.lat,
            lng: ev.lng,
            tytul: extractShortEventTitle(ev.title),
            opis: ev.title + (ev.notes ? ` - ${ev.notes}` : ''),
            opisPubliczny: cleanPublicDesc,
            dateLabel: ev.futureHeaderLabel || '',
            endDate: effectiveEndDate,
            soldOut: isSoldOut,
            link: ev.url,
            style: stylesArray
        });
    }

    sections.thisWeekMid.forEach(ev => addEvent(ev));
    sections.currentWeekend.forEach(ev => addEvent(ev));
    sections.future.forEach(ev => addEvent(ev));

    const finalJson = Object.keys(resultByDate).sort().map(date => ({
        date,
        events: resultByDate[date]
    }));

    writeFileAtomically(JSON_PATH, JSON.stringify(finalJson, null, 2));
    console.log(
        `   Zapisano ${finalJson.length} dni z wydarzeniami (>= ${minDateIso || 'wszystkie'}, odfiltrowano minionych: ${skippedPastCount}) do: ${JSON_PATH}`
    );

    return finalJson;
}

function buildNaturalDayNarrative(dayEvents, dayName) {
    if (!dayEvents || dayEvents.length === 0) {
        return 'Na razie brak potwierdzonych ogłoszeń.';
    }

    const kato = dayEvents.filter(e => e.city === 'Katowice');
    const region = dayEvents.filter(e => e.city !== 'Katowice' && e.city !== 'Kraków');
    const krakow = dayEvents.filter(e => e.city === 'Kraków');

    const formatItem = (e) => {
        const shortName = extractShortEventTitle(e.title);
        const isWorkshop = /warsztat|kurs|zaj[eę]cia|masterclass|crash\s*course/i.test(e.title);
        if (isWorkshop) {
            return /^warsztaty/i.test(shortName)
                ? `${shortName} w ${e.venue} (${e.styles})`
                : `warsztaty ${shortName} w ${e.venue} (${e.styles})`;
        }
        return `${shortName} w ${e.venue} (${e.styles})`;
    };

    const sentences = [];

    if (kato.length === 0) {
        const altParts = [];
        if (region.length > 0) {
            altParts.push(region.map(r => `w ${r.city} ${formatItem(r)}`).join(', '));
        }
        if (krakow.length > 0) {
            altParts.push(`w Krakowie ${krakow.map(formatItem).join(' oraz ')}`);
        }
        sentences.push(`W Katowicach ${dayName.toLowerCase()} jeszcze bez potwierdzonych ogłoszeń, ale potańczycie ${altParts.join(', a ')}.`);
    } else {
        const katoText = kato.map(formatItem).join(', ');
        sentences.push(`W Katowicach czekają ${katoText}.`);

        const katoHasCubana = kato.some(e => /cubana|timba|son|casino/i.test(e.styles) && !/warsztat|kurs/i.test(e.title));
        const otherParts = [];
        if (region.length > 0) {
            const cities = Array.from(new Set(region.map(r => r.city)));
            const regText = region.slice(0, 3).map(r => `${r.venue} (${r.city}, ${r.styles})`).join(', ');
            otherParts.push(`w regionie parkiety otwierają ${regText}${region.length > 3 ? ` (łącznie ${cities.join(', ')})` : ''}`);
        }
        if (krakow.length > 0) {
            const krakowCubana = krakow.find(e => /cubana|son/i.test(e.styles));
            if (!katoHasCubana && krakowCubana) {
                otherParts.push(`na wieczorną salsę cubana lub son możecie też wyskoczyć do Krakowa (${krakow.map(k => `${k.venue} – ${extractShortEventTitle(k.title)}`).join(', ')})`);
            } else {
                otherParts.push(`w Krakowie czekają ${krakow.map(formatItem).join(' oraz ')}`);
            }
        }
        if (otherParts.length > 0) {
            const second = otherParts.join(', natomiast ');
            sentences.push(second.charAt(0).toUpperCase() + second.slice(1) + '.');
        }
    }

    return sentences.join(' ');
}

function countVenuesInDay(dayEvents) {
    const counts = new Map();
    dayEvents.forEach(e => {
        const key = `${e.city.toLowerCase()}::${e.venue.toLowerCase()}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return (ev) => counts.get(`${ev.city.toLowerCase()}::${ev.venue.toLowerCase()}`) || 1;
}

// 4. Generate the 6-Section Weekly Report
function generateWeeklyReport(sections, newSubmissions = []) {
    console.log('📝 [4/5] Generowanie pełnego 6-sekcyjnego raportu Kato Salsa Hub...');

    const meta = sections.meta || {
        reportDate: '15.10.2026',
        weekendRange: '16–18.10.2026',
        weekendShort: '16-18.10'
    };
    const todayStr = meta.reportDate;
    const weekendRangeStr = meta.weekendRange;
    const weekendShortStr = meta.weekendShort;

    const weekendEvents = sections.currentWeekend || [];
    const fridayEvents = weekendEvents.filter(e => e.weekdayPL === 'PIĄTEK');
    const saturdayEvents = weekendEvents.filter(e => e.weekdayPL === 'SOBOTA');
    const sundayEvents = weekendEvents.filter(e => e.weekdayPL === 'NIEDZIELA');

    if (fridayEvents.length === 0 && saturdayEvents.length === 0 && sundayEvents.length === 0 && weekendEvents.length > 0) {
        weekendEvents.forEach(e => {
            const info = parseEventDateInfo(e.rawDate);
            if (info.weekdayPL === 'PIĄTEK') fridayEvents.push({ ...e, ...info });
            else if (info.weekdayPL === 'SOBOTA') saturdayEvents.push({ ...e, ...info });
            else if (info.weekdayPL === 'NIEDZIELA') sundayEvents.push({ ...e, ...info });
        });
    }

    const ptDateLabel = fridayEvents[0]?.startDayMonth || weekendShortStr.split('-')[0] + '.' + weekendShortStr.split('.')[1];
    const sbDateLabel = saturdayEvents[0]?.startDayMonth || '';
    const ndDateLabel = sundayEvents[0]?.startDayMonth || weekendShortStr.split('-')[1];

    const getPtVenueCount = countVenuesInDay(fridayEvents);
    const getSbVenueCount = countVenuesInDay(saturdayEvents);
    const getNdVenueCount = countVenuesInDay(sundayEvents);

    const allTracked = [...(sections.thisWeekMid || []), ...weekendEvents, ...(sections.future || [])];
    const newlyAddedToday = allTracked.filter(e => e.notes && e.notes.includes(`nowe w bazie ${todayStr.slice(0, 5)}`));

    const newItemsSummary = newlyAddedToday.length > 0
        ? newlyAddedToday.map(e => {
            const fullDateLabel = /\.\d{4}$/.test(e.rawDate) ? e.rawDate : `${e.rawDate}.2026`;
            return `  - **${e.title}** | ${fullDateLabel} | ${e.city}, ${e.venue} | ${e.styles} | ${e.url}`;
        }).join('\n')
        : '  - Na dziś nie znalazłem nowych ogłoszeń (wszystkie pozycje w bazie zweryfikowane wcześniej).';

    const sec1 = `## 1. PRYWATNIE — raport na ${todayStr}
- **Stan zestawienia na weekend ${weekendRangeStr}:** **${weekendEvents.length} pozycji** (${fridayEvents.length} pt + ${saturdayEvents.length} sb + ${sundayEvents.length} nd).
- **Zapowiedzi na kolejne tygodnie (Komentarz 2):** **${(sections.future || []).length} pozycji** (pełny horyzont do 2027 r.).
- **Wydarzenia pn–cz bieżącego tygodnia (poza ankietą):** **${(sections.thisWeekMid || []).length} pozycje**.
- **Nowości w bazie z ostatniego sprawdzenia (${todayStr.slice(0, 5)} — ${newlyAddedToday.length} pozycji, data publikacji nieustalona):**
${newItemsSummary}
- **Zgłoszenia z formularza Google KSH (CSV):** ${newSubmissions.length > 0 ? newSubmissions.map(s => s.link).join(', ') : 'brak nowych zgłoszeń spoza bazy'}.
- **Faktycznie wykonana praca i ulepszenia:** Zsynchronizowano jednolitą bazę \`events_database.md\`, rozwinięto wszystkie skróty identyfikatorów \`F:ID\` i \`O:ID\` do pełnych linków, rozróżniono krótką nazwą imprezy wydarzenia występujące tego samego dnia w tym samym klubie (La Clave, DANCE#LOVEit, Forum Tańca, LOFToDANCE) oraz wygenerowano plik \`events.json\` i podgląd 6 sekcji w interfejsie DancePuls.`;

    const narrative = sections.postNarrative || {};
    const ptText = narrative.PIĄTEK || buildNaturalDayNarrative(fridayEvents, 'piątek');
    const sbText = narrative.SOBOTA || buildNaturalDayNarrative(saturdayEvents, 'sobota');
    const ndText = narrative.NIEDZIELA || buildNaturalDayNarrative(sundayEvents, 'niedziela');

    const sec2 = `🎉 ${toBoldUnicode(`Gdzie tańczymy w ten weekend? (${weekendShortStr})`)}

🗓️ ${toBoldUnicode('PIĄTEK')}
${ptText}

🗓️ ${toBoldUnicode('SOBOTA')}
${sbText}

🗓️ ${toBoldUnicode('NIEDZIELA')}
${ndText}

${MAIN_POST_FOOTER}`;

    const sec3Lines = [];
    fridayEvents.forEach(e => {
        sec3Lines.push(`PIĄTEK (${e.startDayMonth || ptDateLabel}): ${e.city} - ${buildVenueAndStyleLabel(e, getPtVenueCount(e))}  `);
    });
    saturdayEvents.forEach(e => {
        sec3Lines.push(`SOBOTA (${e.startDayMonth || sbDateLabel}): ${e.city} - ${buildVenueAndStyleLabel(e, getSbVenueCount(e))}  `);
    });
    sundayEvents.forEach(e => {
        sec3Lines.push(`NIEDZIELA (${e.startDayMonth || ndDateLabel}): ${e.city} - ${buildVenueAndStyleLabel(e, getNdVenueCount(e))}  `);
    });
    const sec3 = sec3Lines.join('\n');

    const sec4Lines = ['🎉 Zestawienie imprezowe\n'];
    if (fridayEvents.length > 0) {
        sec4Lines.push(`🗓️ PIĄTEK (${fridayEvents[0].startDayMonth || ptDateLabel}):  `);
        fridayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${buildVenueAndStyleLabel(e, getPtVenueCount(e))}  `);
            sec4Lines.push(`🔗 ${e.url}  `);
        });
        sec4Lines.push('');
    }
    if (saturdayEvents.length > 0) {
        sec4Lines.push(`🗓️ SOBOTA (${saturdayEvents[0].startDayMonth || sbDateLabel}):  `);
        saturdayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${buildVenueAndStyleLabel(e, getSbVenueCount(e))}  `);
            sec4Lines.push(`🔗 ${e.url}  `);
        });
        sec4Lines.push('');
    }
    if (sundayEvents.length > 0) {
        sec4Lines.push(`🗓️ NIEDZIELA (${sundayEvents[0].startDayMonth || ndDateLabel}):  `);
        sundayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${buildVenueAndStyleLabel(e, getNdVenueCount(e))}  `);
            sec4Lines.push(`🔗 ${e.url}  `);
        });
        sec4Lines.push('');
    }
    sec4Lines.push(FOOTER);
    const sec4 = sec4Lines.join('\n');

    const sec5Lines = ['🎉 Zaplanowane wydarzenia — kolejne tygodnie\n'];
    (sections.future || []).forEach(e => {
        const mark = e.isKSH ? '⭐' : '➡️';
        const headerLabel = e.futureHeaderLabel || parseEventDateInfo(e.rawDate).futureHeaderLabel;
        sec5Lines.push(`🗓️ ${headerLabel}  `);
        sec5Lines.push(`${mark} ${e.city}: ${e.venue}, ${e.title} (${e.styles})  `);
        sec5Lines.push(`🔗 ${e.url}  `);
    });
    sec5Lines.push('');
    sec5Lines.push(FOOTER);
    const sec5 = sec5Lines.join('\n');

    const midWeekLines = (sections.thisWeekMid || []).map(e => {
        const status = /miniony/i.test(e.notes) ? ' (dzień miniony)' : ' (bieżący tydzień poza ankietą weekendową)';
        return `  - ${e.rawDate}.2026 (${e.weekdayPL || 'PN–CZ'}): ${e.city}, ${e.venue} — ${e.title} (${e.styles}) -> ${e.url}${status}`;
    });
    const uncertainLines = (sections.uncertain || []).map(e => {
        return `  - ${e.rawDate}: ${e.city}${e.venue && e.venue !== 'Inne' ? `, ${e.venue}` : ''} — ${e.title} (${e.styles}) — powód wstrzymania: ${e.notes || 'wymaga potwierdzenia szczegółów'}`;
    });

    const sec6 = `## 6. PRYWATNIE — pominięcia, wydarzenia pn–cz, konflikty danych i kolejne kroki
- **Wydarzenia pn–cz bieżącego tygodnia (poza ankietą weekendową):**
${midWeekLines.length > 0 ? midWeekLines.join('\n') : '  - Brak pozycji pn–cz w bieżącym tygodniu.'}
- **Wstrzymane / niepewne tropy (poza publikacją do czasu weryfikacji):**
${uncertainLines.length > 0 ? uncertainLines.join('\n') : '  - Brak niepewnych tropów.'}
- **Konflikty danych i zasady ostrożności:**
  - **Mil Pasos (18.10 Salsa Street oraz 24.10 K Experience):** na kartach zewnętrznych agregatorów (Krajownik / OnlyDance) pojawia się jeszcze dawny adres ul. Mikołowska 13A, podczas gdy oficjalna strona szkoły wskazuje aktualną siedzibę ul. Kamienna 4 — publikujemy wyłącznie zweryfikowaną nazwę szkoły / aktualny adres.
  - **Forum Tańca Kraków:** mapa OnlyDance wskazuje nr 31, natomiast opis wydarzenia potwierdza ul. Konopnickiej 29 — w zestawieniu publikujemy samą nazwę Forum Tańca bez ulicy.
  - **AllDance Bielsko-Biała (17.10):** sprzeczność między etykietą „Bezpłatne” a opisem „40 zł” na Krajowniku — cenę pominięto publicznie.
  - **Poza zakresem geograficznym/stylowym (pominięte):** Integracja Mohito 06–08.11 (Poronin — poza woj. śląskim i Krakowem), wydarzenia z Opola, Murzasichla i Bartkowej oraz czysty Zouk/WCS.
- **Kolejne konkretne kroki przy następnym sprawdzeniu:**
  1. Rotacja regionalna: Częstochowa, Zagłębie (Sosnowiec, Dąbrowa Górnicza, Będzin, Czeladź) oraz świeże komunikaty na publicznej stronie FB Kato Salsa Hub.
  2. Celowane wyszukanie konkretnej karty OnlyDance dla **SabroFest (16–18.10)** oraz ustalenie lokalizacji i zakresu dat dla tropu **BailaMe 2027**.
  3. Nie odczytywać ponownie 16 potwierdzonych wydarzeń bieżącego weekendu (16–18.10).`;

    const fullReport = `${sec1}

---

## 2. POST NA FB
${sec2}

---

## 3. ANKIETA
${sec3}

---

## 4. KOMENTARZ 1 — WEEKEND
${sec4}

---

## 5. KOMENTARZ 2 — PRZYSZŁOŚĆ
${sec5}

---

${sec6}
`;

    writeFileAtomically(REPORT_PATH, fullReport);
    console.log(`   Zapisano gotowy raport do: ${REPORT_PATH}`);
    return fullReport;
}

// 5. Deploy / Sync to LH Server via SSH
function syncToRemoteLH() {
    if (process.env.CI || process.env.SKIP_REMOTE_SYNC === '1') {
        console.log('⏭️ [5/5] Pominięto bezpośredni transfer SSH (tryb CI/automatyczny).');
        return;
    }
    console.log('🚀 [5/5] Synchronizacja z serwerem LH (katosalsahub.pl/assets/data)...');
    try {
        execSync('ssh lh-katosalsa "mkdir -p /home/platne/serwer417204/public_html/katosalsahub.pl/assets/data"');
        execSync(`scp "${JSON_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/katosalsahub.pl/assets/data/events.json`);
        execSync(`scp "${REPORT_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/katosalsahub.pl/assets/data/latest_report.md`);
        execSync(`scp "${DB_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/katosalsahub.pl/assets/data/events_database.md`);
        console.log('   ✅ Pomyślnie zsynchronizowano bazę, JSON i raport w katosalsahub.pl/assets/data na serwerze LH.pl!');
    } catch (e) {
        console.warn('   ⚠️ Synchronizacja SSH nie powiodła się:', e.message);
    }
}

// MAIN RUNNER
async function main() {
    console.log('========================================================');
    console.log('🕺 KATO SALSA HUB & DANCEPULS - AUTOMATION ENGINE RUN');
    console.log('========================================================');

    if (!fs.existsSync(DB_PATH)) {
        console.error('Błąd: brak pliku bazy', DB_PATH);
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const todayIso = getTodayIsoDate();
    const dbText = fs.readFileSync(DB_PATH, 'utf8');
    const { newSubmissions } = await checkFormSubmissions(dbText);
    const sections = parseDatabase(dbText);

    const shouldScanRemote = !args.includes('--no-remote') && !process.env.CI;
    if (shouldScanRemote || args.includes('--check-remote') || args.includes('--fb')) {
        const { freshEvents } = (shouldScanRemote || args.includes('--check-remote'))
            ? await checkRemoteEventSources(dbText, todayIso)
            : { freshEvents: [] };

        const fbCandidateUrls = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--fb' && args[i + 1]) {
                fbCandidateUrls.push(args[i + 1]);
            }
        }
        for (const sub of newSubmissions) {
            if (/facebook\.com\/events\/\d+/i.test(sub.link)) {
                fbCandidateUrls.push(sub.link);
            }
        }

        for (const fbUrl of fbCandidateUrls) {
            try {
                const fbEv = await fetchFacebookEventDetails(fbUrl);
                if (fbEv && (!todayIso || (fbEv.isoEndDate || fbEv.isoStartDate) >= todayIso)) {
                    freshEvents.push(fbEv);
                }
            } catch (err) {
                console.warn(`   ⚠️ [Fallback] Nie udało się pobrać metadanych FB dla ${fbUrl} (${err.message})`);
            }
        }

        const allKnown = [
            ...sections.thisWeekMid,
            ...sections.currentWeekend,
            ...sections.future,
            ...sections.uncertain
        ];

        const normalizeCompareTokens = (str = '') =>
            String(str || '')
                .toLowerCase()
                .replace(/([a-zA-Ząćęłńóśźż])(\d+)/g, '$1 $2')
                .replace(/(\d+)([a-zA-Ząćęłńóśźż])/g, '$1 $2')
                .replace(/[^a-z0-9ąćęłńóśźż]+/gi, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 4 && !/^(warsztaty|impreza|zajecia|specjalne|party|edition|salsa|bachata|kizomba|katowice|krakow|bielsko|pasos|loftodance|\d{4})$/.test(w));

        for (const ev of freshEvents) {
            const loc = normalizeLocation(ev.venueCode || ev.venue || ev.city);
            const dateInfo = parseEventDateInfo(ev.rawDate);
            const evTokens = normalizeCompareTokens(ev.title);

            const isAlreadyTracked = allKnown.some(k => {
                if (k.isoStartDate !== dateInfo.isoStartDate) return false;
                if (k.city.toLowerCase() !== loc.city.toLowerCase()) return false;
                const kTokens = normalizeCompareTokens(k.title);
                const sharedCount = evTokens.filter(t => kTokens.includes(t)).length;
                if (k.venue.toLowerCase() === loc.venue.toLowerCase()) {
                    if (evTokens.length === 0 || kTokens.length === 0) return true;
                    return sharedCount >= 1;
                }
                return sharedCount >= 2;
            });

            if (isAlreadyTracked) continue;

            const newEntry = {
                rawDate: ev.rawDate,
                isoStartDate: dateInfo.isoStartDate,
                isoEndDate: dateInfo.isoEndDate,
                startDayMonth: dateInfo.startDayMonth,
                weekdayPL: dateInfo.weekdayPL,
                futureHeaderLabel: dateInfo.futureHeaderLabel,
                sortTimestamp: dateInfo.sortTimestamp,
                city: loc.city,
                venue: loc.venue,
                address: loc.address,
                lat: loc.lat,
                lng: loc.lng,
                rawVenue: ev.venueCode || ev.venue,
                title: ev.title,
                styles: ev.styles,
                url: ev.url,
                notes: `${ev.notes}; nowe w bazie ${todayIso.slice(8, 10)}.${todayIso.slice(5, 7)}`,
                isKSH: Boolean(ev.isKSH)
            };

            const weekendDates = new Set(sections.currentWeekend.map(w => w.isoStartDate).filter(Boolean));
            if (weekendDates.has(newEntry.isoStartDate)) {
                sections.currentWeekend.push(newEntry);
            } else {
                const maxWeekendIso = Array.from(weekendDates).sort().pop() || '';
                if (maxWeekendIso && newEntry.isoStartDate >= todayIso && newEntry.isoStartDate < maxWeekendIso && !['PIĄTEK', 'SOBOTA', 'NIEDZIELA'].includes(newEntry.weekdayPL)) {
                    sections.thisWeekMid.push(newEntry);
                } else {
                    sections.future.push(newEntry);
                }
            }
            allKnown.push(newEntry);
        }
        sections.thisWeekMid = deduplicateEvents(sections.thisWeekMid);
        sections.currentWeekend = deduplicateEvents(sections.currentWeekend);
        sections.future = deduplicateEvents(sections.future).sort((a, b) => (a.sortTimestamp || 0) - (b.sortTimestamp || 0));
    }

    generateEventsJson(sections, { minDateIso: todayIso });
    generateWeeklyReport(sections, newSubmissions);
    syncToRemoteLH();

    console.log('========================================================');
    console.log('🎉 ZAKOŃCZONO PEŁNY PROCES AUTOMATYZACJI!');
    console.log('========================================================');
}

if (require.main === module) {
    main();
}

module.exports = {
    main,
    getTodayIsoDate,
    parseDatabase,
    parseEventDateInfo,
    expandSourceUrl,
    extractShortEventTitle,
    buildVenueAndStyleLabel,
    generateEventsJson,
    generateWeeklyReport,
    normalizeLocation,
    normalizeStreetAddress,
    deduplicateEvents,
    writeFileAtomically,
    inferEventStyles,
    parseMilPasosEventsHtml,
    parseLoftodanceEventsHtml,
    parseKrajownikEventsHtml,
    parseSabakiEventsHtml,
    parseOnlyDanceEventsHtml,
    parseAirdanciaEventsHtml,
    parseFacebookEventHtml,
    fetchFacebookEventDetails,
    extractFacebookEventUrlFromHtml,
    checkRemoteEventSources,
    KRAJOWNIK_CITY_SLUGS,
    VENUE_MAP,
    FOOTER
};
