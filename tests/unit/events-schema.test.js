const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeLocation,
  deduplicateEvents,
  expandSourceUrl,
  parseEventDateInfo,
  buildVenueAndStyleLabel,
  inferEventStyles,
  parseMilPasosEventsHtml,
  parseLoftodanceEventsHtml,
  parseKrajownikEventsHtml,
  parseSabakiEventsHtml,
  parseOnlyDanceEventsHtml,
  parseAirdanciaEventsHtml,
  parseFacebookEventHtml,
  extractFacebookEventUrlFromHtml
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

      const tkLoc = normalizeLocation('TK');
      assert.strictEqual(tkLoc.city, 'Katowice');
      assert.strictEqual(tkLoc.venue, 'Taneczna Kompania');
      assert.match(tkLoc.address, /Kościuszki 227/);
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

      assert.ok(schools.length >= 14, `Oczekiwano min. 14 szkół tańca w Katowicach/Śląsku, znaleziono: ${schools.length}`);
      assert.ok(schools.some(s => /Good Mood/i.test(s.term)), 'Brak Szkoły Tańca Good Mood w kategorii schools');
      assert.ok(schools.some(s => /Taneczna Kompania/i.test(s.term)), 'Brak Szkoły Tańca Taneczna Kompania w kategorii schools');
      assert.ok(instructors.length >= 37, `Oczekiwano min. 37 instruktorów z katowickich szkół, znaleziono: ${instructors.length}`);
      assert.ok(instructors.some(i => /Dronszczyk/i.test(i.term)), 'Brak Adriana „Dronsona” Dronszczyka (Good Mood) w kategorii instructors');
      assert.ok(instructors.some(i => /Claudio Mineo/i.test(i.term)), 'Brak Claudio Mineo (La Clave / Good Mood) w kategorii instructors');
      assert.ok(instructors.some(i => /Marzena i Tomek/i.test(i.term)), 'Brak Marzeny i Tomka (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Kuba Tracz/i.test(i.term)), 'Brak Kuby Tracza (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Dominik i Natalia/i.test(i.term)), 'Brak Dominika i Natalii (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Martica Zaldivar/i.test(i.term)), 'Brak Marticy Zaldivar (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Piotr i Ela/i.test(i.term)), 'Brak Piotra i Eli (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Anita \(La Clave\)/i.test(i.term)), 'Brak Anity (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Dawid Bawor/i.test(i.term)), 'Brak Dawida Bawora (La Clave) w kategorii instructors');
      assert.ok(instructors.some(i => /Dominika \(La Clave\)/i.test(i.term)), 'Brak Dominiki (La Clave) w kategorii instructors');
      assert.ok(!instructors.some(i => /Marziiik/i.test(i.term)), 'W bazie nie powinno być błędnego hasła Marzena „Marziiik” i Jacek');
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

  describe('Kato Salsa Hub - Wspólny Grafik Szkół (schedule.json & schedule.js)', () => {
    const SCHEDULE_JSON = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'schedule.json');
    const KSH_EVENTS_JSON = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'events.json');

    it('plik schedule.json oraz zsynchronizowany katosalsahub.pl/assets/data/events.json powinny istnieć i posiadać poprawny schemat oraz ustandaryzowane poziomy KSH', () => {
      assert.ok(fs.existsSync(SCHEDULE_JSON), 'Brak pliku katosalsahub.pl/assets/data/schedule.json');
      assert.ok(fs.existsSync(KSH_EVENTS_JSON), 'Brak zsynchronizowanego pliku katosalsahub.pl/assets/data/events.json');

      const sched = JSON.parse(fs.readFileSync(SCHEDULE_JSON, 'utf-8'));
      assert.strictEqual(sched.schools.length, 3, 'schedule.json musi zawierać dokładnie 3 katowickie szkoły tańca (La Clave, Good Mood, Mil Pasos)');
      assert.ok(Array.isArray(sched.levelStandard) && sched.levelStandard.length === 5, 'schedule.json musi definiować 5-stopniowy standard poziomów KSH (P0, P1, P2, S1, OPEN)');
      assert.ok(Array.isArray(sched.classes) && sched.classes.length >= 100, `Oczekiwano min. 100 realnych kursów z 3 szkół, znaleziono: ${sched.classes.length}`);

      const schoolIds = new Set(sched.schools.map((s) => s.id));
      assert.ok(schoolIds.has('LC'), 'Brak szkoły La Clave (LC) w schedule.json');
      assert.ok(schoolIds.has('GM'), 'Brak szkoły Good Mood (GM) w schedule.json');
      assert.ok(schoolIds.has('MP'), 'Brak szkoły Mil Pasos (MP) w schedule.json');
      assert.strictEqual(schoolIds.has('EV'), false, 'Szkoła EV (Evolution & KIZLAB) nie powinna znajdować się w schedule.json');

      const allowedLevels = new Set(['P0', 'P1', 'P2', 'S1', 'OPEN']);
      for (const cls of sched.classes) {
        assert.ok(cls.id, 'Każde zajęcia muszą mieć pole id');
        assert.ok(schoolIds.has(cls.schoolId), `Zajęcia ${cls.id} odwołują się do nieznanej szkoły ${cls.schoolId}`);
        assert.ok(cls.dayOfWeek >= 1 && cls.dayOfWeek <= 7, `Zajęcia ${cls.id} mają niepoprawny dzień tygodnia`);
        assert.match(cls.startTime, /^\d{2}:\d{2}$/, `Zajęcia ${cls.id} mają niepoprawny format startTime`);
        assert.ok(allowedLevels.has(cls.levelCode), `Zajęcia ${cls.id} mają nieustandaryzowany kod poziomu: ${cls.levelCode}`);
        assert.ok(Array.isArray(cls.instructors) && cls.instructors.length > 0, `Zajęcia ${cls.id} muszą mieć przypisanego instruktora`);
        if (cls.styleCategory === 'bachata') {
          assert.ok(
            !cls.instructors.some((i) => /Seruga/i.test(i.name || '')),
            `Zajęcia bachatowe ${cls.id} nie mogą przypisywać salsowej instruktorki Ani Serugi zamiast duetu Ania & Kuba`
          );
        }
      }

      // Weryfikacja funkcji normalizeLevel, parsera CSV Good Mood, parsera cennika La Clave oraz Circuit Breakera
      const {
        normalizeLevel,
        parseCsvGrid,
        parseGoodMoodSheetCells,
        parseLaClavePricingHtml,
        validateScheduleSanity,
      } = require('../../scripts/sync-schedules.js');
      assert.strictEqual(normalizeLevel('GR. OD PODSTAW START: 26.10.2026'), 'P0');
      assert.strictEqual(normalizeLevel('BACHATA OD ZERA'), 'P0');
      assert.strictEqual(normalizeLevel('P0 - CZ.1'), 'P0');
      assert.strictEqual(normalizeLevel('GR. PODSTAWOWA TAŃCZĄCA'), 'P1');
      assert.strictEqual(normalizeLevel('SALSA BASIC 4'), 'P1');
      assert.strictEqual(normalizeLevel('BACHATA P2 - CZ.1'), 'P2');
      assert.strictEqual(normalizeLevel('BACHATA TAŃCZĄCY 6+ MIES.'), 'P2');
      assert.strictEqual(normalizeLevel('GR. ŚR-ZAAWANSOWANA dla tańczących min. 6 miesięcy'), 'S1');
      assert.strictEqual(normalizeLevel('SALSA KUBAŃSKA P4 GRUPA ZAMKNIĘTA'), 'S1');
      assert.strictEqual(normalizeLevel('BACHATA PRAKTIS Z INSTRUKTOREM'), 'OPEN');

      const sampleCsv = 'Poniedziałek,"SALA \nSWAYZE","SALSA CUBANA\n\nGR. OD PODSTAW\nSTART: 26.10.2026\n\n18:10 - 18:55\n\nDaniel"';
      const rows = parseCsvGrid(sampleCsv);
      assert.strictEqual(rows.length, 1);
      const gmBlocks = parseGoodMoodSheetCells(sampleCsv, 'Paderewskiego 35');
      assert.strictEqual(gmBlocks.length, 1);
      assert.strictEqual(gmBlocks[0].dayOfWeek, 1);
      assert.strictEqual(gmBlocks[0].startTime, '18:10');
      assert.strictEqual(gmBlocks[0].startDate, '26.10.2026');
      assert.strictEqual(gmBlocks[0].levelCode, 'P0');

      const sampleLcPricingHtml = `
        <table id="cennik">
          <tr><th>Start</th><td>4</td><td>109zł</td><td>bezterminowy*</td></tr>
          <tr><th>Eko</th><td>8</td><td>189zł</td><td>bezterminowy*</td></tr>
          <tr><th>Pro</th><td>10</td><td>219zł</td><td>bezterminowy*</td></tr>
        </table>
        <table id="cennik">
          <tr><th>Jednorazowe</th><td>1</td><td>30zł</td></tr>
          <tr><th>karnet OPEN</th><td>full</td><td>300zł</td></tr>
        </table>
      `;
      const parsedPrices = parseLaClavePricingHtml(sampleLcPricingHtml);
      assert.ok(parsedPrices, 'parseLaClavePricingHtml powinien poprawnie sparsować tabelę cennika La Clave');
      assert.strictEqual(parsedPrices.pass4Price, 109);
      assert.strictEqual(parsedPrices.pass8Price, 189);
      assert.strictEqual(parsedPrices.pass10Price, 219);
      assert.strictEqual(parsedPrices.singleEntryPrice, 30);
      assert.strictEqual(parsedPrices.openPassPrice, 300);
      assert.strictEqual(parseLaClavePricingHtml('<html>Błąd 500</html>'), null);

      assert.strictEqual(validateScheduleSanity(sched), true);
      assert.throws(() => validateScheduleSanity({ classes: [] }), /Circuit Breaker/i);
      assert.throws(
        () => validateScheduleSanity({ ...sched, schools: [{ id: 'LC', pricing: { unitMinutes: 45, singleEntryPrice: 0, openPassPrice: 300, passes: [] } }] }),
        /Circuit Breaker/i
      );
    });

    it('funkcje filterScheduleClasses, filterDancepulsEvents oraz calculateSchoolPricingComparison w schedule.js powinny poprawnie filtrować kursy, imprezy i wyliczać opłacalność cenników', () => {
      const {
        filterScheduleClasses,
        filterDancepulsEvents,
        calculateSchoolPricingComparison,
      } = require('../../katosalsahub.pl/assets/js/schedule.js');
      const sched = JSON.parse(fs.readFileSync(SCHEDULE_JSON, 'utf-8'));
      const evDays = JSON.parse(fs.readFileSync(KSH_EVENTS_JSON, 'utf-8'));

      const lcClasses = filterScheduleClasses(sched.classes, { schoolFilter: 'LC' });
      assert.ok(lcClasses.length > 0 && lcClasses.every((c) => c.schoolId === 'LC'));

      const p0Classes = filterScheduleClasses(sched.classes, { levelFilter: 'P0' });
      assert.ok(p0Classes.length > 0 && p0Classes.every((c) => c.levelCode === 'P0'));

      const galasClasses = filterScheduleClasses(sched.classes, { searchQuery: 'Daniel Galas' });
      assert.ok(galasClasses.length >= 1 && galasClasses.every((c) => c.schoolId === 'MP'));

      const katoEvents = filterDancepulsEvents(evDays, { eventCityFilter: 'Katowice' }, new Date('2026-10-20T12:00:00'));
      assert.ok(katoEvents.length > 0);
      for (const day of katoEvents) {
        assert.ok(day.date >= '2026-10-20', `Widok nie powinien zwracać minionych dat (< 2026-10-20): ${day.date}`);
        assert.ok(day.events.every((e) => e.miasto.toLowerCase() === 'katowice'));
      }

      // Weryfikacja domyślnego odfiltrowywania wydarzeń minionych (pokazuj wyłącznie dzisiejsze i późniejsze)
      const mixedDays = [
        {
          date: '2026-10-18',
          events: [{ opis: 'Stara impreza weekendowa', miasto: 'Katowice', miejsce: 'La Clave', style: ['Salsa'] }]
        },
        {
          date: '2026-10-19',
          events: [{ endDate: '2026-10-21', opis: 'Festiwal wielodniowy trwający dziś', miasto: 'Kraków', miejsce: 'Forum Tańca', style: ['Bachata'] }]
        },
        {
          date: '2026-10-20',
          events: [{ opis: 'Dzisiejszy praktis', miasto: 'Katowice', miejsce: 'Piąty Dom', style: ['Kizomba'] }]
        },
        {
          date: '2026-10-25',
          events: [{ opis: 'Salsa Habana Picante vol. 68', miasto: 'Katowice', miejsce: 'Wolni Ludzie', style: ['Cubana'] }]
        }
      ];
      const activeOnly = filterDancepulsEvents(mixedDays, {}, new Date('2026-10-20T18:00:00'));
      assert.strictEqual(activeOnly.length, 3, 'Wydarzenia zakończone przed dzisiejszą datą (2026-10-18) muszą być odfiltrowane');
      assert.ok(activeOnly.every((d) => d.date !== '2026-10-18'));

      // Weryfikacja zunifikowanych konektorów HTML dla wydarzeń tanecznych (Mil Pasos, LOFToDANCE, Krajownik)
      assert.match(inferEventStyles('Cuban Ladies – Rumba Guaguancó & Timba'), /Cubana/);
      assert.match(inferEventStyles('Cuban Ladies – Rumba Guaguancó & Timba'), /Timba/);

      const sampleMpHtml = `
        <div class="event">
          <h3>Cuban Ladies - Rumba Guaguancó, Oshun &amp; Timba Ladies - sobota 21.11</h3>
          <p>21.11.2026 12:30 - 21.11.2026 15:45</p>
        </div>
      `;
      const mpEvents = parseMilPasosEventsHtml(sampleMpHtml);
      assert.strictEqual(mpEvents.length, 1);
      assert.strictEqual(mpEvents[0].rawDate, '21.11');
      assert.strictEqual(mpEvents[0].isoStartDate, '2026-11-21');
      assert.strictEqual(mpEvents[0].venue, 'Mil Pasos');

      const sampleLoftHtml = `
        <a href="https://sklep.loftodance.pl/wydarzenie/salsa-on1-od-zera,1287">
          07.11.2026 Salsa On1 - warsztaty od zera oraz dla tańczących 120 zł Zobacz szczegóły
        </a>
      `;
      const loftEvents = parseLoftodanceEventsHtml(sampleLoftHtml);
      assert.strictEqual(loftEvents.length, 1);
      assert.strictEqual(loftEvents[0].rawDate, '07.11');
      assert.strictEqual(loftEvents[0].venue, 'LOFToDANCE');
      assert.match(loftEvents[0].styles, /Salsa On1/);

      const sampleKrajownikHtml = `
        <a href="/katowice/wydarzenia/kizomba-w-piatym-domu-sh75-423287">
          Kizomba w Piątym Domu - SH#75 20 Października 2026, od 21:00 Katowice Piąty Dom, Katowice
        </a>
        <a href="/szczecin/wydarzenia/kizomba-podstawy-407133">
          Kizomba Podstawy 24 Października 2026, od 11:00 Szczecin
        </a>
        <a href="/katowice/wydarzenia/salsation-fitness-400000">
          Maraton Salsation Fitness 24 Października 2026, od 12:00 Katowice
        </a>
      `;
      const krEvents = parseKrajownikEventsHtml(sampleKrajownikHtml, 'Katowice');
      assert.strictEqual(krEvents.length, 1, 'Parser Krajownika powinien pominąć zajęcia fitness Salsation oraz miasta spoza regionu (Szczecin)');
      assert.strictEqual(krEvents[0].isoStartDate, '2026-10-20');
      assert.strictEqual(krEvents[0].venue, 'Piąty Dom');

      assert.strictEqual(
        extractFacebookEventUrlFromHtml('<a href="https://www.facebook.com/events/1410619787718525">FB</a>'),
        'https://www.facebook.com/events/1410619787718525/'
      );

      const sampleFbEventHtml = `
        <meta property="og:title" content="Salsa Habana Picante&#x1f525;- Wolni Ludzie vol. 68" />
        <meta property="og:description" content="Wydarzenie w miejscowo&#x15b;ci Katowice organizowane przez KATO SALSA HUB w dniu niedziela, pa&#x17a;dziernika 25 2026" />
        <meta property="og:url" content="https://www.facebook.com/events/wolni-ludzie/salsa-habana-picante-wolni-ludzie-vol-68/891329324066083/" />
      `;
      const fbEv = parseFacebookEventHtml(sampleFbEventHtml);
      assert.ok(fbEv, 'parseFacebookEventHtml powinien sparsować metatagi OpenGraph wydarzenia FB');
      assert.strictEqual(fbEv.rawDate, '25.10');
      assert.strictEqual(fbEv.isoStartDate, '2026-10-25');
      assert.strictEqual(fbEv.city, 'Katowice');
      assert.strictEqual(fbEv.venue, 'Wolni Ludzie');
      assert.strictEqual(fbEv.url, 'https://www.facebook.com/events/891329324066083/');
      assert.strictEqual(fbEv.isKSH, true);

      // Weryfikacja kalkulatora opłacalności cenników (Unit Economics)
      const std8 = calculateSchoolPricingComparison(sched.schools, { units: 8, profile: 'standard' });
      assert.strictEqual(std8.length, 3, 'Kalkulator powinien zwrócić porównanie dla 3 szkół (LC, GM, MP)');
      const gm8 = std8.find((r) => r.schoolId === 'GM');
      const lc8 = std8.find((r) => r.schoolId === 'LC');
      const mp8 = std8.find((r) => r.schoolId === 'MP');
      assert.strictEqual(gm8.monthlyCost, 170);
      assert.strictEqual(gm8.costPer60Min, 21.25);
      assert.strictEqual(gm8.isBestValue60Min, true);
      assert.strictEqual(lc8.monthlyCost, 189);
      assert.strictEqual(lc8.isUnlimitedValidity, true);
      assert.strictEqual(mp8.monthlyCost, 199);

      const singleCard8 = calculateSchoolPricingComparison(sched.schools, { units: 8, profile: 'card_single' });
      const lcCard = singleCard8.find((r) => r.schoolId === 'LC');
      assert.strictEqual(lcCard.monthlyCost, 60, 'W La Clave przy 4 blokach 2x45 min i karcie 1x/dzień dopłata powinna wynosić 4 * 15 zł = 60 zł');
      assert.strictEqual(lcCard.isBestValue60Min, true);

      // Weryfikacja odporności kalkulatora na pustą/zbuforowaną tablicę schools (Fallback) oraz dokładności wyliczeń dla 4 i 16 jedn.
      const fallback4 = calculateSchoolPricingComparison([], { units: 4, profile: 'standard' });
      assert.strictEqual(fallback4.length, 3, 'Kalkulator musi działać nawet przy pustej tablicy schools dzięki DEFAULT_SCHOOLS_WITH_PRICING');
      assert.strictEqual(fallback4.find((r) => r.schoolId === 'GM').costPer60Min, 25);
      assert.strictEqual(fallback4.find((r) => r.schoolId === 'MP').costPerUnit, 29.75);
      assert.strictEqual(fallback4.find((r) => r.schoolId === 'MP').costPer60Min, 32.45);
      assert.strictEqual(fallback4.find((r) => r.schoolId === 'LC').costPerUnit, 27.25);
      assert.strictEqual(fallback4.find((r) => r.schoolId === 'LC').costPer60Min, 36.33);

      const student16 = calculateSchoolPricingComparison([], { units: 16, profile: 'student' });
      assert.strictEqual(student16.find((r) => r.schoolId === 'GM').costPer60Min, 16.25);
      assert.strictEqual(student16.find((r) => r.schoolId === 'MP').costPerUnit, 16.82);
    });

    it('zrefaktoryzowany Universal Event Scraper v3.0 (fb_scraper.js) oraz parser schowka (utils.js & parser.js) powinny bezbłędnie rozpoznawać daty, JSON-LD, Relay i priorytety źródeł', async () => {
      const {
        parseFBDate,
        toLocalYMD,
        canonicalizeEventUrl,
        extractEventsFromRelayJson,
        parseEventDetailHtml,
        deepEnrichFacebookEvents,
      } = require('../../dancepuls.pl/tools/fb_scraper.js');
      const { parsujDateFB, toYMD } = await import('../../dancepuls.pl/js/utils.js');
      const { parseClipboardData } = await import('../../dancepuls.pl/js/parser.js');

      const refNow = new Date(2026, 9, 20); // 20.10.2026

      // 1. Testy parseFBDate z fb_scraper.js (OpenGraph, zakresy, kropki, ISO)
      assert.strictEqual(
        toYMD(parseFBDate('Wydarzenie w dniu niedziela, października 25 2026', refNow)),
        '2026-10-25'
      );
      assert.strictEqual(
        toYMD(parseFBDate('24–25.10.2026 o 21:00', refNow)),
        '2026-10-24'
      );
      assert.strictEqual(
        canonicalizeEventUrl('https://www.facebook.com/events/wolni-ludzie/salsa-habana-picante/891329324066083/?acontext=%7B%7D'),
        'https://www.facebook.com/events/891329324066083/'
      );

      // 2. Testy ekstraktora Facebook Relay / GraphQL (start_timestamp)
      const sampleRelayPayload = {
        data: {
          viewer: {
            events: {
              edges: [
                {
                  node: {
                    __typename: 'Event',
                    id: '891329324066083',
                    name: 'Salsa Habana Picante - Wolni Ludzie vol. 68',
                    start_timestamp: Math.floor(new Date(2026, 9, 25, 21, 0, 0).getTime() / 1000),
                    event_place: { contextual_name: 'Wolni Ludzie, Katowice' },
                  },
                },
              ],
            },
          },
        },
      };
      const relayEvents = extractEventsFromRelayJson(sampleRelayPayload);
      assert.strictEqual(relayEvents.length, 1);
      assert.strictEqual(relayEvents[0].isoDate, '2026-10-25');
      assert.strictEqual(relayEvents[0].rawDate, '25.10');
      assert.strictEqual(relayEvents[0].url, 'https://www.facebook.com/events/891329324066083/');
      assert.strictEqual(relayEvents[0].location, 'Wolni Ludzie, Katowice');

      // 3. Testy parsujDateFB (utils.js) — odporność na przypadkowe dni tygodnia i godziny w opisie
      assert.strictEqual(
        toYMD(parsujDateFB('2026-10-25', { now: refNow })),
        '2026-10-25'
      );
      assert.strictEqual(
        toYMD(parsujDateFB('października 25 2026', { now: refNow })),
        '2026-10-25'
      );
      assert.strictEqual(
        parsujDateFB('Start imprezy o 20.00, zapisy na warsztaty trwają do środy!', { now: refNow, allowWeekdayOnly: false }),
        null,
        'Opis z godziną 20.00 i słowem "do środy" nie może fałszywie zwracać daty w trybie allowWeekdayOnly: false'
      );

      // 4. Testy parseClipboardData (parser.js) — ważenie źródeł (rawDate/isoDate > description) i odrzucanie minionych dat
      const clipboardPayload = JSON.stringify([
        {
          url: 'https://www.facebook.com/events/891329324066083/',
          title: 'Salsa Habana Picante - Wolni Ludzie vol. 68',
          rawDate: '25.10',
          isoDate: '2026-10-25',
          location: 'Wolni Ludzie, Katowice',
          description: 'Zapisy i przedpłaty do środy 21.10! Start o 21.00 w niedzielę.',
        },
        {
          url: 'https://www.facebook.com/events/111111111111111/',
          title: 'Miniona impreza sprzed tygodnia',
          rawDate: '12.10.2026',
          isoDate: '2026-10-12',
          location: 'Katowice',
          description: 'Archiwalne wydarzenie',
        },
      ]);
      const parsedClipboard = parseClipboardData(clipboardPayload, { now: refNow });
      assert.strictEqual(parsedClipboard.events.length, 1, 'Minione wydarzenie z 12.10 musi zostać odrzucone');
      assert.strictEqual(
        parsedClipboard.events[0].isoDate,
        '2026-10-25',
        'Waga rawDate/isoDate (25.10) musi mieć priorytet nad wcześniejszą datą zapisów (21.10) w opisie'
      );

      // 5. Testy Same-Origin Deep Fetch w fb_scraper.js (parseEventDetailHtml & deepEnrichFacebookEvents)
      const detailHtml = `
        <meta property="og:title" content="Musicality &amp; Dance with Anichi Perez (5h)" />
        <meta property="og:description" content="Wydarzenie w dniu sobota, listopada 21 2026" />
        <meta property="og:url" content="https://www.facebook.com/events/1636457378133646/" />
        <script type="application/json">{"event_description":{"text":"5 godzin warsztatów Salsa i Mambo w Sabrosa Dance Studio Kraków"},"contextual_name":"Sabrosa Dance Studio, Kraków"}</script>
      `;
      const enrichedDetail = parseEventDetailHtml(detailHtml, 'https://www.facebook.com/events/1636457378133646/', refNow);
      assert.ok(enrichedDetail);
      assert.strictEqual(enrichedDetail.isoDate, '2026-11-21');
      assert.strictEqual(enrichedDetail.location, 'Sabrosa Dance Studio, Kraków');
      assert.match(enrichedDetail.description, /Sabrosa Dance Studio/);

      const deepList = await deepEnrichFacebookEvents(
        [{ url: 'https://www.facebook.com/events/1636457378133646/', title: 'Anichi', rawDate: '21.11', isoDate: '2026-11-21', location: '', description: '' }],
        null,
        async () => ({ ok: true, text: async () => detailHtml }),
        refNow
      );
      assert.strictEqual(deepList.length, 1);
      assert.strictEqual(deepList[0].location, 'Sabrosa Dance Studio, Kraków');

      // 6. Test ekstrakcji JSON-LD @graph ze stron organizatorów Krajownika (/organizator/...)
      const sampleKrajownikOrgLd = `
        <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"Event","name":"Musicality & Dance with Anichi Perez (5h)","startDate":"2026-11-21T12:00:00.000Z","location":{"name":"Sabrosa Dance Studio","address":{"addressLocality":"Kraków"}},"organizer":{"name":"Sabrosa Dance Studio"},"url":"https://krajownik.pl/krakow/wydarzenia/musicality-anichi-perez-500001"}
        ]}
        </script>
      `;
      const orgEvents = parseKrajownikEventsHtml(sampleKrajownikOrgLd, 'Kraków');
      assert.strictEqual(orgEvents.length, 1);
      assert.strictEqual(orgEvents[0].isoStartDate, '2026-11-21');
      assert.strictEqual(orgEvents[0].venue, 'Sabrosa Dance Studio');

      // 7. Test ekstrakcji Sabaki.dance JSON-LD (z filtrowaniem regularnych kursów tygodniowych) oraz pojedynczej godziny w Mil Pasos
      const sampleSabakiLd = `
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"ItemList","itemListElement":[
          {"@type":"ListItem","position":1,"item":{"@type":"Event","name":"BACHATA SOCIAL CLUB - impreza 100% social w La Clave","startDate":"2026-11-14T22:00:00.000Z","location":{"name":"La Clave","address":{"addressLocality":"Katowice"}},"organizer":{"name":"La Clave"},"sameAs":["https://facebook.com/events/28393357210359838"]}},
          {"@type":"ListItem","position":2,"item":{"@type":"Event","name":"SALSA KUBAŃSKA OD ZERA | NOWY KURS | CZWARTKI 18:00","startDate":"2026-10-22T18:00:00.000Z","location":{"name":"La Clave","address":{"addressLocality":"Katowice"}},"organizer":{"name":"La Clave"},"sameAs":["https://facebook.com/events/1387152979507021"]}}
        ]}
        </script>
      `;
      const sabakiEvents = parseSabakiEventsHtml(sampleSabakiLd, 'Katowice');
      assert.strictEqual(sabakiEvents.length, 1, 'Regularny kurs tygodniowy (CZWARTKI 18:00) musi zostać odfiltrowany');
      assert.strictEqual(sabakiEvents[0].isoStartDate, '2026-11-14');
      assert.strictEqual(sabakiEvents[0].venue, 'La Clave');
      assert.strictEqual(sabakiEvents[0].url, 'https://www.facebook.com/events/28393357210359838/');

      const singleTimeMpHtml = `
        <div>
          <p class="title">LATINO SOCIAL PARTY vol. 13 - 10.11.2026 WTOREK! SALSA - BACHATA - KIZOMBA</p>
          <p>10.11.2026 22:00</p>
          <p>Szkoła Tańca Mil Pasos</p>
        </div>
      `;
      const singleMpEvents = parseMilPasosEventsHtml(singleTimeMpHtml);
      assert.strictEqual(singleMpEvents.length, 1);
      assert.strictEqual(singleMpEvents[0].rawDate, '10.11');
      assert.strictEqual(singleMpEvents[0].isoStartDate, '2026-11-10');

      // 8. Testy relatywnych dni tygodnia na kartach FB ("W ten piątek o 20:00", "W tę sobotę o 21:00", "Oct 24")
      // refNow = wtorek 20.10.2026 -> piątek = 23.10.2026, sobota = 24.10.2026, niedziela = 25.10.2026
      assert.strictEqual(toLocalYMD(parseFBDate('W ten piątek o 20:00', refNow)), '2026-10-23');
      assert.strictEqual(toLocalYMD(parseFBDate('W tę sobotę o 21:00', refNow)), '2026-10-24');
      assert.strictEqual(toLocalYMD(parseFBDate('Niedziela o 15:00', refNow)), '2026-10-25');
      assert.strictEqual(toLocalYMD(parseFBDate('Sat, Oct 24 at 8 PM', refNow)), '2026-10-24');

      // 9. Test Relay JSON z zagnieżdżonymi obiektami {} między id, name i start_timestamp
      const nestedRelay = JSON.stringify({
        data: {
          viewer: {
            events: [
              {
                id: '28458661560422914',
                profile_picture: { uri: 'https://scontent.xx.fbcdn.net/pic.jpg', width: 400 },
                name: 'Early Vibes & Goodnights Dance Party – Pumpkin Edition',
                event_place: { contextual_name: 'Mil Pasos, Katowice', address: { street: 'Kamienna 4' } },
                start_timestamp: 1792864800,
              },
            ],
          },
        },
      });
      const nestedRelayEvents = extractEventsFromRelayJson(nestedRelay, refNow);
      assert.strictEqual(nestedRelayEvents.length, 1);
      assert.strictEqual(nestedRelayEvents[0].url, 'https://www.facebook.com/events/28458661560422914/');
      assert.strictEqual(nestedRelayEvents[0].location, 'Mil Pasos, Katowice');

      // 10. Test konektorów OnlyDance i AirDancia w sync_engine.js
      const sampleOnlyDanceHtml = `
        <a class="row" href="/event/024ae44e1d4243c7a817">
          <span class="date"><span class="d">23</span><span class="m">Oct</span></span>
          <span class="row-main">
            <span class="t">Stylowa Willa 23 października- impreza mieszana oraz warsztaty</span>
            <span class="s">Salsa Party · PLONS.pl by Asia &amp; Przemo</span>
          </span>
        </a>
        <a class="row" href="/event/74616a91a9344a7b994e">
          <span class="date"><span class="d">23</span><span class="m">Oct</span></span>
          <span class="row-main">
            <span class="t">JESIENIARA West Coast Swing PARTY</span>
            <span class="s">West Coast Swing Party · U2Dance</span>
          </span>
        </a>
      `;
      const odEvents = parseOnlyDanceEventsHtml(sampleOnlyDanceHtml, 'Katowice');
      assert.strictEqual(odEvents.length, 1, 'Wydarzenia West Coast Swing muszą być odfiltrowane z OnlyDance');
      assert.strictEqual(odEvents[0].isoStartDate, '2026-10-23');
      assert.strictEqual(odEvents[0].city, 'Świętochłowice');
      assert.strictEqual(odEvents[0].venue, 'Stylowa Willa');

      const sampleAirdanciaHtml = `
        <article class="aird-soc__card" data-soc-card data-soc-start="1792774800" data-families="afro-latino bachata-dance kizomba-dance salsa-dance">
          <a class="aird-soc__card-link" href="https://airdancia.com/event/stylowa-willa-23-pazdziernika-impreza-mieszana-oraz-warsztaty-swietochlowice/"></a>
          <div class="aird-soc__card-body">
            <h3 class="aird-soc__card-title">Stylowa Willa 23 października- impreza mieszana oraz warsztaty</h3>
            <div class="aird-soc__card-city">Świętochłowice</div>
            <div class="aird-soc__card-when">19:00</div>
          </div>
        </article>
      `;
      const adEvents = parseAirdanciaEventsHtml(sampleAirdanciaHtml, 'Katowice');
      assert.strictEqual(adEvents.length, 1);
      assert.strictEqual(adEvents[0].isoStartDate, '2026-10-23');
      assert.strictEqual(adEvents[0].city, 'Świętochłowice');
      assert.strictEqual(adEvents[0].venue, 'Stylowa Willa');
    });
  });
});

