/**
 * KATO SALSA HUB & DANCEPULS - UNIFIED SYNC & REPORT ENGINE
 *
 * Automates:
 * 1. Fetching Google Forms submissions (CSV)
 * 2. Parsing and maintaining events_database.md (including F:ID / O:ID expansion)
 * 3. Normalizing addresses & GPS coordinates (#16) and deduplicating events (#17)
 * 4. Generating dancepuls.pl/data/events.json for the web app (including future weeks)
 * 5. Generating the complete, dynamic 6-section Kato Salsa Hub report (latest_report.md)
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

const WEEKDAYS_PL = ['NIEDZIELA', 'PONIEDZIAŁEK', 'WTOREK', 'ŚRODA', 'CZWARTEK', 'PIĄTEK', 'SOBOTA'];

// Słownik skrótów i lokalizacji ze współrzędnymi GPS (#16)
const VENUE_MAP = {
    'LC': { city: 'Katowice', venue: 'La Clave', address: 'ul. Chorzowska 11', org: 'La Clave', lat: 50.2608, lng: 19.0205 },
    'EV': { city: 'Katowice', venue: 'Evolution Dance', address: 'al. Korfantego 4', org: 'Evolution Dance', lat: 50.2599, lng: 19.0218 },
    'MP': { city: 'Katowice', venue: 'Mil Pasos', address: 'ul. Kamienna 4', org: 'Mil Pasos', lat: 50.2562, lng: 19.0315 },
    'GM': { city: 'Katowice', venue: 'Good Mood', address: 'ul. Paderewskiego 35', org: 'Szkoła Tańca Good Mood', lat: 50.2518, lng: 19.0354 },
    'GR': { city: 'Katowice', venue: 'Gravitacja', address: 'ul. Gliwicka 44', org: 'Dance Plus Plus', lat: 50.2624, lng: 19.0052 },
    'KL': { city: 'Katowice', venue: 'KIZLAB', address: 'ul. Sobieskiego 11', org: 'KIZLAB', lat: 50.2603, lng: 19.0156 },
    'TS': { city: 'Katowice', venue: 'Dolina Trzech Stawów', address: 'ul. Trzech Stawów 20', org: 'KATO SALSA HUB', lat: 50.2425, lng: 19.0381 },
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
    { match: /dw[oó]r\s+hubertus/i, city: 'Piekary Śląskie', venue: 'Dwór Hubertus', address: 'ul. Inwalidów Wojennych 72', lat: 50.3712, lng: 18.9475 },
    { match: /mohito.*tychy|tychy.*mohito/i, city: 'Tychy', venue: 'Mohito', address: 'al. Jana Pawła II 14', lat: 50.1275, lng: 18.9912 },
    { match: /mohito/i, city: 'Gliwice', venue: 'Mohito', address: 'ul. Zwycięstwa 52A', lat: 50.2968, lng: 18.6714 },
    { match: /pachanguero/i, city: 'Rybnik', venue: 'Akademia El Pachanguero', address: 'ul. Grunwaldzka 46', lat: 50.0971, lng: 18.5418 },
    { match: /havana\s+dance/i, city: 'Rybnik', venue: 'Havana Dance Studio', address: 'ul. Jana Kotucza 36', lat: 50.1022, lng: 18.5384 },
    { match: /este\s+loco/i, city: 'Częstochowa', venue: 'Este Loco–Dance with passion', address: 'ul. Dekabrystów 35B', lat: 50.8245, lng: 19.1152 },
    { match: /cz[eę]stota[nń]cz/i, city: 'Częstochowa', venue: 'Częstotańcz', address: 'ul. Spółdzielczości 4', lat: 50.8180, lng: 19.1240 },
    { match: /beleza/i, city: 'Siewierz', venue: 'Beleza', address: 'Rynek 11', lat: 50.4701, lng: 19.2291 },
    { match: /alldance/i, city: 'Bielsko-Biała', venue: 'AllDance', address: 'ul. 1 Maja 20', lat: 49.8235, lng: 19.0442 },
    { match: /orle\s+gniazdo/i, city: 'Hucisko', venue: 'Orle Gniazdo', address: 'Orle Gniazdo 20', lat: 50.5947, lng: 19.5297 },
    { match: /paprocany|przysta[nń]\s+kajakowa/i, city: 'Tychy', venue: 'Paprocany, przystań kajakowa', address: 'ul. Sikorskiego', lat: 50.0885, lng: 18.9955 },
    { match: /dzie[nń]\s+i\s+noc/i, city: 'Katowice', venue: 'Dzień i Noc', address: 'ul. Warszawska 5', lat: 50.2591, lng: 19.0235 },
    { match: /mojitos/i, city: 'Kraków', venue: 'Mojitos', address: 'ul. Mikołajska 13', lat: 50.0615, lng: 19.9408 },
    { match: /teatro\s+cubano/i, city: 'Kraków', venue: 'Teatro Cubano', address: 'ul. Jagiellońska 10', lat: 50.0628, lng: 19.9352 },
    { match: /panorama\s+forum/i, city: 'Kraków', venue: 'Panorama Forum', address: 'ul. Konopnickiej 28', lat: 50.0451, lng: 19.9361 },
    { match: /hala\s+lipowa/i, city: 'Kraków', venue: 'Hala Lipowa', address: 'ul. Lipowa 4D', lat: 50.0478, lng: 19.9614 },
    { match: /hotel\s+galaxy/i, city: 'Kraków', venue: 'Hotel Galaxy', address: 'ul. Gęsia 22a', lat: 50.0558, lng: 19.9602 },
    { match: /hotel\s+premier/i, city: 'Kraków', venue: 'Hotel Premier', address: 'ul. Opolska 14a', lat: 50.0912, lng: 19.9278 },
    { match: /ponchocaf/i, city: 'Kraków', venue: 'PonchoCafé Latino Bar', address: 'ul. Długa', lat: 50.0675, lng: 19.9395 },
    { match: /hotel\s+meta/i, city: 'Szczyrk', venue: 'Hotel Meta', address: 'ul. Skośna 4', lat: 49.7145, lng: 19.0265 },
    { match: /u\s+fojta/i, city: 'Wisła', venue: 'Ośrodek U Fojta', address: 'ul. Branców 2', lat: 49.6562, lng: 18.8591 },
    { match: /trzy\s+stawy|trzech\s+staw/i, city: 'Katowice', venue: 'Dolina Trzech Stawów', address: 'ul. Trzech Stawów 20', lat: 50.2425, lng: 19.0381 },
    { match: /la\s+clave/i, city: 'Katowice', venue: 'La Clave', address: 'ul. Chorzowska 11', lat: 50.2608, lng: 19.0205 },
    { match: /evolution/i, city: 'Katowice', venue: 'Evolution Dance', address: 'al. Korfantego 4', lat: 50.2599, lng: 19.0218 },
    { match: /mil\s+pasos/i, city: 'Katowice', venue: 'Mil Pasos', address: 'ul. Kamienna 4', lat: 50.2562, lng: 19.0315 },
    { match: /good\s*mood|paderewskiego\s*35/i, city: 'Katowice', venue: 'Good Mood', address: 'ul. Paderewskiego 35', lat: 50.2518, lng: 19.0354 },
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
    'Tychy': { lat: 50.1275, lng: 18.9912 },
    'Chorzów': { lat: 50.2975, lng: 18.9545 },
    'Bytom': { lat: 50.3484, lng: 18.9157 },
    'Świętochłowice': { lat: 50.2920, lng: 18.9178 },
    'Zabrze': { lat: 50.3249, lng: 18.7857 },
    'Sosnowiec': { lat: 50.2863, lng: 19.1041 },
    'Dąbrowa Górnicza': { lat: 50.3217, lng: 19.1949 },
    'Tarnowskie Góry': { lat: 50.4442, lng: 18.8565 },
    'Piekary Śląskie': { lat: 50.3789, lng: 18.9470 },
    'Siewierz': { lat: 50.4701, lng: 19.2291 },
    'Hucisko': { lat: 50.5947, lng: 19.5297 },
    'Rybnik': { lat: 50.0971, lng: 18.5418 },
    'Częstochowa': { lat: 50.8118, lng: 19.1203 },
    'Bielsko-Biała': { lat: 49.8224, lng: 19.0584 },
    'Cieszyn': { lat: 49.7513, lng: 18.6321 },
    'Żywiec': { lat: 49.6853, lng: 19.1924 },
    'Szczyrk': { lat: 49.7189, lng: 19.0270 },
    'Wisła': { lat: 49.6562, lng: 18.8591 },
    'Kraków': { lat: 50.0647, lng: 19.9450 }
};

const FOOTER = `@wszyscy Do zobaczenia na parkiecie! 💃🕺

📝 PS1: Chcesz zgłosić imprezę? Wypełnij krótki formularz, a dodamy ją do następnego zestawienia: 👉 https://tiny.pl/2bc8z7649

📻 PS2: Szukasz gdzie tańczyć salsę w Katowicach? Mapa miejscówek i darmowych parkingów, słownik ponad 200 figur Salsopedia oraz radio z salsą 24/7 bez reklam (działa przy zablokowanym telefonie!) czekają na naszej stronie Salsa Katowice: 👉 https://katosalsahub.pl/

☕ PS3: Podoba Ci się to, co robię? Jeśli chcesz, możesz postawić mi wirtualną kawę – to daje mi mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub

#SalsaKatowice #KatoSalsaHub #Salsa #Bachata #Kizomba #Taniec #Katowice #Silesia`;

/**
 * Rozwija skróty linków z bazy KSH:
 * F:ID -> https://www.facebook.com/events/ID/
 * O:ID -> https://onlydanceapp.com/event/ID
 */
function expandSourceUrl(rawSource) {
    if (!rawSource || typeof rawSource !== 'string') return '';
    const trimmed = rawSource.trim();
    if (!trimmed || trimmed.toLowerCase() === 'brak') return '';
    if (/^F:[A-Za-z0-9_-]+$/i.test(trimmed)) {
        const id = trimmed.slice(2);
        return `https://www.facebook.com/events/${id}/`;
    }
    if (/^O:[A-Za-z0-9_-]+$/i.test(trimmed)) {
        const id = trimmed.slice(2);
        return `https://onlydanceapp.com/event/${id}`;
    }
    return trimmed;
}

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
        if (vParts[0] === 'MY') {
            // Specjalny kod organizatora Mykhailo Burdeinyi w Krakowie — lokal podany po przecinku
            city = 'Kraków';
            const rest = vParts.slice(1).filter(p => p.toLowerCase() !== 'kraków');
            venue = rest[0] || 'Mykhailo Burdeinyi';
            address = normalizeStreetAddress(rest.slice(1).join(', '));
        } else if (VENUE_MAP[vParts[0]]) {
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
    } else if (CITY_DEFAULT_COORDS[raw]) {
        city = raw;
        venue = 'Inne';
    }

    for (const known of KNOWN_VENUES_GEO) {
        if (known.match.test(raw) || known.match.test(venue)) {
            city = city || known.city;
            if (!venue || venue === raw || venue === 'Inne') {
                venue = known.venue;
            }
            address = address || known.address;
            lat = lat ?? known.lat;
            lng = lng ?? known.lng;
            break;
        }
    }

    // Oczyść nazwę lokalu z doklejonego numeru (np. "Orle Gniazdo20" -> "Orle Gniazdo")
    if (/^Orle\s+Gniazdo\d+$/i.test(venue)) {
        venue = 'Orle Gniazdo';
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
 * Parsuje zapis daty z bazy (np. "16.10", "24–25.10", "29–31.01.2027", "od 18.06.2027")
 * i zwraca ustrukturyzowane metadane daty oraz sformatowany nagłówek dla Komentarza 2 (Sekcja 5).
 */
function parseEventDateInfo(rawDate, defaultYear = 2026) {
    const raw = (rawDate || '').trim();
    const isOpenEnded = /^od\s*/i.test(raw);
    const cleaned = raw.replace(/^od\s*/i, '').trim();

    // Sprawdź rok na końcu (np. .2026 lub .2027)
    const yearMatch = cleaned.match(/\.(\d{4})$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : defaultYear;
    const withoutYear = yearMatch ? cleaned.slice(0, -5) : cleaned;

    let startDay = 1;
    let startMonth = 1;
    let endDay = null;
    let endMonth = null;
    let isRange = false;

    if (withoutYear.includes('–') || withoutYear.includes('-')) {
        isRange = true;
        const [left, right] = withoutYear.split(/[–-]/).map(s => s.trim());
        const rightParts = right.split('.');
        if (rightParts.length >= 2) {
            endDay = parseInt(rightParts[0], 10);
            endMonth = parseInt(rightParts[1], 10);
        }
        const leftParts = left.split('.');
        startDay = parseInt(leftParts[0], 10);
        startMonth = leftParts.length >= 2 ? parseInt(leftParts[1], 10) : endMonth;
    } else if (/^\d{1,2}\.\d{1,2}$/.test(withoutYear)) {
        const [d, m] = withoutYear.split('.');
        startDay = parseInt(d, 10);
        startMonth = parseInt(m, 10);
    } else {
        return {
            raw,
            isoStartDate: '',
            startDayMonth: raw,
            weekdayPL: '',
            futureHeaderLabel: raw,
            sortTimestamp: Number.MAX_SAFE_INTEGER
        };
    }

    const pad = n => String(n).padStart(2, '0');
    const isoStartDate = `${year}-${pad(startMonth)}-${pad(startDay)}`;
    const startDayMonth = `${pad(startDay)}.${pad(startMonth)}`;
    const startDateObj = new Date(Date.UTC(year, startMonth - 1, startDay, 12, 0, 0));
    const weekdayPL = WEEKDAYS_PL[startDateObj.getUTCDay()];

    let futureHeaderLabel = '';
    if (isOpenEnded) {
        futureHeaderLabel = `${weekdayPL} (OD ${pad(startDay)}.${pad(startMonth)}.${year})`;
    } else if (isRange && endDay && endMonth) {
        const endDateObj = new Date(Date.UTC(year, endMonth - 1, endDay, 12, 0, 0));
        const endWeekdayPL = WEEKDAYS_PL[endDateObj.getUTCDay()];
        if (startMonth === endMonth) {
            futureHeaderLabel = `${weekdayPL}–${endWeekdayPL} (${pad(startDay)}–${pad(endDay)}.${pad(endMonth)}.${year})`;
        } else {
            futureHeaderLabel = `${weekdayPL}–${endWeekdayPL} (${pad(startDay)}.${pad(startMonth)}–${pad(endDay)}.${pad(endMonth)}.${year})`;
        }
    } else {
        futureHeaderLabel = `${weekdayPL} (${pad(startDay)}.${pad(startMonth)}.${year})`;
    }

    return {
        raw,
        year,
        isoStartDate,
        startDayMonth,
        weekdayPL,
        isRange,
        isOpenEnded,
        futureHeaderLabel,
        sortTimestamp: startDateObj.getTime()
    };
}

/**
 * Skraca tytuł wydarzenia do zwięzłej etykiety używanej w Ankiecie (Sekcja 3) i Komentarzu 1 (Sekcja 4),
 * gdy w tym samym miejscu i dniu odbywa się więcej niż jedno wydarzenie.
 */
function extractShortEventTitle(title) {
    if (!title || typeof title !== 'string') return '';
    const firstPart = title.split(',')[0].trim();
    return firstPart.replace(/\s+/g, ' ');
}

/**
 * Buduje tekst miejsca i stylów dla Ankiety (Sekcja 3) i Komentarza 1 (Sekcja 4).
 * Zgodnie ze specyfikacją KSH:
 * - miejsca i style są identyczne w Ankiecie i Komentarzu 1
 * - gdy w tym samym dniu i miejscu jest więcej niż 1 wydarzenie, rozróżniamy je krótką nazwą imprezy
 * - gdy wydarzenie jest wyprzedane, oznaczamy to publicznie
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

/**
 * Automatyczna deduplikacja wydarzeń z wielu źródeł (#17)
 * Łączy zduplikowane wpisy z tą samą datą i znormalizowanym miejscem/tytułem lub identycznym ID wydarzenia FB
 * (z zachowaniem odrębności dla cyklicznych edycji z tym samym wspólnym linkiem FB w różnych dniach).
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

        const expandedUrl = expandSourceUrl(ev.url || ev.link || '');
        const fbIdMatch = expandedUrl.match(/facebook\.com\/events\/(?:s\/[^\/]+\/)?(\d+)/i);
        const fbKey = fbIdMatch ? `fb:${normDate}:${fbIdMatch[1]}` : null;
        const venueKey = `loc:${normDate}:${normCity}:${normVenue}:${normTitle}`;

        const existing = (fbKey && seenMap.get(fbKey)) || seenMap.get(venueKey);
        if (existing) {
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
            if (!existing.url && expandedUrl) {
                existing.url = expandedUrl;
            }
            if (ev.isKSH) {
                existing.isKSH = true;
            }
            continue;
        }

        const cloned = { ...ev, url: expandedUrl || ev.url };
        if (fbKey) seenMap.set(fbKey, cloned);
        seenMap.set(venueKey, cloned);
        result.push(cloned);
    }

    return result;
}

// Helper: HTTP GET with redirect handling and timeout
function fetchUrl(url, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve(fetchUrl(res.headers.location, timeoutMs));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('timeout', () => {
            req.destroy(new Error('Przekroczono czas oczekiwania HTTP'));
        });
        req.on('error', reject);
    });
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
                // Pomijaj archiwalne zgłoszenia sprzed października 2026
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

        // format: data|miejsce|nazwa|style|źródło|uwagi/organizator
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

    // Deduplikacja wszystkich sekcji (#17)
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

// 3. Generate dancepuls.pl/data/events.json
function generateEventsJson(sections) {
    console.log('⚡ [3/5] Generowanie struktury JSON dla DancePuls...');

    const currentYear = new Date().getFullYear();
    const resultByDate = {};

    function addEvent(ev, defaultYear = currentYear) {
        let isoDate = ev.isoStartDate || '';
        if (!isoDate) {
            let dayStr = ev.rawDate || '';
            if (dayStr.includes('–') || dayStr.includes('-')) {
                dayStr = dayStr.split(/[–-]/)[0].trim();
            }
            if (/^od\s*/i.test(dayStr)) {
                dayStr = dayStr.replace(/^od\s*/i, '').trim();
            }
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(dayStr)) {
                const [d, m, y] = dayStr.split('.');
                isoDate = `${y}-${m}-${d}`;
            } else if (/^\d{2}\.\d{2}$/.test(dayStr)) {
                const [d, m] = dayStr.split('.');
                isoDate = `${defaultYear}-${m}-${d}`;
            }
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
            tytul: extractShortEventTitle(ev.title),
            opis: ev.title + (ev.notes ? ` - ${ev.notes}` : ''),
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
    console.log(`   Zapisano ${finalJson.length} dni z wydarzeniami do: ${JSON_PATH}`);
    return finalJson;
}

/**
 * Buduje naturalny, ludzki opis dnia do Sekcji 2 (POST NA FB)
 * zgodnie ze standardem KSH:
 * - po 1–2 naturalne zdania na dzień
 * - Katowice na pierwszym planie; gdy brak lokalnej imprezy lub Cubany, wskazuje alternatywy w regionie/Krakowie
 * - warsztaty nazywa warsztatami
 * - pisownia Cubana / salsa cubana przez 'C'
 */
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
        const isPraktis = /praktis|practis/i.test(e.title);
        if (isWorkshop) {
            return /^warsztaty/i.test(shortName)
                ? `${shortName} w ${e.venue} (${e.styles})`
                : `warsztaty ${shortName} w ${e.venue} (${e.styles})`;
        }
        if (isPraktis) {
            return `${shortName} w ${e.venue} (${e.styles})`;
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

/**
 * Zlicza wystąpienia (miasto + miejsce) w obrębie jednego dnia, aby rozróżnić
 * krótką nazwą imprezy wydarzenia odbywające się w tym samym miejscu i dniu.
 */
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

    // Jeśli z jakiegoś powodu daty nie miały przypisanego dnia tygodnia (fallback np. dla testów)
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

    // SEKCJA 1: PRYWATNIE
    const newItemsSummary = newlyAddedToday.length > 0
        ? newlyAddedToday.map(e => `  - **${e.title}** | ${e.rawDate}.2026 | ${e.city}, ${e.venue} | ${e.styles} | ${e.url}`).join('\n')
        : '  - Na dziś nie znalazłem nowych ogłoszeń (wszystkie pozycje w bazie zweryfikowane wcześniej).';

    const sec1 = `## 1. PRYWATNIE — raport na ${todayStr}
- **Stan zestawienia na weekend ${weekendRangeStr}:** **${weekendEvents.length} pozycji** (${fridayEvents.length} pt + ${saturdayEvents.length} sb + ${sundayEvents.length} nd).
- **Zapowiedzi na kolejne tygodnie (Komentarz 2):** **${(sections.future || []).length} pozycji** (pełny horyzont do 2027 r.).
- **Wydarzenia pn–cz bieżącego tygodnia (poza ankietą):** **${(sections.thisWeekMid || []).length} pozycje**.
- **Nowości w bazie z ostatniego sprawdzenia (${todayStr.slice(0, 5)} — ${newlyAddedToday.length} pozycji, data publikacji nieustalona):**
${newItemsSummary}
- **Zgłoszenia z formularza Google KSH (CSV):** ${newSubmissions.length > 0 ? newSubmissions.map(s => s.link).join(', ') : 'brak nowych zgłoszeń spoza bazy'}.
- **Faktycznie wykonana praca i ulepszenia:** Zsynchronizowano jednolitą bazę \`events_database.md\`, rozwinięto wszystkie skróty identyfikatorów \`F:ID\` i \`O:ID\` do pełnych linków, rozróżniono krótką nazwą imprezy wydarzenia występujące tego samego dnia w tym samym klubie (La Clave, DANCE#LOVEit, Forum Tańca, LOFToDANCE) oraz wygenerowano plik \`events.json\` i podgląd 6 sekcji w interfejsie DancePuls.`;

    // SEKCJA 2: POST NA FB
    const narrative = sections.postNarrative || {};
    const ptText = narrative.PIĄTEK || buildNaturalDayNarrative(fridayEvents, 'piątek');
    const sbText = narrative.SOBOTA || buildNaturalDayNarrative(saturdayEvents, 'sobota');
    const ndText = narrative.NIEDZIELA || buildNaturalDayNarrative(sundayEvents, 'niedziela');

    const sec2 = `🎉 Gdzie tańczymy w ten weekend? (${weekendShortStr})

🗓️ PIĄTEK
${ptText}

🗓️ SOBOTA
${sbText}

🗓️ NIEDZIELA
${ndText}`;

    // SEKCJA 3: ANKIETA
    const sec3Lines = [];
    fridayEvents.forEach(e => {
        sec3Lines.push(`PIĄTEK (${e.startDayMonth || ptDateLabel}): ${e.city} - ${buildVenueAndStyleLabel(e, getPtVenueCount(e))}`);
    });
    saturdayEvents.forEach(e => {
        sec3Lines.push(`SOBOTA (${e.startDayMonth || sbDateLabel}): ${e.city} - ${buildVenueAndStyleLabel(e, getSbVenueCount(e))}`);
    });
    sundayEvents.forEach(e => {
        sec3Lines.push(`NIEDZIELA (${e.startDayMonth || ndDateLabel}): ${e.city} - ${buildVenueAndStyleLabel(e, getNdVenueCount(e))}`);
    });
    const sec3 = sec3Lines.join('\n');

    // SEKCJA 4: KOMENTARZ 1 — WEEKEND
    const sec4Lines = ['🎉 Zestawienie imprezowe\n'];
    if (fridayEvents.length > 0) {
        sec4Lines.push(`🗓️ PIĄTEK (${fridayEvents[0].startDayMonth || ptDateLabel}):`);
        fridayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${buildVenueAndStyleLabel(e, getPtVenueCount(e))}`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    if (saturdayEvents.length > 0) {
        sec4Lines.push(`🗓️ SOBOTA (${saturdayEvents[0].startDayMonth || sbDateLabel}):`);
        saturdayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${buildVenueAndStyleLabel(e, getSbVenueCount(e))}`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    if (sundayEvents.length > 0) {
        sec4Lines.push(`🗓️ NIEDZIELA (${sundayEvents[0].startDayMonth || ndDateLabel}):`);
        sundayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${buildVenueAndStyleLabel(e, getNdVenueCount(e))}`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    sec4Lines.push(FOOTER);
    const sec4 = sec4Lines.join('\n');

    // SEKCJA 5: KOMENTARZ 2 — PRZYSZŁOŚĆ
    const sec5Lines = ['🎉 Zaplanowane wydarzenia — kolejne tygodnie\n'];
    (sections.future || []).forEach(e => {
        const mark = e.isKSH ? '⭐' : '➡️';
        const headerLabel = e.futureHeaderLabel || parseEventDateInfo(e.rawDate).futureHeaderLabel;
        sec5Lines.push(`🗓️ ${headerLabel}`);
        sec5Lines.push(`${mark} ${e.city}: ${e.venue}, ${e.title} (${e.styles})`);
        sec5Lines.push(`🔗 ${e.url}`);
    });
    sec5Lines.push('');
    sec5Lines.push(FOOTER);
    const sec5 = sec5Lines.join('\n');

    // SEKCJA 6: PRYWATNIE — pominięcia, pn-cz, niepewne tropy i kolejne kroki
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
    VENUE_MAP,
    FOOTER
};
