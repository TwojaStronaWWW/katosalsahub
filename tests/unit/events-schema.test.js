const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeLocation,
  deduplicateEvents,
  expandSourceUrl,
  parseEventDateInfo,
  buildVenueAndStyleLabel
} = require('../../dancepuls.pl/tools/sync_engine.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const EVENTS_JSON = path.join(ROOT_DIR, 'dancepuls.pl', 'data', 'events.json');
const EVENTS_DB_MD = path.join(ROOT_DIR, 'dancepuls.pl', 'data', 'events_database.md');
const LATEST_REPORT_MD = path.join(ROOT_DIR, 'dancepuls.pl', 'data', 'latest_report.md');
const SALSOPEDIA_JSON = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'salsopedia.json');

describe('Walidacja schematu baz danych (DancePuls Events & Kato Salsa Hub Salsopedia)', () => {
  describe('DancePuls - events_database.md, events.json & latest_report.md', () => {
    it('plik bazy Markdown events_database.md powinien istnieć i mieć niepustą zawartość', () => {
      assert.ok(fs.existsSync(EVENTS_DB_MD), 'Brak pliku events_database.md');
      const md = fs.readFileSync(EVENTS_DB_MD, 'utf-8');
      assert.ok(md.length > 100);
      assert.match(md, /KATO SALSA HUB/i);
    });

    it('plik events.json powinien istnieć i być poprawnym JSON-em z listą dni', () => {
      assert.ok(fs.existsSync(EVENTS_JSON), 'Brak pliku events.json');
      let data;
      assert.doesNotThrow(() => {
        data = JSON.parse(fs.readFileSync(EVENTS_JSON, 'utf-8'));
      }, 'Plik events.json zawiera błąd składni JSON!');

      assert.ok(Array.isArray(data), 'events.json musi być tablicą dni');
      assert.ok(data.length > 0, 'events.json powinien zawierać przynajmniej jeden dzień z wydarzeniami');
    });

    it('każdy dzień i wydarzenie w events.json powinno posiadać wymagane pola (date, events, opis, miasto, miejsce, lat, lng)', () => {
      const data = JSON.parse(fs.readFileSync(EVENTS_JSON, 'utf-8'));
      for (const day of data) {
        assert.ok(day.date && typeof day.date === 'string', 'Każdy wpis dnia musi posiadać pole date');
        assert.ok(Array.isArray(day.events), `Wpis dnia ${day.date} musi zawierać tablicę events`);
        for (const ev of day.events) {
          assert.ok(ev.opis && typeof ev.opis === 'string', `Wydarzenie w ${day.date} nie ma opisu`);
          assert.ok(ev.miasto && typeof ev.miasto === 'string', `Wydarzenie ${ev.opis} nie ma przypisanego miasta`);
          assert.ok(ev.miejsce && typeof ev.miejsce === 'string', `Wydarzenie ${ev.opis} nie ma przypisanego miejsca`);
          assert.strictEqual(typeof ev.lat, 'number', `Wydarzenie ${ev.opis} nie posiada współrzędnej GPS lat (#16)`);
          assert.strictEqual(typeof ev.lng, 'number', `Wydarzenie ${ev.opis} nie posiada współrzędnej GPS lng (#16)`);
        }
      }
    });

    it('funkcja normalizeLocation powinna normalizować adresy, kody MY i zwracać współrzędne GPS (#16)', () => {
      const loc = normalizeLocation('LC');
      assert.strictEqual(loc.city, 'Katowice');
      assert.strictEqual(loc.venue, 'La Clave');
      assert.match(loc.address, /Chorzowska 11/);
      assert.strictEqual(typeof loc.lat, 'number');
      assert.strictEqual(typeof loc.lng, 'number');

      const customLoc = normalizeLocation('PR,Kraków,Kamienna17');
      assert.strictEqual(customLoc.city, 'Kraków');
      assert.strictEqual(customLoc.venue, 'PROMINENT');
      assert.match(customLoc.address, /Kamienna 17/);

      const myLoc = normalizeLocation('MY,Teatro Cubano,Jagiellońska10');
      assert.strictEqual(myLoc.city, 'Kraków');
      assert.strictEqual(myLoc.venue, 'Teatro Cubano');
      assert.match(myLoc.address, /Jagiellońska 10/);
    });

    it('funkcje expandSourceUrl, parseEventDateInfo oraz buildVenueAndStyleLabel powinny działać zgodnie ze specyfikacją KSH', () => {
      assert.strictEqual(expandSourceUrl('F:1432950208788026'), 'https://www.facebook.com/events/1432950208788026/');
      assert.strictEqual(expandSourceUrl('O:cf94eaa4a26b4794b860'), 'https://onlydanceapp.com/event/cf94eaa4a26b4794b860');

      const singleDate = parseEventDateInfo('20.10', 2026);
      assert.strictEqual(singleDate.isoStartDate, '2026-10-20');
      assert.strictEqual(singleDate.weekdayPL, 'WTOREK');
      assert.strictEqual(singleDate.futureHeaderLabel, 'WTOREK (20.10.2026)');

      const rangeDate = parseEventDateInfo('13–15.11', 2026);
      assert.strictEqual(rangeDate.futureHeaderLabel, 'PIĄTEK–NIEDZIELA (13–15.11.2026)');

      const openDate = parseEventDateInfo('od 18.06.2027');
      assert.strictEqual(openDate.futureHeaderLabel, 'PIĄTEK (OD 18.06.2027)');

      const singleVenueLabel = buildVenueAndStyleLabel({ venue: 'Mil Pasos', title: 'Crash Course', styles: 'Salsa' }, 1);
      assert.strictEqual(singleVenueLabel, 'Mil Pasos (Salsa)');

      const multiVenueLabel = buildVenueAndStyleLabel({ venue: 'La Clave', title: 'TIMBEANDO LIVE MUSIC,warsztaty', styles: 'Timba/Cubana' }, 2);
      assert.strictEqual(multiVenueLabel, 'La Clave, TIMBEANDO LIVE MUSIC (Timba/Cubana)');
    });

    it('plik latest_report.md powinien zawierać wszystkie 6 sekcji raportu KSH i rozwinięte linki', () => {
      assert.ok(fs.existsSync(LATEST_REPORT_MD), 'Brak pliku latest_report.md');
      const report = fs.readFileSync(LATEST_REPORT_MD, 'utf-8');
      assert.match(report, /## 1\. PRYWATNIE/);
      assert.match(report, /## 2\. POST NA FB/);
      assert.match(report, /## 3\. ANKIETA/);
      assert.match(report, /## 4\. KOMENTARZ 1 — WEEKEND/);
      assert.match(report, /## 5\. KOMENTARZ 2 — PRZYSZŁOŚĆ/);
      assert.match(report, /## 6\. PRYWATNIE/);
      assert.doesNotMatch(report, /🔗\s*[FO]:[A-Za-z0-9_-]+/, 'W raporcie pozostały nierozwinięte skróty F:ID lub O:ID');
    });

    it('funkcja deduplicateEvents powinna łączyć duplikaty wydarzeń z wielu źródeł (#17)', () => {
      const sample = [
        {
          rawDate: '09.10',
          city: 'Katowice',
          venue: 'La Clave',
          title: 'Salsa Fiesta',
          styles: 'Salsa',
          url: 'https://www.facebook.com/events/123456789/'
        },
        {
          rawDate: '09.10',
          city: 'Katowice',
          venue: 'La Clave',
          title: 'Salsa Fiesta (Zgłoszenie z formularza)',
          styles: 'Bachata',
          url: 'https://www.facebook.com/events/123456789/'
        }
      ];
      const deduped = deduplicateEvents(sample);
      assert.strictEqual(deduped.length, 1);
      assert.match(deduped[0].styles, /Salsa/);
      assert.match(deduped[0].styles, /Bachata/);
    });
  });

  describe('Kato Salsa Hub - salsopedia.json', () => {
    it('plik salsopedia.json powinien istnieć i być poprawną tablicą pojęć', () => {
      assert.ok(fs.existsSync(SALSOPEDIA_JSON), 'Brak pliku salsopedia.json');
      let entries;
      assert.doesNotThrow(() => {
        entries = JSON.parse(fs.readFileSync(SALSOPEDIA_JSON, 'utf-8'));
      }, 'Błąd składni w salsopedia.json');
      assert.ok(Array.isArray(entries), 'salsopedia.json musi być tablicą');
      assert.ok(entries.length > 10, 'salsopedia.json powinna zawierać pojęcia');
    });

    it('każde hasło w salsopedia.json powinno posiadać wymagane pola (id, term, definition, category)', () => {
      const entries = JSON.parse(fs.readFileSync(SALSOPEDIA_JSON, 'utf-8'));
      for (const entry of entries) {
        assert.ok(entry.id, 'Hasło brakuje unikalnego pola id');
        assert.ok(entry.term && typeof entry.term === 'string', `Hasło ${entry.id} nie ma nazwy terminu`);
        assert.ok(entry.definition && typeof entry.definition === 'string', `Hasło ${entry.term} nie ma definicji`);
        assert.ok(Array.isArray(entry.category) && entry.category.length > 0, `Hasło ${entry.term} nie ma kategorii`);
      }
    });

    it('salsopedia.json powinna zawierać pełną bazę szkół tańca (w tym Good Mood), instruktorów, rozbudowaną sekcję instrumentów oraz klikalne linki źródłowe', () => {
      const entries = JSON.parse(fs.readFileSync(SALSOPEDIA_JSON, 'utf-8'));
      const schools = entries.filter(e => Array.isArray(e.category) && e.category.includes('schools'));
      const instructors = entries.filter(e => Array.isArray(e.category) && e.category.includes('instructors'));
      const instruments = entries.filter(e => Array.isArray(e.category) && e.category.includes('instruments'));

      assert.ok(schools.length >= 13, `Oczekiwano min. 13 szkół tańca w Katowicach/Śląsku, znaleziono: ${schools.length}`);
      assert.ok(schools.some(s => /Good Mood/i.test(s.term)), 'Brak Szkoły Tańca Good Mood w kategorii schools');
      assert.ok(instructors.length >= 30, `Oczekiwano min. 30 instruktorów z katowickich szkół, znaleziono: ${instructors.length}`);
      assert.ok(instructors.some(i => /Dronszczyk/i.test(i.term)), 'Brak Adriana „Dronsona” Dronszczyka (Good Mood) w kategorii instructors');
      assert.ok(instructors.some(i => /Claudio Mineo/i.test(i.term)), 'Brak Claudio Mineo (Good Mood) w kategorii instructors');
      assert.ok(instruments.length >= 18, `Oczekiwano min. 18 instrumentów w Salsopedii, znaleziono: ${instruments.length}`);

      for (const entry of entries) {
        assert.ok(Array.isArray(entry.source) && entry.source.length > 0, `Hasło ${entry.term} nie posiada źródła`);
        assert.match(entry.source[0].url || '', /^https:\/\//, `Hasło ${entry.term} nie posiada klikalnego linku URL w polu source`);
      }

      const rawJson = fs.readFileSync(SALSOPEDIA_JSON, 'utf-8');
      assert.doesNotMatch(rawJson, /"Rueda Logic"|'Rueda Logic'|"Spanish Terms"|"Casino Essentials"/, 'W salsopedia.json pozostały nieprzetłumaczone angielskie etykiety źródeł');

      const wikiJs = fs.readFileSync(path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'js', 'wiki.js'), 'utf-8');
      assert.match(wikiJs, /linkifyDefinition/, 'Brak silnika automatycznego linkowania słów kluczowych (linkifyDefinition) w wiki.js');
      assert.match(wikiJs, /wiki-inline-link/, 'Brak klasy .wiki-inline-link dla linków wewnętrznych Salsopedii');
    });

    it('silnik porównywania zmian Salsopedia Studio (computeWordDiff, buildTermDiffHtml) powinien precyzyjnie oznaczać różnice Przed vs Po', () => {
      const { computeWordDiff, buildTermDiffHtml } = require('../../katosalsahub.pl/assets/js/wiki.js');

      const diffSame = computeWordDiff('Krok podstawowy w salsie.', 'Krok podstawowy w salsie.');
      assert.strictEqual(diffSame.hasChanges, false);

      const diffChanged = computeWordDiff(
        'Guapea to krok podstawowy w parze.',
        'Guapea to lustrzany krok podstawowy w salsie kubańskiej.'
      );
      assert.strictEqual(diffChanged.hasChanges, true);
      assert.match(diffChanged.html, /<ins class="diff-added">lustrzany\s*<\/ins>/);
      assert.match(diffChanged.html, /<del class="diff-removed">parze\.<\/del>/);

      const fullDiffHtml = buildTermDiffHtml(
        {
          id: 'term_7',
          term: 'Guapea',
          definition: 'Krok w parze.',
          category: ['steps'],
          source: 'Podstawy'
        },
        {
          id: 'term_7',
          term: 'Básico (Guapea)',
          definition: 'Krok podstawowy w parze na 1-3 i 5-7.',
          category: ['steps', 'dance'],
          source: 'Standard Casino',
          change_note: 'Doprecyzowano rozliczenie rytmiczne'
        }
      );

      assert.match(fullDiffHtml, /Nazwa hasła:/);
      assert.match(fullDiffHtml, /Zmiany w definicji:/);
      assert.match(fullDiffHtml, /Kategorie:/);
      assert.match(fullDiffHtml, /Źródła:/);
      assert.match(fullDiffHtml, /Doprecyzowano rozliczenie rytmiczne/);
    });

    it('wyszukiwarka Salsopedii (sortAndFilterTermsByQuery) powinna priorytetyzować trafienia w tytule nad definicją (np. "Timba" na 1. miejscu)', () => {
      const { computeSearchRelevance, sortAndFilterTermsByQuery } = require('../../katosalsahub.pl/assets/js/wiki.js');
      const entries = JSON.parse(fs.readFileSync(SALSOPEDIA_JSON, 'utf-8'));

      const timbaResults = sortAndFilterTermsByQuery(entries, 'timba');
      assert.ok(timbaResults.length >= 5, 'Zapytanie "timba" powinno zwrócić wiele powiązanych haseł');
      assert.strictEqual(timbaResults[0].term, 'Timba', 'Hasło o dokładnym tytule "Timba" musi być na 1. miejscu wyników!');
      assert.ok(
        computeSearchRelevance({ term: 'Timba', definition: '...' }, 'timba') >
          computeSearchRelevance({ term: 'Timbales (Pailas)', definition: '...' }, 'timba'),
        'Dokładne dopasowanie tytułu musi mieć wyższy priorytet niż dopasowanie prefiksowe'
      );
      assert.ok(
        computeSearchRelevance({ term: 'Bombo i Songo Drumset (Perkusja w Timbie)', definition: '...' }, 'timba') >
          computeSearchRelevance({ term: 'Despelote', definition: 'Styl tańca w Timba...' }, 'timba'),
        'Dopasowanie w tytule musi mieć wyższy priorytet niż dopasowanie wyłącznie w definicji'
      );

      // Sprawdzenie wyszukiwania bez polskich i hiszpańskich znaków diakrytycznych
      const bongoResults = sortAndFilterTermsByQuery(entries, 'bongo');
      assert.ok(bongoResults.length >= 1 && /Bongó/i.test(bongoResults[0].term), 'Zapytanie "bongo" bez akcentu powinno znaleźć "Bongó (Bongosy)" na 1. miejscu');
    });
  });
});

