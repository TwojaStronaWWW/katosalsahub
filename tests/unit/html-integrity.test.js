const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const KSH_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'index.html');
const PRIVACY_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'privacy.html');
const SALSOPEDIA_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'salsopedia.html');
const DANCEPULS_HTML = path.join(ROOT_DIR, 'dancepuls.pl', 'index.html');

describe('Integralność semantyczna, SEO, RODO i SoC (HTML)', () => {
  describe('Kato Salsa Hub (katosalsahub.pl/index.html)', () => {
    const html = fs.readFileSync(KSH_HTML, 'utf-8');

    it('plik index.html powinien istnieć i mieć niepustą zawartość', () => {
      assert.ok(fs.existsSync(KSH_HTML));
      assert.ok(html.length > 500);
    });

    it('powinien posiadać poprawny DOCTYPE, lang="pl", meta description oraz manifest PWA (#21)', () => {
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
      assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i);
      assert.match(html, /<link\s+rel="manifest"\s+href="manifest\.json">/i);
    });

    it('powinien definiować precyzyjny tytuł <title> z marką Kato Salsa Hub', () => {
      const match = html.match(/<title>(.*?)<\/title>/i);
      assert.ok(match, 'Brak znacznika <title>');
      assert.match(match[1], /Kato Salsa Hub/i);
    });

    it('powinien zawierać przycisk odtwarzacza radiowego, metadane utworu (#20) oraz wyłącznik czasowy (#19)', () => {
      assert.match(html, /id="header-radio-play"[^>]*aria-label="[^"]+"/i);
      assert.match(html, /id="radio-now-playing"/i);
      assert.match(html, /id="radio-track-title"/i);
      assert.match(html, /class="sleep-timer-btn"\s+data-minutes="15"/i);
    });

    it('powinien wykorzystywać format WebP oraz atrybut loading="lazy" dla grafiki Hero (#23)', () => {
      assert.match(html, /srcset="assets\/images\/hero\.webp"/i);
      assert.match(html, /loading="lazy"/i);
    });

    it('powinien stosować minimalizację RODO ("Imię lub pseudonim" #6) oraz checkbox zgody RODO (#7)', () => {
      assert.match(html, /Imię lub pseudonim/i);
      assert.doesNotMatch(html, /Imię i nazwisko/i);
      assert.match(html, /id="gdpr_consent"[^>]*required/i);
    });

    it('nie powinien zawierać publicznego linku do Panelu Moderacji w stopce (#5), pustych linków href="#", stylów inline ani bloków inline <script> (SoC) oraz powinien ładować Asystenta AI', () => {
      assert.doesNotMatch(html, /\[Panel Moderacji Salsopedii\]/i);
      assert.doesNotMatch(html, /href\s*=\s*["']#["']/i, 'Wykryto pusty odnośnik href="#" w index.html');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w index.html');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w index.html');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)[^>]*>/i, 'Wykryto blok inline <script> w index.html');
      assert.match(html, /src="assets\/js\/ai-widget\.js(\?[^"]*)?"/i);
      assert.match(html, /data-site-id="katosalsahub"/i);
      assert.match(html, /data-kb-url="assets\/data\/salsopedia\.json"/i);
    });
  });

  describe('Polityka Prywatności (katosalsahub.pl/privacy.html)', () => {
    const html = fs.readFileSync(PRIVACY_HTML, 'utf-8');

    it('powinna zawierać informacje o systemie Helpdesk, anonimizacji IP (#7) oraz analityce Cookieless (#22)', () => {
      assert.match(html, /Helpdesk/i);
      assert.match(html, /Cookieless/i);
      assert.match(html, /imię lub pseudonim/i);
    });

    it('nie powinna zawierać bloków <style>, bloków inline <script>, stylów inline ani linku moderacji w stopce (#5, SoC) oraz powinna ładować Asystenta AI', () => {
      assert.doesNotMatch(html, /<style[\s>]/i);
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)[^>]*>/i, 'Wykryto blok inline <script> w privacy.html');
      assert.doesNotMatch(html, /\s+style\s*=/i);
      assert.doesNotMatch(html, /\[Panel Moderacji Salsopedii\]/i);
      assert.match(html, /src="assets\/js\/ai-widget\.js(\?[^"]*)?"/i);
    });
  });

  describe('Salsopedia (katosalsahub.pl/salsopedia.html)', () => {
    it('plik salsopedia.html powinien posiadać poprawny szkielet HTML5, Salsopedia Studio (Live Preview + Diff), modal ról Admin/Moderator oraz Asystenta AI', () => {
      assert.ok(fs.existsSync(SALSOPEDIA_HTML));
      const html = fs.readFileSync(SALSOPEDIA_HTML, 'utf-8');
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
      assert.match(html, /<title>.*Salsopedia.*<\/title>/i);
      assert.match(html, /id="wikiGrid"/i);
      assert.match(html, /id="wikiModal"/i);
      assert.match(html, /id="adminToolbar"/i);
      assert.match(html, /id="btnShowUnverified"/i);
      assert.match(html, /id="studioDiffBox"/i);
      assert.match(html, /id="livePreviewContainer"/i);
      assert.match(html, /id="teamModal"/i);
      assert.match(html, /src="assets\/js\/ai-widget\.js(\?[^"]*)?"/i);
      assert.match(html, /data-kb-url="assets\/data\/salsopedia\.json"/i);
    });

    it('plik salsopedia.html nie powinien zawierać styli inline, inline event handlerów, inline <script> ani publicznego linku moderacji w stopce (#5, SoC)', () => {
      const html = fs.readFileSync(SALSOPEDIA_HTML, 'utf-8');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w salsopedia.html naruszający SoC');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w salsopedia.html naruszający SoC');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)[^>]*>/i, 'Wykryto blok inline <script> w salsopedia.html');
      assert.doesNotMatch(html, /\[Panel Moderacji Salsopedii\]/i);
    });
  });

  describe('DancePuls (dancepuls.pl/index.html)', () => {
    it('plik index.html powinien istnieć, mieć poprawny szkielet, meta description i zawierać panel 6-sekcyjnego raportu KSH', () => {
      assert.ok(fs.existsSync(DANCEPULS_HTML));
      const html = fs.readFileSync(DANCEPULS_HTML, 'utf-8');
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
      assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i);
      assert.match(html, /id="load-report-btn"/i);
      assert.match(html, /id="open-audit-btn"/i);
      assert.match(html, /id="wynik-przyszle"/i);
      assert.match(html, /id="copy-comment2-btn"/i);
      assert.match(html, /id="copy-all-poll-btn"/i);
    });

    it('plik dancepuls.pl/index.html nie powinien zawierać stylów inline, inline event handlerów ani inline <script> (SoC)', () => {
      const html = fs.readFileSync(DANCEPULS_HTML, 'utf-8');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w dancepuls.pl/index.html naruszający SoC');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w dancepuls.pl/index.html naruszający SoC');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)[^>]*>/i, 'Wykryto blok inline <script> w dancepuls.pl/index.html');
    });
  });
});
