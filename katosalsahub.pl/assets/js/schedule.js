/**
 * SCHEDULE.JS - Wspólny Grafik Szkół Tańca (Katowice), Kalendarz Imprez DancePuls & Mapa Szkół
 * Architektura Zero-Bloat Vanilla JS, kompatybilna z routerem SPA (router.js) oraz testami node:test.
 */

(function () {
'use strict';

const DAY_NAMES_PL = {
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
  7: 'Niedziela',
};

const WEEKDAY_FROM_JS_DAY = {
  0: 7, // Niedziela
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

/**
 * Wbudowany, awaryjny wsad cennikowy 3 szkół (Circuit Breaker Fallback),
 * gwarantujący 100% działanie kalkulatora nawet przed załadowaniem schedule.json lub przy starym cache.
 */
const DEFAULT_SCHOOLS_WITH_PRICING = [
  {
    id: 'GM',
    name: 'Good Mood',
    badgeClass: 'school-badge--gm',
    pricing: {
      unitMinutes: 60,
      validityLabel: '28 dni (4 tygodnie)',
      validityDays: 28,
      isUnlimitedValidity: false,
      singleEntryPrice: 35,
      twoUnitsBlockPrice: 55,
      threeUnitsBlockPrice: 80,
      extraSecondUnitSurcharge: 25,
      extraThirdUnitSurcharge: 25,
      thirdUnitFreeWithTwoPunches: false,
      passes: [
        { id: 'gm_4', units: 4, name: 'Karnet 4h', price: 100, studentPrice: 90, validity: '28 dni' },
        { id: 'gm_8', units: 8, name: 'Karnet 8h', price: 170, studentPrice: 160, validity: '28 dni' },
      ],
      openPassPrice: 260,
      openPassStudentPrice: 260,
      openPassValidity: '28 dni (4 tygodnie)',
    },
  },
  {
    id: 'LC',
    name: 'La Clave',
    badgeClass: 'school-badge--lc',
    pricing: {
      unitMinutes: 45,
      validityLabel: 'Bezterminowy (wejścia nie przepadają)',
      validityDays: null,
      isUnlimitedValidity: true,
      singleEntryPrice: 30,
      twoUnitsBlockPrice: 45,
      threeUnitsBlockPrice: 55,
      extraSecondUnitSurcharge: 15,
      extraThirdUnitSurcharge: 10,
      thirdUnitFreeWithTwoPunches: true,
      passes: [
        { id: 'lc_4', units: 4, name: 'Karnet Start (4 wejścia)', price: 109, studentPrice: 109, validity: 'Bezterminowy' },
        { id: 'lc_8', units: 8, name: 'Karnet Eko (8 wejść)', price: 189, studentPrice: 189, validity: 'Bezterminowy' },
        { id: 'lc_10', units: 10, name: 'Karnet Pro (10 wejść)', price: 219, studentPrice: 219, validity: 'Bezterminowy' },
      ],
      openPassPrice: 300,
      openPassStudentPrice: 300,
      openPassValidity: '4 tygodnie (28 dni)',
    },
  },
  {
    id: 'MP',
    name: 'Mil Pasos',
    badgeClass: 'school-badge--mp',
    pricing: {
      unitMinutes: 55,
      validityLabel: '4 tygodnie (28 dni)',
      validityDays: 28,
      isUnlimitedValidity: false,
      singleEntryPrice: 35,
      twoUnitsBlockPrice: 55,
      threeUnitsBlockPrice: 90,
      dayPassPrice: 90,
      extraSecondUnitSurcharge: 35,
      extraThirdUnitSurcharge: 35,
      thirdUnitFreeWithTwoPunches: false,
      passes: [
        { id: 'mp_4', units: 4, name: 'Karnet 4h', price: 119, studentPrice: 107.1, validity: '4 tygodnie' },
        { id: 'mp_8', units: 8, name: 'Karnet 8h', price: 199, studentPrice: 179.1, validity: '4 tygodnie' },
        { id: 'mp_12', units: 12, name: 'Karnet 12h', price: 249, studentPrice: 224.1, validity: '4 tygodnie' },
        { id: 'mp_16', units: 16, name: 'Karnet 16h', price: 299, studentPrice: 269.1, validity: '4 tygodnie' },
      ],
      openPassPrice: 399,
      openPassStudentPrice: 359.1,
      openPassValidity: '4 tygodnie (28 dni)',
    },
  },
];

const scheduleState = {
  activeTab: 'classes', // 'classes' | 'pricing' | 'events' | 'map'
  searchQuery: '',
  dayFilter: 'all', // 'all' | 'today' | '1'..'7'
  schoolFilter: 'all', // 'all' | 'LC' | 'GM' | 'MP'
  styleFilter: 'all', // 'all' | 'salsa_cubana' | 'rueda' | 'salsa_liniowa' | 'bachata' | 'kizomba' | 'solo'
  levelFilter: 'all', // 'all' | 'P0' | 'P1' | 'S1' | 'OPEN'
  eventCityFilter: 'all', // 'all' | 'Katowice' | 'Slask' | 'Krakow'
  pricingUnits: 8, // 4 | 8 | 12 | 16
  pricingProfile: 'standard', // 'standard' | 'student' | 'card_single' | 'card_multi'
  schools: DEFAULT_SCHOOLS_WITH_PRICING.slice(),
  classes: [],
  eventsDays: [],
  loaded: false,
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCurrentIsoWeekday(now = new Date()) {
  return WEEKDAY_FROM_JS_DAY[now.getDay()] || 1;
}

function getTodayIsoDate(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Czysta funkcja filtrująca zajęcia w grafiku szkół (testowalna w node:test)
 */
function filterScheduleClasses(classes, filters = {}, now = new Date()) {
  if (!Array.isArray(classes)) return [];
  const query = String(filters.searchQuery || '').trim().toLowerCase();
  const schoolFilter = filters.schoolFilter || 'all';
  const styleFilter = filters.styleFilter || 'all';
  const levelFilter = filters.levelFilter || 'all';
  const dayFilter = filters.dayFilter || 'all';
  const todayNum = getCurrentIsoWeekday(now);

  const targetDayNum =
    dayFilter === 'today'
      ? todayNum
      : dayFilter !== 'all'
        ? parseInt(dayFilter, 10)
        : null;

  return classes
    .filter((item) => {
      if (!item) return false;

      if (targetDayNum && Number(item.dayOfWeek) !== targetDayNum) {
        return false;
      }

      if (schoolFilter !== 'all' && item.schoolId !== schoolFilter) {
        return false;
      }

      if (styleFilter !== 'all' && item.styleCategory !== styleFilter) {
        return false;
      }

      if (levelFilter !== 'all') {
        const code = String(item.levelCode || '').toUpperCase();
        const target = String(levelFilter).toUpperCase();
        if (target === 'P1_P2') {
          if (code !== 'P1' && code !== 'P2') return false;
        } else if (code !== target) {
          return false;
        }
      }

      if (query) {
        const instructorNames = Array.isArray(item.instructors)
          ? item.instructors.map((i) => i.name || '').join(' ')
          : '';
        const haystack = [
          item.title,
          item.styleLabel,
          item.levelLabel,
          item.levelCode,
          item.room,
          item.dayName,
          item.schoolId,
          instructorNames,
          item.notes,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const dayDiff = (Number(a.dayOfWeek) || 0) - (Number(b.dayOfWeek) || 0);
      if (dayDiff !== 0) return dayDiff;
      return String(a.startTime || '').localeCompare(String(b.startTime || ''));
    });
}

/**
 * Czysta funkcja filtrująca wydarzenia z DancePuls (testowalna w node:test).
 * Domyślnie odcina minione dni (pokazuje wyłącznie dzisiejsze i późniejsze: effectiveEndDate >= todayIso).
 */
function filterDancepulsEvents(eventsDays, filters = {}, now = new Date()) {
  if (!Array.isArray(eventsDays)) return [];
  const query = String(filters.searchQuery || '').trim().toLowerCase();
  const cityFilter = filters.eventCityFilter || 'all';
  const styleFilter = filters.styleFilter || 'all';
  const minDateIso =
    filters.includePast === true
      ? ''
      : typeof filters.minDateIso === 'string'
        ? filters.minDateIso
        : getTodayIsoDate(now);

  const filteredDays = [];

  for (const dayEntry of eventsDays) {
    if (!dayEntry || !Array.isArray(dayEntry.events)) continue;
    const dayDate = String(dayEntry.date || '');

    const matchingEvents = dayEntry.events.filter((ev) => {
      if (!ev) return false;
      const effectiveEndDate = String(ev.endDate || dayDate);
      if (minDateIso && effectiveEndDate < minDateIso) return false;

      const city = String(ev.miasto || '').trim();

      if (cityFilter === 'Katowice' && city.toLowerCase() !== 'katowice') {
        return false;
      }
      if (cityFilter === 'Krakow' && city.toLowerCase() !== 'kraków' && city.toLowerCase() !== 'krakow') {
        return false;
      }
      if (cityFilter === 'Slask') {
        const lowerCity = city.toLowerCase();
        if (lowerCity === 'kraków' || lowerCity === 'krakow') return false;
      }

      const stylesStr = Array.isArray(ev.style) ? ev.style.join(' ').toLowerCase() : '';
      if (styleFilter !== 'all') {
        if (styleFilter === 'salsa_cubana' && !/salsa|cubana|timba|son|casino/i.test(stylesStr)) return false;
        if (styleFilter === 'rueda' && !/rueda|timba|cubana|rumba/i.test(stylesStr)) return false;
        if (styleFilter === 'salsa_liniowa' && !/salsa|mambo|on1|on2/i.test(stylesStr)) return false;
        if (styleFilter === 'bachata' && !/bachata|sensual/i.test(stylesStr)) return false;
        if (styleFilter === 'kizomba' && !/kizomba|kiz|semba|zouk/i.test(stylesStr)) return false;
      }

      if (query) {
        const haystack = [
          ev.tytul,
          ev.opisPubliczny || ev.opis,
          ev.miasto,
          ev.miejsce,
          ev.adres,
          stylesStr,
          dayEntry.date,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    if (matchingEvents.length > 0) {
      filteredDays.push({
        date: dayEntry.date,
        events: matchingEvents,
      });
    }
  }

  return filteredDays;
}

function formatPlDateHeader(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekdays = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const dayName = weekdays[dt.getUTCDay()] || '';
  return `${dayName} • ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

function getCleanEventDescription(ev) {
  if (ev.opisPubliczny) return ev.opisPubliczny;
  const raw = String(ev.opis || ev.tytul || '');
  return raw.split(';')[0].replace(/\s*-\s*dzień miniony.*$/i, '').trim();
}

function buildClassCardHtml(item, schoolsMap) {
  const school = schoolsMap.get(item.schoolId) || {
    id: item.schoolId,
    name: item.schoolId,
    address: 'Katowice',
    badgeClass: 'school-badge--lc',
    salsopediaId: 'term_school_1',
  };

  const schoolLower = String(item.schoolId || 'lc').toLowerCase();
  const levelLower = String(item.levelCode || 'open').toLowerCase();

  const instructorsHtml = (item.instructors || [])
    .map((inst) => {
      const href = inst.termId
        ? `salsopedia.html?term=${encodeURIComponent(inst.termId)}`
        : 'salsopedia.html';
      return `<a href="${href}" class="instructor-link-pill" title="Zobacz profil instruktora w Salsopedii"><i class="fas fa-user-graduate"></i> ${escapeHtml(inst.name)}</a>`;
    })
    .join('');

  return `
    <article class="schedule-card schedule-card--${escapeHtml(schoolLower)}" data-class-id="${escapeHtml(item.id)}" data-school-id="${escapeHtml(item.schoolId)}">
      <div>
        <div class="schedule-card-top">
          <span class="schedule-time-box">
            <i class="far fa-clock"></i> ${escapeHtml(item.startTime)} – ${escapeHtml(item.endTime)}
          </span>
          <div class="schedule-badges-row">
            <span class="school-badge ${escapeHtml(school.badgeClass || `school-badge--${schoolLower}`)}">${escapeHtml(school.name)}</span>
            <span class="level-badge level-badge--${escapeHtml(levelLower)}">${escapeHtml(item.levelLabel || item.levelCode)}</span>
          </div>
        </div>
        <div class="schedule-card-style">${escapeHtml(item.styleLabel)} • ${escapeHtml(item.room)}</div>
        <h3 class="schedule-card-title">${escapeHtml(item.title)}</h3>
        <p class="schedule-card-notes">${escapeHtml(item.notes)}</p>
      </div>
      <div class="schedule-card-meta">
        <div class="schedule-meta-row">
          <div class="schedule-instructors">${instructorsHtml}</div>
        </div>
        <div class="schedule-card-actions">
          <button type="button" class="schedule-action-btn js-focus-school-map" data-school-id="${escapeHtml(item.schoolId)}" title="Pokaż szkołę ${escapeHtml(school.name)} na mapie">
            <i class="fas fa-map-marker-alt"></i> Pokaż na mapie
          </button>
          <a href="${escapeHtml(school.website || '#')}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn">
            <i class="fas fa-external-link-alt"></i> Strona szkoły
          </a>
        </div>
      </div>
    </article>
  `;
}

/**
 * Czysta funkcja kalkulatora opłacalności cenników (Unit Economics: koszt pakietu, koszt 1 jednostki, realny koszt 60 min).
 * Testowalna w node:test bez zależności od DOM.
 */
function calculateSchoolPricingComparison(schools = [], options = {}) {
  const units = Number(options.units || 8);
  const profile = String(options.profile || 'standard');

  const sourceList =
    Array.isArray(schools) && schools.some((s) => s && s.pricing)
      ? schools
      : DEFAULT_SCHOOLS_WITH_PRICING;

  const fallbackMap = new Map(DEFAULT_SCHOOLS_WITH_PRICING.map((s) => [s.id, s]));
  const orderedIds = ['GM', 'LC', 'MP'];
  const normalizedSchools = [];

  for (const id of orderedIds) {
    const found = sourceList.find((s) => s && s.id === id);
    const fb = fallbackMap.get(id);
    if (found && found.pricing) {
      normalizedSchools.push(found);
    } else if (found && fb) {
      normalizedSchools.push({ ...found, pricing: fb.pricing });
    } else if (fb) {
      normalizedSchools.push(fb);
    }
  }

  for (const s of sourceList) {
    if (s && s.pricing && !orderedIds.includes(s.id)) {
      normalizedSchools.push(s);
    }
  }

  const results = [];

  for (const school of normalizedSchools) {
    if (!school || !school.pricing) continue;
    const p = school.pricing;
    const unitMin = Number(p.unitMinutes || 60);
    const passes = Array.isArray(p.passes) ? p.passes : [];

    let monthlyCost = 0;
    let planName = '';
    let planNote = '';
    let blockRateInfo = '';

    if (profile === 'card_multi') {
      monthlyCost = 0;
      planName = 'Karta wielowejściowa (0 zł dopłat)';
      if (school.id === 'LC') {
        planNote = 'Odbijasz kartę co 45 minut i wchodzisz na cały blok 2×45 lub 3×45 min całkowicie za 0 zł.';
        blockRateInfo = 'Bloki 2×45 min i 3×45 min: 0,00 zł / 60 min';
      } else if (school.id === 'GM') {
        planNote = 'Odbijasz kartę na każdą godzinę zajęć (60 min) — wejście bez dopłat.';
        blockRateInfo = 'Bloki 2×60 min: 0,00 zł / 60 min (odbicie co 1h)';
      } else {
        planNote = 'Odbijasz kartę na każdą godzinę zajęć (55 min) — wejście bez dopłat.';
        blockRateInfo = 'Bloki 2×55 min: 0,00 zł / 60 min (odbicie co 1h)';
      }
    } else if (profile === 'card_single') {
      const blocksOfTwo = Math.max(1, Math.floor(units / 2));
      if (school.id === 'LC') {
        const surcharge = Number(p.extraSecondUnitSurcharge || 15);
        monthlyCost = blocksOfTwo * surcharge;
        planName = `Karta 1×/dzień + dopłaty (${blocksOfTwo}× ${surcharge} zł)`;
        planNote = `1. jednostka (45 min) z karty 0 zł, dopłata do 2. jednostki tylko +${surcharge} zł (do 3. jednostki +${p.extraThirdUnitSurcharge || 10} zł).`;
        blockRateInfo = 'W bloku 3×45 min (2h 15m): dopłata 15+10 = 25 zł (11,11 zł / 60 min)!';
      } else if (school.id === 'GM') {
        const surcharge = Number(p.extraSecondUnitSurcharge || 25);
        monthlyCost = blocksOfTwo * surcharge;
        planName = `Karta 1×/dzień + dopłaty (${blocksOfTwo}× ${surcharge} zł)`;
        planNote = `1. godzina (60 min) z karty 0 zł, dopłata do 2. godziny tego samego dnia wynosi +${surcharge} zł.`;
        blockRateInfo = 'W bloku 2×60 min: 25 zł za 2h tańca (12,50 zł / 60 min)';
      } else {
        // Mil Pasos: 1. godzina z karty 0 zł, 2. godzina z karnetu (przy 4+ blokach) lub wejścia jednorazowego (35 zł)
        const secondHourPass = passes.find((ps) => Number(ps.units) === blocksOfTwo);
        if (secondHourPass && blocksOfTwo >= 4) {
          monthlyCost = Number(secondHourPass.price);
          planName = `Karta 1×/dzień + ${secondHourPass.name} na 2. godz.`;
        } else if (blocksOfTwo === 6) {
          monthlyCost = 149;
          planName = 'Karta 1×/dzień + pakiet na 2. godzinę';
        } else {
          const singlePrice = Number(p.singleEntryPrice || 35);
          monthlyCost = blocksOfTwo * singlePrice;
          planName = `Karta 1×/dzień + ${blocksOfTwo}× wejście 35 zł`;
        }
        planNote = '1. godzina z karty (0 zł); brak specjalnej taniej dopłaty do karty 1×/dzień (2. godzina z karnetu lub 35 zł).';
        blockRateInfo = 'Najkorzystniej łączyć kartę 1×/dzień z karnetem godzinowym na 2. godzinę.';
      }
    } else {
      const isStudent = profile === 'student';
      const openPrice = Number(isStudent && p.openPassStudentPrice ? p.openPassStudentPrice : p.openPassPrice || 300);
      const exactPass = passes.find((ps) => Number(ps.units) === units);

      if (exactPass) {
        const passPrice = Number(isStudent && exactPass.studentPrice ? exactPass.studentPrice : exactPass.price);
        if (passPrice <= openPrice) {
          monthlyCost = passPrice;
          planName =
            isStudent && exactPass.studentPrice < exactPass.price
              ? `${exactPass.name} (Student -10%)`
              : exactPass.name;
          if (school.id === 'GM' && isStudent && exactPass.studentPrice < exactPass.price) {
            planName = `${exactPass.name} (Student)`;
          }
          planNote = p.isUnlimitedValidity
            ? 'Karnet BEZTERMINOWY — niewykorzystane wejścia nigdy nie przepadają!'
            : `Ważność: ${p.validityLabel} (ścisły limit czasu)`;
        } else {
          monthlyCost = openPrice;
          planName = isStudent && openPrice < p.openPassPrice ? 'Karnet OPEN (Student)' : 'Karnet OPEN (Bez limitu)';
          planNote = `Ważność: ${p.openPassValidity || p.validityLabel}`;
        }
      } else if (school.id === 'LC' && units === 12) {
        const pass10 = passes.find((ps) => Number(ps.units) === 10);
        const pass8 = passes.find((ps) => Number(ps.units) === 8);
        const p10Cost = pass10 ? Number(pass10.price) + 2 * Number(p.extraSecondUnitSurcharge || 15) : openPrice;
        if (p10Cost < openPrice) {
          monthlyCost = p10Cost;
          planName = 'Karnet Pro (10x za 219 zł) + 2× dopłata 15 zł';
          planNote = pass8
            ? `Bezterminowy (21,90 zł/okienko). W blokach 3×45 min (3. gratis) wystarczy Karnet Eko 8x za ${pass8.price} zł!`
            : 'Bezterminowy karnet Pro + dopłaty blokowe.';
        } else {
          monthlyCost = openPrice;
          planName = 'Karnet OPEN (Full)';
          planNote = `Ważność: ${p.openPassValidity || '4 tygodnie'}`;
        }
      } else {
        monthlyCost = openPrice;
        planName = isStudent && openPrice < p.openPassPrice ? 'Karnet OPEN (Student)' : 'Karnet OPEN (Bez limitu)';
        if (school.id === 'GM') {
          planNote = `Najtańszy Karnet OPEN w Katowicach (260 zł na 28 dni) — zwraca się już przy 10–11h w miesiącu!`;
        } else if (school.id === 'LC') {
          planNote = `Karnet OPEN (300 zł / 4 tyg.) lub bezterminowy Karnet Pro 10x (219 zł = 21,90 zł/okienko) + dopłaty blokowe.`;
        } else {
          planNote = `Najbardziej opłacalny przy ${units}+ wejściach w miesiącu (${p.openPassValidity || '28 dni'}).`;
        }
      }

      // Dodatkowa informacja o realnym koszcie w systemie blokowym / pakietowym (Punkt 3 i 4 analizy)
      if (school.id === 'LC') {
        if (units === 4) {
          blockRateInfo = 'W bloku 2×45 / 3×45 min (dopłaty 15/10 zł lub 3. gratis): 19,47–23,63 zł / 60 min!';
        } else if (units === 8) {
          blockRateInfo = 'W bloku 3×45 min (promocja 3. gratis): realny koszt spada do 19,47–21,00 zł / 60 min!';
        } else if (units === 12) {
          blockRateInfo = 'W bloku 3×45 min (2 skreślenia = 3. gratis): 12 jedn. za 189 zł (21,00 zł / 60 min)!';
        } else {
          blockRateInfo = 'Przy 16h zegarowych na Open (300 zł): 18,75 zł / 60 min (lub Pro 10x w bloku: 19,47 zł / 60 min).';
        }
      } else if (school.id === 'GM') {
        blockRateInfo =
          units >= 12
            ? 'Bezkonkurencyjna cena pakietu OPEN (przy 12h: 21,67 zł/h, przy 16h: 16,25 zł/h).'
            : 'Najniższy próg wejścia dla 1–2h tygodniowo (28 dni ważności, aplikacja Fitssey).';
      } else if (school.id === 'MP') {
        blockRateInfo =
          units >= 12
            ? 'Pakiety 12h (249 zł) i 16h (299 zł / student 269,10 zł) zamiast drogiego Open (399 zł).'
            : 'Zniżka -10% dla studentów na każdy karnet; Day Pass całodniowy za 90 zł.';
      }
    }

    const costPerUnit = Number((monthlyCost / units).toFixed(2));
    const costPer60Min = Number(((costPerUnit / unitMin) * 60).toFixed(2));

    results.push({
      schoolId: school.id,
      schoolName: school.name,
      badgeClass: school.badgeClass || `school-badge--${school.id.toLowerCase()}`,
      unitMinutes: unitMin,
      isUnlimitedValidity: Boolean(p.isUnlimitedValidity),
      validityLabel: p.validityLabel || '28 dni',
      units,
      profile,
      planName,
      planNote,
      blockRateInfo,
      monthlyCost,
      costPerUnit,
      costPer60Min,
      isBestValue60Min: false,
    });
  }

  if (results.length > 0) {
    const min60 = Math.min(...results.map((r) => r.costPer60Min));
    results.forEach((r) => {
      if (Math.abs(r.costPer60Min - min60) < 0.05) {
        r.isBestValue60Min = true;
      }
    });
  }

  return results;
}

function formatPln(val) {
  const num = Number(val || 0);
  if (Number.isInteger(num)) return `${num} zł`;
  return `${num.toFixed(2).replace('.', ',')} zł`;
}

function renderSchedulePricingView(doc = document) {
  const calcContainer = doc.getElementById('pricingCalculatorResults');
  if (!calcContainer) return;

  const comparison = calculateSchoolPricingComparison(scheduleState.schools, {
    units: scheduleState.pricingUnits,
    profile: scheduleState.pricingProfile,
  });
  if (comparison.length === 0) return;

  calcContainer.innerHTML = comparison
    .map((item) => {
      const schoolLower = item.schoolId.toLowerCase();
      const topBadges = [];
      if (item.isBestValue60Min) {
        topBadges.push('<span class="pricing-best-badge">⭐ Najniższy koszt 60 min</span>');
      }
      if (item.isUnlimitedValidity) {
        topBadges.push('<span class="pricing-unlimited-badge">♾️ Bezterminowy</span>');
      }

      const blockInfoLi = item.blockRateInfo
        ? `<li><span>Efekt blokowy / pakiet:</span> <strong>${escapeHtml(item.blockRateInfo)}</strong></li>`
        : '';

      return `
        <article class="pricing-result-card pricing-result-card--${escapeHtml(schoolLower)}${item.isBestValue60Min ? ' is-best-choice' : ''}">
          <div>
            <div class="pricing-result-top">
              <span class="school-badge ${escapeHtml(item.badgeClass)}">${escapeHtml(item.schoolName)}</span>
              <div class="pricing-badges-wrap">${topBadges.join('')}</div>
            </div>
            <h3>${escapeHtml(item.planName)}</h3>
            <div class="pricing-price-main">${escapeHtml(formatPln(item.monthlyCost))} <small>/ ${item.units} jedn.</small></div>
            <ul class="pricing-metrics-list">
              <li><span>Koszt 1 jednostki (${item.unitMinutes} min):</span> <strong>${escapeHtml(formatPln(item.costPerUnit))}</strong></li>
              <li><span>Realny koszt 60 min tańca:</span> <strong class="pricing-highlight-60m">${escapeHtml(formatPln(item.costPer60Min))} / 60 min</strong></li>
              ${blockInfoLi}
              <li><span>Ważność / zasady:</span> <strong>${escapeHtml(item.planNote)}</strong></li>
            </ul>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderScheduleClassesView(doc = document) {
  const container = doc.getElementById('scheduleClassesContainer');
  if (!container) return 0;

  const schoolsMap = new Map(scheduleState.schools.map((s) => [s.id, s]));
  const filtered = filterScheduleClasses(scheduleState.classes, scheduleState);
  const todayNum = getCurrentIsoWeekday();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-calendar-times"></i>
        <h3>Brak zajęć spełniających wybrane kryteria</h3>
        <p>Spróbuj zmienić dzień tygodnia, poziom zaawansowania lub wyczyść filtry jednym kliknięciem.</p>
      </div>
    `;
    return 0;
  }

  const byDay = new Map();
  for (const cls of filtered) {
    const d = Number(cls.dayOfWeek) || 1;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(cls);
  }

  const sectionsHtml = [];
  for (const [dayNum, dayClasses] of byDay.entries()) {
    const dayName = DAY_NAMES_PL[dayNum] || `Dzień ${dayNum}`;
    const isToday = dayNum === todayNum;
    const todayBadge = isToday
      ? '<span class="schedule-day-badge schedule-day-badge--today">⚡ Dzisiaj na parkiecie</span>'
      : `<span class="schedule-day-badge">${dayClasses.length} ${dayClasses.length === 1 ? 'zajęcia' : 'zajęć'}</span>`;

    const cardsHtml = dayClasses.map((c) => buildClassCardHtml(c, schoolsMap)).join('');
    sectionsHtml.push(`
      <div class="schedule-day-section" data-day="${dayNum}">
        <div class="schedule-day-heading">
          <h2><i class="far fa-calendar-check"></i> ${escapeHtml(dayName)}</h2>
          ${todayBadge}
        </div>
        <div class="schedule-cards-list">
          ${cardsHtml}
        </div>
      </div>
    `);
  }

  container.innerHTML = sectionsHtml.join('');
  return filtered.length;
}

function renderDancepulsEventsView(doc = document) {
  const container = doc.getElementById('scheduleEventsContainer');
  if (!container) return 0;

  const filteredDays = filterDancepulsEvents(scheduleState.eventsDays, scheduleState);
  let totalEvents = 0;
  for (const d of filteredDays) {
    totalEvents += d.events.length;
  }

  if (filteredDays.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-glass-cheers"></i>
        <h3>Brak wydarzeń dla wybranego filtra</h3>
        <p>Przełącz filtr miasta na „Wszystkie miasta” lub wyczyść pole wyszukiwania.</p>
      </div>
    `;
    return 0;
  }

  const sectionsHtml = filteredDays.map((dayEntry) => {
    const headerTitle = formatPlDateHeader(dayEntry.date);
    const cardsHtml = dayEntry.events
      .map((ev) => {
        const isKato = String(ev.miasto || '').toLowerCase() === 'katowice';
        const cityClass = isKato ? 'event-city-pill' : 'event-city-pill event-city-pill--other';
        const promotedClass = ev.promote ? 'event-card-ksh event-card-ksh--promoted' : 'event-card-ksh';
        const starBadge = ev.promote
          ? '<span class="event-ksh-star">⭐ Polecane KSH</span>'
          : '';
        const cleanDesc = getCleanEventDescription(ev);
        const stylesTags = (ev.style || [])
          .map((st) => `<span class="event-style-tag">${escapeHtml(st)}</span>`)
          .join('');
        const gpsUrl =
          typeof ev.lat === 'number' && typeof ev.lng === 'number'
            ? `https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}&travelmode=driving`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.miejsce} ${ev.miasto}`)}`;

        const externalLinkBtn = ev.link
          ? `<a href="${escapeHtml(ev.link)}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn"><i class="fas fa-external-link-alt"></i> Szczegóły wydarzenia</a>`
          : '';

        return `
          <article class="${promotedClass}">
            <div>
              <div class="schedule-card-top">
                <div class="schedule-badges-row">
                  <span class="${cityClass}"><i class="fas fa-map-pin"></i> ${escapeHtml(ev.miasto)}</span>
                  ${starBadge}
                </div>
                <div class="event-styles-tags">${stylesTags}</div>
              </div>
              <div class="schedule-card-style">${escapeHtml(ev.miejsce)}${ev.adres ? ` • ${escapeHtml(ev.adres)}` : ''}</div>
              <h3 class="schedule-card-title">${escapeHtml(ev.tytul || cleanDesc)}</h3>
              <p class="schedule-card-notes">${escapeHtml(cleanDesc)}</p>
            </div>
            <div class="schedule-card-meta">
              <div class="schedule-card-actions">
                ${externalLinkBtn}
                <a href="${escapeHtml(gpsUrl)}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn">
                  <i class="fas fa-route"></i> Nawiguj GPS
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    return `
      <div class="schedule-day-section" data-event-date="${escapeHtml(dayEntry.date)}">
        <div class="schedule-day-heading">
          <h2><i class="fas fa-fire-alt"></i> ${escapeHtml(headerTitle)}</h2>
          <span class="schedule-day-badge">${dayEntry.events.length} ${dayEntry.events.length === 1 ? 'wydarzenie' : 'wydarzeń'}</span>
        </div>
        <div class="schedule-cards-list">
          ${cardsHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = sectionsHtml.join('');
  return totalEvents;
}

function updateSidebarCountsAndActivePills(doc = document) {
  const classesCount = filterScheduleClasses(scheduleState.classes, scheduleState).length;
  const eventsDays = filterDancepulsEvents(scheduleState.eventsDays, scheduleState);
  let eventsCount = 0;
  eventsDays.forEach((d) => {
    eventsCount += d.events.length;
  });

  const modeClassesBadge = doc.getElementById('modeCountClasses');
  const modeEventsBadge = doc.getElementById('modeCountEvents');
  if (modeClassesBadge) modeClassesBadge.textContent = String(classesCount);
  if (modeEventsBadge) modeEventsBadge.textContent = String(eventsCount);

  // Liczniki szkół w sidebarze
  const countSchoolAll = doc.getElementById('count-school-all');
  if (countSchoolAll) countSchoolAll.textContent = String(scheduleState.classes.length);
  ['LC', 'GM', 'MP'].forEach((sId) => {
    const el = doc.getElementById(`count-school-${sId.toLowerCase()}`);
    if (el) {
      const cnt = scheduleState.classes.filter((c) => c.schoolId === sId).length;
      el.textContent = String(cnt);
    }
  });

  // Liczniki poziomów i stylów w sidebarze
  const levelList = doc.getElementById('scheduleLevelList');
  if (levelList) {
    levelList.querySelectorAll('li[data-level]').forEach((li) => {
      const lvl = li.getAttribute('data-level') || 'all';
      const badge = li.querySelector('.cat-count');
      if (!badge) return;
      const cnt =
        lvl === 'all'
          ? scheduleState.classes.length
          : scheduleState.classes.filter((c) => String(c.levelCode || '').toUpperCase() === lvl.toUpperCase()).length;
      badge.textContent = String(cnt);
    });
  }

  const styleList = doc.getElementById('scheduleStyleList');
  if (styleList) {
    styleList.querySelectorAll('li[data-style]').forEach((li) => {
      const st = li.getAttribute('data-style') || 'all';
      const badge = li.querySelector('.cat-count');
      if (!badge) return;
      const cnt =
        st === 'all'
          ? scheduleState.classes.length
          : scheduleState.classes.filter((c) => c.styleCategory === st).length;
      badge.textContent = String(cnt);
    });
  }

  // Pasek aktywnego filtra i licznik w nagłówku
  const resultsCountEl = doc.getElementById('scheduleResultsCount');
  if (resultsCountEl) {
    if (scheduleState.activeTab === 'classes') {
      resultsCountEl.textContent = `Wspólny grafik Katowice: ${classesCount} kursów (${scheduleState.schools.length} szkoły)`;
    } else if (scheduleState.activeTab === 'pricing') {
      resultsCountEl.textContent =
        'Porównanie cenników 3 szkół w Katowicach (La Clave, Good Mood, Mil Pasos) • Aktualizacja co 24h';
    } else if (scheduleState.activeTab === 'events') {
      resultsCountEl.textContent = `Kalendarz DancePuls: ${eventsCount} potwierdzonych imprez i warsztatów`;
    } else {
      resultsCountEl.textContent = `Mapa Katowic: ${scheduleState.schools.length} szkoły tańca + 3 parkiety Kato Salsa Hub`;
    }
  }

  const activeBadge = doc.getElementById('scheduleActiveFilterBadge');
  const resetBtn = doc.getElementById('scheduleResetFilterBtn');
  const activeParts = [];

  if (scheduleState.schoolFilter !== 'all') {
    const sch = scheduleState.schools.find((s) => s.id === scheduleState.schoolFilter);
    activeParts.push(`Szkoła: ${sch ? sch.name : scheduleState.schoolFilter}`);
  }
  if (scheduleState.dayFilter !== 'all') {
    activeParts.push(
      scheduleState.dayFilter === 'today'
        ? 'Dzień: Dzisiaj'
        : `Dzień: ${DAY_NAMES_PL[scheduleState.dayFilter] || scheduleState.dayFilter}`
    );
  }
  if (scheduleState.styleFilter !== 'all') {
    activeParts.push(`Styl: ${scheduleState.styleFilter}`);
  }
  if (scheduleState.levelFilter !== 'all') {
    activeParts.push(`Poziom: ${scheduleState.levelFilter}`);
  }
  if (scheduleState.eventCityFilter !== 'all' && scheduleState.activeTab === 'events') {
    activeParts.push(`Miasto: ${scheduleState.eventCityFilter}`);
  }
  if (scheduleState.searchQuery) {
    activeParts.push(`Szukaj: „${scheduleState.searchQuery}”`);
  }

  if (activeBadge) {
    if (scheduleState.activeTab === 'map' && activeParts.length === 0) {
      const activeMapBtn = doc.querySelector('#scheduleMapView .map-tab-btn.is-active');
      const mapLabel = activeMapBtn ? String(activeMapBtn.textContent || '').trim() : '';
      activeBadge.textContent = mapLabel ? `Lokalizacja: ${mapLabel}` : 'Wszystkie pozycje';
    } else {
      activeBadge.textContent = activeParts.length > 0 ? activeParts.join(' • ') : 'Wszystkie pozycje';
    }
  }
  if (resetBtn) {
    if (activeParts.length > 0) {
      resetBtn.classList.remove('is-hidden');
    } else {
      resetBtn.classList.add('is-hidden');
    }
  }
}

function syncMapZoneForSchoolFilter(schoolId, doc = document) {
  if (!schoolId || schoolId === 'all') return;
  const zoneKey = `school-${String(schoolId).toLowerCase()}`;
  const targetZoneBtn = doc.querySelector(`#scheduleMapView .map-tab-btn[data-zone="${zoneKey}"]`);
  if (!targetZoneBtn) return;
  if (typeof window !== 'undefined' && window.kshHome && typeof window.kshHome.activateMapZone === 'function') {
    window.kshHome.activateMapZone(targetZoneBtn, doc);
  } else if (typeof targetZoneBtn.click === 'function') {
    targetZoneBtn.click();
  }
}

function switchScheduleTab(targetTab, doc = document) {
  scheduleState.activeTab = targetTab;

  const tabBtns = doc.querySelectorAll('.schedule-mode-btn');
  tabBtns.forEach((btn) => {
    const isMatch = btn.getAttribute('data-tab') === targetTab;
    btn.classList.toggle('is-active', isMatch);
    btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
  });

  const classesView = doc.getElementById('scheduleClassesView');
  const pricingView = doc.getElementById('schedulePricingView');
  const eventsView = doc.getElementById('scheduleEventsView');
  const mapView = doc.getElementById('scheduleMapView');

  if (classesView) classesView.classList.toggle('is-hidden', targetTab !== 'classes');
  if (pricingView) pricingView.classList.toggle('is-hidden', targetTab !== 'pricing');
  if (eventsView) eventsView.classList.toggle('is-hidden', targetTab !== 'events');
  if (mapView) mapView.classList.toggle('is-hidden', targetTab !== 'map');

  if (targetTab === 'map' && scheduleState.schoolFilter !== 'all') {
    syncMapZoneForSchoolFilter(scheduleState.schoolFilter, doc);
  }

  updateSidebarCountsAndActivePills(doc);
}

function renderAllScheduleViews(doc = document) {
  renderScheduleClassesView(doc);
  renderSchedulePricingView(doc);
  renderDancepulsEventsView(doc);
  updateSidebarCountsAndActivePills(doc);
}

async function loadScheduleAndEventsData(doc = document) {
  const rootEl = doc.getElementById('scheduleAppRoot');
  if (!rootEl) return;

  try {
    const [schedRes, evRes] = await Promise.all([
      fetch('assets/data/schedule.json', { cache: 'no-cache' }).catch(() => null),
      fetch('assets/data/events.json', { cache: 'no-cache' }).catch(() => null),
    ]);

    if (schedRes && schedRes.ok) {
      const schedData = await schedRes.json();
      if (Array.isArray(schedData.schools) && schedData.schools.length > 0) {
        const fallbackMap = new Map(DEFAULT_SCHOOLS_WITH_PRICING.map((s) => [s.id, s]));
        scheduleState.schools = schedData.schools.map((s) => {
          const fb = fallbackMap.get(s.id);
          return s && s.pricing ? s : fb ? { ...s, pricing: fb.pricing } : s;
        });
      }
      scheduleState.classes = Array.isArray(schedData.classes) ? schedData.classes : [];
    }

    if (evRes && evRes.ok) {
      const evData = await evRes.json();
      scheduleState.eventsDays = Array.isArray(evData) ? evData : [];
    } else {
      const fallbackRes = await fetch('/dancepuls/data/events.json', { cache: 'no-cache' }).catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        const evData = await fallbackRes.json();
        scheduleState.eventsDays = Array.isArray(evData) ? evData : [];
      }
    }

    scheduleState.loaded = true;
    renderAllScheduleViews(doc);
  } catch (err) {
    console.warn('Informacja: Użyto statycznego wsadu HTML dla grafiku:', err.message);
  }
}

function bindScheduleEvents(doc = document) {
  const rootEl = doc.getElementById('scheduleAppRoot');
  if (!rootEl || rootEl.dataset.bound === '1') return;
  rootEl.dataset.bound = '1';

  // Oznacz dzisiejszy dzień na pasku dni
  const todayNum = String(getCurrentIsoWeekday());
  doc.querySelectorAll('.schedule-day-bar .day-pill-btn').forEach((btn) => {
    if (btn.getAttribute('data-day') === todayNum) {
      btn.classList.add('is-today');
    }
  });

  // 1. Przełączniki zakładek głównych (Kursy / Cenniki / Imprezy DancePuls / Mapa)
  doc.querySelectorAll('.schedule-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') || 'classes';
      switchScheduleTab(tab, doc);
    });
  });

  // 2. Wyszukiwarka na żywo
  const searchInput = doc.getElementById('scheduleSearchInput');
  const clearBtn = doc.getElementById('scheduleClearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      scheduleState.searchQuery = searchInput.value.trim();
      if (clearBtn) {
        clearBtn.classList.toggle('is-hidden', !scheduleState.searchQuery);
      }
      renderAllScheduleViews(doc);
    });
  }
  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      scheduleState.searchQuery = '';
      clearBtn.classList.add('is-hidden');
      renderAllScheduleViews(doc);
    });
  }

  // 3. Pasek dni tygodnia
  doc.querySelectorAll('.schedule-day-bar .day-pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      scheduleState.dayFilter = btn.getAttribute('data-day') || 'all';
      doc.querySelectorAll('.schedule-day-bar .day-pill-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (scheduleState.activeTab !== 'classes') {
        switchScheduleTab('classes', doc);
      }
      renderAllScheduleViews(doc);
    });
  });

  // 3b. Kalkulator cenników szkół (częstotliwość i profil tancerza)
  doc.querySelectorAll('.pricing-freq-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      scheduleState.pricingUnits = Number(btn.getAttribute('data-units') || 8);
      doc.querySelectorAll('.pricing-freq-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderSchedulePricingView(doc);
    });
  });

  doc.querySelectorAll('.pricing-profile-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      scheduleState.pricingProfile = btn.getAttribute('data-profile') || 'standard';
      doc.querySelectorAll('.pricing-profile-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderSchedulePricingView(doc);
    });
  });

  // 4. Filtry w lewym sidebarze (Szkoła, Styl, Poziom)
  const schoolList = doc.getElementById('scheduleSchoolList');
  if (schoolList) {
    schoolList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-school]');
      if (!li) return;
      scheduleState.schoolFilter = li.getAttribute('data-school') || 'all';
      schoolList.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
      li.classList.add('active');
      if (scheduleState.schoolFilter !== 'all') {
        syncMapZoneForSchoolFilter(scheduleState.schoolFilter, doc);
      }
      renderAllScheduleViews(doc);
    });
  }

  const styleList = doc.getElementById('scheduleStyleList');
  if (styleList) {
    styleList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-style]');
      if (!li) return;
      scheduleState.styleFilter = li.getAttribute('data-style') || 'all';
      styleList.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
      li.classList.add('active');
      renderAllScheduleViews(doc);
    });
  }

  const levelList = doc.getElementById('scheduleLevelList');
  if (levelList) {
    levelList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-level]');
      if (!li) return;
      scheduleState.levelFilter = li.getAttribute('data-level') || 'all';
      levelList.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
      li.classList.add('active');
      if (scheduleState.activeTab !== 'classes') {
        switchScheduleTab('classes', doc);
      }
      renderAllScheduleViews(doc);
    });
  }

  // 5. Filtr miast w zakładce Wydarzenia DancePuls
  doc.querySelectorAll('.event-city-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      scheduleState.eventCityFilter = btn.getAttribute('data-city') || 'all';
      doc.querySelectorAll('.event-city-filter-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderAllScheduleViews(doc);
    });
  });

  // 6. Reset wszystkich filtrów
  const resetBtn = doc.getElementById('scheduleResetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      scheduleState.searchQuery = '';
      scheduleState.dayFilter = 'all';
      scheduleState.schoolFilter = 'all';
      scheduleState.styleFilter = 'all';
      scheduleState.levelFilter = 'all';
      scheduleState.eventCityFilter = 'all';

      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.classList.add('is-hidden');

      doc.querySelectorAll('.schedule-day-bar .day-pill-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-day') === 'all');
      });
      doc.querySelectorAll('.event-city-filter-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-city') === 'all');
      });
      [schoolList, styleList, levelList].forEach((listEl) => {
        if (!listEl) return;
        listEl.querySelectorAll('li').forEach((li, idx) => {
          li.classList.toggle('active', idx === 0);
        });
      });

      renderAllScheduleViews(doc);
    });
  }

  // 7. Delegacja kliknięć w widoku Grafiku i Mapy Szkół
  rootEl.addEventListener('click', (e) => {
    if (!e || !e.target || typeof e.target.closest !== 'function') return;

    // 7a. Kliknięcie zakładki szkoły/lokalizacji na mapie -> aktualizacja paska Aktualny widok
    const mapTabBtn = e.target.closest('#scheduleMapView .map-tab-btn');
    if (mapTabBtn) {
      if (typeof window !== 'undefined' && window.kshHome && typeof window.kshHome.activateMapZone === 'function') {
        window.kshHome.activateMapZone(mapTabBtn, doc);
      }
      updateSidebarCountsAndActivePills(doc);
      return;
    }

    // 7b. Kliknięcie „Grafik [Szkoła]” na karcie wybranej szkoły obok mapy
    const toScheduleBtn = e.target.closest('.js-map-to-schedule');
    if (toScheduleBtn) {
      const targetSchool = toScheduleBtn.getAttribute('data-school-filter') || 'all';
      scheduleState.schoolFilter = targetSchool;
      if (schoolList) {
        schoolList.querySelectorAll('li').forEach((li) => {
          li.classList.toggle('active', li.getAttribute('data-school') === targetSchool);
        });
      }
      switchScheduleTab('classes', doc);
      renderAllScheduleViews(doc);
      return;
    }

    // 7c. Kliknięcie „Imprezy w Katowicach” na karcie miejscówki KSH obok mapy
    const toEventsBtn = e.target.closest('.js-map-to-events');
    if (toEventsBtn) {
      const targetCity = toEventsBtn.getAttribute('data-city-filter') || 'Katowice';
      scheduleState.eventCityFilter = targetCity;
      doc.querySelectorAll('.event-city-filter-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-city') === targetCity);
      });
      switchScheduleTab('events', doc);
      renderAllScheduleViews(doc);
      return;
    }

    // 7d. Kliknięcie „Pokaż na mapie (Szkoła)” na kartach zajęć w grafiku
    const mapFocusBtn = e.target.closest('.js-focus-school-map');
    if (mapFocusBtn) {
      const schoolId = String(mapFocusBtn.getAttribute('data-school-id') || '').toLowerCase();
      switchScheduleTab('map', doc);
      const targetZoneBtn = doc.querySelector(`.map-tab-btn[data-zone="school-${schoolId}"]`);
      if (targetZoneBtn) {
        targetZoneBtn.click();
        const mapEl = doc.getElementById('ksh-map-container');
        if (mapEl && typeof mapEl.scrollIntoView === 'function') {
          mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  });
}

function initSchedulePage() {
  const rootEl = document.getElementById('scheduleAppRoot');
  if (!rootEl) return;
  bindScheduleEvents(document);
  renderSchedulePricingView(document);
  loadScheduleAndEventsData(document);
}

if (typeof document !== 'undefined') {
  if (document.readyState !== 'loading') {
    initSchedulePage();
  } else {
    document.addEventListener('DOMContentLoaded', initSchedulePage);
  }

  document.addEventListener('page:loaded', () => {
    initSchedulePage();
  });
}

if (typeof window !== 'undefined') {
  window.kshSchedule = {
    initSchedulePage,
    switchScheduleTab,
    filterScheduleClasses,
    filterDancepulsEvents,
    calculateSchoolPricingComparison,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterScheduleClasses,
    filterDancepulsEvents,
    calculateSchoolPricingComparison,
    getCurrentIsoWeekday,
    getTodayIsoDate,
    formatPlDateHeader,
    initSchedulePage,
    switchScheduleTab,
  };
}
})();
