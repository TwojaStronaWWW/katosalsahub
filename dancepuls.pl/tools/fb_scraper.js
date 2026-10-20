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

    // 2. Daty relatywne
    if (/\b(dzisiaj|dziś|dzis|today)\b/i.test(lower)) {
      return new Date(todayStart);
    }
    if (/\b(jutro|tomorrow)\b/i.test(lower)) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (/\bpojutrze\b/i.test(lower)) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + 2);
      return d;
    }

    // 3. Format OpenGraph FB: "października 25 2026" / "October 25, 2026"
    const reMonthFirst = new RegExp(
      `\\b(${MONTH_KEYS_PATTERN})\\s+(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?,?\\s+(\\d{4})\\b`,
      'i'
    );
    const mMonthFirst = lower.match(reMonthFirst);
    if (mMonthFirst) {
      const monthIdx = MONTHS_MAP[mMonthFirst[1].toLowerCase()];
      const day = parseInt(mMonthFirst[2], 10);
      const year = parseInt(mMonthFirst[3], 10);
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        return new Date(year, monthIdx, day);
      }
    }

    // 4. Format "24 października 2026", "24–25 października", "20 paź"
    const reDayFirst = new RegExp(
      `\\b(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?\\s+(${MONTH_KEYS_PATTERN})(?:\\s+(\\d{4}))?\\b`,
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
   * Odporna na zmiany klas CSS w DOM — czyta surowe węzły danych z "start_timestamp", "name" i "id".
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

    // Wzorzec węzłów wydarzeń w Relay JSON
    const eventNodeRegex = /"id"\s*:\s*"(\d{10,20})"[^{}]{0,600}?"name"\s*:\s*"((?:[^"\\]|\\.)+)"[^{}]{0,1200}?"start_timestamp"\s*:\s*(\d{9,11})/g;
    const reverseNodeRegex = /"start_timestamp"\s*:\s*(\d{9,11})[^{}]{0,1200}?"id"\s*:\s*"(\d{10,20})"[^{}]{0,600}?"name"\s*:\s*"((?:[^"\\]|\\.)+)"/g;

    const decodeJsonString = (s) => {
      try {
        return JSON.parse(`"${s}"`);
      } catch {
        return s;
      }
    };

    const addMatch = (id, rawName, tsSec, contextSlice) => {
      if (!id || seenIds.has(id)) return;
      const title = decodeJsonString(rawName).trim();
      if (!title || EXCLUDED_TITLES.some((ex) => title.toUpperCase().includes(ex))) return;

      const d = parseFBDate(Number(tsSec), now);
      if (!d) return;

      let location = '';
      const locMatch = contextSlice.match(/"contextual_name"\s*:\s*"((?:[^"\\]|\\.)+)"/);
      if (locMatch) {
        location = decodeJsonString(locMatch[1]);
      }

      seenIds.add(id);
      results.push({
        url: `https://www.facebook.com/events/${id}/`,
        isoDate: toLocalYMD(d),
        rawDate: formatRawDateDDMM(d, now.getFullYear()),
        title,
        location,
        description: `${title} ${location}`.trim(),
      });
    };

    for (const m of src.matchAll(eventNodeRegex)) {
      const slice = src.slice(Math.max(0, m.index - 200), Math.min(src.length, m.index + 1600));
      addMatch(m[1], m[2], m[3], slice);
    }
    for (const m of src.matchAll(reverseNodeRegex)) {
      const slice = src.slice(Math.max(0, m.index - 200), Math.min(src.length, m.index + 1600));
      addMatch(m[2], m[3], m[1], slice);
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

    // 4. Semantyczny skan kart DOM (a[href*="/events/"] oraz karty Krajownik / LOFToDANCE)
    const anchors = doc.querySelectorAll
      ? Array.from(doc.querySelectorAll('a[href*="/events/"], a[href*="/wydarzenia/"], a[href*="/wydarzenie/"]'))
      : [];

    for (const link of anchors) {
      const rawHref = link.href || link.getAttribute('href') || '';
      if (!rawHref) continue;
      if (rawHref.includes('facebook.com') && !/\/events\/(?:[^/?#]+\/[^/?#]+\/|s\/[^/?#]+\/)?\d+/.test(rawHref)) {
        continue;
      }

      const card =
        (link.closest &&
          link.closest('[role="article"], article, li, div[style*="border-radius"], .event-card')) ||
        link.parentElement?.parentElement ||
        link;

      const textContent = (card.innerText || card.textContent || '').trim();
      const lines = textContent
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let parsedDate = null;
      let dateLineIdx = -1;
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const d = parseFBDate(lines[i], now);
        if (d) {
          parsedDate = d;
          dateLineIdx = i;
          break;
        }
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
          /Katowice|Gliwice|Sosnowiec|Zabrze|Tychy|Chorzów|Bielsko|Kraków|Rybnik|Częstochowa|Wolni Ludzie|La Clave|Mil Pasos|Good Mood|Forum Tańca|Sabrosa|LOFToDANCE/i.test(
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

  async function autoScrollPage(steps = 3, delayMs = 350) {
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
    console.log('🚀 [DancePuls Scraper v3.0] Rozpoczynam wielowarstwową ekstrakcję wydarzeń...');
    await autoScrollPage(3, 300);
    const events = extractEventsFromDocument(document, window.location.href, new Date());

    if (events.length > 0) {
      const json = JSON.stringify(events, null, 2);
      await copyToClipboardModern(json);
      console.log(`✅ [DancePuls Scraper v3.0] Pobrano i skopiowano ${events.length} wydarzeń!`);
      console.table(events.map((e) => ({ data: e.rawDate, iso: e.isoDate, tytul: e.title, miejsce: e.location, url: e.url })));
      alert(`✅ DancePuls Scraper v3.0: Skopiowano ${events.length} wydarzeń do schowka!`);
    } else {
      console.warn('⚠️ [DancePuls Scraper v3.0] Nie znaleziono nadchodzących wydarzeń na tej stronie.');
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
    runBrowserScraper,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.DancePulsScraper = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
