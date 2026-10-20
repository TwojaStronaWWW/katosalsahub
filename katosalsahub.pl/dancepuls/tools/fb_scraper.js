/**
 * DANCEPULS & KATO SALSA HUB — UNIVERSAL EVENT SCRAPER v3.0
 *
 * Architektura 5-warstwowa (Zero-Bloat, Isomorphic Browser + Node.js):
 * 1. JSON-LD Schema.org (Event / DanceEvent / SocialEvent / Festival)
 * 2. Facebook Relay / GraphQL Embedded JSON (<script type="application/json">) z obsługą start_timestamp
 * 3. OpenGraph Meta (og:title, og:description, og:url)
 * 4. Konektory agregatorów i szkół (Krajownik, LOFToDANCE, Mil Pasos, OnlyDance)
 * 5. Semantyczny skaner kart DOM z automatycznym dociąganiem listy (Auto-Scroll)
 */

(function (root) {
  'use strict';

  const KEYWORDS_TO_CUT = [
    'proponowane wydarzenia',
    'popularne wśród znajomych',
    'goście',
    'poznaj organizatora',
    'transparentność wydarzeń',
    'informacje o wydarzeniu',
    'pokaż wszystkich',
    'pokaż mniej',
    'zaproszenie',
    'udostępnij',
  ];

  const EXCLUDED_TITLES = [
    'UTWÓRZ WYDARZENIE',
    'POWIADOMIENIA',
    'ZNAJDŹ WYDARZENIA',
    'TWOJE WYDARZENIA',
    'KALENDARZ WYDARZEŃ',
  ];

  const MONTHS_MAP = {
    stycznia: 0, styczeń: 0, styczen: 0, sty: 0, january: 0, jan: 0,
    lutego: 1, luty: 1, lut: 1, february: 1, feb: 1,
    marca: 2, marzec: 2, mar: 2, march: 2,
    kwietnia: 3, kwiecień: 3, kwiecien: 3, kwi: 3, april: 3, apr: 3,
    maja: 4, maj: 4, may: 4,
    czerwca: 5, czerwiec: 5, cze: 5, june: 5, jun: 5,
    lipca: 6, lipiec: 6, lip: 6, july: 6, jul: 6,
    sierpnia: 7, sierpień: 7, sierpien: 7, sie: 7, august: 7, aug: 7,
    września: 8, wrzesnia: 8, wrzesień: 8, wrzesien: 8, wrz: 8, september: 8, sep: 8,
    października: 9, pazdziernika: 9, październik: 9, pazdziernik: 9, paź: 9, paz: 9, october: 9, oct: 9,
    listopada: 10, listopad: 10, lis: 10, november: 10, nov: 10,
    grudnia: 11, grudzień: 11, grudzien: 11, gru: 11, december: 11, dec: 11,
  };

  const MONTH_KEYS_PATTERN = Object.keys(MONTHS_MAP)
    .sort((a, b) => b.length - a.length)
    .join('|');

  const WEEKDAYS_MAP = {
    niedziela: 0, niedzielę: 0, niedziele: 0, ndz: 0, sunday: 0, sun: 0,
    poniedziałek: 1, poniedzialek: 1, pon: 1, monday: 1, mon: 1,
    wtorek: 2, wt: 2, tuesday: 2, tue: 2,
    środa: 3, sroda: 3, środę: 3, srode: 3, śr: 3, wednesday: 3, wed: 3,
    czwartek: 4, czw: 4, thursday: 4, thu: 4,
    piątek: 5, piatek: 5, pt: 5, friday: 5, fri: 5,
    sobota: 6, sobotę: 6, sobote: 6, sob: 6, saturday: 6, sat: 6,
  };

  const WEEKDAY_KEYS_PATTERN = Object.keys(WEEKDAYS_MAP)
    .sort((a, b) => b.length - a.length)
    .join('|');

  function toLocalYMD(dateObj) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatRawDateDDMM(dateObj, defaultYear = new Date().getFullYear()) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    return y === defaultYear ? `${d}.${m}` : `${d}.${m}.${y}`;
  }

  function canonicalizeEventUrl(rawUrl = '') {
    const str = String(rawUrl || '').trim();
    if (!str) return '';
    const fbMatch = str.match(/facebook\.com\/events\/(?:[^/?#]+\/[^/?#]+\/|s\/[^/?#]+\/)?(\d{8,})/i);
    if (fbMatch) {
      return `https://www.facebook.com/events/${fbMatch[1]}/`;
    }
    return str.split('?')[0].split('#')[0];
  }

  /**
   * Uniwersalny parser dat z obsługą:
   * - ISO YYYY-MM-DD / timestampów UNIX
   * - "25 października 2026", "24–25 października 2026", "20 paź"
   * - "października 25 2026" (format OpenGraph FB)
   * - "24.10.2026", "24–25.10.2026", "24.10.26", "24.10"
   * - relatywnych ("dzisiaj", "dziś", "jutro", "pojutrze")
   */
  function parseFBDate(input, now = new Date()) {
    if (input === null || input === undefined || input === '') return null;

    if (typeof input === 'number' && Number.isFinite(input)) {
      const ms = input < 1e12 ? input * 1000 : input;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    const raw = String(input).trim();
    if (!raw) return null;

    const currentYear = now.getFullYear();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. ISO YYYY-MM-DD (parsowany w czasie lokalnym bez przesunięcia strefy UTC)
    const isoMatch = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      return new Date(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10)
      );
    }

    const lower = raw.toLowerCase();

    // 2. Daty relatywne (uwaga: w JS \b nie działa dla polskich znaków diakrytycznych ś/ź/ń/ę/ł)
    if (/(?<![a-ząćęłńóśźż])(dzisiaj|dziś|dzis|today)(?![a-ząćęłńóśźż])/i.test(lower)) {
      return new Date(todayStart);
    }
    if (/(?<![a-ząćęłńóśźż])(jutro|tomorrow)(?![a-ząćęłńóśźż])/i.test(lower)) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (/(?<![a-ząćęłńóśźż])pojutrze(?![a-ząćęłńóśźż])/i.test(lower)) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + 2);
      return d;
    }

    // 3. Format OpenGraph / kart FB: "października 25 2026" / "October 25, 2026" / "Oct 24" / "paź 24"
    const reMonthFirst = new RegExp(
      `(?<![a-ząćęłńóśźż])(${MONTH_KEYS_PATTERN})\\s+(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?(?:,?\\s+(\\d{4}))?\\b`,
      'i'
    );
    const mMonthFirst = lower.match(reMonthFirst);
    if (mMonthFirst) {
      const monthIdx = MONTHS_MAP[mMonthFirst[1].toLowerCase()];
      const day = parseInt(mMonthFirst[2], 10);
      let year = mMonthFirst[3] ? parseInt(mMonthFirst[3], 10) : currentYear;
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const candidate = new Date(year, monthIdx, day);
        if (!mMonthFirst[3] && candidate < new Date(todayStart.getTime() - 60 * 86400000)) {
          candidate.setFullYear(currentYear + 1);
        }
        return candidate;
      }
    }

    // 4. Format "24 października 2026", "24–25 października", "20 paź"
    const reDayFirst = new RegExp(
      `\\b(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?\\s+(${MONTH_KEYS_PATTERN})(?:\\s+(\\d{4}))?(?![a-ząćęłńóśźż])`,
      'i'
    );
    const mDayFirst = lower.match(reDayFirst);
    if (mDayFirst) {
      const day = parseInt(mDayFirst[1], 10);
      const monthIdx = MONTHS_MAP[mDayFirst[2].toLowerCase()];
      let year = mDayFirst[3] ? parseInt(mDayFirst[3], 10) : currentYear;
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const candidate = new Date(year, monthIdx, day);
        if (!mDayFirst[3] && candidate < new Date(todayStart.getTime() - 60 * 86400000)) {
          candidate.setFullYear(currentYear + 1);
        }
        return candidate;
      }
    }

    // 5. Format kropkowy / ukośnikowy: "24.10.2026", "24–25.10.2026", "24.10.26", "24.10"
    // Wykluczamy godziny typu "20.00" lub "16.30", jeśli po kropce jest 00/30/15/45 bez roku i powyżej 12
    const reDot = /\b(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?[./](\d{1,2})(?:[./](\d{2,4}))?\b/;
    const mDot = lower.match(reDot);
    if (mDot) {
      const day = parseInt(mDot[1], 10);
      const monthNum = parseInt(mDot[3], 10);
      if (day >= 1 && day <= 31 && monthNum >= 1 && monthNum <= 12) {
        let year = currentYear;
        if (mDot[4]) {
          const parsedY = parseInt(mDot[4], 10);
          year = parsedY < 100 ? 2000 + parsedY : parsedY;
        } else {
          const candidate = new Date(year, monthNum - 1, day);
          if (candidate < new Date(todayStart.getTime() - 60 * 86400000)) {
            year = currentYear + 1;
          }
        }
        return new Date(year, monthNum - 1, day);
      }
    }

    // 6. Relatywne dni tygodnia z kart Facebooka ("W ten piątek o 20:00", "W tę sobotę o 21:00", "Niedziela o 15:00", "This Saturday at 8 PM")
    const reWeekday = new RegExp(
      `(?:(?<![a-ząćęłńóśźż])(w\\s+ten|w\\s+t[eę]|najbli[zż]sz[ayąe]|this|w\\s+przysz[lł][ayąe]|next)\\s+)?(?<![a-ząćęłńóśźż])(${WEEKDAY_KEYS_PATTERN})(?![a-ząćęłńóśźż])`,
      'i'
    );
    const mWeekday = lower.match(reWeekday);
    if (mWeekday) {
      const prefix = (mWeekday[1] || '').toLowerCase();
      const targetDow = WEEKDAYS_MAP[mWeekday[2].toLowerCase()];
      const hasTimeOrRelativeHint =
        Boolean(prefix) ||
        /\bo\s+\d{1,2}[:.]\d{2}\b|\bat\s+\d{1,2}\b|\b\d{1,2}:\d{2}\b/i.test(lower) ||
        lower === mWeekday[2].toLowerCase();
      if (targetDow !== undefined && hasTimeOrRelativeHint) {
        const todayDow = todayStart.getDay();
        let diff = (targetDow - todayDow + 7) % 7;
        if (/przysz[lł]|next/i.test(prefix)) {
          diff = diff === 0 ? 7 : diff + 7;
        }
        const d = new Date(todayStart);
        d.setDate(d.getDate() + diff);
        return d;
      }
    }

    return null;
  }

  function cleanDescription(text = '') {
    let cleanText = String(text || '');
    const lowerText = cleanText.toLowerCase();
    let cutIndex = cleanText.length;

    for (const kw of KEYWORDS_TO_CUT) {
      const idx = lowerText.indexOf(kw);
      if (idx !== -1 && idx < cutIndex) cutIndex = idx;
    }

    return cleanText.slice(0, cutIndex).replace(/\s+/g, ' ').trim();
  }

  /**
   * Warstwa 2: Ekstrakcja wydarzeń bezpośrednio ze skryptów Relay / GraphQL Facebooka (<script type="application/json">).
   * Odporna na zmiany klas CSS i zagnieżdżone obiekty w DOM — rekurencyjnie przechodzi drzewo JSON oraz skanuje okna wokół ID.
   */
  function extractEventsFromRelayJson(rawJsonText = '', now = new Date()) {
    const src =
      rawJsonText && typeof rawJsonText === 'object'
        ? JSON.stringify(rawJsonText)
        : String(rawJsonText || '');
    if (!src || (!src.includes('start_timestamp') && !src.includes('day_time_sentence'))) {
      return [];
    }

    const results = [];
    const seenIds = new Set();

    const decodeJsonString = (s) => {
      try {
        return JSON.parse(`"${s}"`);
      } catch {
        return s;
      }
    };

    const registerRelayEvent = (id, rawName, tsOrDateInput, locationHint = '') => {
      if (!id || seenIds.has(id)) return;
      const title = String(rawName || '').trim();
      if (!title || EXCLUDED_TITLES.some((ex) => title.toUpperCase().includes(ex))) return;

      const d =
        typeof tsOrDateInput === 'number' || /^\d{9,11}$/.test(String(tsOrDateInput))
          ? parseFBDate(Number(tsOrDateInput), now)
          : parseFBDate(String(tsOrDateInput), now);
      if (!d) return;

      seenIds.add(id);
      results.push({
        url: `https://www.facebook.com/events/${id}/`,
        isoDate: toLocalYMD(d),
        rawDate: formatRawDateDDMM(d, now.getFullYear()),
        title,
        location: String(locationHint || '').trim(),
        description: `${title} ${locationHint || ''}`.trim(),
      });
    };

    // 2A. Rekurencyjny spacer po drzewie JSON (odporny na zagnieżdżone obiekty między "id", "name" i "start_timestamp")
    const walkRelayTree = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walkRelayTree(item);
        return;
      }
      const id = typeof node.id === 'string' && /^\d{10,20}$/.test(node.id) ? node.id : '';
      const name = typeof node.name === 'string' ? node.name : (typeof node.event_title === 'string' ? node.event_title : '');
      const ts = node.start_timestamp || node.start_time || node.day_time_sentence || '';
      if (id && name && ts) {
        const loc =
          node.event_place?.contextual_name ||
          node.event_place?.name ||
          node.place?.name ||
          node.location_name ||
          '';
        registerRelayEvent(id, name, ts, loc);
      }
      for (const val of Object.values(node)) {
        if (val && typeof val === 'object') walkRelayTree(val);
      }
    };

    try {
      if (rawJsonText && typeof rawJsonText === 'object') {
        walkRelayTree(rawJsonText);
      } else if (src.includes('<script')) {
        const scriptBlocks = [...src.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const sb of scriptBlocks) {
          const body = sb[1].trim();
          if (body.includes('start_timestamp') || body.includes('day_time_sentence')) {
            try {
              walkRelayTree(JSON.parse(body));
            } catch {
              // Ignoruj niepoprawne pojedyncze bloki
            }
          }
        }
      } else {
        walkRelayTree(JSON.parse(src));
      }
    } catch {
      // Fallback poniżej dla fragmentów HTML / niepełnego JSON-a
    }

    // 2B. Fallback okienkowy wokół każdego "id":"(\d{10,20})" (obsługuje zagnieżdżone nawiasy klamrowe {})
    const idMatches = [...src.matchAll(/"id"\s*:\s*"(\d{10,20})"/g)];
    for (const m of idMatches) {
      const id = m[1];
      if (seenIds.has(id)) continue;
      const windowSlice = src.slice(Math.max(0, m.index - 400), Math.min(src.length, m.index + 1800));
      const nameMatch = windowSlice.match(/"name"\s*:\s*"((?:[^"\\]|\\.)+)"/);
      const tsMatch = windowSlice.match(/"start_timestamp"\s*:\s*(\d{9,11})/);
      const sentenceMatch = windowSlice.match(/"day_time_sentence"\s*:\s*"((?:[^"\\]|\\.)+)"/);
      if (nameMatch && (tsMatch || sentenceMatch)) {
        const locMatch = windowSlice.match(/"contextual_name"\s*:\s*"((?:[^"\\]|\\.)+)"/);
        registerRelayEvent(
          id,
          decodeJsonString(nameMatch[1]),
          tsMatch ? Number(tsMatch[1]) : decodeJsonString(sentenceMatch[1]),
          locMatch ? decodeJsonString(locMatch[1]) : ''
        );
      }
    }

    return results;
  }

  /**
   * Warstwa 1 & 3 & 5: Ekstrakcja z dokumentu DOM (JSON-LD -> OpenGraph -> Relay Scripts -> Karty DOM)
   */
  function extractEventsFromDocument(doc = typeof document !== 'undefined' ? document : null, currentUrl = '', now = new Date()) {
    if (!doc) return [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const limitDate = new Date(today);
    limitDate.setDate(today.getDate() + 180);

    const collected = new Map();

    const registerEvent = (item) => {
      if (!item || !item.title) return;
      const cleanTitle = String(item.title).replace(/\s+/g, ' ').trim();
      if (!cleanTitle || EXCLUDED_TITLES.some((ex) => cleanTitle.toUpperCase().includes(ex))) return;

      const d = item.parsedDate || parseFBDate(item.isoDate || item.rawDate || cleanTitle, now);
      if (!d) return;
      const checkD = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (checkD < today || checkD > limitDate) return;

      const url = canonicalizeEventUrl(item.url || currentUrl);
      const isoDate = toLocalYMD(checkD);
      const key = `${isoDate}::${url || cleanTitle.toLowerCase()}`;

      if (!collected.has(key)) {
        collected.set(key, {
          url,
          isoDate,
          rawDate: formatRawDateDDMM(checkD, now.getFullYear()),
          title: cleanTitle,
          location: String(item.location || '').trim(),
          description: cleanDescription(item.description || cleanTitle),
        });
      }
    };

    // 1. JSON-LD (Schema.org Event / DanceEvent / SocialEvent)
    const ldScripts = doc.querySelectorAll ? doc.querySelectorAll('script[type="application/ld+json"]') : [];
    for (const s of ldScripts) {
      try {
        const parsed = JSON.parse(s.textContent || s.innerText || '');
        const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
        while (queue.length > 0) {
          const node = queue.shift();
          if (!node || typeof node !== 'object') continue;
          if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
          if (Array.isArray(node.itemListElement)) queue.push(...node.itemListElement);
          const type = String(node['@type'] || '');
          if (/Event/i.test(type) && node.name && node.startDate) {
            const locName = node.location?.name || '';
            const locAddr = node.location?.address?.streetAddress || node.location?.address?.addressLocality || '';
            registerEvent({
              url: node.url || currentUrl,
              isoDate: String(node.startDate).slice(0, 10),
              rawDate: String(node.startDate).slice(0, 10),
              title: node.name,
              location: [locName, locAddr].filter(Boolean).join(', '),
              description: node.description || node.name,
            });
          }
        }
      } catch {
        // Ignoruj uszkodzone bloki JSON-LD
      }
    }

    // 2. Facebook Relay JSON (<script type="application/json">)
    const jsonScripts = doc.querySelectorAll ? doc.querySelectorAll('script[type="application/json"]') : [];
    for (const s of jsonScripts) {
      const relayEvents = extractEventsFromRelayJson(s.textContent || s.innerText || '', now);
      for (const rev of relayEvents) {
        registerEvent(rev);
      }
    }

    // 3. OpenGraph Meta (dla pojedynczego wydarzenia FB)
    if (/\/events\/\d+/i.test(currentUrl)) {
      const getMeta = (prop) => {
        const el = doc.querySelector
          ? doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)
          : null;
        return el ? el.getAttribute('content') || '' : '';
      };
      const ogTitle = getMeta('og:title');
      const ogDesc = getMeta('og:description') || getMeta('description');
      const ogUrl = getMeta('og:url') || currentUrl;
      const d = parseFBDate(ogDesc, now) || parseFBDate(ogTitle, now);
      if (ogTitle && d) {
        let locHint = '';
        const slugMatch = ogUrl.match(/facebook\.com\/events\/([^/]+)\/[^/]+\/\d+/i);
        if (slugMatch) {
          try {
            locHint = decodeURIComponent(slugMatch[1]).replace(/-/g, ' ');
          } catch {
            locHint = slugMatch[1].replace(/-/g, ' ');
          }
        }
        registerEvent({
          url: ogUrl,
          parsedDate: d,
          title: ogTitle,
          location: locHint,
          description: `${ogDesc} ${locHint}`.trim(),
        });
      }
    }

    // 4. Semantyczny skan kart DOM (a[href*="/events/"] oraz karty Krajownik / LOFToDANCE / OnlyDance / AirDancia)
    const anchors = doc.querySelectorAll
      ? Array.from(
          doc.querySelectorAll(
            'a[href*="/events/"], a[href*="/wydarzenia/"], a[href*="/wydarzenie/"], a[href*="/event/"]'
          )
        )
      : [];

    const countUniqueEventUrlsInContainer = (container) => {
      if (!container || typeof container.querySelectorAll !== 'function') return 1;
      const innerLinks = container.querySelectorAll(
        'a[href*="/events/"], a[href*="/wydarzenia/"], a[href*="/wydarzenie/"], a[href*="/event/"]'
      );
      const urls = new Set();
      for (const a of innerLinks) {
        const href = a.href || (a.getAttribute && a.getAttribute('href')) || '';
        const canon = canonicalizeEventUrl(href);
        if (canon) urls.add(canon);
        if (urls.size > 1) return urls.size;
      }
      return urls.size;
    };

    const resolveCardRoot = (link) => {
      const semanticClosest =
        link.closest &&
        link.closest('[role="article"], article, li, div[style*="border-radius"], .event-card, .aird-soc__card');
      if (semanticClosest && countUniqueEventUrlsInContainer(semanticClosest) <= 1) {
        return semanticClosest;
      }
      let curr = link;
      for (let depth = 0; depth < 8; depth++) {
        const parent = curr.parentElement;
        if (!parent || parent.tagName === 'BODY' || parent.tagName === 'MAIN') break;
        if (countUniqueEventUrlsInContainer(parent) > 1) break;
        curr = parent;
      }
      return curr !== link ? curr : link.parentElement?.parentElement || link;
    };

    for (const link of anchors) {
      const rawHref = link.href || link.getAttribute('href') || '';
      if (!rawHref) continue;
      if (rawHref.includes('facebook.com') && !/\/events\/(?:[^/?#]+\/[^/?#]+\/|s\/[^/?#]+\/)?\d+/.test(rawHref)) {
        continue;
      }

      const card = resolveCardRoot(link);

      const textContent = (card.innerText || card.textContent || '').trim();
      const lines = textContent
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let parsedDate = null;
      let dateLineIdx = -1;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const d = parseFBDate(lines[i], now);
        if (d) {
          parsedDate = d;
          dateLineIdx = i;
          break;
        }
      }
      if (!parsedDate && textContent) {
        parsedDate = parseFBDate(textContent, now);
      }

      if (!parsedDate) continue;

      let title = '';
      const heading = card.querySelector ? card.querySelector('h1, h2, h3, h4, strong, span[dir="auto"]') : null;
      if (heading) {
        const hText = (heading.innerText || heading.textContent || '').trim();
        if (hText && !parseFBDate(hText, now)) {
          title = hText;
        }
      }
      if (!title) {
        title = lines.find((l, idx) => idx !== dateLineIdx && l.length > 3 && !parseFBDate(l, now)) || lines[0] || '';
      }

      const locLine =
        lines.find((l) =>
          /Katowice|Gliwice|Sosnowiec|Zabrze|Tychy|Chorzów|Świętochłowice|Bytom|Bielsko|Kraków|Rybnik|Częstochowa|Tarnowskie Góry|Wolni Ludzie|La Clave|Mil Pasos|Good Mood|Forum Tańca|Sabrosa|LOFToDANCE|KIZLAB|Gravitacja|Piąty Dom|Teatro Cubano|Stylowa Willa/i.test(
            l
          )
        ) || '';

      registerEvent({
        url: rawHref,
        parsedDate,
        title,
        location: locLine,
        description: textContent,
      });
    }

    return Array.from(collected.values()).sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  }

  /**
   * Parsuje surowy kod HTML podstrony pojedynczego wydarzenia (np. pobrany przez fetch('/events/ID/') w tle)
   * i wyciąga z niego pełny opis (event_description / og:description / JSON-LD), dokładny czas startu i lokalizację.
   */
  function parseEventDetailHtml(html = '', fallbackUrl = '', now = new Date()) {
    const src = String(html || '');
    if (!src) return null;

    const decodeEntities = (s = '') =>
      String(s || '')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
          try {
            return String.fromCodePoint(parseInt(hex, 16));
          } catch {
            return '';
          }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
          try {
            return String.fromCodePoint(parseInt(dec, 10));
          } catch {
            return '';
          }
        })
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#039;|&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .trim();

    const getMeta = (prop) => {
      const m =
        src.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        src.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
      return m ? decodeEntities(m[1]) : '';
    };

    let title = getMeta('og:title');
    let ogDesc = getMeta('og:description') || getMeta('description');
    const ogUrl = getMeta('og:url') || fallbackUrl;

    // Sprawdź węzły Relay JSON wewnątrz pobranego HTML
    const relayItems = extractEventsFromRelayJson(src, now);
    const primaryRelay = relayItems[0] || null;

    // Wyciągnij pełny tekst opisu z Relay ("event_description":{"text":"..."})
    let relayFullDesc = '';
    const descMatch = src.match(/"event_description"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    if (descMatch) {
      try {
        relayFullDesc = JSON.parse(`"${descMatch[1]}"`);
      } catch {
        relayFullDesc = descMatch[1];
      }
    }

    let locName = primaryRelay?.location || '';
    if (!locName) {
      const locMatch = src.match(/"contextual_name"\s*:\s*"((?:[^"\\]|\\.)+)"/);
      if (locMatch) {
        try {
          locName = JSON.parse(`"${locMatch[1]}"`);
        } catch {
          locName = locMatch[1];
        }
      }
    }
    if (!locName && ogUrl) {
      const slugMatch = ogUrl.match(/facebook\.com\/events\/([^/]+)\/[^/]+\/\d+/i);
      if (slugMatch && slugMatch[1] !== 's') {
        locName = decodeURIComponent(slugMatch[1]).replace(/-/g, ' ');
      }
    }

    const parsedDate =
      (primaryRelay && parseFBDate(primaryRelay.isoDate, now)) ||
      parseFBDate(ogDesc, now) ||
      parseFBDate(title, now) ||
      parseFBDate(relayFullDesc, now);

    if (!parsedDate) return null;

    const finalTitle = primaryRelay?.title || title || 'Wydarzenie bez tytułu';
    const combinedDesc = cleanDescription([relayFullDesc, ogDesc, locName].filter(Boolean).join(' | '));

    return {
      url: canonicalizeEventUrl(ogUrl || fallbackUrl),
      title: finalTitle,
      rawDate: formatRawDateDDMM(parsedDate),
      isoDate: toLocalYMD(parsedDate),
      location: locName,
      description: combinedDesc || finalTitle,
    };
  }

  /**
   * Warstwa 4b (Same-Origin Deep Fetch):
   * Dociąga w tle (w paczkach po 4 równoległe żądania) podstrony znalezionych wydarzeń,
   * uzupełniając brakujące lokalizacje, pełne opisy stylów oraz daty z bezpośrednich linków /events/ID/.
   */
  async function deepEnrichFacebookEvents(events = [], doc = null, fetchImpl = null, now = new Date()) {
    const fetcher =
      fetchImpl || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    if (!fetcher) return events;

    const byUrl = new Map();
    for (const ev of events) {
      byUrl.set(canonicalizeEventUrl(ev.url), { ...ev });
    }

    // Dodaj również linki /events/ID/ z dokumentu, które na karcie listy nie miały widocznej daty
    if (doc && doc.querySelectorAll) {
      const allEventLinks = Array.from(doc.querySelectorAll('a[href*="/events/"]'));
      for (const a of allEventLinks) {
        const href = a.href || a.getAttribute('href') || '';
        const canon = canonicalizeEventUrl(href);
        if (/facebook\.com\/events\/\d+\/$/.test(canon) && !byUrl.has(canon) && byUrl.size < 60) {
          byUrl.set(canon, {
            url: canon,
            title: (a.innerText || a.textContent || '').trim(),
            rawDate: '',
            isoDate: '',
            location: '',
            description: '',
            _needsDate: true,
          });
        }
      }
    }

    const targets = Array.from(byUrl.values()).filter(
      (ev) =>
        /facebook\.com\/events\/\d+\/$/.test(ev.url) &&
        (ev._needsDate || !ev.location || !ev.description || ev.description.length < 80)
    );

    const BATCH_SIZE = 4;
    for (let i = 0; i < Math.min(targets.length, 48); i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (ev) => {
          try {
            const res = await fetcher(ev.url, { credentials: 'same-origin' });
            if (!res || !res.ok) return;
            const html = await res.text();
            const enriched = parseEventDetailHtml(html, ev.url, now);
            if (!enriched) return;
            const existing = byUrl.get(ev.url);
            if (existing) {
              existing.title =
                !existing.title || existing.title === 'Wydarzenie bez tytułu' || existing.title.length < 4
                  ? enriched.title
                  : existing.title;
              existing.rawDate = existing.rawDate || enriched.rawDate;
              existing.isoDate = existing.isoDate || enriched.isoDate;
              existing.location = existing.location || enriched.location;
              if (enriched.description && enriched.description.length > (existing.description || '').length) {
                existing.description = enriched.description;
              }
              delete existing._needsDate;
            }
          } catch {
            // Ignoruj błędy pojedynczych podstron
          }
        })
      );
    }

    const todayIso = toLocalYMD(now);
    return Array.from(byUrl.values())
      .filter((ev) => !ev._needsDate && ev.isoDate && ev.isoDate >= todayIso)
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  }

  const FB_REGIONAL_ORGANIZER_PAGES = [
    { name: 'Kato Salsa Hub', url: 'https://www.facebook.com/katosalsahub/upcoming_hosted_events', locationHint: 'Katowice, Wolni Ludzie' },
    { name: 'La Clave Katowice', url: 'https://www.facebook.com/LaClaveKatowice/upcoming_hosted_events', locationHint: 'Katowice, La Clave' },
    { name: 'Mil Pasos Katowice', url: 'https://www.facebook.com/SzkolaTancaMilPasos/upcoming_hosted_events', locationHint: 'Katowice, Mil Pasos' },
    { name: 'Good Mood Katowice', url: 'https://www.facebook.com/goodmoodkatowice/upcoming_hosted_events', locationHint: 'Katowice, Good Mood' },
    { name: 'KIZLAB Katowice', url: 'https://www.facebook.com/kizlab.katowice/upcoming_hosted_events', locationHint: 'Katowice, KIZLAB' },
    { name: 'Taneczna Kompania', url: 'https://www.facebook.com/tanecznakompaniapl/upcoming_hosted_events', locationHint: 'Katowice, Taneczna Kompania' },
    { name: 'Mohito Gliwice', url: 'https://www.facebook.com/SzkolaTancaMohitoGliwice/upcoming_hosted_events', locationHint: 'Gliwice, Mohito' },
    { name: 'Mohito Tychy', url: 'https://www.facebook.com/SzkolaTancaMohito/upcoming_hosted_events', locationHint: 'Tychy, Mohito' },
    { name: 'AllDance Bielsko-Biała', url: 'https://www.facebook.com/alldancebielsko/upcoming_hosted_events', locationHint: 'Bielsko-Biała, AllDance' },
    { name: 'DANCE#LOVEit Bielsko-Biała', url: 'https://www.facebook.com/danceloveit/upcoming_hosted_events', locationHint: 'Bielsko-Biała, DANCE#LOVEit & Corazon' },
    { name: 'Sabrosa Kraków', url: 'https://www.facebook.com/SabrosaDanceStudio/upcoming_hosted_events', locationHint: 'Kraków, Sabrosa Dance Studio' },
    { name: 'Forum Tańca Kraków', url: 'https://www.facebook.com/forumtanca/upcoming_hosted_events', locationHint: 'Kraków, Forum Tańca' },
    { name: 'LOFToDANCE Kraków', url: 'https://www.facebook.com/loftodance/upcoming_hosted_events', locationHint: 'Kraków, LOFToDANCE' },
    { name: 'Salsa House Kraków', url: 'https://www.facebook.com/salsahousekrakow/upcoming_hosted_events', locationHint: 'Kraków, Salsa House' },
    { name: 'VivaSalsa Kraków', url: 'https://www.facebook.com/vivasalsakrakow/upcoming_hosted_events', locationHint: 'Kraków, Zaraz Wracam Tu' },
    { name: 'Teatro Cubano Kraków', url: 'https://www.facebook.com/teatrocubanokrakow/upcoming_hosted_events', locationHint: 'Kraków, Teatro Cubano' },
  ];

  /**
   * Warstwa 4c (Active Same-Origin Organizer Crawler):
   * Będąc zalogowanym na dowolnej karcie Facebooka, odpytuje w tle strony /upcoming_hosted_events
   * najważniejszych szkół i klubów ze Śląska i Krakowa, wyciągając wszystkie ich nadchodzące wydarzenia.
   */
  async function crawlFacebookOrganizerPages(fetchImpl = null, now = new Date(), pages = FB_REGIONAL_ORGANIZER_PAGES) {
    const fetcher =
      fetchImpl || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    if (!fetcher) return [];

    const discoveredByUrl = new Map();
    const BATCH_SIZE = 4;

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (page) => {
          try {
            const res = await fetcher(page.url, { credentials: 'same-origin' });
            if (!res || !res.ok) return;
            const html = await res.text();
            const relayEvents = extractEventsFromRelayJson(html, now);
            for (const rev of relayEvents) {
              if (!rev.location && page.locationHint) {
                rev.location = page.locationHint;
                rev.description = `${rev.title} ${page.locationHint}`.trim();
              }
              discoveredByUrl.set(canonicalizeEventUrl(rev.url), rev);
            }
            // Wyciągnij również surowe identyfikatory /events/ID/ zaszyte w kodzie strony organizatora
            const idMatches = [...html.matchAll(/\/events\/(\d{10,20})(?:\/|["'?])/g)];
            for (const m of idMatches) {
              const canon = `https://www.facebook.com/events/${m[1]}/`;
              if (!discoveredByUrl.has(canon) && discoveredByUrl.size < 80) {
                discoveredByUrl.set(canon, {
                  url: canon,
                  title: '',
                  rawDate: '',
                  isoDate: '',
                  location: page.locationHint || '',
                  description: page.locationHint || '',
                  _needsDate: true,
                });
              }
            }
          } catch {
            // Ignoruj niedostępne strony organizatorów
          }
        })
      );
    }

    return Array.from(discoveredByUrl.values());
  }

  async function autoScrollPage(steps = 6, delayMs = 350) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (/\/events\/\d+/.test(window.location.href)) return;
    for (let i = 0; i < steps; i++) {
      window.scrollBy(0, window.innerHeight * 0.9);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    window.scrollTo(0, 0);
  }

  async function copyToClipboardModern(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fallback poniżej
      }
    }
    if (typeof document !== 'undefined') {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    }
    return false;
  }

  async function runBrowserScraper() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return [];
    console.log('🚀 [DancePuls Scraper v3.3] Rozpoczynam wielowarstwową ekstrakcję wydarzeń + Active Organizer Crawl + Deep Fetch...');
    await autoScrollPage(6, 300);
    const now = new Date();
    const initialEvents = extractEventsFromDocument(document, window.location.href, now);
    let combinedCandidates = [...initialEvents];
    if (/facebook\.com/i.test(window.location.hostname) && !/\/events\/\d+/.test(window.location.pathname)) {
      const crawled = await crawlFacebookOrganizerPages(null, now);
      combinedCandidates = [...combinedCandidates, ...crawled];
    }
    const events = await deepEnrichFacebookEvents(combinedCandidates, document, null, now);

    if (events.length > 0) {
      const json = JSON.stringify(events, null, 2);
      await copyToClipboardModern(json);
      console.log(`✅ [DancePuls Scraper v3.3] Pobrano, wzbogacono i skopiowano ${events.length} wydarzeń!`);
      console.table(events.map((e) => ({ data: e.rawDate, iso: e.isoDate, tytul: e.title, miejsce: e.location, url: e.url })));
      alert(`✅ DancePuls Scraper v3.3: Skopiowano ${events.length} wzbogaconych wydarzeń do schowka!`);
    } else {
      console.warn('⚠️ [DancePuls Scraper v3.3] Nie znaleziono nadchodzących wydarzeń na tej stronie.');
      alert('⚠️ Nie znaleziono nadchodzących wydarzeń (>= dzisiaj). Przewiń listę wydarzeń i spróbuj ponownie.');
    }
    return events;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !root.__DANCEPULS_TEST_ENV__) {
    runBrowserScraper();
  }

  const exported = {
    parseFBDate,
    toLocalYMD,
    formatRawDateDDMM,
    canonicalizeEventUrl,
    cleanDescription,
    extractEventsFromRelayJson,
    extractEventsFromDocument,
    parseEventDetailHtml,
    deepEnrichFacebookEvents,
    crawlFacebookOrganizerPages,
    FB_REGIONAL_ORGANIZER_PAGES,
    runBrowserScraper,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.DancePulsScraper = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
