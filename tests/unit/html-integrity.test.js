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

    it('powinien zawierać przycisk odtwarzacza radiowego, preconnect do Zeno.fm, metadane utworu (#20) oraz wyłącznik czasowy (#19)', () => {
      assert.match(html, /id="header-radio-play"[^>]*aria-label="[^"]+"/i);
      assert.match(html, /rel="preconnect"\s+href="https:\/\/stream\.zeno\.fm"/i);
      assert.match(html, /id="radio-now-playing"/i);
      assert.match(html, /id="radio-track-title"/i);
      assert.match(html, /class="sleep-timer-btn"\s+data-minutes="15"/i);

      const radioJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'radio.js'), 'utf-8');
      assert.match(radioJs, /function\s+warmUpStream\b/, 'Brak funkcji pre-warmingu warmUpStream w radio.js');
      assert.doesNotMatch(radioJs, /crossOrigin\s*=\s*['"]anonymous['"]/, 'Zbędny crossOrigin="anonymous" spowalniający przekierowanie 302 strumienia');

      const sectionsCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'sections.css'), 'utf-8');
      assert.match(sectionsCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1\.5fr\)/, 'Brak minmax(0, ...) w .radio-wrapper zapobiegającego przesuwaniu widgetu przy zmianie piosenki');
      assert.match(sectionsCss, /\.radio-content\s*\{[^}]*min-width:\s*0/s, 'Brak min-width: 0 w .radio-content');

      const radioCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'radio.css'), 'utf-8');
      assert.match(radioCss, /\.radio-now-playing\s*\{[^}]*overflow:\s*hidden/s, 'Brak overflow: hidden w .radio-now-playing');
      assert.match(radioCss, /\.now-playing-meta\s*\{[^}]*flex:\s*1\s+1\s+0%/s, 'Brak flex: 1 1 0% w .now-playing-meta');
      assert.match(radioCss, /\.radio-sleep-timer\s*\{[^}]*height:\s*50px/s, 'Brak stałej wysokości height: 50px w .radio-sleep-timer');
      assert.match(radioCss, /\.radio-sleep-timer\s+\.sleep-timer-cancel\.is-hidden[\s\S]*?visibility:\s*hidden\s*!important/, 'Brak visibility: hidden !important zapobiegającego skokom wysokości przy przełączaniu timera');
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

    it('nie powinien zawierać publicznego linku do Panelu Moderacji w stopce (#5), pustych linków href="#", stylów inline ani wykonywalnych bloków inline <script> (SoC) oraz powinien ładować Asystenta AI i linkować do Salsopedii w stopce (#32)', () => {
      assert.doesNotMatch(html, /\[Panel Moderacji Salsopedii\]/i);
      assert.doesNotMatch(html, /href\s*=\s*["']#["']/i, 'Wykryto pusty odnośnik href="#" w index.html');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w index.html');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w index.html');
      assert.doesNotMatch(html, /<script(?![^>]*(\bsrc\s*=|type\s*=\s*["']application\/ld\+json["']))[^>]*>/i, 'Wykryto wykonywalny blok inline <script> w index.html');
      assert.match(html, /rel="canonical"\s+href="https:\/\/katosalsahub\.pl\/"/i);
      assert.match(html, /property="og:title"/i);
      assert.match(html, /type="application\/ld\+json"/i);
      assert.match(html, /class="footer-links"[\s\S]*?<a\s+href="salsopedia\.html">Salsopedia<\/a>/i, 'Brak linku do salsopedia.html w stopce index.html (#32)');
      assert.match(html, /src="assets\/js\/ai-widget\.js(\?[^"]*)?"/i);
      assert.match(html, /data-site-id="katosalsahub"/i);
      assert.match(html, /data-kb-url="assets\/data\/salsopedia\.json"/i);
    });

    it('powinien zawierać zaktualizowaną mapę Google My Maps (mid=1uVKmGBXSW7Gv2VXC_B1MErhEKRn5vJI), widget .map-hub w układzie 4 kafelków 2x2 z nawigacją zawsze na Parking Rekomendowany oraz poprawny plik KML', () => {
      assert.match(html, /mid=1uVKmGBXSW7Gv2VXC_B1MErhEKRn5vJI/);
      assert.match(html, /href="assets\/css\/sections\.css\?v=[0-9.]+"/i, 'Brak parametru cache-busting ?v= dla sections.css');
      assert.match(html, /class="map-hub"/);
      assert.match(html, /id="ksh-map-iframe"/);
      assert.match(html, /class="map-tab-btn is-active"/);
      assert.match(html, /class="map-focus-btn"/);
      assert.doesNotMatch(html, /class="map-stage-footer"/, 'Nadmiarowa sekcja .map-stage-footer pod mapą powinna być usunięta');
      assert.doesNotMatch(html, /Cała Mapa/i, 'Przycisk Cała Mapa powinien być usunięty z paska .map-tabs');
      assert.match(html, /Nawiguj na Parking Rekomendowany/);
      assert.doesNotMatch(html, /destination=50\.2577281,19\.0248325/, 'Nawigacja dla Wolnych Ludzi powinna kierować na Parking Rekomendowany (NOSPR), a nie na deptak Mariacka 2');
      assert.doesNotMatch(html, /destination=50\.2449289,19\.046362/, 'Nawigacja dla 3 Stawów powinna kierować na Parking Rekomendowany (Południe / Rolkostrada), a nie na sam brzeg stawu');
      assert.match(html, /Wolni Ludzie/i);
      assert.match(html, /Kamienny Krąg/i);
      assert.match(html, /Amfiteatr i Parking NOSPR/i);

      const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'style.css'), 'utf-8');
      assert.match(styleCss, /html\s*\{[^}]*overflow-x:\s*hidden/s, 'Brak blokady overflow-x: hidden na elemencie html w style.css');
      assert.match(styleCss, /body\s*\{[^}]*overflow-x:\s*hidden/s, 'Brak blokady overflow-x: hidden na elemencie body w style.css');

      const sectionsCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'sections.css'), 'utf-8');
      assert.match(sectionsCss, /\.map-hub-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s, 'Brak minmax(0, 1fr) w .map-hub-grid zapobiegającego rozpychaniu sekcji mapy na telefonie');
      assert.match(sectionsCss, /\.map-spot-top\s*\{[^}]*flex-wrap:\s*wrap/s, 'Brak flex-wrap: wrap w .map-spot-top zapobiegającego wychodzeniu napisów poza ramki kart lokalizacji');

      const kmlPath = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'kato-salsa-hub-mapa.kml');
      assert.ok(fs.existsSync(kmlPath), 'Brak pliku kato-salsa-hub-mapa.kml w katosalsahub.pl/assets/data/');
      const kml = fs.readFileSync(kmlPath, 'utf-8');
      assert.match(kml, /<kml\s+xmlns="http:\/\/www\.opengis\.net\/kml\/2\.2">/);
      assert.match(kml, /19\.046362,50\.2449289,0/, 'Brak dokładnych współrzędnych Kamiennego Kręgu w pliku KML');
      assert.match(kml, /19\.0248325,50\.2577281,0/, 'Brak dokładnych współrzędnych lokalu Wolni Ludzie (ul. Mariacka 2) w pliku KML');
      assert.match(kml, /19\.0471200,50\.2485200,0/, 'Brak współrzędnych Wiaty tanecznej w razie deszczu w pliku KML');
      assert.match(kml, /19\.0484200,50\.2459200,0/, 'Brak nowej pinezki toalety przy AMO Pizza w pliku KML');
      assert.match(kml, /19\.0473500,50\.2419500,0/, 'Brak nowej pinezki toalety za wiaduktem A4 w pliku KML');
      assert.match(kml, /Trasa piesza: Parking Rekomendowany ↔ Kamienny Krąg/, 'Brak trasy pieszej od Parkingu Rekomendowanego do Kamiennego Kręgu');
      assert.match(kml, /Trasa piesza: Parking Rekomendowany NOSPR ↔ Wolnych Ludzi|Trasa piesza: Parking Rekomendowany NOSPR ↔ Wolni Ludzie/, 'Brak trasy pieszej od Parkingu Rekomendowanego NOSPR do Wolnych Ludzi');
      assert.doesNotMatch(kml, /Trasa piesza: Parking CH 3 Stawy/, 'Stara trasa piesza z CH 3 Stawy powinna zostać usunięta');
      assert.match(kml, /19\.0304412,50\.2641287,0/, 'Brak dokładnych współrzędnych Amfiteatru pod NOSPR-em w pliku KML');
      assert.doesNotMatch(kml, /http:\/\/maps\.google\.com/i, 'Ikony w KML powinny używać protokołu HTTPS');
    });
  });

  describe('Polityka Prywatności (katosalsahub.pl/privacy.html)', () => {
    const html = fs.readFileSync(PRIVACY_HTML, 'utf-8');

    it('powinna zawierać informacje o systemie Helpdesk, anonimizacji IP (#7) oraz analityce Cookieless (#22, #34)', () => {
      assert.match(html, /Helpdesk/i);
      assert.match(html, /Cookieless/i);
      assert.match(html, /imię lub pseudonim/i);
      const cookiesJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'cookies.js'), 'utf-8');
      assert.match(cookiesJs, /https:\/\/ai\.twojastronawww\.pl\/analytics/, 'Brak podłączenia kolektora analityki Cookieless w cookies.js (#34)');
      assert.match(cookiesJs, /trackCookielessSearch/, 'Brak funkcji trackCookielessSearch w cookies.js (#34)');
    });

    it('nie powinna zawierać bloków <style>, wykonywalnych bloków inline <script>, stylów inline ani linku moderacji w stopce (#5, SoC) oraz powinna ładować Asystenta AI', () => {
      assert.doesNotMatch(html, /<style[\s>]/i);
      assert.doesNotMatch(html, /<script(?![^>]*(\bsrc\s*=|type\s*=\s*["']application\/ld\+json["']))[^>]*>/i, 'Wykryto wykonywalny blok inline <script> w privacy.html');
      assert.doesNotMatch(html, /\s+style\s*=/i);
      assert.doesNotMatch(html, /\[Panel Moderacji Salsopedii\]/i);
      assert.match(html, /rel="canonical"\s+href="https:\/\/katosalsahub\.pl\/privacy\.html"/i);
      assert.match(html, /src="assets\/js\/ai-widget\.js(\?[^"]*)?"/i);
    });
  });

  describe('Salsopedia (katosalsahub.pl/salsopedia.html)', () => {
    it('plik salsopedia.html powinien posiadać poprawny szkielet HTML5, Salsopedia Studio, statyczny wsad SEO ~200 haseł (#32), JSON-LD DefinedTermSet oraz Asystenta AI', () => {
      assert.ok(fs.existsSync(SALSOPEDIA_HTML));
      const html = fs.readFileSync(SALSOPEDIA_HTML, 'utf-8');
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
      assert.match(html, /<title>.*Salsopedia.*<\/title>/i);
      assert.match(html, /rel="canonical"\s+href="https:\/\/katosalsahub\.pl\/salsopedia\.html"/i);
      assert.match(html, /"@type":\s*"DefinedTermSet"/);
      assert.match(html, /data-term-id="term_1"/, 'Brak statycznie wyrenderowanych haseł Salsopedii w czystym HTML (#32)');
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

    it('plik salsopedia.html nie powinien zawierać styli inline, inline event handlerów, wykonywalnych bloków inline <script> ani publicznego linku moderacji w stopce (#5, SoC)', () => {
      const html = fs.readFileSync(SALSOPEDIA_HTML, 'utf-8');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w salsopedia.html naruszający SoC');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w salsopedia.html naruszający SoC');
      assert.doesNotMatch(html, /<script(?![^>]*(\bsrc\s*=|type\s*=\s*["']application\/ld\+json["']))[^>]*>/i, 'Wykryto wykonywalny blok inline <script> w salsopedia.html');
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
