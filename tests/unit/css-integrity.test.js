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
});
