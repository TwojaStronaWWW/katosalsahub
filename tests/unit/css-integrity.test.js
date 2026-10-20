const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const CSS_FILES = [
  'katosalsahub.pl/assets/css/style.css',
  'katosalsahub.pl/assets/css/components.css',
  'katosalsahub.pl/assets/css/sections.css',
  'katosalsahub.pl/assets/css/radio.css',
  'katosalsahub.pl/assets/css/wiki.css',
  'katosalsahub.pl/assets/css/schedule.css',
  'dancepuls.pl/css/style.css',
];

describe('Integralność i składnia arkuszy stylów CSS (Kato Salsa Hub & DancePuls)', () => {
  it('wszystkie arkusze CSS powinny istnieć i posiadać zbalansowane nawiasy klamrowe {} oraz okrągłe ()', () => {
    for (const relPath of CSS_FILES) {
      const fullPath = path.join(ROOT_DIR, relPath);
      assert.ok(fs.existsSync(fullPath), `Brak arkusza CSS: ${relPath}`);
      const css = fs.readFileSync(fullPath, 'utf-8');
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

      const openBraces = (stripped.match(/\{/g) || []).length;
      const closeBraces = (stripped.match(/\}/g) || []).length;
      assert.strictEqual(
        openBraces,
        closeBraces,
        `Niezbalansowane nawiasy klamrowe {} w ${relPath}: { (${openBraces}) vs } (${closeBraces})`
      );

      const openParen = (stripped.match(/\(/g) || []).length;
      const closeParen = (stripped.match(/\)/g) || []).length;
      assert.strictEqual(
        openParen,
        closeParen,
        `Niezbalansowane nawiasy okrągłe () w ${relPath}: ( (${openParen}) vs ) (${closeParen})`
      );
    }
  });

  it('główne arkusze stylów powinny definiować zmienne CSS (Design Tokens) w :root', () => {
    const kshStyle = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/style.css'), 'utf-8');
    const dpStyle = fs.readFileSync(path.join(ROOT_DIR, 'dancepuls.pl/css/style.css'), 'utf-8');

    assert.match(kshStyle, /:root\s*\{/i);
    assert.match(dpStyle, /:root\s*\{/i);
  });

  it('licznik kategorii .cat-count w wiki.css powinien posiadać flex-shrink: 0 i white-space: nowrap (ochrona przed łamaniem dwucyfrowych liczb w pionie)', () => {
    const wikiCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/wiki.css'), 'utf-8');
    assert.match(wikiCss, /\.cat-count\s*\{[^}]*flex-shrink:\s*0/s, 'Brak flex-shrink: 0 w .cat-count');
    assert.match(wikiCss, /\.cat-count\s*\{[^}]*white-space:\s*nowrap/s, 'Brak white-space: nowrap w .cat-count');
  });

  it('components.css powinien zawierać wyodrębnione style widżetu AI (.tsw-ai-btn, .tsw-ai-window), a radio.css siatkę CSS Grid dla .sleep-timer-buttons (CLS = 0 & SoC)', () => {
    const compCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/components.css'), 'utf-8');
    const radioCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/radio.css'), 'utf-8');

    assert.match(compCss, /\.tsw-ai-btn\s*\{/, 'Brak stylów .tsw-ai-btn w components.css');
    assert.match(compCss, /\.tsw-ai-window\s*\{/, 'Brak stylów .tsw-ai-window w components.css');
    assert.match(
      radioCss,
      /\.sleep-timer-buttons\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*auto\)\)/s,
      'Brak stałej siatki CSS Grid 4-kolumnowej w .sleep-timer-buttons w radio.css (CLS = 0)'
    );
  });

  it('przyciski, zakładki i karty w schedule.css, wiki.css oraz sections.css powinny chronić przed wylewaniem napisów poza ramki na urządzeniach mobilnych (white-space: normal, overflow-wrap: anywhere, flex-wrap: wrap)', () => {
    const scheduleCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/schedule.css'), 'utf-8');
    const wikiCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/wiki.css'), 'utf-8');
    const sectionsCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl/assets/css/sections.css'), 'utf-8');

    assert.match(scheduleCss, /\.schedule-mode-btn\s*\{[^}]*white-space:\s*normal/s, 'Brak white-space: normal w .schedule-mode-btn');
    assert.match(scheduleCss, /\.day-pill-btn\s*\{[^}]*white-space:\s*normal/s, 'Brak white-space: normal w .day-pill-btn');
    assert.match(scheduleCss, /\.schedule-action-btn\s*\{[^}]*min-height:\s*38px[^}]*height:\s*auto/s, 'Brak elastycznej wysokości w .schedule-action-btn');
    assert.match(wikiCss, /\.wiki-card-header\s*\{[^}]*flex-wrap:\s*wrap/s, 'Brak flex-wrap: wrap w .wiki-card-header');
    assert.match(wikiCss, /\.wiki-card-footer\s*\{[^}]*flex-wrap:\s*wrap/s, 'Brak flex-wrap: wrap w .wiki-card-footer');
    assert.match(sectionsCss, /\.map-spot-badge\s*\{[^}]*overflow-wrap:\s*anywhere/s, 'Brak overflow-wrap: anywhere w .map-spot-badge');
  });
});
