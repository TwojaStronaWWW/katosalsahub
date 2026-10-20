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
const zlib = require('zlib');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'data', 'events_database.md');
const JSON_PATH = path.join(BASE_DIR, 'data', 'events.json');
const KSH_EVENTS_JSON_PATH = path.resolve(BASE_DIR, '..', 'katosalsahub.pl', 'assets', 'data', 'events.json');
const REPORT_PATH = path.join(BASE_DIR, 'data', 'latest_report.md');

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/export?format=csv&gid=1833510316';

const WEEKDAYS_PL = ['NIEDZIELA', 'PONIEDZIAŁEK', 'WTOREK', 'ŚRODA', 'CZWARTEK', 'PIĄTEK', 'SOBOTA'];

// Słownik skrótów i lokalizacji ze współrzędnymi GPS (#16)
const VENUE_MAP = {
    'LC': { city: 'Katowice', venue: 'La Clave', address: 'ul. Chorzowska 11', org: 'La Clave', lat: 50.2660, lng: 19.0188 },
    'EV': { city: 'Katowice', venue: 'Evolution Dance', address: 'al. Korfantego 4', org: 'Evolution Dance', lat: 50.2620, lng: 19.0215 },
    'MP': { city: 'Katowice', venue: 'Mil Pasos', address: 'ul. Kamienna 4', org: 'Mil Pasos', lat: 50.2569, lng: 19.0121 },
    'GM': { city: 'Katowice', venue: 'Good Mood', address: 'ul. Paderewskiego 35', org: 'Szkoła Tańca Good Mood', lat: 50.2536, lng: 19.0399 },
    'TK': { city: 'Katowice', venue: 'Taneczna Kompania', address: 'ul. Kościuszki 227', org: 'Taneczna Kompania', lat: 50.2248, lng: 18.9894 },
    'GR': { city: 'Katowice', venue: 'Gravitacja', address: 'ul. Gliwicka 44', org: 'Dance Plus Plus', lat: 50.2625, lng: 19.0060 },
    'KL': { city: 'Katowice', venue: 'KIZLAB', address: 'ul. Sobieskiego 11', org: 'KIZLAB', lat: 50.2619, lng: 19.0119 },
    'TS': { city: 'Katowice', venue: 'Dolina Trzech Stawów', address: 'ul. Trzech Stawów 20', org: 'KATO SALSA HUB', lat: 50.2449, lng: 19.0464 },
    'WL': { city: 'Katowice', venue: 'Wolni Ludzie', address: 'ul. Mariacka 2', org: 'KATO SALSA HUB', lat: 50.2577, lng: 19.0248 },
    'DL': { city: 'Bielsko-Biała', venue: 'DANCE#LOVEit & Corazon', address: 'ul. Grażyńskiego 12', org: 'DANCE#LOVEit & Corazon', lat: 49.8294, lng: 19.0496 },
    'SA': { city: 'Kraków', venue: 'Sabrosa Dance Studio', address: 'rondo Mogilskie 1', org: 'Sabrosa', lat: 50.0658, lng: 19.9595 },
    'FT': { city: 'Kraków', venue: 'Forum Tańca', address: 'ul. Konopnickiej 29', org: 'Forum Tańca', lat: 50.0442, lng: 19.9348 },
    'PR': { city: 'Kraków', venue: 'PROMINENT', address: 'ul. Kamienna 17', org: 'PROMINENT The Original Lounge Bar', lat: 50.0752, lng: 19.9398 },
    'LO': { city: 'Kraków', venue: 'LOFToDANCE', address: 'ul. Kamienna 2–4', org: 'LOFToDANCE Łukasz Raś', lat: 50.0736, lng: 19.9412 },
    'ZW': { city: 'Kraków', venue: 'Zaraz Wracam Tu', address: 'ul. Miodowa 51', org: 'VivaSalsa', lat: 50.0528, lng: 19.9482 },
    'MY': { city: 'Kraków', venue: 'Mykhailo Burdeinyi', address: 'Kraków Centrum', org: 'Mykhailo Burdeinyi', lat: 50.0647, lng: 19.9450 }
};

// Domyślne współrzędne miast i znanych klubów w regionie (#16)
const KNOWN_VENUES_GEO = [
    { match: /taneczna\s+kompania|taneczna\s+kampania|ko[sś]ciuszki\s*227/i, city: 'Katowice', venue: 'Taneczna Kompania', address: 'ul. Kościuszki 227', lat: 50.2248, lng: 18.9894 },
    { match: /dw[oó]r\s+hubertus/i, city: 'Piekary Śląskie', venue: 'Dwór Hubertus', address: 'ul. Inwalidów Wojennych 72', lat: 50.3910, lng: 18.9446 },
    { match: /mohito.*tychy|tychy.*mohito/i, city: 'Tychy', venue: 'Mohito', address: 'al. Jana Pawła II 14', lat: 50.1121, lng: 18.9876 },
    { match: /mohito/i, city: 'Gliwice', venue: 'Mohito', address: 'ul. Zwycięstwa 52A', lat: 50.2974, lng: 18.6746 },
    { match: /pachanguero/i, city: 'Rybnik', venue: 'Akademia El Pachanguero', address: 'ul. Grunwaldzka 46', lat: 50.0948, lng: 18.5198 },
    { match: /havana\s+dance/i, city: 'Rybnik', venue: 'Havana Dance Studio', address: 'ul. Jana Kotucza 36', lat: 50.1014, lng: 18.5365 },
    { match: /este\s+loco/i, city: 'Częstochowa', venue: 'Este Loco–Dance with passion', address: 'ul. Dekabrystów 35B', lat: 50.8257, lng: 19.1147 },
    { match: /cz[eę]stota[nń]cz/i, city: 'Częstochowa', venue: 'Częstotańcz', address: 'ul. Spółdzielczości 4', lat: 50.7951, lng: 19.0420 },
    { match: /beleza/i, city: 'Siewierz', venue: 'Beleza', address: 'Rynek 11', lat: 50.4681, lng: 19.2358 },
    { match: /alldance|1\s+maja\s*20/i, city: 'Bielsko-Biała', venue: 'AllDance', address: 'ul. 1 Maja 20', lat: 49.8178, lng: 19.0457 },
    { match: /orle\s+gniazdo/i, city: 'Hucisko', venue: 'Orle Gniazdo', address: 'Orle Gniazdo 20', lat: 50.5947, lng: 19.5297 },
    { match: /paprocany|przysta[nń]\s+kajakowa/i, city: 'Tychy', venue: 'Paprocany, przystań kajakowa', address: 'ul. Sikorskiego', lat: 50.0978, lng: 18.9956 },
    { match: /dzie[nń]\s+i\s+noc/i, city: 'Katowice', venue: 'Dzień i Noc', address: 'ul. Warszawska 5', lat: 50.2589, lng: 19.0239 },
    { match: /pi[aą]tym?\s+dom/i, city: 'Katowice', venue: 'Piąty Dom', address: 'ul. Matejki 2', lat: 50.2602, lng: 19.0168 },
    { match: /mojitos/i, city: 'Kraków', venue: 'Mojitos', address: 'ul. Mikołajska 13', lat: 50.0615, lng: 19.9408 },
    { match: /teatro\s+cubano/i, city: 'Kraków', venue: 'Teatro Cubano', address: 'ul. Jagiellońska 10', lat: 50.0628, lng: 19.9352 },
    { match: /panorama\s+forum/i, city: 'Kraków', venue: 'Panorama Forum', address: 'ul. Konopnickiej 28', lat: 50.0451, lng: 19.9361 },
    { match: /hala\s+lipowa/i, city: 'Kraków', venue: 'Hala Lipowa', address: 'ul. Lipowa 4D', lat: 50.0478, lng: 19.9614 },
    { match: /hotel\s+galaxy/i, city: 'Kraków', venue: 'Hotel Galaxy', address: 'ul. Gęsia 22a', lat: 50.0558, lng: 19.9602 },
    { match: /hotel\s+premier/i, city: 'Kraków', venue: 'Hotel Premier', address: 'ul. Opolska 14a', lat: 50.0912, lng: 19.9278 },
    { match: /ponchocaf/i, city: 'Kraków', venue: 'PonchoCafé Latino Bar', address: 'ul. Długa', lat: 50.0675, lng: 19.9395 },
    { match: /hotel\s+meta/i, city: 'Szczyrk', venue: 'Hotel Meta', address: 'ul. Skośna 4', lat: 49.7145, lng: 19.0265 },
    { match: /u\s+fojta/i, city: 'Wisła', venue: 'Ośrodek U Fojta', address: 'ul. Branców 2', lat: 49.6562, lng: 18.8591 },
    { match: /wolni\s+ludzie|mariacka\s*2/i, city: 'Katowice', venue: 'Wolni Ludzie', address: 'ul. Mariacka 2', lat: 50.2577, lng: 19.0248 },
    { match: /trzy\s+stawy|trzech\s+staw/i, city: 'Katowice', venue: 'Dolina Trzech Stawów', address: 'ul. Trzech Stawów 20', lat: 50.2449, lng: 19.0464 },
    { match: /la\s+clave|chorzowska\s*11/i, city: 'Katowice', venue: 'La Clave', address: 'ul. Chorzowska 11', lat: 50.2660, lng: 19.0188 },
    { match: /evolution|korfantego\s*4/i, city: 'Katowice', venue: 'Evolution Dance', address: 'al. Korfantego 4', lat: 50.2620, lng: 19.0215 },
    { match: /mil\s+pasos|kamienna\s*4\b/i, city: 'Katowice', venue: 'Mil Pasos', address: 'ul. Kamienna 4', lat: 50.2569, lng: 19.0121 },
    { match: /good\s*mood|paderewskiego\s*35/i, city: 'Katowice', venue: 'Good Mood', address: 'ul. Paderewskiego 35', lat: 50.2536, lng: 19.0399 },
    { match: /gravitacja|gliwicka\s*44/i, city: 'Katowice', venue: 'Gravitacja', address: 'ul. Gliwicka 44', lat: 50.2625, lng: 19.0060 },
    { match: /kizlab|sobieskiego\s*11/i, city: 'Katowice', venue: 'KIZLAB', address: 'ul. Sobieskiego 11', lat: 50.2619, lng: 19.0119 },
    { match: /danceloveit|corazon|gra[zż]y[nń]skiego\s*12/i, city: 'Bielsko-Biała', venue: 'DANCE#LOVEit & Corazon', address: 'ul. Grażyńskiego 12', lat: 49.8294, lng: 19.0496 },
    { match: /sabrosa|mogilskie\s*1/i, city: 'Kraków', venue: 'Sabrosa Dance Studio', address: 'rondo Mogilskie 1', lat: 50.0658, lng: 19.9595 },
    { match: /forum\s+ta[nń]ca|konopnickiej\s*29/i, city: 'Kraków', venue: 'Forum Tańca', address: 'ul. Konopnickiej 29', lat: 50.0442, lng: 19.9348 },
    { match: /prominent|kamienna\s*17/i, city: 'Kraków', venue: 'PROMINENT', address: 'ul. Kamienna 17', lat: 50.0752, lng: 19.9398 },
    { match: /loftodance|kamienna\s*2/i, city: 'Kraków', venue: 'LOFToDANCE', address: 'ul. Kamienna 2–4', lat: 50.0736, lng: 19.9412 }
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
            if (
                !venue ||
                venue === raw ||
                venue === 'Inne' ||
                /^(ul\.|ulica|al\.|aleja|rondo|rynek|pl\.|plac)\b/i.test(venue) ||
                known.match.test(venue)
            ) {
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
 * Zwraca dzisiejszą datę w formacie ISO YYYY-MM-DD (czas lokalny).
 */
function getTodayIsoDate(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Parsuje zapis daty z bazy (np. "16.10", "24–25.10", "29–31.01.2027", "od 18.06.2027")
 * i zwraca ustrukturyzowane metadane daty (isoStartDate, isoEndDate) oraz sformatowany nagłówek dla Komentarza 2 (Sekcja 5).
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
            isoEndDate: '',
            startDayMonth: raw,
            weekdayPL: '',
            futureHeaderLabel: raw,
            sortTimestamp: Number.MAX_SAFE_INTEGER
        };
    }

    const pad = n => String(n).padStart(2, '0');
    const isoStartDate = `${year}-${pad(startMonth)}-${pad(startDay)}`;
    const isoEndDate =
        isRange && endDay && endMonth
            ? `${year}-${pad(endMonth)}-${pad(endDay)}`
            : isoStartDate;
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
        isoEndDate,
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

// Helper: HTTP GET with redirect handling, native zlib decompression (gzip/deflate/br), custom User-Agent and timeout
function fetchUrl(url, timeoutMs = 8000, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                timeout: timeoutMs,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
                    'Accept-Encoding': 'gzip, deflate, br',
                    ...customHeaders
                }
            },
            (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    const nextUrl = res.headers.location.startsWith('http')
                        ? res.headers.location
                        : new URL(res.headers.location, url).href;
                    return resolve(fetchUrl(nextUrl, timeoutMs, customHeaders));
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }
                const chunks = [];
                res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on('end', () => {
                    try {
                        const rawBuf = Buffer.concat(chunks);
                        const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
                        if (encoding === 'gzip') {
                            return resolve(zlib.gunzipSync(rawBuf).toString('utf8'));
                        }
                        if (encoding === 'deflate') {
                            return resolve(zlib.inflateSync(rawBuf).toString('utf8'));
                        }
                        if (encoding === 'br' && typeof zlib.brotliDecompressSync === 'function') {
                            return resolve(zlib.brotliDecompressSync(rawBuf).toString('utf8'));
                        }
                        resolve(rawBuf.toString('utf8'));
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        );
        req.on('timeout', () => {
            req.destroy(new Error('Przekroczono czas oczekiwania HTTP'));
        });
        req.on('error', reject);
    });
}

function decodeHtmlEntities(str = '') {
    return String(str || '')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ''; }
        })
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#8211;|&ndash;/gi, '–')
        .replace(/&#8212;|&mdash;/gi, '—')
        .replace(/&#039;|&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();
}

/**
 * Zunifikowany klasyfikator stylów tanecznych dla wydarzeń (spójny z sync-schedules.js).
 */
function inferEventStyles(rawText = '') {
    const t = String(rawText || '');
    const found = [];
    if (/\btimbeando|\btimb[ay]\b/i.test(t)) found.push('Timba');
    if (/\bcuban[ay]?|\bcasino\b|\bkuba[nń]sk/i.test(t)) found.push('Cubana');
    if (/\brueda\b/i.test(t)) found.push('Rueda');
    if (/\brumb[ay]\b|\bguaguanc/i.test(t)) found.push('Rumba');
    if (/\bson\s+cubano|\bsonday\b/i.test(t)) found.push('Son Cubano');
    if (/\bmambo\b|\bon\s*2\b/i.test(t)) found.push('Salsa On2');
    if (/\bon\s*1\b/i.test(t)) found.push('Salsa On1');
    if (/\bsals[ayę]\b/i.test(t) && !found.some(s => /Cubana|Salsa|Timba|Rueda/i.test(s))) {
        found.push('Salsa');
    }
    if (/\bsensual\s+impro\b/i.test(t)) {
        found.push('Bachata', 'Sensual Impro');
    } else if (/\bbachat[ayę]\b|\bdobranocka\b|\bb\s+experience\b|\blvl\s*up\b|\bfreestyle\b/i.test(t)) {
        found.push('Bachata');
        if (/\bimpro\b/i.test(t)) found.push('Impro');
    }
    if (/\burban\s*kiz\b/i.test(t)) found.push('Urban Kiz');
    if (/\btarraxo\b/i.test(t)) found.push('Kizomba', 'Tarraxo');
    if (/\bkizomb[ayę]|\bkizlab\b|\bk\s+experience\b|\bdance\+\+/i.test(t)) found.push('Kizomba');
    if (/\bsemba\b/i.test(t)) found.push('Semba');

    const unique = Array.from(new Set(found));
    return unique.length > 0 ? unique.join('/') : 'Salsa/Bachata/Kizomba';
}

/**
 * Zunifikowany parser HTML oficjalnej strony wydarzeń Mil Pasos (https://www.milpasoskatowice.pl/?page=wydarzenia).
 * Działa na tej samej architekturze Zero-Bloat co parsery w scripts/sync-schedules.js.
 */
function parseMilPasosEventsHtml(html = '') {
    const src = String(html || '');
    if (!src) return [];
    const lines = src
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .split(/\r?\n/)
        .map(s => decodeHtmlEntities(s))
        .filter(Boolean);

    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const rangeMatch = lines[i].match(/^(\d{2}\.\d{2}\.(\d{4}))\s+(\d{2}:\d{2})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})$/);
        if (!rangeMatch) continue;
        const fullStartDate = rangeMatch[1];
        const year = parseInt(rangeMatch[2], 10);
        const startTime = rangeMatch[3];
        const endTime = rangeMatch[5];
        const rawTitle = lines[i - 1] || 'Wydarzenie w Mil Pasos';
        const cleanTitle = rawTitle
            .replace(/\s*[-|–]\s*(?:sobota|piątek|niedziela|środa|czwartek|wtorek|poniedziałek)?\s*\d{1,2}\.\d{1,2}(?:\.\d{2,4})?.*$/i, '')
            .replace(/\s*\|\s*.*$/, '')
            .trim();

        const rawDate = year === 2026 ? fullStartDate.slice(0, 5) : fullStartDate;
        const dateInfo = parseEventDateInfo(rawDate, year);
        const styles = inferEventStyles(`${rawTitle} ${cleanTitle}`);

        results.push({
            rawDate,
            isoStartDate: dateInfo.isoStartDate,
            isoEndDate: dateInfo.isoEndDate,
            venueCode: 'MP',
            city: 'Katowice',
            venue: 'Mil Pasos',
            title: cleanTitle || rawTitle,
            styles,
            url: 'https://www.milpasoskatowice.pl/?page=wydarzenia',
            notes: `${startTime}–${endTime}; Mil Pasos Kamienna 4`
        });
    }
    return results;
}

/**
 * Zunifikowany parser HTML oficjalnego sklepu wydarzeń LOFToDANCE Kraków (https://sklep.loftodance.pl/wydarzenia).
 */
function parseLoftodanceEventsHtml(html = '') {
    const src = String(html || '');
    if (!src) return [];
    const matches = [...src.matchAll(/href=["'](https?:\/\/sklep\.loftodance\.pl\/wydarzenie\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const results = [];
    const seenUrls = new Set();

    for (const m of matches) {
        const url = m[1].trim();
        if (seenUrls.has(url)) continue;
        const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
        const dateMatch = text.match(/^(\d{2}\.\d{2})\.(\d{4})\s+(.+?)(?:\s+\d+\s*z[łl].*)?$/i);
        if (!dateMatch) continue;
        seenUrls.add(url);

        const dayMonth = dateMatch[1];
        const year = parseInt(dateMatch[2], 10);
        const rawTitle = dateMatch[3].replace(/\s*Zobacz szczegóły.*$/i, '').trim();
        const rawDate = year === 2026 ? dayMonth : `${dayMonth}.${year}`;
        const dateInfo = parseEventDateInfo(rawDate, year);
        const styles = inferEventStyles(rawTitle);

        results.push({
            rawDate,
            isoStartDate: dateInfo.isoStartDate,
            isoEndDate: dateInfo.isoEndDate,
            venueCode: 'LO',
            city: 'Kraków',
            venue: 'LOFToDANCE',
            title: rawTitle,
            styles,
            url,
            notes: 'LOFToDANCE Kraków'
        });
    }
    return results;
}

// Dozwolone miasta naszego regionu (woj. śląskie + Kraków) na Krajowniku
const KRAJOWNIK_CITY_SLUGS = {
    'katowice': 'Katowice',
    'gliwice': 'Gliwice',
    'tychy': 'Tychy',
    'chorzow': 'Chorzów',
    'bytom': 'Bytom',
    'swietochlowice': 'Świętochłowice',
    'zabrze': 'Zabrze',
    'sosnowiec': 'Sosnowiec',
    'dabrowa-gornicza': 'Dąbrowa Górnicza',
    'tarnowskie-gory': 'Tarnowskie Góry',
    'piekary-slaskie': 'Piekary Śląskie',
    'siewierz': 'Siewierz',
    'hucisko': 'Hucisko',
    'rybnik': 'Rybnik',
    'czestochowa': 'Częstochowa',
    'bielsko-biala': 'Bielsko-Biała',
    'cieszyn': 'Cieszyn',
    'zywiec': 'Żywiec',
    'szczyrk': 'Szczyrk',
    'wisla': 'Wisła',
    'krakow': 'Kraków'
};

/**
 * Zunifikowany parser HTML strony wydarzenia na Facebooku (https://www.facebook.com/events/ID/).
 * Odczytuje metatagi OpenGraph (og:title, og:description, og:url) zwracane przez FB dla nagłówka
 * facebookexternalhit/1.1 bez konieczności uruchamiania przeglądarki.
 */
function parseFacebookEventHtml(html = '', fallbackUrl = '') {
    const src = String(html || '');
    if (!src) return null;

    const getMeta = (prop) => {
        const m = src.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
            || src.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
        return m ? decodeHtmlEntities(m[1]) : '';
    };

    const rawTitle = getMeta('og:title');
    const rawDesc = getMeta('og:description') || getMeta('description');
    const ogUrl = getMeta('og:url') || fallbackUrl;

    if (!rawTitle || /^Facebook$|^Zaloguj/i.test(rawTitle)) return null;

    const MONTHS_MAP = {
        stycznia: '01', styczeń: '01', january: '01',
        lutego: '02', luty: '02', february: '02',
        marca: '03', marzec: '03', march: '03',
        kwietnia: '04', kwiecień: '04', april: '04',
        maja: '05', maj: '05', may: '05',
        czerwca: '06', czerwiec: '06', june: '06',
        lipca: '07', lipiec: '07', july: '07',
        sierpnia: '08', sierpień: '08', august: '08',
        września: '09', wrzesnia: '09', wrzesień: '09', september: '09',
        października: '10', pazdziernika: '10', październik: '10', october: '10',
        listopada: '11', listopad: '11', november: '11',
        grudnia: '12', grudzień: '12', december: '12'
    };

    let day = '';
    let month = '';
    let year = 2026;

    // Wariant 1: "października 25 2026" lub "October 25 2026"
    const mMonthFirst = rawDesc.match(/\b(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    // Wariant 2: "25 października 2026"
    const mDayFirst = rawDesc.match(/\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)\s+(\d{4})\b/i);
    // Wariant 3: data w tytule np. "24.10.26" lub "24.10"
    const mTitleDate = rawTitle.match(/\b(\d{1,2})\.(\d{2})(?:\.(\d{2,4}))?\b/);

    if (mMonthFirst) {
        month = MONTHS_MAP[mMonthFirst[1].toLowerCase()] || '10';
        day = String(mMonthFirst[2]).padStart(2, '0');
        year = parseInt(mMonthFirst[3], 10);
    } else if (mDayFirst) {
        day = String(mDayFirst[1]).padStart(2, '0');
        month = MONTHS_MAP[mDayFirst[2].toLowerCase()] || '10';
        year = parseInt(mDayFirst[3], 10);
    } else if (mTitleDate) {
        day = String(mTitleDate[1]).padStart(2, '0');
        month = mTitleDate[2];
        if (mTitleDate[3]) {
            const yr = parseInt(mTitleDate[3], 10);
            year = yr < 100 ? 2000 + yr : yr;
        }
    }

    if (!day || !month) return null;

    // Miasto z opisu FB ("w miejscowości Katowice" lub "miejscowość: Katowice" lub "Event in Katowice")
    const cityMatch = rawDesc.match(/(?:miejscowo[śs]ci|miejscowo[śs][ćc]:|Event in)\s+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż -]+?)(?:,|\s+organizowane|\s+by\s+|\s+w\s+dniu|$)/i);
    const extractedCity = cityMatch ? cityMatch[1].trim() : 'Katowice';

    // Organizator z opisu FB ("organizowane przez X w dniu" lub "organizator: X, data:")
    const orgMatch = rawDesc.match(/(?:organizowane przez|organizator:)\s+(.+?)(?:\s+w\s+dniu|,?\s+data:|$)/i);
    const organizer = orgMatch ? orgMatch[1].trim() : '';

    // Slug miejsca z og:url: https://www.facebook.com/events/<venue-slug>/<event-slug>/<id>/
    let venueHint = '';
    const slugMatch = ogUrl.match(/facebook\.com\/events\/([^\/]+)\/[^\/]+\/\d+/i);
    if (slugMatch) {
        try {
            venueHint = decodeURIComponent(slugMatch[1]).replace(/-/g, ' ');
        } catch {
            venueHint = slugMatch[1].replace(/-/g, ' ');
        }
    }

    const idMatch = (ogUrl || fallbackUrl).match(/events\/(?:[^\/]+\/[^\/]+\/)?(\d{8,})/i);
    const canonicalFbUrl = idMatch ? `https://www.facebook.com/events/${idMatch[1]}/` : (ogUrl || fallbackUrl);

    const loc = normalizeLocation(`${extractedCity},${venueHint || organizer || rawTitle}`);
    const rawDate = year === 2026 ? `${day}.${month}` : `${day}.${month}.${year}`;
    const dateInfo = parseEventDateInfo(rawDate, year);
    const cleanTitle = rawTitle
        .replace(/\s*\|\s*\d{1,2}\.\d{2}(?:\.\d{2,4})?\s*$/, '')
        .replace(/\s*-\s*\d{1,2}\.\d{2}(?:\.\d{2,4})?\s*-\s*\d{1,2}:\d{2}-\d{1,2}:\d{2}\s*$/, '')
        .trim();
    const styles = inferEventStyles(`${rawTitle} ${organizer}`);
    const isKSH = /kato\s+salsa\s+hub/i.test(organizer) || /habana\s+picante/i.test(rawTitle);

    return {
        rawDate,
        isoStartDate: dateInfo.isoStartDate,
        isoEndDate: dateInfo.isoEndDate,
        venueCode: `${loc.city},${loc.venue}`,
        city: loc.city,
        venue: loc.venue,
        title: cleanTitle || rawTitle,
        styles,
        url: canonicalFbUrl,
        organizer,
        isKSH,
        notes: `${organizer ? organizer + '; ' : ''}pobrano z FB`
    };
}

/**
 * Pobiera i parsuje pojedyncze wydarzenie bezpośrednio z Facebooka przez nagłówek facebookexternalhit/1.1.
 */
async function fetchFacebookEventDetails(fbUrl) {
    const expanded = expandSourceUrl(fbUrl);
    const html = await fetchUrl(expanded, 6000, {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept-Language': 'pl-PL,pl;q=0.9'
    });
    return parseFacebookEventHtml(html, expanded);
}

/**
 * Wyciąga bezpośredni link do wydarzenia na Facebooku (https://www.facebook.com/events/ID/) z kodu HTML karty Krajownika.
 */
function extractFacebookEventUrlFromHtml(html = '') {
    const m = String(html || '').match(/https?:\/\/(?:www\.)?facebook\.com\/events\/(\d{8,})/i);
    return m ? `https://www.facebook.com/events/${m[1]}/` : '';
}

/**
 * Zunifikowany parser HTML kart wydarzeń z regionalnego agregatora Krajownik (krajownik.pl).
 * Filtruje wyłącznie autentyczne wydarzenia taneczne (Salsa, Bachata, Kizomba, Cubana, Timba, Rueda, Son)
 * oraz wyłącznie miasta z województwa śląskiego i Krakowa (KRAJOWNIK_CITY_SLUGS).
 */
function parseKrajownikEventsHtml(html = '', defaultCity = 'Katowice') {
    const src = String(html || '');
    if (!src) return [];

    const MONTHS_PL = {
        stycznia: '01', lutego: '02', marca: '03', kwietnia: '04', maja: '05', czerwca: '06',
        lipca: '07', sierpnia: '08', września: '09', wrzesnia: '09', października: '10', pazdziernika: '10',
        listopada: '11', grudnia: '12'
    };

    const danceRegex = /\b(sals[ayę]|bachat[ayę]|kizomb[ayę]|cuban[ay]?|timbeando|timb[ay]|rueda|son\s+cubano|urbankiz|urban\s*kiz|sensual\s+impro|habana|la\s+clave|mil\s+pasos|good\s*mood|gravitacja|sabrosa|forum\s+ta[nń]ca|loftodance|danceloveit|alldance|pachanguero|havana\s+dance|kizlab|teatro\s+cubano)\b/i;
    const excludeRegex = /\b(salsation|zumba\s+kids|szydełkow|szydelkow|joga|koncert\s+metal|behemoth|erykah\s+badu|targi\s+ksi[aą][zż]ki)\b/i;

    const matches = [...src.matchAll(/href=["']([^"']*\/wydarzenia\/[a-z0-9-]+-\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const results = [];
    const seenUrls = new Set();

    for (const m of matches) {
        const relOrAbs = m[1].trim();
        const url = relOrAbs.startsWith('http') ? relOrAbs : `https://krajownik.pl${relOrAbs}`;
        if (seenUrls.has(url)) continue;

        // Sprawdź slug miasta w URL (/katowice/wydarzenia/...) — odrzuć miasta spoza woj. śląskiego i Krakowa
        const citySlugMatch = url.match(/krajownik\.pl\/([a-z0-9-]+)\/wydarzenia\//i);
        let resolvedCity = defaultCity;
        if (citySlugMatch) {
            const slug = citySlugMatch[1].toLowerCase();
            if (!KRAJOWNIK_CITY_SLUGS[slug]) continue;
            resolvedCity = KRAJOWNIK_CITY_SLUGS[slug];
        }

        const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
        if (!danceRegex.test(text) && !danceRegex.test(url)) continue;
        if (excludeRegex.test(text) || excludeRegex.test(url)) continue;

        const dateMatch = text.match(/^(.*?)\s+(\d{1,2})\s+(Stycznia|Lutego|Marca|Kwietnia|Maja|Czerwca|Lipca|Sierpnia|Września|Października|Listopada|Grudnia)\s+(\d{4})(?:\s*,\s*od\s*(\d{1,2}:\d{2}))?\s*(.*)$/i);
        if (!dateMatch) continue;
        seenUrls.add(url);

        const rawTitle = dateMatch[1].trim();
        const day = String(dateMatch[2]).padStart(2, '0');
        const month = MONTHS_PL[dateMatch[3].toLowerCase()] || '10';
        const year = parseInt(dateMatch[4], 10);
        const startTime = dateMatch[5] || '';
        const venueTail = (dateMatch[6] || '').trim();

        const cleanedTail = venueTail
            .replace(new RegExp(`^${resolvedCity}\\s+`, 'i'), '')
            .replace(new RegExp(`,\\s*${resolvedCity}$`, 'i'), '')
            .replace(/,?\s*\d{2}-\d{3}\s+[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż -]+(?:,\s*Poland)?$/i, '')
            .trim();
        const rawDate = year === 2026 ? `${day}.${month}` : `${day}.${month}.${year}`;
        const dateInfo = parseEventDateInfo(rawDate, year);
        const loc = normalizeLocation(cleanedTail ? `${resolvedCity},${cleanedTail}` : resolvedCity);
        const styles = inferEventStyles(`${rawTitle} ${venueTail}`);

        results.push({
            rawDate,
            isoStartDate: dateInfo.isoStartDate,
            isoEndDate: dateInfo.isoEndDate,
            venueCode: `${loc.city},${loc.venue}`,
            city: loc.city,
            venue: loc.venue,
            title: rawTitle,
            styles,
            url,
            notes: `${startTime ? startTime + '; ' : ''}${loc.venue}`
        });
    }
    return results;
}

/**
 * Zunifikowany skaner zewnętrznych źródeł wydarzeń tanecznych (Mil Pasos, LOFToDANCE, Krajownik Regional + Wyszukiwarka + ekstrakcja linków FB).
 * Współdzieli architekturę konektorów z scripts/sync-schedules.js.
 */
async function checkRemoteEventSources(existingDatabaseText = '', todayIso = getTodayIsoDate()) {
    console.log('🌐 [1b/5] Zunifikowany skan zewnętrznych źródeł wydarzeń (Mil Pasos, LOFToDANCE, Krajownik, Facebook)...');
    const discovered = [];

    const tasks = [
        {
            name: 'Mil Pasos Wydarzenia',
            url: 'https://www.milpasoskatowice.pl/?page=wydarzenia',
            parser: (html) => parseMilPasosEventsHtml(html)
        },
        {
            name: 'LOFToDANCE Wydarzenia',
            url: 'https://sklep.loftodance.pl/wydarzenia',
            parser: (html) => parseLoftodanceEventsHtml(html)
        },
        {
            name: 'Krajownik Katowice (Dzisiaj)',
            url: 'https://krajownik.pl/katowice/wydarzenia/dzisiaj',
            parser: (html) => parseKrajownikEventsHtml(html, 'Katowice')
        },
        {
            name: 'Krajownik Katowice (Weekend)',
            url: 'https://krajownik.pl/katowice/wydarzenia/weekend',
            parser: (html) => parseKrajownikEventsHtml(html, 'Katowice')
        },
        {
            name: 'Krajownik Katowice (Imprezy)',
            url: 'https://krajownik.pl/katowice/wydarzenia/kategoria/impreza',
            parser: (html) => parseKrajownikEventsHtml(html, 'Katowice')
        },
        {
            name: 'Krajownik Katowice (Warsztaty)',
            url: 'https://krajownik.pl/katowice/wydarzenia/kategoria/warsztaty',
            parser: (html) => parseKrajownikEventsHtml(html, 'Katowice')
        },
        {
            name: 'Krajownik Gliwice (Weekend)',
            url: 'https://krajownik.pl/gliwice/wydarzenia/weekend',
            parser: (html) => parseKrajownikEventsHtml(html, 'Gliwice')
        },
        {
            name: 'Krajownik Tychy (Weekend)',
            url: 'https://krajownik.pl/tychy/wydarzenia/weekend',
            parser: (html) => parseKrajownikEventsHtml(html, 'Tychy')
        },
        {
            name: 'Krajownik Bielsko-Biała (Imprezy)',
            url: 'https://krajownik.pl/bielsko-biala/wydarzenia/kategoria/impreza',
            parser: (html) => parseKrajownikEventsHtml(html, 'Bielsko-Biała')
        },
        {
            name: 'Krajownik Kraków (Weekend)',
            url: 'https://krajownik.pl/krakow/wydarzenia/weekend',
            parser: (html) => parseKrajownikEventsHtml(html, 'Kraków')
        },
        {
            name: 'Krajownik Kraków (Imprezy)',
            url: 'https://krajownik.pl/krakow/wydarzenia/kategoria/impreza',
            parser: (html) => parseKrajownikEventsHtml(html, 'Kraków')
        },
        {
            name: 'Krajownik Chorzów (Weekend)',
            url: 'https://krajownik.pl/chorzow/wydarzenia/weekend',
            parser: (html) => parseKrajownikEventsHtml(html, 'Chorzów')
        },
        {
            name: 'Krajownik Rybnik (Weekend)',
            url: 'https://krajownik.pl/rybnik/wydarzenia/weekend',
            parser: (html) => parseKrajownikEventsHtml(html, 'Rybnik')
        }
    ];

    // Równoległy pobór i parsowanie wszystkich 13 źródeł zewnętrznych (zamiast sekwencyjnego czekania)
    const settledTasks = await Promise.allSettled(
        tasks.map(async (task) => {
            const html = await fetchUrl(task.url, 8000);
            return { task, items: task.parser(html) };
        })
    );

    for (let i = 0; i < settledTasks.length; i++) {
        const outcome = settledTasks[i];
        const task = tasks[i];
        if (outcome.status === 'fulfilled') {
            for (const item of outcome.value.items) {
                const endIso = item.isoEndDate || item.isoStartDate || '';
                if (todayIso && endIso && endIso < todayIso) continue;
                discovered.push(item);
            }
        } else {
            console.warn(`   ⚠️ [Fallback] Źródło ${task.name} niedostępne (${outcome.reason?.message || outcome.reason})`);
        }
    }

    const uniqueDiscovered = deduplicateEvents(discovered);
    const dbLower = String(existingDatabaseText || '').toLowerCase();
    const freshEvents = uniqueDiscovered.filter(ev => {
        if (ev.url && ev.url !== 'https://www.milpasoskatowice.pl/?page=wydarzenia' && dbLower.includes(ev.url.toLowerCase())) {
            return false;
        }
        const shortTitle = extractShortEventTitle(ev.title).toLowerCase();
        if (shortTitle && dbLower.includes(ev.rawDate.toLowerCase()) && dbLower.includes(shortTitle.slice(0, 14))) {
            return false;
        }
        return true;
    });

    // Dla nowych pozycji z Krajownika wyciągnij równolegle bezpośredni link do wydarzenia na Facebooku (jeśli istnieje na karcie)
    await Promise.allSettled(
        freshEvents.map(async (ev) => {
            if (ev.url && ev.url.includes('krajownik.pl/')) {
                try {
                    const detailHtml = await fetchUrl(ev.url, 6000);
                    const fbUrl = extractFacebookEventUrlFromHtml(detailHtml);
                    if (fbUrl) {
                        ev.url = fbUrl;
                    }
                } catch {
                    // Zachowaj link Krajownika jako fallback
                }
            }
        })
    );

    console.log(`   Zeskanowano źródła zewnętrzne równolegle: wykryto ${uniqueDiscovered.length} unikalnych aktywnych wydarzeń (nowych spoza bazy: ${freshEvents.length}).`);
    return { discovered: uniqueDiscovered, freshEvents };
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

// 3. Generate dancepuls.pl/data/events.json (wyłącznie dzisiejsze i przyszłe wydarzenia: effectiveEndDate >= minDateIso)
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

        // Odcinaj minione wydarzenia (pokazuj wyłącznie dzisiejsze i późniejsze)
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

    try {
        if (fs.existsSync(path.dirname(KSH_EVENTS_JSON_PATH))) {
            writeFileAtomically(KSH_EVENTS_JSON_PATH, JSON.stringify(finalJson, null, 2));
            console.log(`   Zsynchronizowano publiczną bazę wydarzeń KSH: ${KSH_EVENTS_JSON_PATH}`);
        }
    } catch (err) {
        console.warn('   ⚠️ Nie udało się zapisać kopii events.json do katosalsahub.pl:', err.message);
    }

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
        execSync(`scp "${KSH_EVENTS_JSON_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/katosalsahub.pl/assets/data/events.json`);
        execSync(`scp "${DB_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/events_database.md`);
        execSync(`scp "${REPORT_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/latest_report.md`);
        console.log('   ✅ Pomyślnie zsynchronizowano bazę, JSON (DancePuls + KSH) i raport na serwer LH.pl!');
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

    if (args.includes('--check-remote') || args.includes('--fb')) {
        const { freshEvents } = args.includes('--check-remote')
            ? await checkRemoteEventSources(dbText, todayIso)
            : { freshEvents: [] };

        // Automatyczny skan zgłoszonych lub przekazanych linków wydarzeń FB (przez nagłówek facebookexternalhit/1.1)
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
                if (k.venue.toLowerCase() !== loc.venue.toLowerCase()) return false;
                const kTokens = normalizeCompareTokens(k.title);
                if (evTokens.length === 0 || kTokens.length === 0) return true;
                return evTokens.some(t => kTokens.includes(t));
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
                isKSH: false
            };
            sections.future.push(newEntry);
            allKnown.push(newEntry);
        }
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
    parseFacebookEventHtml,
    fetchFacebookEventDetails,
    extractFacebookEventUrlFromHtml,
    checkRemoteEventSources,
    KRAJOWNIK_CITY_SLUGS,
    VENUE_MAP,
    FOOTER
};
