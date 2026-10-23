const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const KSH_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'index.html');
const PRIVACY_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'privacy.html');
const SALSOPEDIA_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'salsopedia.html');
const GRAFIK_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'grafik.html');
const DANCEPULS_HTML = path.join(ROOT_DIR, 'katosalsahub.pl', 'dancepuls', 'index.html');

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

    it('powinien definiować precyzyjny tytuł <title> z frazą kluczową "Salsa Katowice" oraz marką "Kato Salsa Hub", link canonical, Open Graph i dane strukturalne Schema.org (DanceGroup + FAQPage)', () => {
      const match = html.match(/<title>(.*?)<\/title>/i);
      assert.ok(match, 'Brak znacznika <title>');
      assert.match(match[1], /Salsa Katowice/i, 'Brak głównej frazy kluczowej "Salsa Katowice" w <title>');
      assert.match(match[1], /Kato Salsa Hub/i);
      assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/katosalsahub\.pl\/">/i, 'Brak linku canonical w index.html');
      assert.match(html, /<meta\s+property="og:title"\s+content="[^"]*Salsa Katowice[^"]*"/i, 'Brak tagu og:title z frazą Salsa Katowice');
      assert.match(html, /<meta\s+property="og:image"\s+content="https:\/\/katosalsahub\.pl\/assets\/images\/hero\.png"/i, 'Tag og:image powinien wskazywać na fotografię hero.png (800x800) zamiast duplikatu faviconu logo.jpg');
      assert.match(html, /data-i18n="faq\.q5"/i, 'Brak pytania FAQ #5 o kursy i szkoły salsy w Katowicach');
      assert.match(html, /itemtype="https:\/\/schema\.org\/DanceGroup"/i, 'Brak mikrodanych Schema.org/DanceGroup');
      assert.match(html, /"@type":\s*"GeoCoordinates"[\s\S]*?"latitude":\s*50\.2449289[\s\S]*?"longitude":\s*19\.046362/, 'Brak dokładnych współrzędnych GeoCoordinates dla Kamiennego Kręgu w Schema.org');
      assert.match(html, /"@type":\s*"SiteNavigationElement"/, 'Brak elementów SiteNavigationElement w Schema.org dla Sitelinks');
      assert.match(html, /"performer":\s*\{[\s\S]*?"@type":\s*"DanceGroup"/, 'Brak pola performer w DanceEvent wymaganych przez Google Rich Results');
      assert.match(html, /"offers":\s*\{[\s\S]*?"@type":\s*"Offer"/, 'Brak pola offers w DanceEvent wymaganych przez Google Rich Results');
      assert.match(html, /itemtype="https:\/\/schema\.org\/FAQPage"/i, 'Brak sekcji FAQ z mikrodanymi Schema.org/FAQPage');
      assert.match(html, /https:\/\/www\.facebook\.com\/KatoSalsaHub/, 'Brak linku do oficjalnego fanpage Facebook KatoSalsaHub');
      assert.match(html, /https:\/\/www\.instagram\.com\/katosalsahub\//, 'Brak linku do oficjalnego profilu Instagram katosalsahub');
      assert.match(html, /<h1[^>]*>[\s\S]*?Katowicach[\s\S]*?<\/h1>/i, 'Nagłówek <h1> powinien zawierać lokalizację (Katowicach/Katowice)');
      assert.doesNotMatch(html, /<h1[^>]*>[\s\S]*?<div\b[\s\S]*?<\/h1>/i, 'Nagłówek <h1> nie może zawierać elementu blokowego <div>');
    });

    it('powinien zawierać przycisk odtwarzacza radiowego, preconnect do Zeno.fm, metadane utworu (#20) oraz wyłącznik czasowy (#19)', () => {
      assert.match(html, /id="header-radio-play"[^>]*aria-label="[^"]+"/i);
      assert.match(html, /rel="preconnect"\s+href="https:\/\/stream\.zeno\.fm"/i);
      assert.match(html, /id="radio-now-playing"/i);
      assert.match(html, /id="radio-track-title"/i);
      assert.match(html, /class="sleep-timer-btn"\s+data-minutes="15"/i);

      const radioJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'radio.js'), 'utf-8');
      assert.match(radioJs, /function\s+warmUpStream\b/, 'Brak funkcji pre-warmingu warmUpStream w radio.js');
      assert.match(radioJs, /ensureAudioElementMounted/, 'Brak montowania elementu #ksh-radio-audio do DOM w radio.js');
      assert.match(radioJs, /armPlaybackWatchdog/, 'Brak strażnika startu strumienia armPlaybackWatchdog w radio.js');
      assert.match(radioJs, /resolveDirectStreamUrl/, 'Brak resolvera bezpośredniego węzła strumienia resolveDirectStreamUrl w radio.js');
      assert.doesNotMatch(radioJs, /addEventListener\(\s*['"]stalled['"]/, 'Nasłuchiwanie stalled nie powinno przerywać i resetować buforowanego strumienia Zeno.fm');
      assert.doesNotMatch(radioJs, /crossOrigin\s*=\s*['"]anonymous['"]/, 'Zbędny crossOrigin="anonymous" spowalniający przekierowanie 302 strumienia');
      assert.ok(fs.existsSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'php', 'radio.php')), 'Brak pliku katosalsahub.pl/assets/php/radio.php');

      const swJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'sw.js'), 'utf-8');
      const cookiesJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'cookies.js'), 'utf-8');
      const swCacheMatch = swJs.match(/CACHE_NAME\s*=\s*['"]ksh-pwa-v(\d+)['"]/);
      assert.ok(swCacheMatch, 'Brak CACHE_NAME = ksh-pwa-vXX w sw.js');
      assert.match(cookiesJs, new RegExp(`sw\\.js\\?v=${swCacheMatch[1]}`), 'Wersja sw.js?v=XX w cookies.js musi odpowiadać wersji ksh-pwa-vXX w sw.js');
      assert.match(cookiesJs, /radioActive/, 'Brak ochrony aktywnego odtwarzania radia przed przeładowaniem strony w cookies.js');

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
      assert.match(html, /id="cookie-banner"[^>]*\bdata-nosnippet\b/i, 'Brak atrybutu data-nosnippet na banerze cookies');
      const aiWidgetJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'ai-widget.js'), 'utf-8');
      assert.match(aiWidgetJs, /setAttribute\s*\(\s*['"]data-nosnippet['"]/, 'Brak atrybutu data-nosnippet na kontenerze widgetu AI');
    });

    it('powinien zawierać zaktualizowaną mapę Google My Maps (mid=1cj-CYV4HEEMEKW4Fq65Yyk5gFqp4ecU), widget .map-hub w układzie 4 kafelków 2x2 z nawigacją zawsze na Parking Rekomendowany oraz poprawny plik KML', () => {
      assert.match(html, /mid=1cj-CYV4HEEMEKW4Fq65Yyk5gFqp4ecU/);
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
      assert.match(kml, /Szkoły Tańca i Kluby – Katowice/, 'Brak warstwy Szkół Tańca w Katowicach w pliku KML');
      assert.match(kml, /La Clave Katowice/, 'Brak szkoły La Clave w pliku KML');
      assert.match(kml, /Szkoła Tańca Good Mood/, 'Brak szkoły Good Mood w pliku KML');
      assert.match(kml, /Mil Pasos Katowice/, 'Brak szkoły Mil Pasos w pliku KML');
      assert.match(kml, /Taneczna Kompania.*Kościuszki 227/, 'Brak szkoły Taneczna Kompania (ul. Kościuszki 227) w pliku KML');
      assert.match(kml, /18\.9894412,50\.2247965,0/, 'Brak dokładnych współrzędnych Tanecznej Kompanii w pliku KML');
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

      const wikiCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'wiki.css'), 'utf-8');
      assert.match(wikiCss, /\.wiki-grid\s*\{[^}]*align-items:\s*start/s, 'Brak align-items: start na .wiki-grid zapobiegającego rozciąganiu sąsiednich kart przez długie definicje');
      assert.match(wikiCss, /-webkit-line-clamp:\s*5/, 'Brak -webkit-line-clamp: 5 ujednolicającego wysokość długich definicji w kartach Salsopedii');
      assert.match(wikiCss, /\.btn-expand-def\b/, 'Brak stylów przycisku rozwijania długich opisów .btn-expand-def w wiki.css');

      const wikiJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'wiki.js'), 'utf-8');
      assert.match(wikiJs, /toggle-expand/, 'Brak obsługi akcji toggle-expand dla długich definicji w wiki.js');
    });

    it('plik salsopedia.html nie powinien zawierać styli inline, inline event handlerów, wykonywalnych bloków inline <script> ani publicznego linku moderacji w stopce (#5, SoC)', () => {
      const html = fs.readFileSync(SALSOPEDIA_HTML, 'utf-8');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w salsopedia.html naruszający SoC');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w salsopedia.html naruszający SoC');
      assert.doesNotMatch(html, /<script(?![^>]*(\bsrc\s*=|type\s*=\s*["']application\/ld\+json["']))[^>]*>/i, 'Wykryto wykonywalny blok inline <script> w salsopedia.html');
      assert.doesNotMatch(html, /\[Panel Moderacji Salsopedii\]/i);
    });
  });

  describe('Wspólny Grafik Szkół & Wydarzenia DancePuls (katosalsahub.pl/grafik.html)', () => {
    it('plik grafik.html powinien posiadać czysty widok SPA na wzór Salsopedii (bez sekcji strony głównej pod spodem), 4 zakładki trybów (w tym Cenniki Szkół i Kalkulator), filtry szkół (La Clave, Good Mood, Mil Pasos), brak pigułek Multisport na kafelkach zajęć oraz integrację z mapą i AI', () => {
      assert.ok(fs.existsSync(GRAFIK_HTML), 'Brak pliku katosalsahub.pl/grafik.html');
      const html = fs.readFileSync(GRAFIK_HTML, 'utf-8');
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
      assert.match(html, /rel="canonical"\s+href="https:\/\/katosalsahub\.pl\/grafik\.html"/i);
      assert.match(html, /id="scheduleAppRoot"/);
      assert.match(html, /id="scheduleSearchInput"/);
      assert.match(html, /class="schedule-mode-tabs"/);
      assert.match(html, /data-tab="classes"/);
      assert.match(html, /data-tab="pricing"/);
      assert.match(html, /data-tab="events"/);
      assert.match(html, /data-tab="map"/);
      assert.match(html, /id="schedulePricingView"/);
      assert.match(html, /id="pricingCalculatorResults"/);
      assert.doesNotMatch(html, /class="multisport-pill"/, 'Kafelki zajęć nie powinny zawierać pigułki Multisport');
      assert.match(html, /La Clave/i);
      assert.match(html, /Good Mood/i);
      assert.match(html, /Mil Pasos/i);
      assert.doesNotMatch(html, /data-school="EV"/i, 'Widok grafik.html nie powinien zawierać usuniętego filtra szkoły EV (Evolution & KIZLAB)');
      assert.doesNotMatch(html, /id="faq"/i, 'Widok grafik.html nie powinien zawierać sekcji #faq pod spodem');
      assert.doesNotMatch(html, /id="kontakt"/i, 'Widok grafik.html nie powinien zawierać sekcji #kontakt pod spodem');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w grafik.html naruszający SoC');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w grafik.html naruszający SoC');
      assert.doesNotMatch(html, /<script(?![^>]*(\bsrc\s*=|type\s*=\s*["']application\/ld\+json["']))[^>]*>/i, 'Wykryto wykonywalny blok inline <script> w grafik.html');
      assert.match(html, /src="assets\/js\/schedule\.js(\?[^"]*)?"/i);
      assert.match(html, /src="assets\/js\/ai-widget\.js(\?[^"]*)?"/i);

      // Weryfikacja Mapy Szkół (#scheduleMapView): 8 zakładek i wyświetlanie wyłącznie 1 aktywnej karty obok mapy
      const expectedZones = ['school-lc', 'school-gm', 'school-mp', 'school-tk', 'school-gr', 'wolni', 'stawy', 'nospr'];
      for (const zone of expectedZones) {
        assert.match(
          html,
          new RegExp(`class="map-tab-btn[^"]*"[\\s\\S]*?data-zone="${zone}"`),
          `Brak przycisku wyboru lokalizacji data-zone="${zone}" w #scheduleMapView`
        );
        assert.match(
          html,
          new RegExp(`<article\\s+class="card\\s+map-spot-card[^"]*"\\s+data-zone="${zone}">`),
          `Brak dedykowanej karty informacyjnej .map-spot-card[data-zone="${zone}"] w #scheduleMapView`
        );
      }

      const scheduleCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'schedule.css'), 'utf-8');
      assert.match(
        scheduleCss,
        /#scheduleMapView\s+\.map-spot-card:not\(\.is-active\)\s*\{\s*display:\s*none\s*!important;\s*\}/,
        'Brak reguły CSS ukrywającej nieaktywne karty szkół obok mapy w #scheduleMapView'
      );

      // Test jednostkowy logiki activateMapZone w home.js (wyświetlanie tylko wybranej szkoły w #scheduleMapView)
      const { activateMapZone } = require('../../katosalsahub.pl/assets/js/home.js');
      const makeClassList = (initial = []) => {
        const set = new Set(initial);
        return {
          add: (c) => set.add(c),
          remove: (c) => set.delete(c),
          contains: (c) => set.has(c),
        };
      };
      const mockCards = expectedZones.map((z, idx) => ({
        classList: makeClassList(idx === 0 ? ['is-active'] : ['is-hidden']),
        getAttribute: (attr) => (attr === 'data-zone' ? z : null),
        closest: (sel) => (sel === '#scheduleMapView' ? {} : null),
      }));
      const mockTabs = expectedZones.map((z, idx) => {
        const attrs = {
          'data-zone': z,
          'data-map-src': `https://maps.example/${z}`,
          'data-label': `Label ${z}`,
          'aria-pressed': idx === 0 ? 'true' : 'false',
        };
        return {
          classList: makeClassList(idx === 0 ? ['is-active'] : []),
          getAttribute: (a) => attrs[a] || null,
          setAttribute: (a, v) => {
            attrs[a] = v;
          },
        };
      });
      const mockIframe = {
        src: 'https://maps.example/school-lc',
        getAttribute: function (a) {
          return a === 'src' ? this.src : null;
        },
        setAttribute: function (a, v) {
          if (a === 'src') this.src = v;
        },
      };
      const mockLabel = { textContent: '' };
      const mockDoc = {
        getElementById: (id) => {
          if (id === 'ksh-map-iframe') return mockIframe;
          if (id === 'scheduleMapView') return {};
          if (id === 'map-active-label') return mockLabel;
          return null;
        },
        querySelectorAll: (sel) => {
          if (sel === '.map-tab-btn') return mockTabs;
          if (sel === '.map-spot-card') return mockCards;
          return [];
        },
      };

      // Symulacja kliknięcia na Szkołę Tańca Good Mood (index 1 = school-gm)
      activateMapZone(mockTabs[1], mockDoc);
      assert.strictEqual(mockCards[1].classList.contains('is-active'), true, 'Karta Good Mood powinna otrzymać klasę is-active');
      assert.strictEqual(mockCards[1].classList.contains('is-hidden'), false, 'Karta Good Mood powinna być widoczna (brak is-hidden)');
      assert.strictEqual(mockCards[0].classList.contains('is-active'), false, 'Karta La Clave powinna stracić klasę is-active');
      assert.strictEqual(mockCards[0].classList.contains('is-hidden'), true, 'Karta La Clave powinna zostać ukryta (is-hidden)');
      const visibleCards = mockCards.filter((c) => !c.classList.contains('is-hidden'));
      assert.strictEqual(visibleCards.length, 1, 'W widoku #scheduleMapView może wyświetlać się jednocześnie tylko 1 karta wybranej szkoły');
    });
  });

  describe('DancePuls (katosalsahub.pl/dancepuls/index.html) & Centralizacja SEO na katosalsahub.pl', () => {
    it('plik index.html powinien posiadać noindex/nofollow, canonical na grafik.html oraz przekierowanie 301 ze starej subdomeny w .htaccess', () => {
      assert.ok(fs.existsSync(DANCEPULS_HTML));
      const html = fs.readFileSync(DANCEPULS_HTML, 'utf-8');
      assert.match(html, /<!DOCTYPE html>/i);
      assert.match(html, /<html\s+lang="pl">/i);
      assert.match(html, /<meta\s+name="robots"\s+content="noindex,\s*nofollow">/i, 'Roboczy generator DancePuls musi posiadać noindex, nofollow');
      assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i);
      assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/katosalsahub\.pl\/grafik\.html">/i, 'Canonical generatora DancePuls musi wskazywać na publiczny kalendarz https://katosalsahub.pl/grafik.html');
      assert.match(html, /id="load-report-btn"/i);
      assert.match(html, /id="post-opis"/i);
      assert.match(html, /id="wynik"/i);
      assert.match(html, /id="wynik-przyszle"/i);
      assert.match(html, /id="copy-comment2-btn"/i);
      assert.match(html, /id="kopiuj-ankiete-container"/i);
      assert.doesNotMatch(html, /Skraper|scrapery/i, 'Widok dancepuls/index.html nie powinien zawierać słowa "Skraper" / "scrapery" w treści HTML');

      for (const publicPage of [KSH_HTML, GRAFIK_HTML, SALSOPEDIA_HTML, PRIVACY_HTML]) {
        const publicHtml = fs.readFileSync(publicPage, 'utf-8');
        assert.doesNotMatch(
          publicHtml,
          /DancePuls Generator|href="https:\/\/katosalsahub\.pl\/dancepuls\/"/i,
          `Publiczny widok ${path.basename(publicPage)} nie powinien eksponować linku do roboczego generatora /dancepuls/ w stopce`
        );
      }

      const dpHtaccess = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'dancepuls', '.htaccess'), 'utf-8');
      assert.match(dpHtaccess, /dancepuls\\\.katosalsahub\\\.pl/, 'Brak reguły przekierowania 301 dla starej subdomeny dancepuls.katosalsahub.pl w katosalsahub.pl/dancepuls/.htaccess');
      assert.match(dpHtaccess, /https:\/\/katosalsahub\.pl\/grafik\.html\s+\[R=301,L\]/, 'Subdomena dancepuls.katosalsahub.pl musi przekierowywać 301 na https://katosalsahub.pl/grafik.html');

      const htaccess = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', '.htaccess'), 'utf-8');
      assert.match(htaccess, /RewriteCond\s+%\{HTTP_HOST\}\s+\^www\\\.katosalsahub\\\.pl\$/, 'Brak przekierowania 301 z www.katosalsahub.pl w .htaccess');
      assert.match(htaccess, /microphone=\(self\)/, 'Nagłówek Permissions-Policy w .htaccess musi zezwalać na microphone=(self) dla dyktowania głosowego w Asystencie AI');
    });

    it('wszystkie 4 widoki katosalsahub.pl (index, grafik, salsopedia, privacy) powinny mieć w 100% zsynchronizowany układ wspólny przez scripts/sync-layout.js oraz poprawne referencje lokalnych zasobów', () => {
      const { syncAllLayouts } = require('../../scripts/sync-layout.js');
      const status = syncAllLayouts({ write: false });
      for (const page of status) {
        assert.strictEqual(
          page.changed,
          false,
          `Widok ${page.pageFile} ma niespójny nagłówek/stopkę/skrypty — uruchom: npm run sync:layout`
        );
      }

      for (const dir of ['katosalsahub.pl', 'katosalsahub.pl/dancepuls']) {
        const fullDir = path.join(ROOT_DIR, dir);
        const htmlFiles = fs.readdirSync(fullDir).filter((f) => f.endsWith('.html'));
        for (const f of htmlFiles) {
          const html = fs.readFileSync(path.join(fullDir, f), 'utf-8');
          const matches = html.matchAll(/(?:src|href)="(?!https?:\/\/|#|javascript:|mailto:|tel:)([^"]+)"/g);
          for (const m of matches) {
            const ref = m[1].split(/[?#]/)[0];
            if (!ref) continue;
            assert.ok(
              fs.existsSync(path.join(fullDir, ref)),
              `Brak lokalnego zasobu ${ref} referencjonowanego w ${dir}/${f}`
            );
          }
        }
      }
    });

    it('plik katosalsahub.pl/dancepuls/index.html oraz moduły katosalsahub.pl/dancepuls/js/*.js nie powinny zawierać stylów inline, manipulacji .style.*, inline event handlerów ani inline <script> (SoC)', () => {
      const html = fs.readFileSync(DANCEPULS_HTML, 'utf-8');
      assert.doesNotMatch(html, /\s+style\s*=/i, 'Wykryto atrybut style="..." w katosalsahub.pl/dancepuls/index.html naruszający SoC');
      assert.doesNotMatch(html, /\s+on(click|submit|mouseover|mouseout|load|error)\s*=/i, 'Wykryto inline event handler w katosalsahub.pl/dancepuls/index.html naruszający SoC');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)[^>]*>/i, 'Wykryto blok inline <script> w katosalsahub.pl/dancepuls/index.html');

      const dpJsDir = path.join(ROOT_DIR, 'katosalsahub.pl', 'dancepuls', 'js');
      const dpJsFiles = fs.readdirSync(dpJsDir).filter((f) => f.endsWith('.js'));
      assert.ok(dpJsFiles.includes('post-generator.js'), 'Brak wydzielonego modułu katosalsahub.pl/dancepuls/js/post-generator.js');
      for (const file of dpJsFiles) {
        const src = fs.readFileSync(path.join(dpJsDir, file), 'utf-8');
        const withoutComments = src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '').trim();
        assert.doesNotMatch(
          withoutComments,
          /\.[a-zA-Z0-9_$]+\.style\.[a-zA-Z]+/,
          `Plik katosalsahub.pl/dancepuls/js/${file} manipuluje bezpośrednio właściwością .style.*, naruszając zasadę SoC`
        );
        assert.doesNotMatch(
          withoutComments,
          /\.onclick\s*=/,
          `Plik katosalsahub.pl/dancepuls/js/${file} używa .onclick zamiast addEventListener`
        );
      }
    });
  });

  describe('Wielojęzyczność i18n (PL / Hiszpański Kubański es-CU / Angielski Brytyjski en-GB)', () => {
    it('wszystkie widoki Kato Salsa Hub powinny posiadać przełącznik .lang-switcher w nawigacji i stopce oraz ładować i18n.js', () => {
      for (const filePath of [KSH_HTML, GRAFIK_HTML, SALSOPEDIA_HTML, PRIVACY_HTML]) {
        const html = fs.readFileSync(filePath, 'utf-8');
        assert.match(html, /class="lang-switcher"/, `Brak przełącznika .lang-switcher w ${path.basename(filePath)}`);
        assert.match(html, /class="lang-switcher lang-switcher--footer"/, `Brak przełącznika .lang-switcher--footer w ${path.basename(filePath)}`);
        assert.match(html, /data-lang="pl"/);
        assert.match(html, /data-lang="es"/);
        assert.match(html, /data-lang="en"/);
        assert.match(html, /src="assets\/js\/i18n\.js(\?[^"]*)?"/);
        assert.match(html, /src="assets\/js\/contact\.js(\?[^"]*)?"/, `Brak ładowania contact.js w ${path.basename(filePath)} (wymagane dla nawigacji SPA do #kontakt)`);
      }

      const sectionsCss = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'css', 'sections.css'), 'utf-8');
      assert.match(sectionsCss, /\.lang-switcher\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s, 'Brak stałej siatki CSS Grid 3x1fr dla .lang-switcher (CLS = 0)');
    });

    it('moduł i18n.js powinien zawierać kompletne słowniki (pl, es-CU z leksyką kubańską, en-GB z pisownią brytyjską) i poprawnie tłumaczyć klucze', () => {
      const i18n = require(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'i18n.js'));
      assert.ok(i18n.TRANSLATIONS.pl);
      assert.ok(i18n.TRANSLATIONS.es);
      assert.ok(i18n.TRANSLATIONS.en);

      // Sprawdź spójność kluczy między PL, ES (Kuba) i EN (UK)
      const plKeys = Object.keys(i18n.TRANSLATIONS.pl);
      for (const key of plKeys) {
        assert.ok(key in i18n.TRANSLATIONS.es, `Brak klucza "${key}" w słowniku hiszpańskim (es-CU)`);
        assert.ok(key in i18n.TRANSLATIONS.en, `Brak klucza "${key}" w słowniku angielskim (en-GB)`);
      }

      // Sprawdź, czy każdy atrybut data-i18n* w plikach HTML ma pokrycie w słowniku
      for (const filePath of [KSH_HTML, GRAFIK_HTML, SALSOPEDIA_HTML, PRIVACY_HTML]) {
        const html = fs.readFileSync(filePath, 'utf-8');
        const matches = html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g);
        for (const match of matches) {
          const key = match[1];
          assert.ok(key in i18n.TRANSLATIONS.pl, `Brak klucza "${key}" z pliku ${path.basename(filePath)} w słowniku PL`);
          assert.ok(key in i18n.TRANSLATIONS.es, `Brak klucza "${key}" z pliku ${path.basename(filePath)} w słowniku ES`);
          assert.ok(key in i18n.TRANSLATIONS.en, `Brak klucza "${key}" z pliku ${path.basename(filePath)} w słowniku EN`);
        }
      }

      // Autentyczny hiszpański kubański (parqueo, guagua, gozadera, bajo techo, descargas)
      assert.match(i18n.t('map.navBtn', 'es'), /Parqueo Recomendado/);
      assert.match(i18n.t('map.stawy.p3', 'es'), /guagua/);
      assert.match(i18n.t('hero.subtitle', 'es'), /llégate/);
      assert.match(i18n.t('about.c3.title', 'es'), /Descargas/);

      // Autentyczny angielski brytyjski (car park, city centre, encyclopaedia, organise, practise)
      assert.match(i18n.t('map.navBtn', 'en'), /Recommended Car Park/);
      assert.match(i18n.t('map.wolni.label', 'en'), /City Centre/);
      assert.match(i18n.t('wiki.subtitle', 'en'), /encyclopaedia/);
      assert.match(i18n.t('contact.desc', 'en'), /organising/);

      // Interpolacja zmiennych
      assert.equal(i18n.t('wiki.resultsShown', 'es', { shown: 12, total: 200 }), 'Mostrando: 12 de 200 términos');
      assert.equal(i18n.t('wiki.resultsShown', 'en', { shown: 12, total: 200 }), 'Showing: 12 of 200 entries');
    });

    it('wszystkie skrypty katosalsahub.pl/assets/js/*.js powinny być hermetyzowane w IIFE, wolne od manipulacji .style. / createElement("style") (SoC) i wolne od kolizji zasięgu', () => {
      const vm = require('node:vm');
      const jsDir = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js');
      const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();

      for (const file of jsFiles) {
        const src = fs.readFileSync(path.join(jsDir, file), 'utf-8');
        const withoutComments = src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '').trim();
        assert.match(
          withoutComments,
          /^\(function\s*\(\)\s*\{/,
          `Plik ${file} nie jest hermetyzowany w domknięciu IIFE (function () { ... })()`
        );
        assert.doesNotMatch(
          withoutComments,
          /createElement\(\s*['"]style['"]\s*\)/,
          `Plik ${file} wstrzykuje znacznik <style> przez JS, naruszając zasadę SoC`
        );
        assert.doesNotMatch(
          withoutComments,
          /\.[a-zA-Z0-9_$]+\.style\.[a-zA-Z]+/,
          `Plik ${file} manipuluje bezpośrednio właściwością .style.*, naruszając zasadę SoC`
        );
      }

      const combinedSource = jsFiles
        .map((f) => `// === ${f} ===\n${fs.readFileSync(path.join(jsDir, f), 'utf-8')}`)
        .join('\n\n');

      assert.doesNotThrow(
        () => new vm.Script(combinedSource, { filename: 'combined-browser-scripts.js' }),
        'Wykryto kolizję deklaracji top-level (let/const/class) pomiędzy plikami JS ładowanymi wspólnie w przeglądarce'
      );
    });
  });
});
