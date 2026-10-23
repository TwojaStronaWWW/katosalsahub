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
const ASSET_VERSION = '5.0';
const HTML_PAGES = ['index.html', 'grafik.html', 'salsopedia.html', 'privacy.html'];

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
  ];
  return scripts.join('\n');
}

function transformPageHtml(rawHtml, pageFile) {
  let html = String(rawHtml || '').replace(/\r\n/g, '\n');

  html = html.replace(
    /href="assets\/css\/([a-z0-9_-]+\.css)(?:\?v=[^"]*)?"/gi,
    `href="assets/css/$1?v=${ASSET_VERSION}"`
  );
  html = html.replace(/<nav class="nav-bar">[\s\S]*?<\/nav>/, buildNavBar(pageFile));
  html = html.replace(/<footer class="footer">[\s\S]*?<\/footer>/, buildFooter(pageFile));
  html = html.replace(/<div id="cookie-banner"[\s\S]*?<\/div>\s*<\/div>/, buildCookieBanner());
  html = html.replace(
    /(\s*<script data-cfasync="false" src="assets\/js\/[\s\S]*?<\/script>)+/,
    '\n\n' + buildScriptsBlock(pageFile)
  );

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
