const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const KSH_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'index.html');
const DANCEPULS_HTML = path.join(ROOT_DIR, 'dancepuls.pl', 'index.html');

describe('Integralność semantyczna i SEO (HTML)', () => {
  describe('Kato Salsa Hub (katosalsahub.pl/index.html)', () => {
    const html = fs.readFileSync(KSH_HTML, 'utf-8');

    it('plik index.html powinien istnieć i mieć niepustą zawartość', () => {
      assert.ok(fs.existsSync(KSH_HTML));
      assert.ok(html.length > 500);
    });

    it('powinien posiadać poprawny DOCTYPE oraz deklarację języka polskiego <html lang="pl">', () => {
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
    });

    it('powinien definiować precyzyjny tytuł <title> z marką Kato Salsa Hub', () => {
      const match = html.match(/<title>(.*?)<\/title>/i);
      assert.ok(match, 'Brak znacznika <title>');
      assert.match(match[1], /Kato Salsa Hub/i);
    });

    it('powinien zawierać przycisk odtwarzacza radiowego z atrybutem aria-label', () => {
      assert.match(html, /id="header-radio-play"[^>]*aria-label="[^"]+"/i);
    });
  });

  describe('DancePuls (dancepuls.pl/index.html)', () => {
    it('plik index.html powinien istnieć i mieć poprawny szkielet', () => {
      assert.ok(fs.existsSync(DANCEPULS_HTML));
      const html = fs.readFileSync(DANCEPULS_HTML, 'utf-8');
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
    });
  });
});
