/**
 * KATO SALSA HUB — CENTRALIZED LAYOUT & ASSET SYNCHRONIZER (Zero-Bloat SSOT)
 *
 * Utrzymuje w 100% spójny, scentralizowany układ wspólnych komponentów:
 * - Nawigacja główna (<nav class="nav-bar">)
 * - Stopka (<footer class="footer">)
 * - Baner prywatności (<div id="cookie-banner" data-nosnippet>)
 * - Zestaw skryptów JS i wersjonowanie cache-busting (?v=X.Y)
 * we wszystkich widokach portalu: index.html, grafik.html, salsopedia.html, privacy.html.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const KSH_DIR = path.join(ROOT_DIR, 'katosalsahub.pl');
const ASSET_VERSION = '5.1';
const HTML_PAGES = ['index.html', 'grafik.html', 'salsopedia.html', 'privacy.html'];

function buildSkipLink() {
  return `<a href="#app-content" class="skip-link" data-i18n="nav.skipLink">Przejdź do głównej treści</a>`;
}

function buildNavBar(pageFile) {
  const isHome = pageFile === 'index.html';
  const prefix = isHome ? '' : 'index.html';
  const logoHref = isHome ? '#hero' : 'index.html';
  const scheduleActive = pageFile === 'grafik.html' ? ' class="active"' : '';
  const wikiActive = pageFile === 'salsopedia.html' ? ' class="active"' : '';

  return `<nav class="nav-bar">
    <div class="nav-brand-group">
      <a href="${logoHref}" class="nav-logo">
        <span class="logo-text">KATO SALSA HUB</span>
        <span class="logo-emoji">🔥</span>
      </a>
      <button id="header-radio-play" class="header-radio-btn" aria-label="Włącz radio" data-i18n-aria-label="nav.radioAria">
        <i class="fas fa-play"></i>
      </button>
    </div>
    <div class="nav-links">
      <a href="${prefix}#hero" data-i18n="nav.start">Start</a>
      <a href="${prefix}#onas" data-i18n="nav.about">O nas</a>
      <a href="${prefix}#style" data-i18n="nav.styles">Style</a>
      <a href="grafik.html"${scheduleActive} data-page="schedule" data-i18n="nav.schedule">Grafik</a>
      <a href="salsopedia.html"${wikiActive} data-page="wiki" data-i18n="nav.wiki">Salsopedia</a>
      <a href="${prefix}#radio" data-i18n="nav.radio">Radio</a>
      <a href="${prefix}#mapa" data-i18n="nav.map">Lokacja</a>
      <a href="https://photos.app.goo.gl/faiU7NhFAgpTEPRt9" target="_blank" rel="noopener noreferrer" data-i18n="nav.photos">Zdjęcia</a>
      <a href="${prefix}#faq" data-i18n="nav.faq">FAQ</a>
      <a href="${prefix}#kontakt" class="cta-link" data-i18n="nav.contact">Kontakt</a>
    </div>
    <div class="nav-right-group">
      <div class="lang-switcher" role="group" aria-label="Wybierz język / Idioma / Language" data-i18n-aria-label="nav.langAria">
        <button type="button" class="lang-btn is-active" data-lang="pl" aria-pressed="true" title="Polski"><span class="lang-flag" aria-hidden="true">🇵🇱</span><span>PL</span></button>
        <button type="button" class="lang-btn" data-lang="es" aria-pressed="false" title="Español (Cuba)"><span class="lang-flag" aria-hidden="true">🇨🇺</span><span>ES</span></button>
        <button type="button" class="lang-btn" data-lang="en" aria-pressed="false" title="English (UK)"><span class="lang-flag" aria-hidden="true">🇬🇧</span><span>EN</span></button>
      </div>
      <div class="burger-menu">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </nav>`;
}

function buildFooter(pageFile) {
  const isHome = pageFile === 'index.html';
  const prefix = isHome ? '' : 'index.html';

  return `<footer class="footer">
    <div class="footer-content">
      <div class="footer-brand">
        <h3>KATO SALSA HUB 🔥</h3>
        <p data-i18n="footer.tagline">Salsa Katowice – Kubańska energia w sercu Śląska</p>
        <div class="lang-switcher lang-switcher--footer" role="group" aria-label="Wybierz język / Idioma / Language" data-i18n-aria-label="nav.langAria">
          <button type="button" class="lang-btn is-active" data-lang="pl" aria-pressed="true" title="Polski"><span class="lang-flag" aria-hidden="true">🇵🇱</span><span>PL</span></button>
          <button type="button" class="lang-btn" data-lang="es" aria-pressed="false" title="Español (Cuba)"><span class="lang-flag" aria-hidden="true">🇨🇺</span><span>ES</span></button>
          <button type="button" class="lang-btn" data-lang="en" aria-pressed="false" title="English (UK)"><span class="lang-flag" aria-hidden="true">🇬🇧</span><span>EN</span></button>
        </div>
      </div>
      <div class="footer-links">
        <a href="${prefix}#hero" data-i18n="nav.start">Start</a>
        <a href="${prefix}#onas" data-i18n="nav.about">O nas</a>
        <a href="${prefix}#style" data-i18n="nav.styles">Style</a>
        <a href="grafik.html" data-i18n="nav.schedule">Grafik</a>
        <a href="salsopedia.html">Salsopedia</a>
        <a href="${prefix}#mapa" data-i18n="footer.where">Gdzie tańczymy</a>
        <a href="https://photos.app.goo.gl/faiU7NhFAgpTEPRt9" target="_blank" rel="noopener noreferrer" data-i18n="nav.photos">Zdjęcia</a>
        <a href="${prefix}#faq" data-i18n="nav.faq">FAQ</a>
        <a href="${prefix}#kontakt" data-i18n="nav.contact">Kontakt</a>
        <a href="https://www.facebook.com/KatoSalsaHub" target="_blank" rel="noopener noreferrer">Facebook</a>
        <a href="https://www.instagram.com/katosalsahub/" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="privacy.html" data-i18n="footer.privacy">Polityka Prywatności</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; <span id="rok"></span> Kato Salsa Hub. <span data-i18n="footer.createdBy">Stworzone przez</span> <a href="https://twojastronawww.pl"
          target="_blank" rel="noopener noreferrer">TwojaStronaWWW</a></p>
    </div>
  </footer>`;
}

function buildCookieBanner() {
  return `<div id="cookie-banner" class="cookie-banner" data-nosnippet>
    <div class="cookie-content">
      <h4 data-i18n="cookie.title">🍪 Ciasteczka i Prywatność</h4>
      <p data-i18n-html="cookie.text">Używamy ciasteczek, aby zapewnić najlepszą jakość korzystania z naszej strony. Sprawdź naszą <a
          href="privacy.html">Politykę Prywatności</a>.</p>
    </div>
    <div class="cookie-actions">
      <button id="accept-cookies" class="btn btn-primary" data-i18n="cookie.accept">Akceptuję</button>
    </div>
  </div>`;
}

function buildScriptsBlock(_pageFile, version = ASSET_VERSION) {
  const scripts = [
    `  <script data-cfasync="false" src="assets/js/i18n.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/contact.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/cookies.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/wiki-studio.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/wiki.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/radio.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/home.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/schedule.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/router.js?v=${version}"></script>`,
    `  <script data-cfasync="false" src="assets/js/ai-widget.js?v=${version}" data-site-id="katosalsahub" data-title="Asystent Kato Salsa Hub" data-kb-url="assets/data/salsopedia.json"></script>`,
    `  <!-- [REF-02] Speculation Rules API (Web Platform Baseline): natychmiastowa nawigacja 0 ms bez SPA przy najechaniu kursorem -->`,
    `  <script type="speculationrules">`,
    `  {`,
    `    "prerender": [`,
    `      {`,
    `        "where": {`,
    `          "and": [`,
    `            { "href_matches": "/*" },`,
    `            { "not": { "href_matches": "/api/*" } },`,
    `            { "not": { "href_matches": "/assets/php/*" } },`,
    `            { "not": { "href_matches": "/admin/*" } }`,
    `          ]`,
    `        },`,
    `        "eagerness": "moderate"`,
    `      }`,
    `    ]`,
    `  }`,
    `  </script>`,
  ];
  return scripts.join('\n');
}

const DAY_NAMES_PL = {
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
  7: 'Niedziela',
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPlDateHeader(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekdays = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const dayName = weekdays[dt.getUTCDay()] || '';
  return `${dayName} • ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function getCleanEventDescription(ev) {
  if (ev.opisPubliczny) return ev.opisPubliczny;
  const raw = String(ev.opis || ev.tytul || '');
  return raw.split(';')[0].replace(/\s*-\s*dzień miniony.*$/i, '').trim();
}

function buildStaticScheduleClassesBlock() {
  const schedPath = path.join(KSH_DIR, 'assets', 'data', 'schedule.json');
  if (!fs.existsSync(schedPath)) return null;
  const sched = JSON.parse(fs.readFileSync(schedPath, 'utf-8'));
  const schools = Array.isArray(sched.schools) ? sched.schools : [];
  const classes = Array.isArray(sched.classes) ? sched.classes.slice() : [];
  const schoolsMap = new Map(schools.map((s) => [s.id, s]));

  classes.sort((a, b) => {
    const dayDiff = (Number(a.dayOfWeek) || 0) - (Number(b.dayOfWeek) || 0);
    if (dayDiff !== 0) return dayDiff;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });

  const byDay = new Map();
  for (const cls of classes) {
    const d = Number(cls.dayOfWeek) || 1;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(cls);
  }

  const sectionsHtml = [];
  for (const [dayNum, dayClasses] of byDay.entries()) {
    const dayName = DAY_NAMES_PL[dayNum] || `Dzień ${dayNum}`;
    const badgeText = `${dayClasses.length} ${dayClasses.length === 1 ? 'zajęcia' : 'zajęć'}`;
    const cardsHtml = dayClasses
      .map((item) => {
        const school = schoolsMap.get(item.schoolId) || {
          id: item.schoolId,
          name: item.schoolId,
          badgeClass: 'school-badge--lc',
          website: 'https://katosalsahub.pl/grafik.html',
        };
        const schoolLower = String(item.schoolId || 'lc').toLowerCase();
        const levelLower = String(item.levelCode || 'open').toLowerCase();
        const instructorsHtml = (item.instructors || [])
          .map((inst) => {
            const href = inst.termId
              ? `salsopedia.html?term=${encodeURIComponent(inst.termId)}`
              : 'salsopedia.html';
            return `<a href="${href}" class="instructor-link-pill" title="Zobacz profil instruktora w Salsopedii"><i class="fas fa-user-graduate"></i> ${escapeHtml(inst.name)}</a>`;
          })
          .join('');

        return `                  <article class="schedule-card schedule-card--${escapeHtml(schoolLower)}" data-class-id="${escapeHtml(item.id)}" data-school-id="${escapeHtml(item.schoolId)}">
                    <div>
                      <div class="schedule-card-top">
                        <span class="schedule-time-box"><i class="far fa-clock"></i> ${escapeHtml(item.startTime)} – ${escapeHtml(item.endTime)}</span>
                        <div class="schedule-badges-row">
                          <span class="school-badge ${escapeHtml(school.badgeClass || `school-badge--${schoolLower}`)}">${escapeHtml(school.name)}</span>
                          <span class="level-badge level-badge--${escapeHtml(levelLower)}">${escapeHtml(item.levelLabel || item.levelCode)}</span>
                        </div>
                      </div>
                      <div class="schedule-card-style">${escapeHtml(item.styleLabel)} • ${escapeHtml(item.room)}</div>
                      <h3 class="schedule-card-title">${escapeHtml(item.title)}</h3>
                      <p class="schedule-card-notes">${escapeHtml(item.notes)}</p>
                    </div>
                    <div class="schedule-card-meta">
                      <div class="schedule-meta-row">
                        <div class="schedule-instructors">${instructorsHtml}</div>
                      </div>
                      <div class="schedule-card-actions">
                        <button type="button" class="schedule-action-btn js-focus-school-map" data-school-id="${escapeHtml(item.schoolId)}" title="Pokaż szkołę ${escapeHtml(school.name)} na mapie">
                          <i class="fas fa-map-marker-alt"></i> Pokaż na mapie
                        </button>
                        <a href="${escapeHtml(school.website || 'https://katosalsahub.pl/grafik.html')}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn">
                          <i class="fas fa-external-link-alt"></i> Strona szkoły
                        </a>
                      </div>
                    </div>
                  </article>`;
      })
      .join('\n');

    sectionsHtml.push(`              <div class="schedule-day-section" data-day="${dayNum}">
                <div class="schedule-day-heading">
                  <h2><i class="far fa-calendar-check"></i> ${escapeHtml(dayName)}</h2>
                  <span class="schedule-day-badge">${badgeText}</span>
                </div>
                <div class="schedule-cards-list">
${cardsHtml}
                </div>
              </div>`);
  }

  return {
    count: classes.length,
    html: `<div id="scheduleClassesContainer">\n${sectionsHtml.join('\n')}\n            </div>`,
  };
}

function buildStaticScheduleEventsBlock() {
  const eventsPath = path.join(KSH_DIR, 'assets', 'data', 'events.json');
  if (!fs.existsSync(eventsPath)) return null;
  const days = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
  if (!Array.isArray(days)) return null;

  let totalEvents = 0;
  const sectionsHtml = [];

  for (const dayEntry of days) {
    if (!dayEntry || !Array.isArray(dayEntry.events) || dayEntry.events.length === 0) continue;
    totalEvents += dayEntry.events.length;
    const headerTitle = formatPlDateHeader(dayEntry.date);

    const cardsHtml = dayEntry.events
      .map((ev) => {
        const isKato = String(ev.miasto || '').toLowerCase() === 'katowice';
        const cityClass = isKato ? 'event-city-pill' : 'event-city-pill event-city-pill--other';
        const promotedClass = ev.promote ? 'event-card-ksh event-card-ksh--promoted' : 'event-card-ksh';
        const starBadge = ev.promote ? '<span class="event-ksh-star">⭐ Polecane KSH</span>' : '';
        const cleanDesc = getCleanEventDescription(ev);
        const stylesTags = (ev.style || [])
          .map((st) => `<span class="event-style-tag">${escapeHtml(st)}</span>`)
          .join('');
        const gpsUrl =
          typeof ev.lat === 'number' && typeof ev.lng === 'number'
            ? `https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}&travelmode=driving`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.miejsce} ${ev.miasto}`)}`;

        const externalLinkBtn = ev.link
          ? `<a href="${escapeHtml(ev.link)}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn"><i class="fas fa-external-link-alt"></i> Szczegóły wydarzenia</a>`
          : '';

        return `                  <article class="${promotedClass}">
                    <div>
                      <div class="schedule-card-top">
                        <div class="schedule-badges-row">
                          <span class="${cityClass}"><i class="fas fa-map-pin"></i> ${escapeHtml(ev.miasto)}</span>
                          ${starBadge}
                        </div>
                        <div class="event-styles-tags">${stylesTags}</div>
                      </div>
                      <div class="schedule-card-style">${escapeHtml(ev.miejsce)}${ev.adres ? ` • ${escapeHtml(ev.adres)}` : ''}</div>
                      <h3 class="schedule-card-title">${escapeHtml(ev.tytul || cleanDesc)}</h3>
                      <p class="schedule-card-notes">${escapeHtml(cleanDesc)}</p>
                    </div>
                    <div class="schedule-card-meta">
                      <div class="schedule-card-actions">
                        ${externalLinkBtn}
                        <a href="${escapeHtml(gpsUrl)}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn">
                          <i class="fas fa-route"></i> Nawiguj GPS
                        </a>
                      </div>
                    </div>
                  </article>`;
      })
      .join('\n');

    sectionsHtml.push(`              <div class="schedule-day-section" data-event-date="${escapeHtml(dayEntry.date)}">
                <div class="schedule-day-heading">
                  <h2><i class="fas fa-fire-alt"></i> ${escapeHtml(headerTitle)}</h2>
                  <span class="schedule-day-badge">${dayEntry.events.length} ${dayEntry.events.length === 1 ? 'wydarzenie' : 'wydarzeń'}</span>
                </div>
                <div class="schedule-cards-list">
${cardsHtml}
                </div>
              </div>`);
  }

  return {
    count: totalEvents,
    html: `<div id="scheduleEventsContainer">\n${sectionsHtml.join('\n')}\n            </div>`,
  };
}

function transformPageHtml(rawHtml, pageFile) {
  let html = String(rawHtml || '').replace(/\r\n/g, '\n');

  html = html.replace(
    /<body>(?:\s*<a\s+href="#app-content"\s+class="skip-link"[^>]*>[\s\S]*?<\/a>)?/,
    `<body>\n  ${buildSkipLink()}`
  );
  html = html.replace(
    /href="assets\/css\/([a-z0-9_-]+\.css)(?:\?v=[^"]*)?"/gi,
    `href="assets/css/$1?v=${ASSET_VERSION}"`
  );
  html = html.replace(/<nav class="nav-bar">[\s\S]*?<\/nav>/, buildNavBar(pageFile));
  html = html.replace(/<footer class="footer">[\s\S]*?<\/footer>/, buildFooter(pageFile));
  html = html.replace(/<div id="cookie-banner"[\s\S]*?<\/div>\s*<\/div>/, buildCookieBanner());
  html = html.replace(
    /(\s*<script data-cfasync="false" src="assets\/js\/[\s\S]*?<\/script>)+(?:\s*<!-- \[REF-02\][\s\S]*?<\/script>)?/,
    '\n\n' + buildScriptsBlock(pageFile)
  );

  if (pageFile === 'grafik.html') {
    const classesBlock = buildStaticScheduleClassesBlock();
    if (classesBlock) {
      html = html.replace(
        /<span id="modeCountClasses" class="schedule-mode-count">\d+<\/span>/,
        `<span id="modeCountClasses" class="schedule-mode-count">${classesBlock.count}</span>`
      );
      html = html.replace(
        /<div id="scheduleClassesContainer">[\s\S]*?<\/div>\s*(?=\s*<\/div>\s*<!-- WIDOK 2: PORÓWNYWARKA CENNIKÓW)/,
        classesBlock.html + '\n          '
      );
    }

    const eventsBlock = buildStaticScheduleEventsBlock();
    if (eventsBlock) {
      html = html.replace(
        /<span id="modeCountEvents" class="schedule-mode-count">\d+<\/span>/,
        `<span id="modeCountEvents" class="schedule-mode-count">${eventsBlock.count}</span>`
      );
      html = html.replace(
        /<div id="scheduleEventsContainer">[\s\S]*?<\/div>\s*(?=\s*<\/div>\s*<!-- WIDOK 3: ZINTEGROWANA MAPA)/,
        eventsBlock.html + '\n          '
      );
    }
  }

  return html;
}

function transformServiceWorkerJs(rawSw) {
  let sw = String(rawSw || '').replace(/\r\n/g, '\n');
  sw = sw.replace(
    /'\/assets\/(css|js)\/([a-z0-9_-]+\.(?:css|js))(?:\?v=[^']*)?'/gi,
    `'/assets/$1/$2?v=${ASSET_VERSION}'`
  );
  return sw;
}

function syncAllLayouts({ write = true } = {}) {
  const results = [];
  for (const pageFile of HTML_PAGES) {
    const fullPath = path.join(KSH_DIR, pageFile);
    const original = fs.readFileSync(fullPath, 'utf-8').replace(/\r\n/g, '\n');
    const updated = transformPageHtml(original, pageFile);
    const changed = original !== updated;
    if (changed && write) {
      fs.writeFileSync(fullPath, updated, 'utf-8');
    }
    results.push({ pageFile, changed });
  }

  const swPath = path.join(KSH_DIR, 'sw.js');
  if (fs.existsSync(swPath)) {
    const originalSw = fs.readFileSync(swPath, 'utf-8').replace(/\r\n/g, '\n');
    const updatedSw = transformServiceWorkerJs(originalSw);
    const swChanged = originalSw !== updatedSw;
    if (swChanged && write) {
      fs.writeFileSync(swPath, updatedSw, 'utf-8');
    }
    results.push({ pageFile: 'sw.js', changed: swChanged });
  }

  return results;
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check');
  const results = syncAllLayouts({ write: !checkOnly });
  for (const r of results) {
    console.log(`[Layout Sync] ${r.pageFile}: ${r.changed ? (checkOnly ? 'WYMAGA SYNCHRONIZACJI' : 'ZSYNCHRONIZOWANO') : 'OK'}`);
  }
  if (checkOnly && results.some((r) => r.changed)) {
    process.exit(1);
  }
}

module.exports = {
  ASSET_VERSION,
  HTML_PAGES,
  buildNavBar,
  buildFooter,
  buildCookieBanner,
  buildScriptsBlock,
  transformPageHtml,
  transformServiceWorkerJs,
  syncAllLayouts,
};
