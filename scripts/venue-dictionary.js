/**
 * KATO SALSA HUB & DANCEPULS — SŁOWNIK LOKALIZACJI, KLUBÓW I WSPÓŁRZĘDNYCH GPS (SSOT)
 *
 * Moduł wyodrębniony z silnika sync_engine.js:
 * - VENUE_MAP (skróty klubów i szkół: LC, EV, MP, GM, TK, GR, KL, TS, WL, DL, SA, FT, PR, LO, ZW, MY)
 * - KNOWN_VENUES_GEO (automatyczne rozpoznawanie adresów i klubów w woj. śląskim i Krakowie)
 * - CITY_DEFAULT_COORDS (domyślne współrzędne miast regionu)
 * - normalizeLocation / normalizeStreetAddress / expandSourceUrl
 */

'use strict';

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

const KNOWN_VENUES_GEO = [
    { match: /taneczna\s+kompania|taneczna\s+kampania|ko[sś]ciuszki\s*227/i, city: 'Katowice', venue: 'Taneczna Kompania', address: 'ul. Kościuszki 227', lat: 50.2248, lng: 18.9894 },
    { match: /dw[oó]r\s+hubertus/i, city: 'Piekary Śląskie', venue: 'Dwór Hubertus', address: 'ul. Inwalidów Wojennych 72', lat: 50.3910, lng: 18.9446 },
    { match: /mohito.*tychy|tychy.*mohito|jana\s+paw[lł]a\s*ii\s*14/i, city: 'Tychy', venue: 'Mohito', address: 'al. Jana Pawła II 14', lat: 50.1121, lng: 18.9876 },
    { match: /mohito|zwyci[eę]stwa\s*52a|wojciech\s+filiciak/i, city: 'Gliwice', venue: 'Mohito', address: 'ul. Zwycięstwa 52A', lat: 50.2974, lng: 18.6746 },
    { match: /pachanguero/i, city: 'Rybnik', venue: 'Akademia El Pachanguero', address: 'ul. Grunwaldzka 46', lat: 50.0948, lng: 18.5198 },
    { match: /havana\s+dance/i, city: 'Rybnik', venue: 'Havana Dance Studio', address: 'ul. Jana Kotucza 36', lat: 50.1014, lng: 18.5365 },
    { match: /este\s+loco/i, city: 'Częstochowa', venue: 'Este Loco–Dance with passion', address: 'ul. Dekabrystów 35B', lat: 50.8257, lng: 19.1147 },
    { match: /cz[eę]stota[nń]cz|sp[oó][lł]dzielczo[sś]ci\s*4/i, city: 'Częstochowa', venue: 'Częstotańcz', address: 'ul. Spółdzielczości 4', lat: 50.7951, lng: 19.0420 },
    { match: /beleza|rynek\s*11\b/i, city: 'Siewierz', venue: 'Beleza', address: 'Rynek 11', lat: 50.4681, lng: 19.2358 },
    { match: /w\s+starym\s+kinie|alojzjan[oó]w\s*27/i, city: 'Bytom', venue: 'Restauracja W Starym Kinie', address: 'ul. Alojzjanów 27', lat: 50.3484, lng: 18.9157 },
    { match: /alldance|1\s+maja\s*20/i, city: 'Bielsko-Biała', venue: 'AllDance', address: 'ul. 1 Maja 20', lat: 49.8178, lng: 19.0457 },
    { match: /orle\s+gniazdo|feeltheflow/i, city: 'Hucisko', venue: 'Orle Gniazdo', address: 'Orle Gniazdo 20', lat: 50.5947, lng: 19.5297 },
    { match: /paprocany|przysta[nń]\s+kajakowa/i, city: 'Tychy', venue: 'Paprocany, przystań kajakowa', address: 'ul. Sikorskiego', lat: 50.0978, lng: 18.9956 },
    { match: /dzie[nń]\s+i\s+noc|warszawska\s*5/i, city: 'Katowice', venue: 'Dzień i Noc', address: 'ul. Warszawska 5', lat: 50.2589, lng: 19.0239 },
    { match: /pi[aą]tym?\s+dom|matejki\s*2/i, city: 'Katowice', venue: 'Piąty Dom', address: 'ul. Matejki 2', lat: 50.2602, lng: 19.0168 },
    { match: /mojitos|miko[lł]ajska\s*13/i, city: 'Kraków', venue: 'Mojitos', address: 'ul. Mikołajska 13', lat: 50.0615, lng: 19.9408 },
    { match: /teatro\s+cubano|jagiello[nń]ska\s*10/i, city: 'Kraków', venue: 'Teatro Cubano', address: 'ul. Jagiellońska 10', lat: 50.0628, lng: 19.9352 },
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
    { match: /salsa\s+house|zamoyskiego\s*79/i, city: 'Kraków', venue: 'Salsa House', address: 'ul. Jana Zamoyskiego 79A/3', lat: 50.0389, lng: 19.9412 },
    { match: /party\s+house|szewska\s*21/i, city: 'Kraków', venue: 'Party House', address: 'ul. Szewska 21', lat: 50.0632, lng: 19.9360 },
    { match: /prominent|kamienna\s*17/i, city: 'Kraków', venue: 'PROMINENT', address: 'ul. Kamienna 17', lat: 50.0752, lng: 19.9398 },
    { match: /loftodance|kamienna\s*2/i, city: 'Kraków', venue: 'LOFToDANCE', address: 'ul. Kamienna 2–4', lat: 50.0736, lng: 19.9412 },
    { match: /stylowa\s+willa|willi\s+styl|dworcowa\s*8|plons\.pl/i, city: 'Świętochłowice', venue: 'Stylowa Willa', address: 'ul. Dworcowa 8', lat: 50.2925, lng: 18.9182 },
    { match: /euforma|fabryka\s+flou/i, city: 'Katowice', venue: 'Euforma (Fabryka FloU)', address: 'ul. Bocheńskiego 69', lat: 50.2682, lng: 18.9721 },
    { match: /borowickiej\s*1|frenzyshot/i, city: 'Kraków', venue: 'Frenzy (ul. Borowickiej 1)', address: 'ul. Iwony Borowickiej 1', lat: 50.0681, lng: 19.9562 },
    { match: /klub\s+studio|budryka\s*4/i, city: 'Kraków', venue: 'Klub Studio', address: 'ul. Budryka 4', lat: 50.0687, lng: 19.9042 },
    { match: /zaraz\s+wracam\s+tu|vivasalsa|miodowa\s*51/i, city: 'Kraków', venue: 'Zaraz Wracam Tu', address: 'ul. Miodowa 51', lat: 50.0528, lng: 19.9482 }
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

module.exports = {
    VENUE_MAP,
    KNOWN_VENUES_GEO,
    CITY_DEFAULT_COORDS,
    KRAJOWNIK_CITY_SLUGS,
    expandSourceUrl,
    normalizeStreetAddress,
    normalizeLocation
};
