/**
 * KATO SALSA HUB & DANCEPULS — ZUNIFIKOWANE KONEKTORY ZEWNĘTRZNYCH ŹRÓDEŁ WYDARZEŃ
 *
 * Moduł wyodrębniony z silnika sync_engine.js:
 * - Mil Pasos Katowice (milpasoskatowice.pl/?page=wydarzenia)
 * - LOFToDANCE Kraków (sklep.loftodance.pl/wydarzenia)
 * - Sabaki.dance (sabaki.dance/events/Katowice, /events/Krakow)
 * - OnlyDance (onlydanceapp.com/events/katowice, /events/krakow)
 * - AirDancia (airdancia.com/sociales/pl22a/bachata/)
 * - Krajownik Regional & Organizatorzy (krajownik.pl)
 * - Facebook Events OpenGraph (facebookexternalhit/1.1)
 */

'use strict';

const https = require('node:https');
const zlib = require('node:zlib');
const {
    KNOWN_VENUES_GEO,
    KRAJOWNIK_CITY_SLUGS,
    expandSourceUrl,
    normalizeLocation
} = require('./venue-dictionary.js');

const WEEKDAYS_PL = ['NIEDZIELA', 'PONIEDZIAŁEK', 'WTOREK', 'ŚRODA', 'CZWARTEK', 'PIĄTEK', 'SOBOTA'];

function getTodayIsoDate(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseEventDateInfo(rawDate, defaultYear = 2026) {
    const raw = (rawDate || '').trim();
    const isOpenEnded = /^od\s*/i.test(raw);
    const cleaned = raw.replace(/^od\s*/i, '').trim();

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

function extractShortEventTitle(title) {
    if (!title || typeof title !== 'string') return '';
    const firstPart = title.split(',')[0].trim();
    return firstPart.replace(/\s+/g, ' ');
}

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
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#8211;|&ndash;/gi, '–')
        .replace(/&#8212;|&mdash;/gi, '—')
        .replace(/&#039;|&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();
}

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
        const rangeMatch = lines[i].match(/^(\d{2}\.\d{2}\.(\d{4}))\s+(\d{2}:\d{2})(?:\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}))?$/);
        if (!rangeMatch) continue;
        const fullStartDate = rangeMatch[1];
        const year = parseInt(rangeMatch[2], 10);
        const startTime = rangeMatch[3];
        const endTime = rangeMatch[5] || '';
        const rawTitle = lines[i - 1] || 'Wydarzenie w Mil Pasos';
        if (/\b(zaj[eę]cia\s+regularne|zapisy\s+na\s+kurs|kurs\s+od\s+zera|darmowe\s+zaj[eę]cia\s+pokazowe)\b/i.test(rawTitle)) {
            continue;
        }
        const cleanTitle = rawTitle
            .replace(/\s*(?:[-|–]|\b(?:sobota|piątek|niedziela|środa|czwartek|wtorek|poniedziałek))\s*(?:sobota|piątek|niedziela|środa|czwartek|wtorek|poniedziałek)?\s*\d{1,2}\.\d{1,2}(?:\.\d{2,4})?.*$/i, '')
            .replace(/\s*\|\s*.*$/, '')
            .trim();

        const descSnippet = lines.slice(i + 1, i + 12).join(' ');
        const rawDate = year === 2026 ? fullStartDate.slice(0, 5) : fullStartDate;
        const dateInfo = parseEventDateInfo(rawDate, year);
        const styles = inferEventStyles(`${rawTitle} ${cleanTitle} ${descSnippet}`);

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
            notes: `${endTime ? `${startTime}–${endTime}` : startTime}; Mil Pasos Kamienna 4`
        });
    }
    return results;
}

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

    const mMonthFirst = rawDesc.match(/\b(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    const mDayFirst = rawDesc.match(/\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)\s+(\d{4})\b/i);
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

    const cityMatch = rawDesc.match(/(?:miejscowo[śs]ci|miejscowo[śs][ćc]:|Event in)\s+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż -]+?)(?:,|\s+organizowane|\s+by\s+|\s+w\s+dniu|$)/i);
    const extractedCity = cityMatch ? cityMatch[1].trim() : '';

    const orgMatch = rawDesc.match(/(?:organizowane przez|organizator:)\s+(.+?)(?:\s+w\s+dniu|,?\s+data:|$)/i);
    const organizer = orgMatch ? orgMatch[1].trim() : '';

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

    const locInput = extractedCity
        ? `${extractedCity},${venueHint || organizer || rawTitle}`
        : (venueHint || organizer || rawTitle);
    const loc = normalizeLocation(locInput);
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

async function fetchFacebookEventDetails(fbUrl) {
    const expanded = expandSourceUrl(fbUrl);
    const html = await fetchUrl(expanded, 6000, {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept-Language': 'pl-PL,pl;q=0.9'
    });
    return parseFacebookEventHtml(html, expanded);
}

function extractFacebookEventUrlFromHtml(html = '') {
    const m = String(html || '').match(/https?:\/\/(?:www\.)?facebook\.com\/events\/(\d{8,})/i);
    return m ? `https://www.facebook.com/events/${m[1]}/` : '';
}

function parseKrajownikEventsHtml(html = '', defaultCity = 'Katowice') {
    const src = String(html || '');
    if (!src) return [];

    const MONTHS_PL = {
        stycznia: '01', lutego: '02', marca: '03', kwietnia: '04', maja: '05', czerwca: '06',
        lipca: '07', sierpnia: '08', września: '09', wrzesnia: '09', października: '10', pazdziernika: '10',
        listopada: '11', grudnia: '12'
    };

    const danceRegex = /\b(sals[ayę]|bachat[ayę]|kizomb[ayę]|cuban[ay]?|timbeando|timb[ay]|rueda|son\s+cubano|urbankiz|urban\s*kiz|sensual\s+impro|habana|la\s+clave|mil\s+pasos|good\s*mood|gravitacja|sabrosa|forum\s+ta[nń]ca|loftodance|danceloveit|alldance|pachanguero|havana\s+dance|kizlab|teatro\s+cubano)\b/i;
    const excludeRegex = /\b(salsation|zumba\s+kids|zouk\s+solo|west\s+coast\s+swing|zaj[eę]cia\s+regularne|kurs\s+regularny|kursy?\s+ta[nń]ca\s+od\s+zera|od\s+zera\s+z\s+|3x45min|w\s+parach\s+od\s+podstaw|solo\s+footwork\s*&\s*styling\s+z\s+klaudi|szydełkow|szydelkow|joga|koncert\s+metal|behemoth|erykah\s+badu|targi\s+ksi[aą][zż]ki)\b/i;

    const matches = [...src.matchAll(/href=["']([^"']*\/wydarzenia\/[a-z0-9-]+-\d+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const results = [];
    const seenUrls = new Set();

    const ldScripts = [...src.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const sMatch of ldScripts) {
        try {
            const parsed = JSON.parse(sMatch[1]);
            const nodes = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.['@graph'])
                    ? parsed['@graph']
                    : [parsed];
            for (const node of nodes) {
                if (!node || typeof node !== 'object') continue;
                const typeStr = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] || '');
                if (!/Event/i.test(typeStr)) continue;
                const url = String(node.url || '').trim();
                const rawTitle = decodeHtmlEntities(String(node.name || '').trim());
                if (!url || !rawTitle || seenUrls.has(url)) continue;

                const citySlugMatch = url.match(/krajownik\.pl\/([a-z0-9-]+)\/wydarzenia\//i);
                let resolvedCity = node.location?.address?.addressLocality || defaultCity;
                if (citySlugMatch) {
                    const slug = citySlugMatch[1].toLowerCase();
                    if (!KRAJOWNIK_CITY_SLUGS[slug]) continue;
                    resolvedCity = KRAJOWNIK_CITY_SLUGS[slug];
                }

                const locName = decodeHtmlEntities(String(node.location?.name || ''));
                const orgName = decodeHtmlEntities(String(node.organizer?.name || ''));
                const combinedCheck = `${rawTitle} ${locName} ${orgName} ${url}`;
                if (!danceRegex.test(combinedCheck)) continue;
                if (excludeRegex.test(combinedCheck)) continue;

                const startIsoMatch = String(node.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
                if (!startIsoMatch) continue;
                seenUrls.add(url);

                const year = parseInt(startIsoMatch[1], 10);
                const month = startIsoMatch[2];
                const day = startIsoMatch[3];
                const startTime = startIsoMatch[4] || '';
                const rawDate = year === 2026 ? `${day}.${month}` : `${day}.${month}.${year}`;
                const dateInfo = parseEventDateInfo(rawDate, year);
                const loc = normalizeLocation(locName ? `${resolvedCity},${locName}` : resolvedCity);
                const styles = inferEventStyles(`${rawTitle} ${locName} ${orgName}`);

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
        } catch {
            // Ignoruj niepoprawne bloki JSON-LD
        }
    }

    for (const m of matches) {
        const relOrAbs = m[1].trim();
        const url = relOrAbs.startsWith('http') ? relOrAbs : `https://krajownik.pl${relOrAbs}`;
        if (seenUrls.has(url)) continue;

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

function parseSabakiEventsHtml(html = '', defaultCity = 'Katowice') {
    const src = String(html || '');
    if (!src) return [];

    const results = [];
    const seenUrls = new Set();
    const regularClassRegex = /\b(wtorki|środy|srody|czwartki|piątki|piatki|poniedziałki|poniedzialki|niedziele|kurs\s+od\s+zera|od\s+zera|od\s+podstaw|kurs\s+regularny|nab[oó]r\s+do\s+grupy|dla\s+ta[nń]cz[aą]cych|3x45min|leading\s*&\s*following|salsation|zumba|west\s+coast\s+swing|lambada\s+w\s+parach|zouk\s+od\s+zera|kizup|kiz\s+fusion\s+open|viral\s+moves|lady\s+styling\s+w\s+krakowie|solo\s+footwork\s*&\s*styling|crash\s+course\s+krak[oó]w)\b/i;
    const specialEventOverrideRegex = /\b(party|imprez[ay]|praktis|practice|festival|festiwal|social\s+club|warsztaty\s+weekendowe|zaj[eę]cia\s+specjalne|experience|dom[oó]wka|biba|sylwester|integracja|halloween)\b/i;

    const ldScripts = [...src.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const sMatch of ldScripts) {
        try {
            const parsed = JSON.parse(sMatch[1]);
            const list = Array.isArray(parsed?.itemListElement)
                ? parsed.itemListElement
                : Array.isArray(parsed)
                    ? parsed
                    : [parsed];
            for (const el of list) {
                const ev = el?.item || (el?.['@type'] === 'Event' ? el : null);
                if (!ev || typeof ev !== 'object') continue;
                const rawTitle = decodeHtmlEntities(String(ev.alternateName || ev.name || '').trim());
                if (!rawTitle) continue;

                const isRegularClass =
                    /\bzaj[eę]cia\s+regularne\b/i.test(rawTitle) ||
                    (regularClassRegex.test(rawTitle) && !specialEventOverrideRegex.test(rawTitle));
                if (isRegularClass) continue;

                const startIsoMatch = String(ev.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
                if (!startIsoMatch) continue;

                const sameAsRaw = Array.isArray(ev.sameAs) ? ev.sameAs[0] : (ev.sameAs || '');
                const fbIdMatch = String(sameAsRaw || ev.image || '').match(/facebook(?:\.com\/events\/|_com_events_)(\d{8,})/i);
                const url = fbIdMatch
                    ? `https://www.facebook.com/events/${fbIdMatch[1]}/`
                    : String(ev.url || '').trim();
                if (!url || seenUrls.has(url)) continue;
                seenUrls.add(url);

                const year = parseInt(startIsoMatch[1], 10);
                const month = startIsoMatch[2];
                const day = startIsoMatch[3];
                const startTime = startIsoMatch[4] || '';
                const rawDate = year === 2026 ? `${day}.${month}` : `${day}.${month}.${year}`;
                const dateInfo = parseEventDateInfo(rawDate, year);

                const rawCity = decodeHtmlEntities(String(ev.location?.address?.addressLocality || defaultCity))
                    .replace(/\bBielsko\s+Bia[lł]a\b/i, 'Bielsko-Biała');
                const locName = decodeHtmlEntities(String(ev.location?.name || ''));
                const orgName = decodeHtmlEntities(String(ev.organizer?.name || ''));
                const loc = normalizeLocation(`${rawCity},${locName || orgName}`);
                const styles = inferEventStyles(`${rawTitle} ${ev.keywords || ''} ${locName} ${orgName}`);

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
                    notes: `${startTime ? startTime + '; ' : ''}${orgName || loc.venue}`
                });
            }
        } catch {
            // Ignoruj niepoprawne bloki JSON-LD
        }
    }

    return results;
}

function parseOnlyDanceEventsHtml(html = '', defaultCity = 'Katowice') {
    const src = String(html || '');
    if (!src) return [];

    const MONTHS_EN = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const excludeRegex = /\b(west\s+coast\s+swing|zouk\s+festival|krak[oó]w\s+zouk\s+fire|katowice\s+zouk\s+meetup|silesian\s+zouk|ka[zż]dy\s+poniedzia[lł]ek\s+i\s+wtorek|od\s+podstaw\s+z\s+kam[aą]|bartkowa|ro[zż]nowskim|fuego\s+latin\s+dance|opole|salsospontan)\b/i;

    const results = [];
    const seenUrls = new Set();

    const rowMatches = [...src.matchAll(/<a[^>]+class=["'][^"']*\brow\b[^"']*["'][^>]+href=["'](\/event\/([A-Za-z0-9_-]+))["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of rowMatches) {
        const eventId = m[2];
        const url = `https://onlydanceapp.com/event/${eventId}`;
        if (seenUrls.has(url)) continue;

        const block = m[3];
        const dayRaw = block.match(/<span[^>]+class=["']d["'][^>]*>\s*(\d{1,2})\s*<\/span>/i)?.[1];
        const monthRaw = block.match(/<span[^>]+class=["']m["'][^>]*>\s*([A-Za-z]{3})\s*<\/span>/i)?.[1];
        const titleRaw = block.match(/<span[^>]+class=["']t["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
        const subRaw = block.match(/<span[^>]+class=["']s["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];

        if (!dayRaw || !monthRaw || !titleRaw) continue;
        const month = MONTHS_EN[monthRaw.toLowerCase()];
        if (!month) continue;

        const rawTitle = decodeHtmlEntities(titleRaw.replace(/<[^>]+>/g, '').trim());
        const subtitle = decodeHtmlEntities((subRaw || '').replace(/<[^>]+>/g, '').trim());
        const combined = `${rawTitle} ${subtitle}`;
        if (excludeRegex.test(combined)) continue;

        seenUrls.add(url);
        const day = String(dayRaw).padStart(2, '0');
        const monthNum = parseInt(month, 10);
        const hasExplicit2027 = /(?<!2026\s*\/\s*)\b2027\b|'27\b/.test(combined);
        const year = hasExplicit2027 || monthNum <= 9 ? 2027 : 2026;

        let rawDate = year === 2026 ? `${day}.${month}` : `${day}.${month}.${year}`;
        const rangeInTitle = rawTitle.match(/\b(\d{1,2})\s*[\/–-]\s*(\d{1,2})\.(\d{2})(?:\.(\d{4}))?\b/);
        if (
            rangeInTitle &&
            parseInt(rangeInTitle[1], 10) < parseInt(rangeInTitle[2], 10) &&
            !/(?:vol\.?|#)\s*$/i.test(rawTitle.slice(0, rangeInTitle.index))
        ) {
            const d1 = String(rangeInTitle[1]).padStart(2, '0');
            const d2 = String(rangeInTitle[2]).padStart(2, '0');
            const rm = rangeInTitle[3];
            const ry = rangeInTitle[4] ? parseInt(rangeInTitle[4], 10) : year;
            rawDate = ry === 2026 ? `${d1}–${d2}.${rm}` : `${d1}–${d2}.${rm}.${ry}`;
        }

        let resolvedCity = defaultCity;
        if (/ś?wi[eę]toch[lł]owice|stylowa\s+willa|plons\.pl/i.test(combined)) resolvedCity = 'Świętochłowice';
        else if (/feeltheflow/i.test(combined)) resolvedCity = 'Hucisko';
        else if (/\btychy\b|mohito\s+tychy/i.test(combined)) resolvedCity = 'Tychy';
        else if (/\bgliwice\b|gliwickie|mohito\s+gliwice/i.test(combined)) resolvedCity = 'Gliwice';
        else if (/bielsko|bielsku|alldance|sahar[ay]|danceloveit|corazon/i.test(combined)) resolvedCity = 'Bielsko-Biała';
        else if (/krak[oó]w|cracow|cracovia|forum\s+ta[nń]ca|sabrosa|loftodance|vivasalsa|teatro\s+cubano|panorama|frenzyshot/i.test(combined)) resolvedCity = 'Kraków';

        const orgPart = subtitle.split('·')[1]?.trim() || '';
        const knownInTitle = KNOWN_VENUES_GEO.find(k => k.match.test(rawTitle));
        const loc = normalizeLocation(`${resolvedCity},${knownInTitle ? knownInTitle.venue : (orgPart || rawTitle)}`);
        const dateInfo = parseEventDateInfo(rawDate, year);
        const styles = inferEventStyles(combined);

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
            notes: `${orgPart || loc.venue}; OnlyDance`
        });
    }

    return results;
}

function parseAirdanciaEventsHtml(html = '', defaultCity = 'Katowice') {
    const src = String(html || '');
    if (!src) return [];

    const results = [];
    const seenUrls = new Set();

    const cardMatches = [...src.matchAll(/<article[^>]+class=["'][^"']*aird-soc__card[^"']*["'][\s\S]*?<\/article>/gi)];
    for (const m of cardMatches) {
        const block = m[0];
        const href = block.match(/href=["'](https?:\/\/airdancia\.com\/event\/[^"']+)["']/i)?.[1];
        const startTs = block.match(/data-soc-start=["'](\d{9,11})["']/i)?.[1];
        const titleRaw = block.match(/<h3[^>]+class=["'][^"']*aird-soc__card-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1];
        const cityRaw = block.match(/<div[^>]+class=["'][^"']*aird-soc__card-city[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
        const whenRaw = block.match(/<div[^>]+class=["'][^"']*aird-soc__card-when[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
        const families = block.match(/data-families=["']([^"']+)["']/i)?.[1] || '';

        if (!href || !startTs || !titleRaw || seenUrls.has(href)) continue;
        seenUrls.add(href);

        const d = new Date(Number(startTs) * 1000);
        if (Number.isNaN(d.getTime())) continue;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const rawDate = year === 2026 ? `${day}.${month}` : `${day}.${month}.${year}`;
        const dateInfo = parseEventDateInfo(rawDate, year);

        const rawTitle = decodeHtmlEntities(titleRaw.replace(/<[^>]+>/g, '').trim());
        if (/\b(zaj[eę]cia\s+regularne|leading\s*&\s*following\s*[–-]\s*zaj[eę]cia\s+dla\s+ta[nń]cz[aą]cych)\b/i.test(rawTitle)) {
            continue;
        }
        const resolvedCity = decodeHtmlEntities((cityRaw || defaultCity).replace(/<[^>]+>/g, '').trim()) || defaultCity;
        const startTime = decodeHtmlEntities((whenRaw || '').replace(/<[^>]+>/g, '').trim());
        const knownInTitle = KNOWN_VENUES_GEO.find(k => k.match.test(rawTitle));
        const loc = normalizeLocation(knownInTitle ? `${resolvedCity},${knownInTitle.venue}` : resolvedCity);
        const styles = inferEventStyles(`${rawTitle} ${families.replace(/-dance/g, '')}`);

        results.push({
            rawDate,
            isoStartDate: dateInfo.isoStartDate,
            isoEndDate: dateInfo.isoEndDate,
            venueCode: `${loc.city},${loc.venue}`,
            city: loc.city,
            venue: loc.venue,
            title: rawTitle,
            styles,
            url: href,
            notes: `${startTime ? startTime + '; ' : ''}${loc.venue}; AirDancia`
        });
    }

    return results;
}

async function checkRemoteEventSources(existingDatabaseText = '', todayIso = getTodayIsoDate()) {
    console.log('🌐 [1b/5] Zunifikowany skan zewnętrznych źródeł wydarzeń (Mil Pasos, LOFToDANCE, Krajownik, Sabaki, OnlyDance, AirDancia, Facebook)...');
    const discovered = [];

    const tasks = [
        { name: 'Mil Pasos Wydarzenia', url: 'https://www.milpasoskatowice.pl/?page=wydarzenia', parser: (html) => parseMilPasosEventsHtml(html) },
        { name: 'LOFToDANCE Wydarzenia', url: 'https://sklep.loftodance.pl/wydarzenia', parser: (html) => parseLoftodanceEventsHtml(html) },
        { name: 'Sabaki Dance Katowice & Śląsk', url: 'https://sabaki.dance/events/Katowice', parser: (html) => parseSabakiEventsHtml(html, 'Katowice') },
        { name: 'Sabaki Dance Kraków', url: 'https://sabaki.dance/events/Krakow', parser: (html) => parseSabakiEventsHtml(html, 'Kraków') },
        { name: 'OnlyDance Katowice & Śląsk', url: 'https://onlydanceapp.com/events/katowice', parser: (html) => parseOnlyDanceEventsHtml(html, 'Katowice') },
        { name: 'OnlyDance Kraków', url: 'https://onlydanceapp.com/events/krakow', parser: (html) => parseOnlyDanceEventsHtml(html, 'Kraków') },
        { name: 'AirDancia Śląsk', url: 'https://airdancia.com/sociales/pl22a/bachata/', parser: (html) => parseAirdanciaEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Katowice (Dzisiaj)', url: 'https://krajownik.pl/katowice/wydarzenia/dzisiaj', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Katowice (Weekend)', url: 'https://krajownik.pl/katowice/wydarzenia/weekend', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Katowice (Imprezy)', url: 'https://krajownik.pl/katowice/wydarzenia/kategoria/impreza', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Katowice (Warsztaty)', url: 'https://krajownik.pl/katowice/wydarzenia/kategoria/warsztaty', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Gliwice (Weekend)', url: 'https://krajownik.pl/gliwice/wydarzenia/weekend', parser: (html) => parseKrajownikEventsHtml(html, 'Gliwice') },
        { name: 'Krajownik Tychy (Weekend)', url: 'https://krajownik.pl/tychy/wydarzenia/weekend', parser: (html) => parseKrajownikEventsHtml(html, 'Tychy') },
        { name: 'Krajownik Bielsko-Biała (Imprezy)', url: 'https://krajownik.pl/bielsko-biala/wydarzenia/kategoria/impreza', parser: (html) => parseKrajownikEventsHtml(html, 'Bielsko-Biała') },
        { name: 'Krajownik Kraków (Weekend)', url: 'https://krajownik.pl/krakow/wydarzenia/weekend', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Kraków (Imprezy)', url: 'https://krajownik.pl/krakow/wydarzenia/kategoria/impreza', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Chorzów (Weekend)', url: 'https://krajownik.pl/chorzow/wydarzenia/weekend', parser: (html) => parseKrajownikEventsHtml(html, 'Chorzów') },
        { name: 'Krajownik Rybnik (Weekend)', url: 'https://krajownik.pl/rybnik/wydarzenia/weekend', parser: (html) => parseKrajownikEventsHtml(html, 'Rybnik') },
        { name: 'Krajownik Katowice (Taniec)', url: 'https://krajownik.pl/katowice/wydarzenia/kategoria/taniec', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Kraków (Taniec)', url: 'https://krajownik.pl/krakow/wydarzenia/kategoria/taniec', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Gliwice (Taniec)', url: 'https://krajownik.pl/gliwice/wydarzenia/kategoria/taniec', parser: (html) => parseKrajownikEventsHtml(html, 'Gliwice') },
        { name: 'Krajownik Bielsko-Biała (Taniec)', url: 'https://krajownik.pl/bielsko-biala/wydarzenia/kategoria/taniec', parser: (html) => parseKrajownikEventsHtml(html, 'Bielsko-Biała') },
        { name: 'Krajownik Organizator: Kato Salsa Hub', url: 'https://krajownik.pl/organizator/kato-salsa-hub-85966', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Organizator: La Clave Katowice', url: 'https://krajownik.pl/organizator/la-clave-6331', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Organizator: Mil Pasos', url: 'https://krajownik.pl/organizator/szkola-tanca-mil-pasos-4946', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Organizator: Michał Rozewski (Mil Pasos)', url: 'https://krajownik.pl/organizator/michal-rozewski-4948', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Organizator: Piąty Dom', url: 'https://krajownik.pl/organizator/piaty-dom-2188', parser: (html) => parseKrajownikEventsHtml(html, 'Katowice') },
        { name: 'Krajownik Organizator: Mohito Gliwice', url: 'https://krajownik.pl/organizator/szkola-tanca-mohito-gliwice-2173', parser: (html) => parseKrajownikEventsHtml(html, 'Gliwice') },
        { name: 'Krajownik Organizator: Mohito Tychy', url: 'https://krajownik.pl/organizator/szkola-tanca-mohito-tychy-9627', parser: (html) => parseKrajownikEventsHtml(html, 'Tychy') },
        { name: 'Krajownik Organizator: AllDance Bielsko-Biała', url: 'https://krajownik.pl/organizator/szkola-tanca-alldance-bielsko-biala-4024', parser: (html) => parseKrajownikEventsHtml(html, 'Bielsko-Biała') },
        { name: 'Krajownik Organizator: DANCE#LOVEit & Corazon', url: 'https://krajownik.pl/organizator/danceloveit-corazon-szkola-tanca-9515', parser: (html) => parseKrajownikEventsHtml(html, 'Bielsko-Biała') },
        { name: 'Krajownik Organizator: Częstotańcz', url: 'https://krajownik.pl/organizator/czestotancz-znajdz-swoj-taniec-w-czestochowie-szkola-tanca-czestochowa-17492', parser: (html) => parseKrajownikEventsHtml(html, 'Częstochowa') },
        { name: 'Krajownik Organizator: Forum Tańca Kraków', url: 'https://krajownik.pl/organizator/forum-tanca-17531', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Organizator: Sabrosa Kraków', url: 'https://krajownik.pl/organizator/sabrosa-dance-studio-3594', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Organizator: LOFToDANCE Kraków', url: 'https://krajownik.pl/organizator/loftodance-lukasz-ras-402', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Organizator: VivaSalsa Kraków', url: 'https://krajownik.pl/organizator/vivasalsa-krakow-4784', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') },
        { name: 'Krajownik Organizator: Teatro Cubano Kraków', url: 'https://krajownik.pl/organizator/teatro-cubano-krakow-resto-rum-bar-799', parser: (html) => parseKrajownikEventsHtml(html, 'Kraków') }
    ];

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
        if (ev.url && ev.url !== 'https://www.milpasoskatowice.pl/?page=wydarzenia') {
            if (dbLower.includes(ev.url.toLowerCase())) return false;
            const fbIdMatch = ev.url.match(/facebook\.com\/events\/(\d{8,})/i);
            if (fbIdMatch && dbLower.includes(`f:${fbIdMatch[1]}`)) return false;
            const odIdMatch = ev.url.match(/onlydanceapp\.com\/event\/([A-Za-z0-9_-]+)/i);
            if (odIdMatch && dbLower.includes(`o:${odIdMatch[1].toLowerCase()}`)) return false;
        }
        const shortTitle = extractShortEventTitle(ev.title).toLowerCase();
        if (shortTitle && dbLower.includes(ev.rawDate.toLowerCase()) && dbLower.includes(shortTitle.slice(0, 14))) {
            return false;
        }
        return true;
    });

    await Promise.allSettled(
        freshEvents.map(async (ev) => {
            if (ev.url && ev.url.includes('krajownik.pl/')) {
                try {
                    const detailHtml = await fetchUrl(ev.url, 6000);
                    const fbUrl = extractFacebookEventUrlFromHtml(detailHtml);
                    if (fbUrl) {
                        ev.url = fbUrl;
                        try {
                            const fbDetails = await fetchFacebookEventDetails(fbUrl);
                            if (fbDetails) {
                                if (fbDetails.venue && fbDetails.venue !== 'Inne' && (!ev.venue || ev.venue === 'Inne')) {
                                    ev.venue = fbDetails.venue;
                                    ev.venueCode = fbDetails.venueCode;
                                }
                                if (fbDetails.styles && ev.styles === 'Salsa/Bachata/Kizomba') {
                                    ev.styles = fbDetails.styles;
                                }
                            }
                        } catch {
                            // Zachowaj metadane Krajownika
                        }
                    }
                } catch {
                    // Zachowaj link Krajownika
                }
            } else if (ev.url && ev.url.includes('onlydanceapp.com/event/')) {
                try {
                    const detailHtml = await fetchUrl(ev.url, 6000);
                    const ldMatch = detailHtml.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
                    if (ldMatch) {
                        const ld = JSON.parse(ldMatch[1]);
                        const locName = decodeHtmlEntities(String(ld.location?.name || ''));
                        const streetAddr = decodeHtmlEntities(String(ld.location?.address?.streetAddress || ''));
                        const combinedAddr = `${locName} ${streetAddr}`.trim();
                        if (/\b4[5-9]-\d{3}\b|\bOpole\b/i.test(combinedAddr)) {
                            ev._excludeOutOfRegion = true;
                            return;
                        }
                        if (combinedAddr) {
                            const enrichedLoc = normalizeLocation(`${ev.city},${combinedAddr}`);
                            if (enrichedLoc.venue && enrichedLoc.venue !== 'Inne') {
                                ev.city = enrichedLoc.city;
                                ev.venue = enrichedLoc.venue;
                                ev.venueCode = `${enrichedLoc.city},${enrichedLoc.venue}`;
                            }
                        }
                    }
                    const fbUrl = extractFacebookEventUrlFromHtml(detailHtml);
                    if (fbUrl) ev.url = fbUrl;
                } catch {
                    // Zachowaj metadane OnlyDance
                }
            }
        })
    );

    const verifiedFreshEvents = freshEvents.filter(ev => !ev._excludeOutOfRegion);
    console.log(`   Zeskanowano źródła zewnętrzne równolegle: wykryto ${uniqueDiscovered.length} unikalnych aktywnych wydarzeń (nowych spoza bazy: ${verifiedFreshEvents.length}).`);
    return { discovered: uniqueDiscovered, freshEvents: verifiedFreshEvents };
}

module.exports = {
    WEEKDAYS_PL,
    getTodayIsoDate,
    parseEventDateInfo,
    extractShortEventTitle,
    deduplicateEvents,
    fetchUrl,
    decodeHtmlEntities,
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
};
