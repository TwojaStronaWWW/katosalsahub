/**
 * KATO SALSA HUB & DANCEPULS - UNIFIED SYNC & REPORT ENGINE
 *
 * Automates:
 * 1. Fetching Google Forms submissions (CSV)
 * 2. Parsing and maintaining events_database.md
 * 3. Normalizing addresses & GPS coordinates (#16) and deduplicating events (#17)
 * 4. Generating dancepuls.pl/data/events.json for the web app
 * 5. Generating the complete 6-section Kato Salsa Hub report (latest_report.md)
 * 6. Syncing to remote LH.pl hosting (dancepuls.katosalsahub.pl)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'data', 'events_database.md');
const JSON_PATH = path.join(BASE_DIR, 'data', 'events.json');
const REPORT_PATH = path.join(BASE_DIR, 'data', 'latest_report.md');

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/export?format=csv&gid=1833510316';

// Słownik skrótów i lokalizacji ze współrzędnymi GPS (#16)
const VENUE_MAP = {
    'LC': { city: 'Katowice', venue: 'La Clave', address: 'ul. Chorzowska 11', org: 'La Clave', lat: 50.2608, lng: 19.0205 },
    'EV': { city: 'Katowice', venue: 'Evolution Dance', address: 'al. Korfantego 4', org: 'Evolution Dance', lat: 50.2599, lng: 19.0218 },
    'MP': { city: 'Katowice', venue: 'Mil Pasos', address: 'ul. Kamienna 4', org: 'Mil Pasos', lat: 50.2562, lng: 19.0315 },
    'GR': { city: 'Katowice', venue: 'Gravitacja', address: 'ul. Gliwicka 44', org: 'Dance Plus Plus', lat: 50.2624, lng: 19.0052 },
    'KL': { city: 'Katowice', venue: 'KIZLAB', address: 'ul. Sobieskiego 11', org: 'KIZLAB', lat: 50.2603, lng: 19.0156 },
    'TS': { city: 'Katowice', venue: 'Dolina Trzech Stawów', address: 'ul. Trzech Stawów', org: 'KATO SALSA HUB', lat: 50.2425, lng: 19.0381 },
    'DL': { city: 'Bielsko-Biała', venue: 'DANCE#LOVEit & Corazon', address: 'ul. Grażyńskiego 12', org: 'DANCE#LOVEit & Corazon', lat: 49.8296, lng: 19.0468 },
    'SA': { city: 'Kraków', venue: 'Sabrosa Dance Studio', address: 'rondo Mogilskie 1', org: 'Sabrosa', lat: 50.0658, lng: 19.9595 },
    'FT': { city: 'Kraków', venue: 'Forum Tańca', address: 'ul. Konopnickiej 29', org: 'Forum Tańca', lat: 50.0442, lng: 19.9348 },
    'PR': { city: 'Kraków', venue: 'PROMINENT', address: 'ul. Kamienna 17', org: 'PROMINENT The Original Lounge Bar', lat: 50.0752, lng: 19.9398 },
    'LO': { city: 'Kraków', venue: 'LOFToDANCE', address: 'ul. Kamienna 2–4', org: 'LOFToDANCE Łukasz Raś', lat: 50.0736, lng: 19.9412 },
    'ZW': { city: 'Kraków', venue: 'Zaraz Wracam Tu', address: 'ul. Miodowa 51', org: 'VivaSalsa', lat: 50.0528, lng: 19.9482 },
    'MY': { city: 'Kraków', venue: 'Mykhailo Burdeinyi', address: 'Kraków Centrum', org: 'Mykhailo Burdeinyi', lat: 50.0647, lng: 19.9450 }
};

// Domyślne współrzędne miast i znanych klubów w regionie (#16)
const KNOWN_VENUES_GEO = [
    { match: /dw[oó]r\s+hubertus/i, city: 'Piekary Śląskie', venue: 'Dwór Hubertus', address: 'ul. Bytomska 73', lat: 50.3712, lng: 18.9475 },
    { match: /mohito/i, city: 'Gliwice', venue: 'Restauracja & Klub Mohito', address: 'ul. Zwycięstwa 30', lat: 50.2968, lng: 18.6714 },
    { match: /pachanguero/i, city: 'Rybnik', venue: 'El Pachanguero', address: 'ul. Sobieskiego 15', lat: 50.0971, lng: 18.5418 },
    { match: /este\s+loco/i, city: 'Częstochowa', venue: 'Este Loco', address: 'al. NMP 29', lat: 50.8118, lng: 19.1203 },
    { match: /mojitos/i, city: 'Kraków', venue: 'Mojitos', address: 'ul. Stolarska 11', lat: 50.0604, lng: 19.9388 },
    { match: /trzy\s+stawy|trzech\s+staw/i, city: 'Katowice', venue: 'Dolina Trzech Stawów', address: 'ul. Trzech Stawów', lat: 50.2425, lng: 19.0381 },
    { match: /la\s+clave/i, city: 'Katowice', venue: 'La Clave', address: 'ul. Chorzowska 11', lat: 50.2608, lng: 19.0205 },
    { match: /evolution/i, city: 'Katowice', venue: 'Evolution Dance', address: 'al. Korfantego 4', lat: 50.2599, lng: 19.0218 },
    { match: /mil\s+pasos/i, city: 'Katowice', venue: 'Mil Pasos', address: 'ul. Kamienna 4', lat: 50.2562, lng: 19.0315 },
    { match: /gravitacja/i, city: 'Katowice', venue: 'Gravitacja', address: 'ul. Gliwicka 44', lat: 50.2624, lng: 19.0052 },
    { match: /kizlab/i, city: 'Katowice', venue: 'KIZLAB', address: 'ul. Sobieskiego 11', lat: 50.2603, lng: 19.0156 },
    { match: /sabrosa/i, city: 'Kraków', venue: 'Sabrosa Dance Studio', address: 'rondo Mogilskie 1', lat: 50.0658, lng: 19.9595 },
    { match: /forum\s+ta[nń]ca/i, city: 'Kraków', venue: 'Forum Tańca', address: 'ul. Konopnickiej 29', lat: 50.0442, lng: 19.9348 },
    { match: /prominent/i, city: 'Kraków', venue: 'PROMINENT', address: 'ul. Kamienna 17', lat: 50.0752, lng: 19.9398 },
    { match: /loftodance/i, city: 'Kraków', venue: 'LOFToDANCE', address: 'ul. Kamienna 2–4', lat: 50.0736, lng: 19.9412 }
];

const CITY_DEFAULT_COORDS = {
    'Katowice': { lat: 50.2649, lng: 19.0238 },
    'Gliwice': { lat: 50.2945, lng: 18.6714 },
    'Piekary Śląskie': { lat: 50.3789, lng: 18.9470 },
    'Rybnik': { lat: 50.0971, lng: 18.5418 },
    'Częstochowa': { lat: 50.8118, lng: 19.1203 },
    'Bielsko-Biała': { lat: 49.8224, lng: 19.0584 },
    'Szczyrk': { lat: 49.7189, lng: 19.0270 },
    'Wisła': { lat: 49.6562, lng: 18.8591 },
    'Kraków': { lat: 50.0647, lng: 19.9450 }
};

/**
 * Normalizuje nazwę ulicy/adresu (#16)
 */
function normalizeStreetAddress(rawAddr) {
    if (!rawAddr || typeof rawAddr !== 'string') return '';
    let addr = rawAddr.trim();
    if (!addr) return '';
    addr = addr.replace(/^ulica\s+/i, 'ul. ').replace(/^aleja\s+/i, 'al. ');
    // Dodaj spację między nazwą a numerem, np. "Kamienna17" -> "Kamienna 17"
    addr = addr.replace(/([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(\d+)/g, '$1 $2');
    return addr;
}

/**
 * Normalizuje lokalizację i zwraca współrzędne GPS (#16)
 */
function normalizeLocation(venueRaw) {
    const raw = (venueRaw || '').trim();
    if (VENUE_MAP[raw]) {
        const entry = VENUE_MAP[raw];
        return {
            city: entry.city,
            venue: entry.venue,
            address: normalizeStreetAddress(entry.address),
            lat: entry.lat,
            lng: entry.lng
        };
    }

    let city = '';
    let venue = raw;
    let address = '';
    let lat = null;
    let lng = null;

    if (raw.includes(',')) {
        const vParts = raw.split(',').map(s => s.trim()).filter(Boolean);
        if (VENUE_MAP[vParts[0]]) {
            const entry = VENUE_MAP[vParts[0]];
            city = entry.city;
            venue = entry.venue;
            address = normalizeStreetAddress(entry.address || vParts.slice(1).join(', '));
            lat = entry.lat;
            lng = entry.lng;
        } else {
            city = vParts[0];
            venue = vParts[1] || vParts[0];
            address = normalizeStreetAddress(vParts.slice(2).join(', '));
        }
    }

    for (const known of KNOWN_VENUES_GEO) {
        if (known.match.test(raw) || known.match.test(venue)) {
            city = city || known.city;
            venue = venue || known.venue;
            address = address || known.address;
            lat = lat ?? known.lat;
            lng = lng ?? known.lng;
            break;
        }
    }

    if ((lat === null || lng === null) && city && CITY_DEFAULT_COORDS[city]) {
        lat = CITY_DEFAULT_COORDS[city].lat;
        lng = CITY_DEFAULT_COORDS[city].lng;
    }

    return {
        city: city || 'Katowice',
        venue: venue || 'Inne',
        address,
        lat: lat ?? CITY_DEFAULT_COORDS['Katowice'].lat,
        lng: lng ?? CITY_DEFAULT_COORDS['Katowice'].lng
    };
}

/**
 * Automatyczna deduplikacja wydarzeń z wielu źródeł (#17)
 * Łączy zduplikowane wpisy z tą samą datą i znormalizowanym miejscem/tytułem lub identycznym ID wydarzenia FB.
 */
function deduplicateEvents(events) {
    if (!Array.isArray(events)) return [];
    const seenMap = new Map();
    const result = [];

    for (const ev of events) {
        if (!ev) continue;
        const normDate = (ev.rawDate || ev.date || '').trim().toLowerCase();
        const normCity = (ev.city || ev.miasto || '').trim().toLowerCase();
        const normVenue = (ev.venue || ev.miejsce || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const normTitle = (ev.title || ev.opis || '').trim().toLowerCase().replace(/\s+/g, ' ');

        // Klucz oparty o ID wydarzenia na FB (jeśli istnieje) lub o datę + miasto + klub + znormalizowany tytuł
        const fbIdMatch = (ev.url || ev.link || '').match(/facebook\.com\/events\/(\d+)/i);
        const fbKey = fbIdMatch ? `fb:${normDate}:${fbIdMatch[1]}` : null;
        const venueKey = `loc:${normDate}:${normCity}:${normVenue}:${normTitle}`;

        const existing = (fbKey && seenMap.get(fbKey)) || seenMap.get(venueKey);
        if (existing) {
            // Scal style i notatki jeśli w duplikacie są dodatkowe informacje
            if (ev.styles && existing.styles && !existing.styles.includes(ev.styles)) {
                const mergedStyles = Array.from(
                    new Set(
                        `${existing.styles}/${ev.styles}`
                            .split(/[\/,]/)
                            .map(s => s.trim())
                            .filter(Boolean)
                    )
                );
                existing.styles = mergedStyles.join('/');
            }
            if (!existing.url && ev.url) {
                existing.url = ev.url;
            }
            if (ev.isKSH) {
                existing.isKSH = true;
            }
            continue;
        }

        const cloned = { ...ev };
        if (fbKey) seenMap.set(fbKey, cloned);
        seenMap.set(venueKey, cloned);
        result.push(cloned);
    }

    return result;
}

// Helper: HTTP GET with redirect handling
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// 1. Fetch & Check Google Form Submissions
async function checkFormSubmissions(existingDatabaseText) {
    console.log('🔍 [1/5] Sprawdzanie zgłoszeń z formularza Google (CSV)...');
    try {
        const csv = await fetchUrl(GOOGLE_SHEET_URL);
        const lines = csv.split('\n').map(l => l.trim()).filter(l => l);
        const submissions = [];

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
            const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
            if (clean.length >= 2) {
                const timestamp = clean[0];
                const link = clean[1];
                const date = clean[2] || '';
                const day = clean[3] || '';

                const isKnown = existingDatabaseText.includes(link) || (link.match(/\d{8,}/) && existingDatabaseText.includes(link.match(/\d{8,}/)[0]));
                submissions.push({ timestamp, link, date, day, isKnown });
            }
        }

        const newSubmissions = submissions.filter(s => !s.isKnown);
        console.log(`   Pobrano ${submissions.length} wierszy zgłoszeń. Nowe (nieznane w bazie): ${newSubmissions.length}`);
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
        currentWeekend: [],
        thisWeekMid: [],
        future: [],
        archive: []
    };

    let currentSection = null;
    const lines = mdContent.split('\n');

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.startsWith('## BIEŻĄCY WEEKEND')) {
            currentSection = 'currentWeekend';
            return;
        } else if (line.startsWith('## PN–CZ BIEŻĄCEGO TYGODNIA')) {
            currentSection = 'thisWeekMid';
            return;
        } else if (line.startsWith('## DALSZE TERMINY')) {
            currentSection = 'future';
            return;
        } else if (line.startsWith('## ARCHIWUM MINIONE')) {
            currentSection = 'archive';
            return;
        } else if (line.startsWith('#')) {
            return; // ignore main title
        }

        if (!currentSection || !line.includes('|')) return;

        // format: data|miejsce|nazwa|style|źródło|uwagi/organizator
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 4) return;

        let [dateStr, venueRaw, name, styles, source, notes] = parts;
        styles = styles || '';
        source = source || '';
        notes = notes || '';

        const normalizedLoc = normalizeLocation(venueRaw);
        const { city, venue, address, lat, lng } = normalizedLoc;

        const isKSH = Boolean(
            (notes && notes.includes('KATO SALSA HUB')) ||
            (name && name.includes('KATO SALSA HUB')) ||
            (venue && venue.includes('Trzy Stawy')) ||
            (venue && venue.includes('Trzech Stawów'))
        );

        sections[currentSection].push({
            rawDate: dateStr,
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

    // Deduplikacja wszystkich sekcji (#17)
    sections.currentWeekend = deduplicateEvents(sections.currentWeekend);
    sections.thisWeekMid = deduplicateEvents(sections.thisWeekMid);
    sections.future = deduplicateEvents(sections.future);
    sections.archive = deduplicateEvents(sections.archive);

    console.log(`   Rozpoznano sekcje (po deduplikacji): Weekend: ${sections.currentWeekend.length}, Pn-Cz: ${sections.thisWeekMid.length}, Kolejne tygodnie: ${sections.future.length}, Archiwum: ${sections.archive.length}`);
    return sections;
}

// Atomowy zapis pliku JSON (zgodnie z ISO 27001 / AGENTS.md 4.3)
function writeFileAtomically(filePath, content) {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

// 3. Generate dancepuls.pl/data/events.json
function generateEventsJson(sections) {
    console.log('⚡ [3/5] Generowanie struktury JSON dla DancePuls...');

    const currentYear = new Date().getFullYear();
    const resultByDate = {};

    function addEvent(ev, defaultYear = currentYear) {
        let dayStr = ev.rawDate;
        if (dayStr.includes('–')) {
            dayStr = dayStr.split('–')[0].trim();
        }
        if (dayStr.startsWith('od ')) {
            dayStr = dayStr.replace('od ', '').trim();
        }

        let isoDate = '';
        if (dayStr.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
            const [d, m, y] = dayStr.split('.');
            isoDate = `${y}-${m}-${d}`;
        } else if (dayStr.match(/^\d{2}\.\d{2}$/)) {
            const [d, m] = dayStr.split('.');
            isoDate = `${defaultYear}-${m}-${d}`;
        }

        if (!isoDate) return;

        if (!resultByDate[isoDate]) {
            resultByDate[isoDate] = [];
        }

        const stylesArray = ev.styles.split(/[\/,]/).map(s => s.trim()).filter(s => s);

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
            opis: ev.title + (ev.notes ? ` - ${ev.notes}` : ''),
            link: ev.url,
            style: stylesArray
        });
    }

    sections.thisWeekMid.forEach(ev => addEvent(ev));
    sections.currentWeekend.forEach(ev => addEvent(ev));

    const finalJson = Object.keys(resultByDate).sort().map(date => ({
        date,
        events: resultByDate[date]
    }));

    writeFileAtomically(JSON_PATH, JSON.stringify(finalJson, null, 2));
    console.log(`   Zapisano ${finalJson.length} dni z wydarzeniami do: ${JSON_PATH}`);
    return finalJson;
}

// 4. Generate the 6-Section Weekly Report
function generateWeeklyReport(sections, newSubmissions = []) {
    console.log('📝 [4/5] Generowanie pełnego 6-sekcyjnego raportu Kato Salsa Hub...');

    const todayStr = '05.10.2026';
    const weekendRangeStr = '09–11.10.2026';
    const weekendShortStr = '09-11.10';

    const weekendEvents = sections.currentWeekend;
    const fridayEvents = weekendEvents.filter(e => e.rawDate.startsWith('09'));
    const saturdayEvents = weekendEvents.filter(e => e.rawDate.startsWith('10'));
    const sundayEvents = weekendEvents.filter(e => e.rawDate.startsWith('11'));

    const FOOTER = `@wszyscy Do zobaczenia na parkiecie! 💃🕺

📝 PS1: Chcesz zgłosić imprezę? Wypełnij krótki formularz, a dodamy ją do następnego zestawienia: 👉 https://tiny.pl/2bc8z7649

📻 PS2: Chcesz posłuchać radia gdzie puszczają salsę bez reklam i w dodatku z opcją zablokowania telefonu? Masz taką opcję na naszej stronie: 👉 https://katosalsahub.pl

☕ PS3: Podoba Ci się to, co robię? Jeśli chcesz, możesz postawić mi wirtualną kawę – to daje mi mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub

#Salsa #Bachata #Kizomba #Taniec #Silesia #Katowice`;

    let sec1 = `## 1. PRYWATNIE — raport na ${todayStr}
Rozpoczynam nową edycji na weekend **${weekendRangeStr}**.
- Z bazy przeniesiono **${weekendEvents.length} pozycji** na nadchodzący weekend (${fridayEvents.length} pt, ${saturdayEvents.length} sb, ${sundayEvents.length} nd).
- Miniony weekend (02–04.10) zarchiwizowany w bazie.
- Nowe zgłoszenia z formularza: ${newSubmissions.length > 0 ? newSubmissions.map(s => s.link).join(', ') : 'brak nowych zgłoszeń w arkuszu'}.
- Rotacja regionalna: baza zawiera pozycje z Katowic, Piekar Śląskich, Gliwic, Rybnika, Częstochowy, Bielska-Białej, Szczyrku, Wisły oraz Krakowa.`;

    let sec2 = `🎉 Gdzie tańczymy w ten weekend? (${weekendShortStr})

🗓️ PIĄTEK
Piekary Śląskie zapraszają na dyniową potańcówkę Pumpkin Latino Fiesta w Dworze Hubertus, w Gliwicach startuje Sensual Weekend z Sergio i Carlą w Mohito, a w Krakowie bachatowy flow rozkręca DJ Palejandro.

🗓️ SOBOTA
W Rybniku świętujemy Pachanguerówkę w El Pachanguero, w Częstochowie latino w Este Loco, a w krakowskim Forum Tańca praktis z cyklu Przygarnij świeżaka.

🗓️ NIEDZIELA
Krakowska Sabrosa zaprasza na warsztaty Son Cubano, Rumby oraz bachaty, a wieczorem przetestujecie parkiet Bachata at Mojitos.`;

    let sec3Lines = [];
    fridayEvents.forEach(e => {
        sec3Lines.push(`PIĄTEK (09.10): ${e.city} - ${e.venue} (${e.styles})`);
    });
    saturdayEvents.forEach(e => {
        sec3Lines.push(`SOBOTA (10.10): ${e.city} - ${e.venue} (${e.styles})`);
    });
    sundayEvents.forEach(e => {
        sec3Lines.push(`NIEDZIELA (11.10): ${e.city} - ${e.venue} (${e.styles})`);
    });
    let sec3 = sec3Lines.join('\n');

    let sec4Lines = ['🎉 Zestawienie imprezowe\n'];
    if (fridayEvents.length > 0) {
        sec4Lines.push('🗓️ PIĄTEK (09.10):');
        fridayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${e.venue} (${e.styles})`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    if (saturdayEvents.length > 0) {
        sec4Lines.push('🗓️ SOBOTA (10.10):');
        saturdayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${e.venue} (${e.styles})`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    if (sundayEvents.length > 0) {
        sec4Lines.push('🗓️ NIEDZIELA (11.10):');
        sundayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${e.venue} (${e.styles})`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    sec4Lines.push(FOOTER);
    let sec4 = sec4Lines.join('\n');

    let sec5Lines = ['🎉 Zaplanowane wydarzenia — kolejne tygodnie\n'];
    sections.future.forEach(e => {
        const mark = e.isKSH ? '⭐' : '➡️';
        let dateLabel = e.rawDate;
        if (!dateLabel.includes('.')) dateLabel += '.2026';
        sec5Lines.push(`🗓️ ${dateLabel}`);
        sec5Lines.push(`${mark} ${e.city}: ${e.venue}, ${e.title} (${e.styles})`);
        sec5Lines.push(`🔗 ${e.url}`);
    });
    sec5Lines.push('');
    sec5Lines.push(FOOTER);
    let sec5 = sec5Lines.join('\n');

    let sec6 = `## 6. PRYWATNIE — pominięcia, niepewne tropy i kolejne kroki
- W tygodniu pn–cz (06.10): w Krakowie zaplanowane są Salsunia w Zaraz Wracam Tu (VivaSalsa) oraz Praktis w Forum Tańca.
- Niepewne / TBA: KIZLAB Katowice ogłosił terminy (08.11, 22.11, 06.12, 20.12), program szczegółowy w trakcie potwierdzania.
- Kolejne kroki: monitorować ogłoszenia KSH dotyczące nowego cyklu plenerowego/klubowego po zakończeniu letniego sezonu na Trzech Stawach.`;

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
    console.log('🚀 [5/5] Synchronizacja z serwerem LH (dancepuls.katosalsahub.pl)...');
    try {
        execSync('ssh lh-katosalsa "mkdir -p /home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data"');
        execSync(`scp "${JSON_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/events.json`);
        execSync(`scp "${DB_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/events_database.md`);
        execSync(`scp "${REPORT_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/latest_report.md`);
        console.log('   ✅ Pomyślnie zsynchronizowano bazę, JSON i raport na serwer LH.pl!');
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

    const dbText = fs.readFileSync(DB_PATH, 'utf8');
    const { newSubmissions } = await checkFormSubmissions(dbText);
    const sections = parseDatabase(dbText);

    generateEventsJson(sections);
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
    parseDatabase,
    generateEventsJson,
    generateWeeklyReport,
    normalizeLocation,
    normalizeStreetAddress,
    deduplicateEvents,
    VENUE_MAP
};
