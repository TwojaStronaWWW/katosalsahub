/**
 * UI Smoke Test w Headless Browserze (Playwright) - Wzorzec Gal Anonim (#11)
 * Weryfikuje:
 * 1. Poprawne wczytanie index.html bez błędów console.error / pageerror
 * 2. Kliknięcie #header-radio-play i aktywację klasy body.radio-playing
 * 3. Nawigację SPA (router.js) do widoku Salsopedii i podmianę #app-content
 * W razie awarii zapisuje zrzut ekranu i logi do katalogu smoke-diagnostics/.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const KSH_DIR = path.join(ROOT_DIR, 'katosalsahub.pl');
const DIAG_DIR = path.join(ROOT_DIR, 'smoke-diagnostics');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0].split('#')[0];
      const relPath = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
      const filePath = path.join(rootDir, relPath);

      if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function runSmokeTest() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.log('ℹ️ Moduł playwright nie jest zainstalowany lokalnie – pomijanie uruchomienia przeglądarki.');
    return;
  }

  const { server, url } = await startStaticServer(KSH_DIR);
  const consoleErrors = [];
  let browser;
  let page;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    // Blokuj zewnętrzne strumienie audio i mapy, aby test był szybki i deterministyczny w CI
    await page.route('**/*', (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith(url) || reqUrl.startsWith('data:')) {
        return route.continue();
      }
      return route.abort();
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignoruj błędy sieciowe wynikające z celowego zablokowania zewnętrznych domen w teście
        if (!text.includes('ERR_FAILED') && !text.includes('Failed to load resource')) {
          consoleErrors.push(`[console.error] ${text}`);
        }
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(`[pageerror] ${err.message}`);
    });

    console.log(`🌐 [1/4] Otwieranie ${url}/index.html...`);
    await page.goto(`${url}/index.html`, { waitUntil: 'domcontentloaded' });

    console.log('📻 [2/4] Testowanie przycisku radia (#header-radio-play -> body.radio-playing)...');
    await page.click('#header-radio-play');
    const isRadioPlaying = await page.evaluate(() => document.body.classList.contains('radio-playing'));
    assert.strictEqual(isRadioPlaying, true, 'Klasa body.radio-playing nie pojawiła się po kliknięciu #header-radio-play');

    console.log('📚 [3/4] Testowanie nawigacji SPA (router.js -> salsopedia.html)...');
    await page.click('a[data-page="wiki"]');
    await page.waitForSelector('#wikiGrid', { timeout: 5000 });
    const hasWikiGrid = await page.evaluate(() => Boolean(document.getElementById('wikiGrid')));
    assert.strictEqual(hasWikiGrid, true, 'Router SPA nie podmienił zawartości #app-content na widok Salsopedii');

    console.log('🔍 [4/4] Weryfikacja braku błędów console.error...');
    assert.strictEqual(
      consoleErrors.length,
      0,
      `Wykryto błędy w konsoli przeglądarki:\n${consoleErrors.join('\n')}`
    );

    console.log('✅ UI Smoke Test zakończony pełnym sukcesem!');
  } catch (error) {
    console.error('❌ UI Smoke Test zakończony błędem:', error.message);
    fs.mkdirSync(DIAG_DIR, { recursive: true });

    if (page) {
      try {
        await page.screenshot({
          path: path.join(DIAG_DIR, 'failure-screenshot.png'),
          fullPage: true
        });
      } catch {
        // Ignoruj błąd zrzutu ekranu
      }
    }

    const logContent = [
      `Timestamp: ${new Date().toISOString()}`,
      `Error: ${error.stack || error.message}`,
      '--- Console Errors ---',
      ...consoleErrors
    ].join('\n');

    fs.writeFileSync(path.join(DIAG_DIR, 'smoke-error.log'), logContent, 'utf-8');
    throw error;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runSmokeTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
