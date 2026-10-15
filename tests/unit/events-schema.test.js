const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeLocation,
  deduplicateEvents
} = require('../../dancepuls.pl/tools/sync_engine.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const EVENTS_JSON = path.join(ROOT_DIR, 'dancepuls.pl', 'data', 'events.json');
const EVENTS_DB_MD = path.join(ROOT_DIR, 'dancepuls.pl', 'data', 'events_database.md');
const SALSOPEDIA_JSON = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'salsopedia.json');

describe('Walidacja schematu baz danych (DancePuls Events & Kato Salsa Hub Salsopedia)', () => {
  describe('DancePuls - events_database.md & events.json', () => {
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

    it('funkcja normalizeLocation powinna normalizować adresy i zwracać współrzędne GPS (#16)', () => {
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
  });
});
