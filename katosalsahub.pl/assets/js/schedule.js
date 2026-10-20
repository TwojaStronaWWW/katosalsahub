/**
 * SCHEDULE.JS - Wspólny Grafik Szkół Tańca (Katowice), Kalendarz Imprez DancePuls & Mapa Szkół
 * Architektura Zero-Bloat Vanilla JS, kompatybilna z routerem SPA (router.js) oraz testami node:test.
 */

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

const scheduleState = {
  activeTab: 'classes', // 'classes' | 'events' | 'map'
  searchQuery: '',
  dayFilter: 'all', // 'all' | 'today' | '1'..'7'
  schoolFilter: 'all', // 'all' | 'LC' | 'GM' | 'MP' | 'EV'
  styleFilter: 'all', // 'all' | 'salsa_cubana' | 'rueda' | 'salsa_liniowa' | 'bachata' | 'kizomba' | 'solo'
  levelFilter: 'all', // 'all' | 'P0' | 'P1' | 'S1' | 'OPEN'
  eventCityFilter: 'all', // 'all' | 'Katowice' | 'Slask' | 'Krakow'
  schools: [],
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
 * Czysta funkcja filtrująca wydarzenia z DancePuls (testowalna w node:test)
 */
function filterDancepulsEvents(eventsDays, filters = {}) {
  if (!Array.isArray(eventsDays)) return [];
  const query = String(filters.searchQuery || '').trim().toLowerCase();
  const cityFilter = filters.eventCityFilter || 'all';
  const styleFilter = filters.styleFilter || 'all';
  const minDateIso = filters.minDateIso || '';

  const filteredDays = [];

  for (const dayEntry of eventsDays) {
    if (!dayEntry || !Array.isArray(dayEntry.events)) continue;
    if (minDateIso && String(dayEntry.date || '') < minDateIso) continue;

    const matchingEvents = dayEntry.events.filter((ev) => {
      if (!ev) return false;
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

  const multisportHtml = item.multisport
    ? '<span class="multisport-pill" title="Zajęcia honorują karty sportowe Multisport / Medicover / FitProfit"><i class="fas fa-id-card"></i> Multisport</span>'
    : '<span class="multisport-pill">🎉 Wstęp wolny / Społeczność</span>';

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
          ${multisportHtml}
        </div>
        <div class="schedule-card-actions">
          <button type="button" class="schedule-action-btn js-focus-school-map" data-school-id="${escapeHtml(item.schoolId)}">
            <i class="fas fa-map-marker-alt"></i> Pokaż na mapie (${escapeHtml(school.name)})
          </button>
          <a href="${escapeHtml(school.website || '#')}" target="_blank" rel="noopener noreferrer" class="schedule-action-btn">
            <i class="fas fa-external-link-alt"></i> Strona szkoły
          </a>
        </div>
      </div>
    </article>
  `;
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
  ['LC', 'GM', 'MP', 'EV'].forEach((sId) => {
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
    activeBadge.textContent = activeParts.length > 0 ? activeParts.join(' • ') : 'Wszystkie pozycje';
  }
  if (resetBtn) {
    if (activeParts.length > 0) {
      resetBtn.classList.remove('is-hidden');
    } else {
      resetBtn.classList.add('is-hidden');
    }
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
  const eventsView = doc.getElementById('scheduleEventsView');
  const mapView = doc.getElementById('scheduleMapView');

  if (classesView) classesView.classList.toggle('is-hidden', targetTab !== 'classes');
  if (eventsView) eventsView.classList.toggle('is-hidden', targetTab !== 'events');
  if (mapView) mapView.classList.toggle('is-hidden', targetTab !== 'map');

  updateSidebarCountsAndActivePills(doc);
}

function renderAllScheduleViews(doc = document) {
  renderScheduleClassesView(doc);
  renderDancepulsEventsView(doc);
  updateSidebarCountsAndActivePills(doc);
}

async function loadScheduleAndEventsData(doc = document) {
  const rootEl = doc.getElementById('scheduleAppRoot');
  if (!rootEl) return;

  try {
    const [schedRes, evRes] = await Promise.all([
      fetch('assets/data/schedule.json').catch(() => null),
      fetch('assets/data/events.json').catch(() => null),
    ]);

    if (schedRes && schedRes.ok) {
      const schedData = await schedRes.json();
      scheduleState.schools = Array.isArray(schedData.schools) ? schedData.schools : [];
      scheduleState.classes = Array.isArray(schedData.classes) ? schedData.classes : [];
    }

    if (evRes && evRes.ok) {
      const evData = await evRes.json();
      scheduleState.eventsDays = Array.isArray(evData) ? evData : [];
    } else {
      const fallbackRes = await fetch('/dancepuls/data/events.json').catch(() => null);
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
  doc.querySelectorAll('.day-pill-btn').forEach((btn) => {
    if (btn.getAttribute('data-day') === todayNum) {
      btn.classList.add('is-today');
    }
  });

  // 1. Przełączniki zakładek głównych (Kursy / Imprezy DancePuls / Mapa)
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
  doc.querySelectorAll('.day-pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      scheduleState.dayFilter = btn.getAttribute('data-day') || 'all';
      doc.querySelectorAll('.day-pill-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (scheduleState.activeTab !== 'classes') {
        switchScheduleTab('classes', doc);
      }
      renderAllScheduleViews(doc);
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

      doc.querySelectorAll('.day-pill-btn').forEach((b) => {
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

  // 7. Delegacja kliknięcia „Pokaż na mapie (Szkoła)” na kartach zajęć
  rootEl.addEventListener('click', (e) => {
    const mapFocusBtn = e.target.closest('.js-focus-school-map');
    if (!mapFocusBtn) return;
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
  });
}

function initSchedulePage() {
  const rootEl = document.getElementById('scheduleAppRoot');
  if (!rootEl) return;
  bindScheduleEvents(document);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    filterScheduleClasses,
    filterDancepulsEvents,
    getCurrentIsoWeekday,
    formatPlDateHeader,
    initSchedulePage,
    switchScheduleTab,
  };
}
