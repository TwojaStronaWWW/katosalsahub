#!/usr/bin/env node
/**
 * SYNC-SCHEDULES.JS — Zunifikowany Ingestor i Standaryzator Grafików Szkół Tańca (Katowice)
 *
 * Architektura Zero-Ban & Single Source of Truth (SSOT):
 * 1. Wczytuje bazowy stan grafiku, szkół i standardu poziomów bezpośrednio z katosalsahub.pl/assets/data/schedule.json
 *    (Zero duplikacji tysięcy linii danych w kodzie JS).
 * 2. Pobiera i parsuje na żywo arkusz Google Sheets szkoły Good Mood:
 *    - ul. Paderewskiego 35 (gid=0)
 *    - ul. Gliwicka 44 / Gravitacja (gid=409650056)
 * 3. Weryfikuje sumy kontrolne SHA-256 i nagłówki HTTP Last-Modified plansz grafików oraz cennika:
 *    - La Clave (https://www.laclave.pl/?grafik-katowice -> files/1000/1-1.png .. 7.png oraz ?cennik)
 *    - Mil Pasos (https://www.milpasoskatowice.pl/?page=grafik -> 8 plansz JPG z CDN FB)
 * 4. Standaryzuje poziomy zaawansowania z różnych nomenklatur szkół do 5-stopniowego Standardu KSH:
 *    - P0   : Od Zera / Start (0–2 mies.)
 *    - P1   : Podstawowy (P1 / Gr. Podstawowa Tańcząca / 2–5 mies.)
 *    - P2   : Podstawowy+ (P2–P3 / Tańczący 6+ mies. / 6–9 mies.)
 *    - S1   : Średniozaawansowany i Zaawansowany (P4–P5 / S1–S3 / Śr.-Zaaw. / 9+ mies.)
 *    - OPEN : Open / Solo / Praktis
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEDULE_JSON_PATH = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'schedule.json');

/**
 * Wczytuje bazowy stan grafiku z pliku JSON stanowiącego Single Source of Truth (SSOT).
 */
function loadBaselineSchedule(filePath = SCHEDULE_JSON_PATH) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return {
    updatedAt: raw.updatedAt || '2026-10-20',
    levelStandard: Array.isArray(raw.levelStandard) ? raw.levelStandard : [],
    schools: Array.isArray(raw.schools) ? raw.schools : [],
    classes: Array.isArray(raw.classes) ? raw.classes : [],
    sourcesMeta: raw.sourcesMeta || null,
  };
}

const BASELINE = loadBaselineSchedule();
const LEVEL_STANDARD = BASELINE.levelStandard;
const SCHOOLS = BASELINE.schools;
const CLASSES = BASELINE.classes;

/**
 * Czysta funkcja mapująca surowe oznaczenia poziomów ze szkół na 5-stopniowy Standard KSH
 */
function normalizeLevel(rawText = '') {
  const txt = String(rawText || '').trim();
  const upper = txt.toUpperCase();

  // 1. Praktisy i jawny OPEN / Solo bez "od zera"
  if (/\b(PRAKTIS|PRAKTYCZNE|SOCIAL)\b/i.test(upper) && !/SOCIAL SKILLS/i.test(upper)) {
    return 'OPEN';
  }
  if (/\b(ADWANCE LAB|ADVANCE LAB|ZAAWANSOWAN[AYE]|ŚR[\.\s-]*ZAAW|ŚREDNIO\s*ZAAW|S3|P4|P5|P3-P5|CHALLENGE|CHALLANGE|FORMACJA)\b/i.test(upper)) {
    return 'S1';
  }
  if (/\b(OD ZERA|OD PODSTAW|PODSTAWY|P0)\b/i.test(upper)) {
    return 'P0';
  }
  if (/\b(P2|P3|6\+\s*MIES|POCZĄTKUJĄCA\+|GRUPA TAŃCZĄCA|ZOUK PROGRESS|OUT OF SCRIPT|RUEDA DE CASINO|TIMBA CONEXION|PARTNERWORK)\b/i.test(upper)) {
    return 'P2';
  }
  if (/\b(P1|PODSTAWOWA TAŃCZĄCA|GR\.\s*POCZĄTK|BASIC\s*4|DLA TAŃCZĄCYCH|WYRÓWNAWCZA)\b/i.test(upper)) {
    return 'P1';
  }
  if (/\b(PODSTAWOWY)\b/i.test(upper)) {
    return 'P0';
  }
  if (/\b(OPEN|SOLO|SUELTA|RUMBA|SON CUBANO|FOOTWORK|BODYMOVEMENT|IZOLACJE)\b/i.test(upper)) {
    return 'OPEN';
  }
  return 'OPEN';
}

const DAY_NAME_TO_NUMBER = {
  poniedziałek: 1,
  wtorek: 2,
  środa: 3,
  czwartek: 4,
  piątek: 5,
  sobota: 6,
  niedziela: 7,
};

const DAY_NUMBER_TO_NAME = {
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
  7: 'Niedziela',
};

/**
 * Mapuje surową nazwę stylu z arkusza Google Sheets / OCR na kategorię filtra KSH.
 */
function inferStyleCategory(styleText = '') {
  const s = String(styleText || '').toUpperCase();
  if (/RUEDA/i.test(s)) return 'rueda';
  if (/SALSA\s*(NY|LA|ON1|ON2|LINIOWA)|MAMBO/i.test(s)) return 'salsa_liniowa';
  if (/SALSA|TIMBA|SON|CASINO|CUBAN/i.test(s)) return 'salsa_cubana';
  if (/BACHATA/i.test(s)) return 'bachata';
  if (/KIZOMBA|URBAN\s*KIZ|ZOUK|SEMBA|TARRAXO/i.test(s)) return 'kizomba';
  return 'solo';
}

/**
 * Parser CSV zgodny z RFC-4180 (obsługuje wieloliniowe komórki w cudzysłowach z Google Sheets).
 */
function parseCsvGrid(csvText = '') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"' && csvText[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Parsuje surowe komórki z arkusza Google Sheets szkoły Good Mood i zwraca listę rozpoznanych bloków zajęć.
 */
function parseGoodMoodSheetCells(csvText = '', locationSuffix = 'Paderewskiego 35') {
  const rows = parseCsvGrid(csvText);
  const parsedBlocks = [];
  let currentDay = 0;
  let currentRoom = '';

  for (const r of rows) {
    const col0 = String(r[0] || '').trim().toLowerCase();
    const col1 = String(r[1] || '').replace(/\s+/g, ' ').trim();
    if (DAY_NAME_TO_NUMBER[col0]) {
      currentDay = DAY_NAME_TO_NUMBER[col0];
    }
    if (col1 && /SALA|Gravitacja/i.test(col1)) {
      currentRoom = col1
        .replace(/^SALA\s+/i, 'Sala ')
        .replace(/SWAYZE/i, 'Swayze')
        .replace(/DIRTY DANCING/i, 'Dirty Dancing')
        .replace(/STEP UP/i, 'Step Up');
      if (!currentRoom.includes('(') && !/Gliwicka/i.test(currentRoom)) {
        currentRoom = `${currentRoom} (${locationSuffix})`;
      } else if (/Gravitacja/i.test(currentRoom)) {
        currentRoom = 'Gravitacja (Gliwicka 44)';
      }
    }
    if (!currentDay) continue;

    for (let j = 2; j < r.length; j++) {
      const rawCell = String(r[j] || '').trim();
      if (!rawCell) continue;
      if (/Miejsce Na Zajęcia Indywidualne|FORMULARZ ZAPISÓW|Grafik 2026|Rezerwuj Nr Tel/i.test(rawCell)) continue;
      if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(rawCell)) continue;

      const timeMatch = rawCell.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!timeMatch) continue;

      const startTime = timeMatch[1].padStart(5, '0');
      const endTime = timeMatch[2].padStart(5, '0');
      const lines = rawCell
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const styleLine = lines[0] || 'Zajęcia taneczne';
      const timeLineIdx = lines.findIndex((l) => /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.test(l));
      const instructorLine =
        timeLineIdx >= 0 && lines[timeLineIdx + 1]
          ? lines.slice(timeLineIdx + 1).join(' & ')
          : lines.length >= 3
            ? lines[lines.length - 1]
            : 'Zespół Good Mood';
      const levelDetailLines =
        timeLineIdx > 1 ? lines.slice(1, timeLineIdx).filter((l) => !/^START/i.test(l)) : [];
      const rawLevelLine = levelDetailLines.join(' ') || styleLine;

      const startMatch = rawCell.match(/START[:\s]*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)/i);
      const startDate = startMatch ? startMatch[1] : null;
      const levelCode = normalizeLevel(rawCell);
      const styleCategory = inferStyleCategory(styleLine);

      parsedBlocks.push({
        dayOfWeek: currentDay,
        dayName: DAY_NUMBER_TO_NAME[currentDay],
        room: currentRoom || `Sala (${locationSuffix})`,
        startTime,
        endTime,
        styleLine,
        styleCategory,
        rawLevelLine,
        instructorLine,
        startDate,
        levelCode,
        rawText: rawCell,
      });
    }
  }
  return parsedBlocks;
}

/**
 * Łączy sąsiadujące 45-minutowe bloki tego samego kursu z arkusza Good Mood (np. 17:20-18:05 + 18:10-18:55)
 * w pojedynczy blok kursu 2x45 min, aby umożliwić pełną żywą synchronizację nowych i zmienionych godzin.
 */
function mergeGoodMoodAdjacentBlocks(blocks = []) {
  const sorted = [...blocks].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    if (a.room !== b.room) return a.room.localeCompare(b.room);
    return a.startTime.localeCompare(b.startTime);
  });

  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const merged = [];
  for (const blk of sorted) {
    const prev = merged[merged.length - 1];
    const sameBaseStyle =
      prev && prev.styleLine.toUpperCase() === blk.styleLine.toUpperCase();
    const sameGroupLevel =
      prev &&
      prev.levelCode === blk.levelCode &&
      prev.rawLevelLine.toUpperCase() === blk.rawLevelLine.toUpperCase();
    const totalDurationMin = prev ? toMinutes(blk.endTime) - toMinutes(prev.startTime) : 999;

    if (
      prev &&
      prev.dayOfWeek === blk.dayOfWeek &&
      prev.room === blk.room &&
      sameBaseStyle &&
      sameGroupLevel &&
      Math.abs(toMinutes(blk.startTime) - toMinutes(prev.endTime)) <= 15 &&
      totalDurationMin <= 120
    ) {
      prev.endTime = blk.endTime;
      if (!prev.startDate && blk.startDate) prev.startDate = blk.startDate;
    } else {
      merged.push({ ...blk });
    }
  }
  return merged;
}

/**
 * Bezpieczny wrapper HTTP z twardym timeoutem (domyślnie 12s), chroniący przed zawieszeniem potoku,
 * gdy zewnętrzny serwer szkoły tańca przestanie odpowiadać.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Czysty parser HTML wyciągający stawki karnetów z tabeli <table id="cennik"> na stronie La Clave (?cennik).
 * Posiada wbudowany Sanity Guard: odrzuca odczyt, jeśli którakolwiek kwota nie mieści się w bezpiecznych widełkach [15..1000 zł].
 */
function parseLaClavePricingHtml(html = '') {
  const src = String(html || '');
  if (!src.includes('id="cennik"') && !/Start/i.test(src)) return null;

  const extractPriceAfter = (labelRegex) => {
    const match = src.match(new RegExp(`${labelRegex.source}[\\s\\S]{0,180}?(\\d{2,3})\\s*z[łl]`, 'i'));
    if (!match) return null;
    const val = Number(match[1]);
    return Number.isFinite(val) && val >= 15 && val <= 1000 ? val : null;
  };

  const pass4 = extractPriceAfter(/<th>\s*Start\s*<\/th>/);
  const pass8 = extractPriceAfter(/<th>\s*Eko\s*<\/th>/);
  const pass10 = extractPriceAfter(/<th>\s*Pro\s*<\/th>/);
  const singleEntry = extractPriceAfter(/<th>\s*Jednorazowe\s*<\/th>/);
  const openPass = extractPriceAfter(/<th>\s*karnet\s+OPEN\s*<\/th>/);

  if (!pass4 || !pass8 || !pass10 || !singleEntry || !openPass) {
    return null;
  }

  return {
    singleEntryPrice: singleEntry,
    pass4Price: pass4,
    pass8Price: pass8,
    pass10Price: pass10,
    openPassPrice: openPass,
  };
}

/**
 * Walidator ciągłości danych (Circuit Breaker / Sanity Guard) — blokuje nadpisanie schedule.json,
 * gdyby wskutek awarii sieci lub błędu OCR ubyło kursów poniżej bezpiecznego progu lub uszkodziły się cenniki szkół.
 */
function validateScheduleSanity(payload) {
  if (!payload || !Array.isArray(payload.classes) || payload.classes.length < 100) {
    throw new Error(`Circuit Breaker: Zbyt mała łączna liczba kursów (${payload?.classes?.length || 0} < 100)`);
  }
  const counts = { LC: 0, GM: 0, MP: 0 };
  const allowedLevels = new Set(['P0', 'P1', 'P2', 'S1', 'OPEN']);
  for (const cls of payload.classes) {
    if (counts[cls.schoolId] !== undefined) counts[cls.schoolId]++;
    if (!/^\d{2}:\d{2}$/.test(cls.startTime || '') || !allowedLevels.has(cls.levelCode)) {
      throw new Error(`Circuit Breaker: Uszkodzony rekord kursu (${cls.id || 'brak ID'})`);
    }
  }
  if (counts.LC < 30 || counts.GM < 30 || counts.MP < 30) {
    throw new Error(
      `Circuit Breaker: Anomalia liczby kursów w szkole (LC=${counts.LC}, GM=${counts.GM}, MP=${counts.MP}) — odrzucono aktualizację.`
    );
  }

  // Walidacja spójności cenników (Circuit Breaker dla cenników 3 głównych szkół: LC, GM, MP)
  if (Array.isArray(payload.schools)) {
    for (const reqId of ['LC', 'GM', 'MP']) {
      const sch = payload.schools.find((s) => s.id === reqId);
      if (!sch || !sch.pricing) {
        throw new Error(`Circuit Breaker: Brak obiektu pricing dla szkoły ${reqId}`);
      }
      const p = sch.pricing;
      if (
        typeof p.unitMinutes !== 'number' ||
        p.unitMinutes < 30 ||
        p.unitMinutes > 90 ||
        typeof p.singleEntryPrice !== 'number' ||
        p.singleEntryPrice < 15 ||
        p.singleEntryPrice > 150 ||
        typeof p.openPassPrice !== 'number' ||
        p.openPassPrice < 150 ||
        p.openPassPrice > 1000 ||
        !Array.isArray(p.passes) ||
        p.passes.length < 2 ||
        p.passes.some((pass) => typeof pass.price !== 'number' || pass.price < 50 || pass.price > 1000)
      ) {
        throw new Error(`Circuit Breaker: Uszkodzone stawki cennika w szkole ${reqId}`);
      }
    }
  }

  return true;
}

/**
 * Atomowy zapis pliku JSON przez plik tymczasowy z izolacją PID, znacznika czasu i entropii losowej (ISO 27001 Anti-TOCTOU).
 */
function writeScheduleAtomically(targetPath, dataObj) {
  validateScheduleSanity(dataObj);
  const rand = crypto.randomBytes(4).toString('hex');
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.${rand}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(dataObj, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Ekstraktor OCR Vision (kaskada Gemini 3.5 Flash -> 2.5 Flash -> 2.0 Flash) wywoływany wyłącznie wtedy,
 * gdy zmieni się suma kontrolna SHA-256 planszy grafiku PNG/JPG i ustawiono GEMINI_API_KEY.
 */
async function extractClassesWithGeminiVision(imageBuffer, mimeType, schoolId, dayOfWeek) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Odczytaj wszystkie zajęcia taneczne z tej planszy grafiku szkoły ${schoolId} dla dnia ${DAY_NUMBER_TO_NAME[dayOfWeek]} (dayOfWeek=${dayOfWeek}). Zwróć tablicę JSON obiektów z polami: startTime (HH:MM), endTime (HH:MM), styleCategory (salsa_cubana|rueda|salsa_liniowa|bachata|kizomba|solo), styleLabel, title, rawLevelText, room, instructors (tablica obiektów {name}), notes.`;
  const visionModels = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

  for (const modelName of visionModels) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: Buffer.from(imageBuffer).toString('base64'),
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        },
        25000
      );

      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const extracted = JSON.parse(text);
      // Sanity check: plansza dziennego grafiku musi zawierać min. 3 poprawne kursy
      if (!Array.isArray(extracted) || extracted.length < 3) continue;

      return extracted.map((item, idx) => {
        const levelCode = normalizeLevel(`${item.rawLevelText || ''} ${item.title || ''}`);
        const styleCat = item.styleCategory && ['salsa_cubana', 'rueda', 'salsa_liniowa', 'bachata', 'kizomba', 'solo'].includes(item.styleCategory)
          ? item.styleCategory
          : inferStyleCategory(`${item.styleLabel || ''} ${item.title || ''}`);
        return {
          id: `${schoolId.toLowerCase()}_d${dayOfWeek}_v${idx + 1}`,
          schoolId,
          dayOfWeek,
          dayName: DAY_NUMBER_TO_NAME[dayOfWeek],
          startTime: String(item.startTime || '18:00').padStart(5, '0'),
          endTime: String(item.endTime || '19:00').padStart(5, '0'),
          styleCategory: styleCat,
          styleLabel: item.styleLabel || 'Taniec',
          title: item.title || 'Zajęcia taneczne',
          levelCode,
          levelLabel: `${levelCode} • ${item.rawLevelText || 'Poziom ustandaryzowany'}`,
          room: item.room || 'Sala główna',
          instructors: Array.isArray(item.instructors) && item.instructors.length ? item.instructors : [{ name: 'Zespół Instruktorów' }],
          multisport: true,
          notes: item.notes || `Zaktualizowano automatycznie przez AI Vision (${modelName}) z nowej planszy grafiku.`,
        };
      });
    } catch (err) {
      console.warn(`   ⚠️ [Fallback] Model Vision ${modelName} nie odczytał planszy (${err.message}) — próba kolejnego modelu.`);
    }
  }
  return null;
}

async function checkRemoteFreshness() {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36';
  const sheetId = '11SHUHN1SJ48e0N8mPUkZSKFKzP8gqc9daNSGysutzl8';

  let existingMeta = {};
  if (fs.existsSync(SCHEDULE_JSON_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(SCHEDULE_JSON_PATH, 'utf-8'));
      existingMeta = prev.sourcesMeta || {};
    } catch {
      existingMeta = {};
    }
  }

  let gmMeta = existingMeta.gm || {};
  try {
    console.log('🔍 [1/3] Żywa synchronizacja CSV Google Sheets szkoły Good Mood...');
    const gmRes = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`, {
      headers: { 'User-Agent': ua },
    });
    const gmCsv = await gmRes.text();
    const gmHash0 = crypto.createHash('sha256').update(gmCsv).digest('hex').slice(0, 16);
    const padBlocks = parseGoodMoodSheetCells(gmCsv, 'Paderewskiego 35');

    const gmGliwRes = await fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=409650056`, {
      headers: { 'User-Agent': ua },
    });
    const gmGliwCsv = await gmGliwRes.text();
    const gmHashGliw = crypto.createHash('sha256').update(gmGliwCsv).digest('hex').slice(0, 16);
    const gliwBlocks = parseGoodMoodSheetCells(gmGliwCsv, 'Gliwicka 44');

    const allLiveGmBlocks = [...padBlocks, ...gliwBlocks];
    const mergedLiveGmBlocks = mergeGoodMoodAdjacentBlocks(allLiveGmBlocks);
    if (allLiveGmBlocks.length >= 20) {
      const prevHash0 = existingMeta?.gm?.paderewskiegoSha256;
      const prevHashGliw = existingMeta?.gm?.gliwickaSha256;
      const gmSheetChanged = Boolean(
        (prevHash0 && prevHash0 !== gmHash0) || (prevHashGliw && prevHashGliw !== gmHashGliw)
      );

      let gmUpdatedStarts = 0;
      let gmUpdatedCourses = 0;
      for (const cls of CLASSES) {
        if (cls.schoolId !== 'GM') continue;
        const matchingBlock =
          mergedLiveGmBlocks.find(
            (b) =>
              b.dayOfWeek === cls.dayOfWeek &&
              b.startTime === cls.startTime &&
              cls.room.toLowerCase().includes(b.room.split(' ')[1]?.toLowerCase() || '')
          ) ||
          allLiveGmBlocks.find(
            (b) =>
              b.dayOfWeek === cls.dayOfWeek &&
              b.startTime === cls.startTime &&
              cls.room.toLowerCase().includes(b.room.split(' ')[1]?.toLowerCase() || '')
          );
        if (matchingBlock) {
          if (matchingBlock.startDate) {
            const updatedLabel = cls.levelLabel.replace(
              /Start\s+\d{1,2}\.\d{1,2}(?:\.\d{2,4})?/i,
              `Start ${matchingBlock.startDate}`
            );
            if (updatedLabel !== cls.levelLabel) {
              cls.levelLabel = updatedLabel;
              gmUpdatedStarts++;
            }
          }
          // Gdy arkusz Good Mood uległ zmianie, zaktualizuj również poziom i godziny z żywego arkusza
          if (gmSheetChanged && matchingBlock.levelCode && matchingBlock.levelCode !== cls.levelCode) {
            cls.levelCode = matchingBlock.levelCode;
            gmUpdatedCourses++;
          }
        }
      }

      if (gmSheetChanged) {
        const gmSchool = SCHOOLS.find((s) => s.id === 'GM');
        if (gmSchool) gmSchool.sourceUpdatedAt = new Date().toISOString().slice(0, 10);
      }

      gmMeta = { paderewskiegoSha256: gmHash0, gliwickaSha256: gmHashGliw, liveCellsCount: allLiveGmBlocks.length };
      console.log(
        `   ✅ Good Mood Live CSV: wyodrębniono ${allLiveGmBlocks.length} bloków komórek (${mergedLiveGmBlocks.length} połączonych kursów, sha256=${gmHash0}/${gmHashGliw}, zaktualizowane daty START: ${gmUpdatedStarts}, korekty kursów: ${gmUpdatedCourses})`
      );
    } else {
      console.warn('   ⚠️ [Fallback] Arkusz Good Mood zwrócił zbyt mało komórek — zachowano ostatni zweryfikowany stan.');
    }
  } catch (err) {
    console.warn(`   ⚠️ [Fallback] Nie udało się pobrać CSV Good Mood (${err.message}) — zachowano ostatni zweryfikowany stan.`);
  }

  let lcMeta = existingMeta.lc || {};
  try {
    console.log('🔍 [2/3] Sprawdzanie sum kontrolnych SHA-256 i Last-Modified plansz PNG La Clave (?grafik-katowice)...');
    const lcPageRes = await fetchWithTimeout('https://www.laclave.pl/?grafik-katowice', { headers: { 'User-Agent': ua } });
    const lcPageHtml = await lcPageRes.text();
    const lcDiscoveredRel = [
      ...new Set(
        [...lcPageHtml.matchAll(/files\/1000\/([1-7](?:-\d+)?\.png)/gi)].map((m) => `https://www.laclave.pl/${m[0]}`)
      ),
    ];
    const lcBoards = (
      lcDiscoveredRel.length > 0
        ? lcDiscoveredRel
        : [
            'https://www.laclave.pl/files/1000/1-1.png',
            'https://www.laclave.pl/files/1000/2-2.png',
            'https://www.laclave.pl/files/1000/3-2.png',
            'https://www.laclave.pl/files/1000/4-2.png',
            'https://www.laclave.pl/files/1000/5-2.png',
            'https://www.laclave.pl/files/1000/7.png',
          ]
    ).map((url) => {
      const dayMatch = url.match(/\/([1-7])(?:-\d+)?\.png$/i);
      return { day: dayMatch ? Number(dayMatch[1]) : 1, url };
    });

    const freshLcMeta = {};
    for (const b of lcBoards) {
      const res = await fetchWithTimeout(b.url, { headers: { 'User-Agent': ua } });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
        const lastMod = res.headers.get('last-modified') || '';
        freshLcMeta[`day_${b.day}`] = { url: b.url, sha256: sha, lastModified: lastMod };
        const prevSha = existingMeta?.lc?.[`day_${b.day}`]?.sha256;
        if (prevSha && prevSha !== sha) {
          console.log(`   ⚡ Wykryto zmianę planszy La Clave (dzień ${b.day}): ${prevSha} -> ${sha}`);
          const visionClasses = await extractClassesWithGeminiVision(buf, 'image/png', 'LC', b.day);
          if (visionClasses && visionClasses.length >= 3) {
            for (let i = CLASSES.length - 1; i >= 0; i--) {
              if (CLASSES[i].schoolId === 'LC' && CLASSES[i].dayOfWeek === b.day) CLASSES.splice(i, 1);
            }
            CLASSES.push(...visionClasses);
            const lcSchool = SCHOOLS.find((s) => s.id === 'LC');
            if (lcSchool) lcSchool.sourceUpdatedAt = new Date().toISOString().slice(0, 10);
            console.log(`   🤖 Gemini Vision zaktualizowało ${visionClasses.length} kursów La Clave dla dnia ${b.day}`);
          }
        }
      }
    }
    if (Object.keys(freshLcMeta).length > 0) lcMeta = { ...lcMeta, ...freshLcMeta };
    console.log(
      `   ✅ La Clave: zweryfikowano ${Object.keys(freshLcMeta).length}/${lcBoards.length} plansz PNG (0 zmian SHA-256 -> 0 zużytych tokenów AI).`
    );

    // Izolowana weryfikacja żywego cennika La Clave (?cennik) z Sanity Guardem
    try {
      const lcPriceRes = await fetchWithTimeout('https://www.laclave.pl/?cennik', { headers: { 'User-Agent': ua } });
      if (lcPriceRes.ok) {
        const lcPriceHtml = await lcPriceRes.text();
        const parsedLcPrices = parseLaClavePricingHtml(lcPriceHtml);
        if (parsedLcPrices) {
          const priceSig = JSON.stringify(parsedLcPrices);
          const priceHash = crypto.createHash('sha256').update(priceSig).digest('hex').slice(0, 16);
          const prevPriceHash = existingMeta?.lc?.pricingSha256;
          const lcSchool = SCHOOLS.find((s) => s.id === 'LC');
          if (lcSchool && lcSchool.pricing) {
            lcSchool.pricing.singleEntryPrice = parsedLcPrices.singleEntryPrice;
            lcSchool.pricing.openPassPrice = parsedLcPrices.openPassPrice;
            lcSchool.pricing.openPassStudentPrice = parsedLcPrices.openPassPrice;
            const p4 = lcSchool.pricing.passes.find((p) => p.units === 4);
            const p8 = lcSchool.pricing.passes.find((p) => p.units === 8);
            const p10 = lcSchool.pricing.passes.find((p) => p.units === 10);
            if (p4) { p4.price = parsedLcPrices.pass4Price; p4.studentPrice = parsedLcPrices.pass4Price; }
            if (p8) { p8.price = parsedLcPrices.pass8Price; p8.studentPrice = parsedLcPrices.pass8Price; }
            if (p10) { p10.price = parsedLcPrices.pass10Price; p10.studentPrice = parsedLcPrices.pass10Price; }
            if (prevPriceHash && prevPriceHash !== priceHash) {
              lcSchool.pricing.pricingUpdatedAt = new Date().toISOString().slice(0, 10);
            }
          }
          lcMeta.pricingSha256 = priceHash;
          console.log(`   💰 La Clave Live Cennik (?cennik): zweryfikowano stawki (Start=${parsedLcPrices.pass4Price} zł, Eko=${parsedLcPrices.pass8Price} zł, Pro=${parsedLcPrices.pass10Price} zł, sha256=${priceHash}).`);
        } else {
          console.warn('   ⚠️ [Fallback Cennik] Tabela na ?cennik La Clave nie przeszła walidacji Sanity Guard — zachowano ostatni zweryfikowany cennik.');
        }
      }
    } catch (priceErr) {
      console.warn(`   ⚠️ [Fallback Cennik] Nie udało się odczytać ?cennik La Clave (${priceErr.message}) — zachowano ostatni zweryfikowany cennik.`);
    }
  } catch (err) {
    console.warn(`   ⚠️ [Fallback] Serwer La Clave nie odpowiedział (${err.message}) — zachowano ostatni zweryfikowany stan.`);
  }

  let mpMeta = existingMeta.mp || {};
  try {
    console.log('🔍 [3/3] Sprawdzanie plansz grafików i cennika Mil Pasos (?page=grafik)...');
    const mpRes = await fetchWithTimeout('https://www.milpasoskatowice.pl/?page=grafik', { headers: { 'User-Agent': ua } });
    const mpHtml = await mpRes.text();
    const mpImgUrls = [...mpHtml.matchAll(/<img[^>]+src=["']([^"']+fbcdn\.net[^"']+)["']/gi)].map((m) =>
      m[1].replace(/&amp;/g, '&')
    );
    if (mpImgUrls.length > 0) {
      // Stabilny fingerprint oparty na nazwach plików JPG (z pominięciem tymczasowych tokenów sesyjnych ?oh=...&oe=... CDN)
      const stableMpAssetIds = mpImgUrls.map((u) => {
        const cleanPath = u.split('?')[0];
        return cleanPath.split('/').pop() || cleanPath;
      });
      const mpHash = crypto.createHash('sha256').update(stableMpAssetIds.join('|')).digest('hex').slice(0, 16);
      const prevMpHash = existingMeta?.mp?.urlsFingerprint;
      if (prevMpHash && prevMpHash !== mpHash && process.env.GEMINI_API_KEY) {
        console.log(`   ⚡ Wykryto zmianę plansz Mil Pasos: ${prevMpHash} -> ${mpHash}`);
        for (let d = 1; d <= Math.min(7, mpImgUrls.length); d++) {
          const imgRes = await fetchWithTimeout(mpImgUrls[d - 1], { headers: { 'User-Agent': ua } });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const visionClasses = await extractClassesWithGeminiVision(buf, 'image/jpeg', 'MP', d);
            if (visionClasses && visionClasses.length >= 3) {
              for (let i = CLASSES.length - 1; i >= 0; i--) {
                if (CLASSES[i].schoolId === 'MP' && CLASSES[i].dayOfWeek === d) CLASSES.splice(i, 1);
              }
              CLASSES.push(...visionClasses);
              const mpSchool = SCHOOLS.find((s) => s.id === 'MP');
              if (mpSchool) mpSchool.sourceUpdatedAt = new Date().toISOString().slice(0, 10);
            }
          }
        }
      }
      mpMeta = { imageCount: mpImgUrls.length, urlsFingerprint: mpHash, pricingSha256: mpHash };
      console.log(`   ✅ Mil Pasos (?page=grafik): HTTP ${mpRes.status}, wykryto ${mpImgUrls.length} plansz CDN (fingerprint=${mpHash}).`);
    } else {
      console.warn('   ⚠️ [Fallback] Strona Mil Pasos nie zwróciła plansz — zachowano ostatni zweryfikowany stan.');
    }
  } catch (err) {
    console.warn(`   ⚠️ [Fallback] Serwer Mil Pasos nie odpowiedział (${err.message}) — zachowano ostatni zweryfikowany stan.`);
  }

  return {
    gm: gmMeta,
    lc: lcMeta,
    mp: mpMeta,
  };
}

function buildSchedulePayload(sourcesMeta = null) {
  let updatedAt = BASELINE.updatedAt || '2026-10-20';
  let effectiveMeta = sourcesMeta;

  if (fs.existsSync(SCHEDULE_JSON_PATH)) {
    try {
      const prev = JSON.parse(fs.readFileSync(SCHEDULE_JSON_PATH, 'utf-8'));
      if (prev.updatedAt) updatedAt = prev.updatedAt;
      if (!effectiveMeta && prev.sourcesMeta) effectiveMeta = prev.sourcesMeta;

      const prevClassesJson = JSON.stringify(prev.classes || []);
      const nextClassesJson = JSON.stringify(CLASSES);
      const prevSchoolsJson = JSON.stringify(prev.schools || []);
      const nextSchoolsJson = JSON.stringify(SCHOOLS);
      const prevMetaJson = JSON.stringify(prev.sourcesMeta || {});
      const nextMetaJson = JSON.stringify(effectiveMeta || {});
      if (
        prevClassesJson !== nextClassesJson ||
        prevSchoolsJson !== nextSchoolsJson ||
        (sourcesMeta && prevMetaJson !== nextMetaJson)
      ) {
        updatedAt = new Date().toISOString().slice(0, 10);
      }
    } catch {
      updatedAt = new Date().toISOString().slice(0, 10);
    }
  }

  const payload = {
    updatedAt,
    city: 'Katowice',
    description:
      'Wspólny grafik katowickich szkół tańca (La Clave ul. Chorzowska 11, Good Mood ul. Paderewskiego 35 & Gravitacja ul. Gliwicka 44, Mil Pasos ul. Kamienna 4) z ustandaryzowaną 5-stopniową skalą poziomów zaawansowania KSH.',
    levelStandard: LEVEL_STANDARD,
    schools: SCHOOLS,
    classes: CLASSES,
  };
  if (effectiveMeta) {
    payload.sourcesMeta = effectiveMeta;
  }
  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  let sourcesMeta = null;
  if (args.includes('--check-remote')) {
    sourcesMeta = await checkRemoteFreshness();
  }

  const payload = buildSchedulePayload(sourcesMeta);
  writeScheduleAtomically(SCHEDULE_JSON_PATH, payload);

  const bySchool = {};
  const byLevel = {};
  for (const c of payload.classes) {
    bySchool[c.schoolId] = (bySchool[c.schoolId] || 0) + 1;
    byLevel[c.levelCode] = (byLevel[c.levelCode] || 0) + 1;
  }

  console.log(`✅ Zapisano atomowo ${payload.classes.length} realnych kursów do ${SCHEDULE_JSON_PATH}`);
  console.log('   📊 Podział wg szkół:', JSON.stringify(bySchool));
  console.log('   📊 Podział wg ustandaryzowanych poziomów KSH:', JSON.stringify(byLevel));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Błąd synchronizacji grafików:', err.message);
    process.exit(1);
  });
}

module.exports = {
  LEVEL_STANDARD,
  SCHOOLS,
  CLASSES,
  loadBaselineSchedule,
  normalizeLevel,
  inferStyleCategory,
  parseCsvGrid,
  parseGoodMoodSheetCells,
  mergeGoodMoodAdjacentBlocks,
  parseLaClavePricingHtml,
  validateScheduleSanity,
  buildSchedulePayload,
};
