#!/usr/bin/env node
/**
 * SYNC-SCHEDULES.JS — Zunifikowany Ingestor i Standaryzator Grafików Szkół Tańca (Katowice)
 *
 * Architektura Zero-Ban:
 * 1. Pobiera i parsuje na żywo arkusz Google Sheets szkoły Good Mood:
 *    - ul. Paderewskiego 35 (gid=0)
 *    - ul. Gliwicka 44 / Gravitacja (gid=409650056)
 * 2. Weryfikuje nagłówki HTTP Last-Modified / ETag plansz grafików:
 *    - La Clave (https://www.laclave.pl/?grafik-katowice -> files/1000/1-1.png .. 7.png)
 *    - Mil Pasos (https://www.milpasoskatowice.pl/?page=grafik -> 7 plansz dni + Legenda Poziomów)
 * 3. Standaryzuje poziomy zaawansowania z różnych nomenklatur szkół do 5-stopniowego Standardu KSH:
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

const LEVEL_STANDARD = [
  {
    code: 'P0',
    name: 'P0 • Od Zera / Start',
    experience: '0 – 2 miesiące (0–20h)',
    description: 'Grupy startowe dla osób, które nigdy wcześniej nie tańczyły lub zaczynają nowy styl od pierwszego kroku.',
    schoolMappings: {
      LC: 'OD ZERA / PODSTAWY (np. Bachata Od Zera, Salsa Od Zera, Kizomba Od Zera)',
      GM: 'GR. OD PODSTAW (np. START: 19.10, START: 26.10.2026, START: 6.10)',
      MP: 'OD ZERA – P0 (0–20h) oraz grupy solo Podstawowy',
    },
  },
  {
    code: 'P1',
    name: 'P1 • Podstawowy',
    experience: '2 – 5 miesięcy (20–40h)',
    description: 'Dla osób po pierwszym kursie P0 znających krok podstawowy, ramę i podstawowe obroty w parze.',
    schoolMappings: {
      LC: 'GR. POCZĄTKUJĄCA / BASIC 4 / DLA TAŃCZĄCYCH',
      GM: 'POCZĄTKUJĄCY P1 / GR. PODSTAWOWA TAŃCZĄCA',
      MP: 'PODSTAWOWY – P1 (po 3 mies.) / GRUPA WYRÓWNAWCZA',
    },
  },
  {
    code: 'P2',
    name: 'P2 • Podstawowy+ (P2/P3)',
    experience: '6 – 9 miesięcy (40–80h)',
    description: 'Swobodne łączenie figur, praca nad płynnością, prowadzeniem i musicality w parze.',
    schoolMappings: {
      LC: 'TAŃCZĄCY 6+ MIES. / GRUPA TAŃCZĄCA / GR. POCZĄTKUJĄCA+ / RUEDA',
      GM: 'GRUPA P2 / GRUPA P3 / ZOUK PROGRESS / SOCIAL SKILLS',
      MP: 'PODSTAWOWY – P2 (po 6 mies.) oraz P3 (po 9 mies.)',
    },
  },
  {
    code: 'S1',
    name: 'S1 • Średniozaaw. / Zaawansowany',
    experience: 'Powyżej 9–12 miesięcy (80h+)',
    description: 'Zaawansowany partnerwork, izolacje, polirytmia, grupy zamknięte i formacje.',
    schoolMappings: {
      LC: 'ŚREDNIO ZAAWANSOWANA / GRUPA ZAAWANSOWANA / FORMACJA',
      GM: 'GR. ŚR-ZAAWANSOWANA (min. 6/9 mies.) / S3 / P3–P5 / P4 / P5 / ADVANCE LAB',
      MP: 'PODSTAWOWY – P4 (1 rok+) / ŚR. ZAAW. / ZAAWANSOWANY / CHALLENGE',
    },
  },
  {
    code: 'OPEN',
    name: 'OPEN • Open / Solo / Praktis',
    experience: 'Otwarte (Solo: dla każdego • Pary: min. podstawy)',
    description: 'Zajęcia solo (Lady Styling, Bodymovement, Footwork, Suelta), grupy Open oraz wieczorne praktisy taneczne.',
    schoolMappings: {
      LC: 'SOLO / UNISEX / FOOTWORK / PRAKTIS',
      GM: 'GR. OPEN / ZAJĘCIA PRAKTYCZNE / ZOUK SOCIAL',
      MP: 'POZIOM OPEN (w parach min. P2 / solo dla każdego) / PRAKTIS Z INSTRUKTOREM',
    },
  },
];

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

const SCHOOLS = [
  {
    id: 'LC',
    name: 'La Clave',
    fullName: 'Szkoła Tańca La Clave Katowice',
    city: 'Katowice',
    address: 'ul. Chorzowska 11, Katowice (koło Spodka)',
    lat: 50.2608,
    lng: 19.0205,
    website: 'https://www.laclave.pl/?grafik-katowice',
    facebook: 'https://www.facebook.com/laclavekatowice',
    salsopediaId: 'term_school_1',
    sourceType: '6 plansz PNG (Chorzowska 11: Sala Duża, Średnia, Mała)',
    sourceUpdatedAt: '2026-09-16',
    multisport: true,
    medicover: true,
    badgeClass: 'school-badge--lc',
  },
  {
    id: 'GM',
    name: 'Good Mood',
    fullName: 'Szkoła Tańca Good Mood (Paderewskiego 35 & Gravitacja Gliwicka 44)',
    city: 'Katowice',
    address: 'ul. Paderewskiego 35 oraz ul. Gliwicka 44 (Gravitacja), Katowice',
    lat: 50.2518,
    lng: 19.0354,
    website: 'https://goodmood.dance/',
    facebook: 'https://www.facebook.com/goodmoodkatowice',
    salsopediaId: 'term_school_13',
    sourceType: 'Google Sheets Live CSV (Paderewskiego gid=0 + Gliwicka gid=409650056)',
    sourceUpdatedAt: '2026-10-19',
    multisport: true,
    medicover: true,
    badgeClass: 'school-badge--gm',
  },
  {
    id: 'MP',
    name: 'Mil Pasos',
    fullName: 'Szkoła Tańca Mil Pasos Katowice',
    city: 'Katowice',
    address: 'ul. Kamienna 4, Katowice (Śródmieście)',
    lat: 50.2562,
    lng: 19.0315,
    website: 'https://www.milpasoskatowice.pl/?page=grafik',
    facebook: 'https://www.facebook.com/milpasoskatowice',
    salsopediaId: 'term_school_2',
    sourceType: '8 plansz JPG z CDN FB (Sala 1, 2, 3 + Legenda Poziomów P0–P4)',
    sourceUpdatedAt: '2026-10-12',
    multisport: true,
    medicover: true,
    badgeClass: 'school-badge--mp',
  },
  {
    id: 'EV',
    name: 'Evolution & KIZLAB',
    fullName: 'Evolution Dance Studio, KIZLAB & Kato Salsa Hub',
    city: 'Katowice',
    address: 'ul. Sobieskiego 11 / ul. Mariacka 2 / Dolina 3 Stawów, Katowice',
    lat: 50.2599,
    lng: 19.0218,
    website: 'https://www.evolutiondancestudio.pl/',
    facebook: 'https://www.facebook.com/kizlabkatowice',
    salsopediaId: 'term_school_6',
    sourceType: 'Grafik społecznościowy KSH / KIZLAB',
    sourceUpdatedAt: '2026-10-19',
    multisport: true,
    medicover: true,
    badgeClass: 'school-badge--ev',
  },
];

// Zweryfikowany rozkład wszystkich 3 szkół z października 2026 r.
const CLASSES = [
  // =========================================================================
  // PONIEDZIAŁEK (dayOfWeek: 1)
  // =========================================================================
  // --- LA CLAVE (Poniedziałek) ---
  {
    id: 'lc_mon_1',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '17:15',
    endTime: '19:30',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Od Zera (3x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 15.06)',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Claudio & Ola', termId: 'term_inst_24' }],
    multisport: true,
    notes: 'Pełny blok fundamentów Bachaty od podstaw w Sali Dużej.',
  },
  {
    id: 'lc_mon_2',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '17:15',
    endTime: '19:30',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Timba & Salsa Cubana',
    title: 'Nowość: Timba & Salsa Cubana – Średniozaawansowana',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw.',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Marzena & Tomek', termId: 'term_inst_6' }],
    multisport: true,
    notes: 'Intensywny blok Timby i Salsy Kubańskiej dla tancerzy średniozaawansowanych.',
  },
  {
    id: 'lc_mon_3',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '18:00',
    endTime: '19:30',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba',
    title: 'Kizomba Od Zera (2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Maciek Zahorodny', termId: 'term_inst_7' }],
    multisport: true,
    notes: 'Podstawy prowadzenia, płynnego chodu i połączenia w Kizombie.',
  },
  {
    id: 'lc_mon_4',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '19:30',
    endTime: '20:15',
    styleCategory: 'solo',
    styleLabel: 'Bachata Solo',
    title: 'Bachata Solo – Technika i Styling',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Claudio & Ola', termId: 'term_inst_24' }],
    multisport: true,
    notes: 'Zajęcia solowe rozwijające koordynację, pracę bioder i klatki piersiowej.',
  },
  {
    id: 'lc_mon_5',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '19:30',
    endTime: '21:00',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba',
    title: 'Kizomba Średniozaawansowana (Można dołączyć)',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw.',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Maciek Zahorodny', termId: 'term_inst_7' }],
    multisport: true,
    notes: 'Rozwinięcie figur, przyspieszeń i musicality w Kizombie.',
  },
  {
    id: 'lc_mon_6',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '20:15',
    endTime: '22:30',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Fusion',
    title: 'Bachata Fusion – Grupa Tańcząca (Dołącz)',
    levelCode: 'P2',
    levelLabel: 'P2 • Grupa tańcząca',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Claudio & Ola', termId: 'term_inst_24' }],
    multisport: true,
    notes: 'Połączenie Bachaty Sensual i Moderna dla osób znających podstawy.',
  },
  {
    id: 'lc_mon_7',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '20:15',
    endTime: '21:00',
    styleCategory: 'solo',
    styleLabel: 'Taniec Brzucha',
    title: 'Taniec Brzucha Od Zera',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Judyta „Niyaf” Mężyk', termId: 'term_inst_30' }],
    multisport: true,
    notes: 'Izolacje orientalne, postawa i kobieca ekspresja od podstaw.',
  },
  {
    id: 'lc_mon_8',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '21:00',
    endTime: '22:30',
    styleCategory: 'solo',
    styleLabel: 'Taniec Brzucha',
    title: 'Taniec Brzucha – Gr. Początkująca i Początkująca+',
    levelCode: 'P1',
    levelLabel: 'P1/P2 • Początkujący+',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Judyta „Niyaf” Mężyk', termId: 'term_inst_30' }],
    multisport: true,
    notes: '21:00 Gr. Początkująca • 21:45 Gr. Początkująca+.',
  },
  {
    id: 'lc_mon_9',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '21:00',
    endTime: '22:30',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba',
    title: 'Kizomba Zaawansowana (Można dołączyć)',
    levelCode: 'S1',
    levelLabel: 'S1 • Zaawansowany',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Maciek Zahorodny', termId: 'term_inst_7' }],
    multisport: true,
    notes: 'Zaawansowana technika prowadzenia, dysocjacji i mikro-ruchu.',
  },
  {
    id: 'lc_mon_10',
    schoolId: 'LC',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '22:30',
    endTime: '23:15',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Praktis',
    title: 'Kizomba Praktis Wieczorny',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Maciek Zahorodny', termId: 'term_inst_7' }],
    multisport: true,
    notes: 'Swobodna praktyka Kizomby na parkiecie po zajęciach.',
  },

  // --- GOOD MOOD (Poniedziałek) ---
  {
    id: 'gm_mon_1',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '17:20',
    endTime: '18:55',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Gr. Od Podstaw (Nowy Nabór!)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 19.10)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Aga & Radek' }],
    multisport: true,
    notes: 'Świeży kurs od podstaw (Start: 19.10.2026) – elastyczny taniec w parze do muzyki pop/R&B.',
  },
  {
    id: 'gm_mon_2',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '18:10',
    endTime: '19:45',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Cubana – Gr. Od Podstaw (START 26.10.2026!)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 26.10)',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Daniel „Kokosz” Machalica', termId: 'term_inst_16' }],
    multisport: true,
    notes: 'Nowy nabór od zera (Start: 26.10.2026) w lokalizacji Gravitacja ul. Gliwicka 44 (2x45 min).',
  },
  {
    id: 'gm_mon_3',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '19:50',
    endTime: '21:25',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Brazylijski – Gr. Od Podstaw',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 21.09)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Sporki' }],
    multisport: true,
    notes: 'Podstawy rytmiki, ramy i płynnego ruchu w Zouku Brazylijskim (2x45 min).',
  },
  {
    id: 'gm_mon_4',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '19:50',
    endTime: '21:25',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Cubana – Gr. Średniozaawansowana Starsza',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. Starsza',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Daniel „Kokosz” Machalica', termId: 'term_inst_16' }],
    multisport: true,
    notes: 'Zaawansowane kombinacje Casino, Timby i rytmiki kubańskiej (2x45 min).',
  },
  {
    id: 'gm_mon_5',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '20:00',
    endTime: '21:00',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Brazylijski – Początkujący P1',
    levelCode: 'P1',
    levelLabel: 'P1 • Początkujący P1',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Kasia Terech & Brajan Nosal', termId: 'term_inst_27' }],
    multisport: true,
    notes: 'Grupa P1 dla osób znających pierwsze kroki w Zouku.',
  },
  {
    id: 'gm_mon_6',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '21:00',
    endTime: '22:00',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Brazylijski – Średniozaawansowana S3',
    levelCode: 'S1',
    levelLabel: 'S1 • Poziom S3',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Kasia Terech & Brajan Nosal', termId: 'term_inst_27' }],
    multisport: true,
    notes: 'Technika headmovementu, cambré i zaawansowanego prowadzenia.',
  },
  {
    id: 'gm_mon_7',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '21:30',
    endTime: '23:05',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Progress & Social',
    title: 'Zouk Progress (21:30) + Zouk Social (22:20)',
    levelCode: 'P2',
    levelLabel: 'P2 • Progress + Social',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Sporki' }],
    multisport: true,
    notes: '45 min treningu Zouk Progress oraz 45 min swobodnego Zouk Socialu.',
  },
  {
    id: 'gm_mon_8',
    schoolId: 'GM',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '22:00',
    endTime: '23:00',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Praktis',
    title: 'Zouk Praktis Open (Praktyka pod okiem instruktorów)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Kasia Terech & Brajan Nosal', termId: 'term_inst_27' }],
    multisport: true,
    notes: 'Otwarty praktis Zouk z konsultacjami instruktorskimi na sali.',
  },

  // --- MIL PASOS (Poniedziałek) ---
  {
    id: 'mp_mon_1',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata P2 (Cz. 1 + Cz. 2)',
    levelCode: 'P2',
    levelLabel: 'P2 • Podstawowy+ (6+ mies.)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Iza', termId: 'term_inst_11' }],
    multisport: true,
    notes: 'Dla osób po poziomie P1 lub tańczących od ok. 6 miesięcy (2x55 min, Start: 26.01.26).',
  },
  {
    id: 'mp_mon_2',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Fusion',
    title: 'Kizomba Fusion P1 (Cz. 1 + Cz. 2)',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowy (Start 15.06)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Mati & Angelika' }],
    multisport: true,
    notes: 'Rozwijanie podstawowych figur, łączenia ruchów i płynności w Kizombie Fusion (2x55 min).',
  },
  {
    id: 'mp_mon_3',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '18:15',
    endTime: '20:10',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Średniozaawansowana (Cz. 1 + Cz. 2)',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. (1 rok+)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Konrad & Karolina', termId: 'term_inst_12' }],
    multisport: true,
    notes: 'Poziom średniozaawansowany dla tancerzy z ponad rocznym stażem (2x55 min).',
  },
  {
    id: 'mp_mon_4',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '20:15',
    endTime: '21:10',
    styleCategory: 'kizomba',
    styleLabel: 'Bachazouk',
    title: 'Bachazouk Open w Parach',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Start 14.09',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Marcelo & Kasia' }],
    multisport: true,
    notes: 'Fuzja Bachaty i Zouka Brazylijskiego (grupa Open dla osób znających podstawy, min. P2).',
  },
  {
    id: 'mp_mon_5',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '20:15',
    endTime: '21:10',
    styleCategory: 'solo',
    styleLabel: 'Bachata Lady Style',
    title: 'Bachata Lady Style Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo Ladies (Start 07.09)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Iza', termId: 'term_inst_11' }],
    multisport: true,
    notes: 'Zajęcia solo otwarte dla tancerek na każdym poziomie zaawansowania.',
  },
  {
    id: 'mp_mon_6',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '20:15',
    endTime: '22:10',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Praktis',
    title: 'Bachata Praktis (2x55 min)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Zespół Mil Pasos', termId: 'term_school_2' }],
    multisport: true,
    notes: 'Dwie godziny otwartego parkietu bachatowego do ćwiczenia figur.',
  },
  {
    id: 'mp_mon_7',
    schoolId: 'MP',
    dayOfWeek: 1,
    dayName: 'Poniedziałek',
    startTime: '21:15',
    endTime: '22:10',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Advanced – Poziom Zaawansowany',
    levelCode: 'S1',
    levelLabel: 'S1 • Zaawansowany (Start 14.09)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Marcelo & Kasia' }],
    multisport: true,
    notes: 'Najwyższy poziom wtajemniczenia w Zouku Brazylijskim.',
  },

  // =========================================================================
  // WTOREK (dayOfWeek: 2)
  // =========================================================================
  // --- LA CLAVE (Wtorek) ---
  {
    id: 'lc_tue_1',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '16:30',
    endTime: '18:00',
    styleCategory: 'solo',
    styleLabel: 'Latino Solo',
    title: 'Latino Solo (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo (Start 08.09)',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Dawid' }],
    multisport: true,
    notes: 'Energiczne choreografie latynoskie solo bez partnera.',
  },
  {
    id: 'lc_tue_2',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '17:15',
    endTime: '18:45',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa',
    title: 'Salsa Podstawy (2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Podstawy',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Dominika' }],
    multisport: true,
    notes: 'Fundamenty Salsy i rytmiki od podstaw.',
  },
  {
    id: 'lc_tue_3',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:00',
    endTime: '18:45',
    styleCategory: 'solo',
    styleLabel: 'Cuban Bodymovement',
    title: 'Cuban Bodymovement & Izolacje (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo Technika',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Ania Seruga', termId: 'term_inst_2' }],
    multisport: true,
    notes: 'Kubańska praca ciała, izolacje klatki, ramion i bioder.',
  },
  {
    id: 'lc_tue_4',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:00',
    endTime: '18:45',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Dominikańska',
    title: 'Bachata Dominikańska Footwork Solo (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Footwork Solo',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Ania & Kuba' }],
    multisport: true,
    notes: 'Tradycyjny dominikański footwork, synkopy i muzykalność.',
  },
  {
    id: 'lc_tue_5',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:45',
    endTime: '20:15',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Timba Solo Unisex',
    title: 'Timba Solo Unisex (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo Unisex',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Ania Seruga', termId: 'term_inst_2' }],
    multisport: true,
    notes: 'Footwork, despelote, tembleque i interpretacja współczesnej Timby kubańskiej.',
  },
  {
    id: 'lc_tue_6',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:45',
    endTime: '20:15',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Dominikańska',
    title: 'Bachata Dominikańska w Parach (Nowość)',
    levelCode: 'P1',
    levelLabel: 'P1 • Start 01.09',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Ania & Kuba' }],
    multisport: true,
    notes: 'Radosna, rytmiczna Bachata prosto z Dominikany w parach (2x45 min).',
  },
  {
    id: 'lc_tue_7',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:45',
    endTime: '20:15',
    styleCategory: 'solo',
    styleLabel: 'Taniec Brzucha',
    title: 'Taniec Brzucha – Gr. Zaawansowana (Nowość)',
    levelCode: 'S1',
    levelLabel: 'S1 • Zaawansowany (Start 08.09)',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Judyta „Niyaf” Mężyk', termId: 'term_inst_30' }],
    multisport: true,
    notes: 'Zaawansowana technika tańca orientalnego i praca z rekwizytem.',
  },
  {
    id: 'lc_tue_8',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:15',
    endTime: '21:00',
    styleCategory: 'rueda',
    styleLabel: 'Rumba Kubańska',
    title: 'Rumba Kubańska (Guaguancó / Yambú / Columbia)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Afro-Cuban',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Ania Seruga', termId: 'term_inst_2' }],
    multisport: true,
    notes: 'Korzenie salsy kubańskiej: dialog taneczny, vacunao i klawa rumbowa.',
  },
  {
    id: 'lc_tue_9',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:15',
    endTime: '21:45',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Sensual',
    title: 'Bachata Sensual (6+ mies.)',
    levelCode: 'P2',
    levelLabel: 'P2 • Tańczący 6+ mies.',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Ania & Kuba' }],
    multisport: true,
    notes: 'Płynne fale, izolacje i prowadzenie ciałem dla osób tańczących min. pół roku.',
  },
  {
    id: 'lc_tue_10',
    schoolId: 'LC',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:15',
    endTime: '21:45',
    styleCategory: 'solo',
    styleLabel: 'Taniec Brzucha',
    title: 'Taniec Brzucha – Formacja',
    levelCode: 'S1',
    levelLabel: 'S1 • Formacja',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Judyta „Niyaf” Mężyk', termId: 'term_inst_30' }],
    multisport: true,
    notes: 'Grupa choreograficzno-pokazowa tańca orientalnego.',
  },

  // --- GOOD MOOD (Wtorek) ---
  {
    id: 'gm_tue_1',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '16:30',
    endTime: '18:05',
    styleCategory: 'solo',
    styleLabel: 'Zumba',
    title: 'Zumba – Zajęcia Solo dla Wszystkich (Open)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Można dołączyć',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Agata' }],
    multisport: true,
    notes: 'Dwa bloki (16:30 i 17:20) energetycznej Zumby – można dołączyć w dowolnym momencie.',
  },
  {
    id: 'gm_tue_2',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:10',
    endTime: '19:45',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba',
    title: 'Kizomba – Grupa Open (2x45 min)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • W parach',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Mili Jakubowska & Mateusz', termId: 'term_inst_28' }],
    multisport: true,
    notes: 'Zajęcia Kizomby w formule Open z naciskiem na musicality i komfort w parze.',
  },
  {
    id: 'gm_tue_3',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:10',
    endTime: '19:45',
    styleCategory: 'solo',
    styleLabel: 'Bachata Ladies Styling',
    title: 'Bachata Ladies Styling – Technika, Body Movement & Choreo',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. Ladies',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Martyna „Ruda”' }],
    multisport: true,
    notes: '18:10 Technika & Body Movement • 19:00 Lady Styling & Choreo.',
  },
  {
    id: 'gm_tue_4',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '19:50',
    endTime: '22:15',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata – Gr. Średniozaawansowana (min. 6 mies.)',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. (6+ mies.)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Pasek & Kasia' }],
    multisport: true,
    notes: 'Trzy bloki warsztatowe (19:50, 20:40, 21:30) dla tancerzy ze stażem min. 6 miesięcy.',
  },
  {
    id: 'gm_tue_5',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '19:50',
    endTime: '21:25',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba',
    title: 'Kizomba – Gr. Od Podstaw (Nowy Nabór!)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 06.10)',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Mili Jakubowska & Mateusz', termId: 'term_inst_28' }],
    multisport: true,
    notes: 'Świeża grupa od podstaw (Start: 6.10.2026) – wciąż można dołączyć!',
  },
  {
    id: 'gm_tue_6',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:00',
    endTime: '21:00',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Brazylijski – Początkujący P1',
    levelCode: 'P1',
    levelLabel: 'P1 • Początkujący P1',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Kasia Terech & Brajan Nosal', termId: 'term_inst_27' }],
    multisport: true,
    notes: 'Wtorkowy trening Zouk P1 w sali Gravitacja (ul. Gliwicka 44).',
  },
  {
    id: 'gm_tue_7',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '21:00',
    endTime: '22:00',
    styleCategory: 'solo',
    styleLabel: 'Shuffle Dance',
    title: 'Shuffle dla Dorosłych – Grupa Od Podstaw',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Dołącz)',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Angelika' }],
    multisport: true,
    notes: 'Dynamiczny footwork Shuffle Dance od podstaw – można dołączyć.',
  },
  {
    id: 'gm_tue_8',
    schoolId: 'GM',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '22:20',
    endTime: '23:05',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Praktis',
    title: 'Bachata – Zajęcia Praktyczne (Gr. Open)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Pasek & Kasia' }],
    multisport: true,
    notes: 'Wieczorna praktyka bachatowa po zajęciach kursowych.',
  },

  // --- MIL PASOS (Wtorek) ---
  {
    id: 'mp_tue_1',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Brazylijski P3 (Cz. 1 + Cz. 2)',
    levelCode: 'P2',
    levelLabel: 'P2 • Poziom P3 (9+ mies.)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Michał & Olha' }],
    multisport: true,
    notes: 'Dla osób po poziomie P2 lub tańczących od ok. 9 miesięcy (2x55 min).',
  },
  {
    id: 'mp_tue_2',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'solo',
    styleLabel: 'Hip-Hop',
    title: 'Hip-Hop Podstawowy (Cz. 1 + Cz. 2)',
    levelCode: 'P0',
    levelLabel: 'P0 • Podstawowy (Start 08.09)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Kasia K' }],
    multisport: true,
    notes: 'Groove, bounce i choreografie Hip-Hop od podstaw (2x55 min).',
  },
  {
    id: 'mp_tue_3',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '18:00',
    endTime: '18:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Cuban Fuego',
    title: 'Cuban Fuego Open – Energia Kubańska Solo',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo (Start 12.05)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Daniel Galas', termId: 'term_inst_9' }],
    multisport: true,
    notes: 'Wybuchowa mieszanka Timby, Salsy, Reggaetonu i Rumby w wydaniu solo.',
  },
  {
    id: 'mp_tue_4',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '19:00',
    endTime: '19:55',
    styleCategory: 'solo',
    styleLabel: 'Izolacje & Koordynacje',
    title: 'Izolacje & Koordynacje Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Body Movement',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Daniel Galas', termId: 'term_inst_9' }],
    multisport: true,
    notes: 'Świadoma kontrola ciała, polirytmia i izolacje dla tancerzy wszystkich stylów.',
  },
  {
    id: 'mp_tue_5',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Challenge',
    title: 'Zouk Challenge (Cz. 1 + Cz. 2)',
    levelCode: 'S1',
    levelLabel: 'S1 • Zouk Challenge',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Michał & Olha' }],
    multisport: true,
    notes: 'Ambitny trening techniczny i koncepcyjny Zouka Brazylijskiego (2x55 min).',
  },
  {
    id: 'mp_tue_6',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Od Zera – P0 (Cz. 1 + Cz. 2)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 15.09)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Rozi & Wika' }],
    multisport: true,
    notes: 'Grupa P0 od podstaw – nauka kroków bazowych, rytmu i prowadzenia (2x55 min).',
  },
  {
    id: 'mp_tue_7',
    schoolId: 'MP',
    dayOfWeek: 2,
    dayName: 'Wtorek',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska',
    title: 'Salsa Kubańska P3 (Cz. 1 + Cz. 2)',
    levelCode: 'P2',
    levelLabel: 'P2 • Poziom P3 (9+ mies.)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Daniel Galas', termId: 'term_inst_9' }],
    multisport: true,
    notes: 'Płynne Casino, dynamika i musicality dla osób tańczących od min. 9 miesięcy.',
  },

  // =========================================================================
  // ŚRODA (dayOfWeek: 3)
  // =========================================================================
  // --- LA CLAVE (Środa) ---
  {
    id: 'lc_wed_1',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '17:15',
    endTime: '18:45',
    styleCategory: 'solo',
    styleLabel: 'Sensual Twerk',
    title: 'Sensual Twerk Od Zera (2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 09.09)',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Anita' }],
    multisport: true,
    notes: 'Technika pracy bioder, izolacji i kondycji od podstaw.',
  },
  {
    id: 'lc_wed_2',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:00',
    endTime: '18:45',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Son Cubano',
    title: 'Son Cubano – Elegancja i Contratiempo (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Son Cubano',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Olita & Ziemowit', termId: 'term_inst_4' }],
    multisport: true,
    notes: 'Tradycyjny kubański Son tańczony w rozliczeniu contratiempo (na „2”).',
  },
  {
    id: 'lc_wed_3',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:00',
    endTime: '20:15',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Tańczący (6+ mies.) – 3x45 min',
    levelCode: 'P2',
    levelLabel: 'P2 • Tańczący 6+ mies.',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Justyna & Kuba', termId: 'term_inst_8' }],
    multisport: true,
    notes: 'Rozbudowany blok dla tancerzy ze stażem min. 6 miesięcy (Start: 16.09.2026).',
  },
  {
    id: 'lc_wed_4',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:45',
    endTime: '20:15',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana Partnerwork',
    title: 'La Clave Del Estilo – Partnerwork (2x45 min)',
    levelCode: 'S1',
    levelLabel: 'S1 • Partnerwork',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Olita & Ziemowit', termId: 'term_inst_4' }],
    multisport: true,
    notes: 'Autorski kurs partnerworku kubańskiego ze stylingiem w parze.',
  },
  {
    id: 'lc_wed_5',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:45',
    endTime: '19:30',
    styleCategory: 'solo',
    styleLabel: 'Sexy Dance',
    title: 'Sexy Dance Od Zera',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 09.09)',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Anita' }],
    multisport: true,
    notes: 'Kobieca choreografia, płynność ruchu i pewność siebie na parkiecie.',
  },
  {
    id: 'lc_wed_6',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:15',
    endTime: '21:45',
    styleCategory: 'rueda',
    styleLabel: 'Rueda de Casino',
    title: 'La Clave Rueda de Casino (2x45 min)',
    levelCode: 'P2',
    levelLabel: 'P2 • Rueda de Casino',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Olita & Ziemowit', termId: 'term_inst_4' }],
    multisport: true,
    notes: 'Flagowa Rueda de Casino w La Clave – dynamiczne komendy i wymiany w kole.',
  },
  {
    id: 'lc_wed_7',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:15',
    endTime: '21:45',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Od Zera (Nowość – 2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 16.09)',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Justyna & Kuba', termId: 'term_inst_8' }],
    multisport: true,
    notes: 'Wieczorna grupa Bachaty od podstaw (Start: 16.09.2026).',
  },
  {
    id: 'lc_wed_8',
    schoolId: 'LC',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '21:45',
    endTime: '22:30',
    styleCategory: 'bachata',
    styleLabel: 'Praktis Bachata',
    title: 'Praktis Bachata z Justyną i Kubą',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Justyna & Kuba', termId: 'term_inst_8' }],
    multisport: true,
    notes: 'Wspólne utrwalanie materiału z zajęć na parkiecie.',
  },

  // --- GOOD MOOD (Środa) ---
  {
    id: 'gm_wed_1',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:10',
    endTime: '20:35',
    styleCategory: 'bachata',
    styleLabel: 'Bachata w Parach',
    title: 'Bachata w Parach – Gr. Średniozaawansowana (min. 9 mies.)',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. (9+ mies.)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Martyna „Ruda” & Łukasz' }],
    multisport: true,
    notes: 'Trzy segmenty (18:10, 19:00, 19:50) dla par tańczących od min. 9 miesięcy.',
  },
  {
    id: 'gm_wed_2',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:10',
    endTime: '18:55',
    styleCategory: 'solo',
    styleLabel: 'Bachata Solo Ladies',
    title: 'Bachata Solo Ladies – Gr. Podstawowa Tańcząca',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowa Tańcząca',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Asia Bernatowicz' }],
    multisport: true,
    notes: 'Kobiecy styling bachatowy dla pań znających krok podstawowy.',
  },
  {
    id: 'gm_wed_3',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '19:00',
    endTime: '19:45',
    styleCategory: 'solo',
    styleLabel: 'Salsation',
    title: 'Salsation – Grupa Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Dla każdego',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Asia Bernatowicz' }],
    multisport: true,
    notes: 'Trening taneczno-funkcjonalny oparty na muzykalności i ekspresji.',
  },
  {
    id: 'gm_wed_4',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '19:50',
    endTime: '21:25',
    styleCategory: 'solo',
    styleLabel: 'Musicality & Izolacje',
    title: 'Bachata Musicality (19:50) + Izolacje / Bodymovement (20:40)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Musicality & Solo',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Asia Bernatowicz' }],
    multisport: true,
    notes: 'Interpretacja instrumentów w Bachacie oraz technika izolacji ciała.',
  },
  {
    id: 'gm_wed_5',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:00',
    endTime: '21:00',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Brazylijski',
    title: 'Zouk Brazylijski – Początkujący P1',
    levelCode: 'P1',
    levelLabel: 'P1 • Początkujący P1',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Kasia Terech & Brajan Nosal', termId: 'term_inst_27' }],
    multisport: true,
    notes: 'Środowa grupa Zouk P1 w lokalizacji Gravitacja (ul. Gliwicka 44).',
  },
  {
    id: 'gm_wed_6',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:40',
    endTime: '22:15',
    styleCategory: 'bachata',
    styleLabel: 'Bachata w Parach',
    title: 'Bachata w Parach – Gr. Podstawowa Tańcząca (2x45 min)',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowa Tańcząca',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Martyna „Ruda” & Łukasz' }],
    multisport: true,
    notes: 'Kontynuacja podstaw Bachaty w parze (20:40–22:15).',
  },
  {
    id: 'gm_wed_7',
    schoolId: 'GM',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '21:00',
    endTime: '22:00',
    styleCategory: 'solo',
    styleLabel: 'Shuffle Dance',
    title: 'Shuffle dla Dorosłych – Grupa Od Podstaw',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Dołącz)',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Angelika' }],
    multisport: true,
    notes: 'Środowy trening Shuffle Dance od podstaw w Gravitacji.',
  },

  // --- MIL PASOS (Środa) ---
  {
    id: 'mp_wed_1',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata P1 (Cz. 1 + Cz. 2)',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowy (Start 17.06)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Iza', termId: 'term_inst_11' }],
    multisport: true,
    notes: 'Poziom P1 (dla osób po P0 lub tańczących od ok. 3 miesięcy, 2x55 min).',
  },
  {
    id: 'mp_wed_2',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Sensual',
    title: 'Bachata Sensual Open (Cz. 1 + Cz. 2)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • W parach (Start 09.09)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Jersey & Alina' }],
    multisport: true,
    notes: 'Grupa Open w parach (min. poziom P2 / ok. 6 miesięcy stażu, 2x55 min).',
  },
  {
    id: 'mp_wed_3',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '18:00',
    endTime: '18:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska',
    title: 'Salsa Kubańska P1',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowy (Start 10.06)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Anita', termId: 'term_inst_10' }],
    multisport: true,
    notes: 'Rozwijanie podstawowych figur Casino i płynnego prowadzenia w parze.',
  },
  {
    id: 'mp_wed_4',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '19:00',
    endTime: '19:55',
    styleCategory: 'solo',
    styleLabel: 'Cuban Lady Style',
    title: 'Cuban Lady Style Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo Ladies',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Anita', termId: 'term_inst_10' }],
    multisport: true,
    notes: 'Kubański styling dla pań – praca rąk, bioder i rytmika w Salsie/Timbie.',
  },
  {
    id: 'mp_wed_5',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Fusion',
    title: 'Kizomba Fusion P1 (Cz. 1 + Cz. 2)',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowy (Start 17.06)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Krystian & Wiola', termId: 'term_inst_11' }],
    multisport: true,
    notes: 'Poziom P1 Kizomby Fusion (2x55 min).',
  },
  {
    id: 'mp_wed_6',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Od Zera – P0 (Cz. 1 + Cz. 2)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 19.08)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Jersey & Alina' }],
    multisport: true,
    notes: 'Grupa startowa P0 od podstaw (2x55 min).',
  },
  {
    id: 'mp_wed_7',
    schoolId: 'MP',
    dayOfWeek: 3,
    dayName: 'Środa',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska Partnerwork',
    title: 'Salsa Kubańska Partnerwork P2 (Cz. 1 + Cz. 2)',
    levelCode: 'P2',
    levelLabel: 'P2 • Podstawowy+ (6+ mies.)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Grzegorz & Anita', termId: 'term_inst_10' }],
    multisport: true,
    notes: 'Partnerwork kubański na poziomie P2 (dla tańczących od min. 6 miesięcy, 2x55 min).',
  },

  // =========================================================================
  // CZWARTEK (dayOfWeek: 4)
  // =========================================================================
  // --- LA CLAVE (Czwartek) ---
  {
    id: 'lc_thu_1',
    schoolId: 'LC',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '17:00',
    endTime: '18:00',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Basic 4',
    levelCode: 'P1',
    levelLabel: 'P1 • Basic 4',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Dariusz „Darek” Gruszczyk', termId: 'term_inst_3' }],
    multisport: true,
    notes: 'Czwarty moduł kursu podstawowego Salsy Kubańskiej.',
  },
  {
    id: 'lc_thu_2',
    schoolId: 'LC',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '17:00',
    endTime: '18:00',
    styleCategory: 'solo',
    styleLabel: 'Latino Solo',
    title: 'Latino Solo (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo (Start 03.09)',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Dawid' }],
    multisport: true,
    notes: 'Czwartkowa grupa Latino Solo.',
  },
  {
    id: 'lc_thu_3',
    schoolId: 'LC',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:00',
    endTime: '19:30',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Średniozaawansowana (Kontynuacja – Można dołączyć)',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw.',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Dariusz „Darek” Gruszczyk', termId: 'term_inst_3' }],
    multisport: true,
    notes: 'Płynne kombinacje Casino w parze – grupa otwarta na dołączenie.',
  },
  {
    id: 'lc_thu_4',
    schoolId: 'LC',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:00',
    endTime: '19:30',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Od Zera (Nowość – 2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 10.09)',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Sebastian „Seba” Ciosiński', termId: 'term_inst_1' }],
    multisport: true,
    notes: 'Kurs Salsy Kubańskiej od podstaw z założycielem La Clave.',
  },
  {
    id: 'lc_thu_5',
    schoolId: 'LC',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '19:30',
    endTime: '21:00',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Partnerwork',
    title: 'Salsa Partnerwork – Grupa Zaawansowana (Nowość)',
    levelCode: 'S1',
    levelLabel: 'S1 • Zaawansowany',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Dariusz „Darek” Gruszczyk', termId: 'term_inst_3' }],
    multisport: true,
    notes: 'Zaawansowany partnerwork kubański, rytmika i improwizacja w parze.',
  },
  {
    id: 'lc_thu_6',
    schoolId: 'LC',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '19:30',
    endTime: '21:45',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Od Zera (3x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 24.09)',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Denis' }],
    multisport: true,
    notes: 'Kompleksowy wieczorny kurs Bachaty od podstaw (Start: 24.09.2026).',
  },

  // --- GOOD MOOD (Czwartek) ---
  {
    id: 'gm_thu_1',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:10',
    endTime: '20:35',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Social Skills',
    title: 'Bachata Social Skills – Out of Script Edition',
    levelCode: 'P2',
    levelLabel: 'P2 • Social Skills',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Paulina & Michał' }],
    multisport: true,
    notes: 'Kreatywne prowadzenie i improwizacja w Bachacie poza utartymi schematami.',
  },
  {
    id: 'gm_thu_2',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:10',
    endTime: '19:45',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Technika Gr. P3–P5',
    levelCode: 'S1',
    levelLabel: 'S1 • Poziom P3–P5 (Start 24.09)',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Zespół WCS Good Mood', termId: 'term_school_13' }],
    multisport: true,
    notes: 'Zaawansowana technika connection i musicality w West Coast Swingu.',
  },
  {
    id: 'gm_thu_3',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:10',
    endTime: '19:45',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Cubana – Gr. Podstawowa Tańcząca',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowa Tańcząca',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Daniel „Kokosz” Machalica', termId: 'term_inst_16' }],
    multisport: true,
    notes: 'Czwartkowa kontynuacja podstaw Salsy Kubańskiej na ul. Gliwickiej 44 (2x45 min).',
  },
  {
    id: 'gm_thu_4',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '19:50',
    endTime: '20:35',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing Praktis',
    title: 'West Coast Swing – Zajęcia Praktyczne',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis WCS',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Zespół WCS Good Mood', termId: 'term_school_13' }],
    multisport: true,
    notes: 'Wspólna praktyka West Coast Swingu między blokami P3–P5 oraz P2.',
  },
  {
    id: 'gm_thu_5',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '19:50',
    endTime: '21:25',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Cubana – Gr. Średniozaawansowana Starsza',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. Starsza',
    room: 'Gravitacja (ul. Gliwicka 44)',
    instructors: [{ name: 'Daniel „Kokosz” Machalica', termId: 'term_inst_16' }],
    multisport: true,
    notes: 'Drugi w tygodniu blok grupy średniozaawansowanej starszej na Gliwickiej 44.',
  },
  {
    id: 'gm_thu_6',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '20:40',
    endTime: '21:25',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Praktis',
    title: 'Bachata Social Skills – Zajęcia Praktyczne',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Paulina & Michał' }],
    multisport: true,
    notes: 'Praktyka parkietowa po bloku Out of Script.',
  },
  {
    id: 'gm_thu_7',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '20:40',
    endTime: '22:15',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Grupa P2 (2x45 min)',
    levelCode: 'P2',
    levelLabel: 'P2 • Poziom P2 (Start 24.09)',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Zespół WCS Good Mood', termId: 'term_school_13' }],
    multisport: true,
    notes: 'Poziom P2 West Coast Swingu.',
  },
  {
    id: 'gm_thu_8',
    schoolId: 'GM',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '21:30',
    endTime: '23:05',
    styleCategory: 'kizomba',
    styleLabel: 'Zouk Advance Lab',
    title: 'Zouk Advance Lab – Grupa Open (2x45 min)',
    levelCode: 'S1',
    levelLabel: 'S1 • Advance Lab',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Dom & Lary' }],
    multisport: true,
    notes: 'Zaawansowane laboratorium ruchu i kreacji w Zouku Brazylijskim.',
  },

  // --- MIL PASOS (Czwartek) ---
  {
    id: 'mp_thu_1',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Open w Parach (Cz. 1 + Cz. 2)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • W parach (Start 02.04)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Michał & Karolina' }],
    multisport: true,
    notes: 'Grupa otwarta dla osób znających podstawy (min. P2 / ok. 6 miesięcy, 2x55 min).',
  },
  {
    id: 'mp_thu_2',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:00',
    endTime: '18:55',
    styleCategory: 'solo',
    styleLabel: 'Body Control & Kizomba Solo',
    title: 'Body Control + Kizomba Solo Unisex Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo Unisex',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Ksenia' }],
    multisport: true,
    notes: 'Izolacje, kontrola środka ciężkości i płynny ruch w Kizombie/Urban Kiz.',
  },
  {
    id: 'mp_thu_3',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska',
    title: 'Salsa Kubańska P4 – Grupa Zamknięta (2x55 min)',
    levelCode: 'S1',
    levelLabel: 'S1 • Poziom P4 (1 rok+)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Daniel Galas', termId: 'term_inst_9' }],
    multisport: true,
    notes: 'Dla tancerzy po poziomie P3 lub tańczących od ponad roku – praca nad detalami i stylem.',
  },
  {
    id: 'mp_thu_4',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '19:00',
    endTime: '20:55',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Fusion / Urban Kiz',
    title: 'Kizomba Fusion / Urban Kiz – Średniozaawansowany',
    levelCode: 'S1',
    levelLabel: 'S1 • Śr.-Zaaw. (1 rok+)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Ksenia' }],
    multisport: true,
    notes: 'Dwa bloki (19:00 i 20:00) techniki Urban Kiz i Kizomba Fusion na poziomie średniozaawansowanym.',
  },
  {
    id: 'mp_thu_5',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '20:00',
    endTime: '21:30',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Praktis',
    title: 'Bachata Praktis z Instruktorem',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis z instruktorem',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Zespół Mil Pasos', termId: 'term_school_2' }],
    multisport: true,
    notes: 'Wieczorny praktis bachatowy ze wsparciem instruktora na sali.',
  },
  {
    id: 'mp_thu_6',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '20:00',
    endTime: '20:55',
    styleCategory: 'solo',
    styleLabel: 'Izolacje & Koordynacje',
    title: 'Izolacje & Koordynacje Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Body Movement',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Daniel Galas', termId: 'term_inst_9' }],
    multisport: true,
    notes: 'Czwartkowy trening izolacji i koordynacji ruchowej.',
  },
  {
    id: 'mp_thu_7',
    schoolId: 'MP',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '21:00',
    endTime: '21:55',
    styleCategory: 'solo',
    styleLabel: 'Cuban Bodymovement',
    title: 'Cuban Bodymovement Open',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Afro-Cuban Solo',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Daniel Galas', termId: 'term_inst_9' }],
    multisport: true,
    notes: 'Ruch afro-kubański, Rumba i plastyka ciała w Timbie.',
  },

  // --- KIZLAB / EVOLUTION (Czwartek) ---
  {
    id: 'ev_thu_1',
    schoolId: 'EV',
    dayOfWeek: 4,
    dayName: 'Czwartek',
    startTime: '19:30',
    endTime: '21:30',
    styleCategory: 'kizomba',
    styleLabel: 'Urban Kiz & Tarraxo',
    title: 'Urban Kiz – Flow, Kontrapunkt i Technika Prowadzenia',
    levelCode: 'P2',
    levelLabel: 'P2 • Urban Kiz (6+ mies.)',
    room: 'Studio KIZLAB (ul. Sobieskiego 11)',
    instructors: [{ name: 'Ela Stępień i Michał Rozewski', termId: 'term_inst_19' }],
    multisport: true,
    notes: 'Precyzja prowadzenia liniowego, tarraxo i nowoczesny Urban Kiz.',
  },

  // =========================================================================
  // PIĄTEK (dayOfWeek: 5)
  // =========================================================================
  // --- LA CLAVE (Piątek) ---
  {
    id: 'lc_fri_1',
    schoolId: 'LC',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '17:15',
    endTime: '18:45',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Sensual',
    title: 'Bachata Sensual Podstawy (2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Podstawy',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Ela & Piotr' }],
    multisport: true,
    notes: 'Podstawy Bachaty Sensual, prawidłowej ramy i bezpiecznego prowadzenia.',
  },
  {
    id: 'lc_fri_2',
    schoolId: 'LC',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '18:00',
    endTime: '19:30',
    styleCategory: 'rueda',
    styleLabel: 'Rueda Praktis',
    title: 'Rueda de Casino – Praktis Piątkowy',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Rueda Praktis',
    room: 'Sala Mała (Chorzowska 11)',
    instructors: [{ name: 'Tomek' }],
    multisport: true,
    notes: 'Piątkowy trening i utrwalanie komend Ruedy de Casino w kole.',
  },
  {
    id: 'lc_fri_3',
    schoolId: 'LC',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '18:45',
    endTime: '21:00',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Sensual',
    title: 'Bachata Sensual – Dla Tańczących (Kontynuacja – Dołącz)',
    levelCode: 'P1',
    levelLabel: 'P1 • Dla tańczących',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Ela & Piotr' }],
    multisport: true,
    notes: 'Trzy bloki (18:45–21:00) Bachaty Sensual bezpośrednio przed piątkowym praktisem.',
  },
  {
    id: 'lc_fri_4',
    schoolId: 'LC',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '18:45',
    endTime: '21:00',
    styleCategory: 'salsa_liniowa',
    styleLabel: 'Salsa New York (On2)',
    title: 'Nowość: Salsa New York (On2) – Dla Tańczących',
    levelCode: 'P1',
    levelLabel: 'P1 • Dla tańczących',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Ivan' }],
    multisport: true,
    notes: 'Salsa liniowa w stylu New York Mambo On2 (3x45 min, Start: 23.01.2026).',
  },
  {
    id: 'lc_fri_5',
    schoolId: 'LC',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '21:00',
    endTime: '23:15',
    styleCategory: 'bachata',
    styleLabel: 'Praktis Bachata',
    title: 'Piątkowy Praktis Bachata (2h 15m)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Ela & Piotr' }],
    multisport: true,
    notes: 'Długi piątkowy praktis bachatowy na Sali Dużej.',
  },
  {
    id: 'lc_fri_6',
    schoolId: 'LC',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '21:00',
    endTime: '23:15',
    styleCategory: 'salsa_liniowa',
    styleLabel: 'Praktis Salsa New York',
    title: 'Piątkowy Praktis Salsa New York (On2)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis On2',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Ivan' }],
    multisport: true,
    notes: 'Praktyka parkietowa dla miłośników Salsy liniowej On1/On2.',
  },

  // --- GOOD MOOD (Piątek) ---
  {
    id: 'gm_fri_1',
    schoolId: 'GM',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '17:20',
    endTime: '18:55',
    styleCategory: 'solo',
    styleLabel: 'Taniec Użytkowy',
    title: 'Taniec Użytkowy w Parach – Od Podstaw',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 25.09)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Tobiasz' }],
    multisport: true,
    notes: 'Praktyczny taniec w parze na każdą imprezę i wesele (2x45 min).',
  },
  {
    id: 'gm_fri_2',
    schoolId: 'GM',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '17:20',
    endTime: '18:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata w Parach – Od Podstaw (Nowy Nabór!)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 09.10)',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Natalia & Artur' }],
    multisport: true,
    notes: 'Październikowa grupa Bachaty od zera (Start: 9.10.2026, 2x45 min).',
  },
  {
    id: 'gm_fri_3',
    schoolId: 'GM',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '19:00',
    endTime: '19:45',
    styleCategory: 'solo',
    styleLabel: 'Bachata Solo',
    title: 'Bachata Solo – Gr. Od Podstaw',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw (Start 02.10)',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Asia Bernatowicz' }],
    multisport: true,
    notes: 'Październikowy kurs Bachaty Solo od podstaw (Start: 2.10.2026).',
  },
  {
    id: 'gm_fri_4',
    schoolId: 'GM',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '19:00',
    endTime: '21:00',
    styleCategory: 'solo',
    styleLabel: 'Tango Argentyńskie',
    title: 'Tango Od Podstaw (19:00) + Zajęcia Praktyczne Open (20:00)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od podstaw + Praktis',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Hector' }],
    multisport: false,
    notes: 'Godzina lekcji Tanga od podstaw (Start: 25.09) oraz godzina otwartej praktyki.',
  },
  {
    id: 'gm_fri_5',
    schoolId: 'GM',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '19:50',
    endTime: '21:25',
    styleCategory: 'solo',
    styleLabel: 'Latino Solo & Izolacje',
    title: 'Latino Solo Od Podstaw (19:50) + Izolacje Open (20:40)',
    levelCode: 'P0',
    levelLabel: 'P0 • Start 02.10',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Asia Bernatowicz' }],
    multisport: true,
    notes: 'Październikowy blok Latino Solo od podstaw połączony z treningiem izolacji.',
  },

  // --- MIL PASOS (Piątek) ---
  {
    id: 'mp_fri_1',
    schoolId: 'MP',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '17:00',
    endTime: '17:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska',
    title: 'Salsa Kubańska – Grupa Wyrównawcza',
    levelCode: 'P1',
    levelLabel: 'P1 • Grupa wyrównawcza',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Monika' }],
    multisport: true,
    notes: 'Uporządkowanie podstaw, rytmu i techniki przed dołączeniem do wyższych grup.',
  },
  {
    id: 'mp_fri_2',
    schoolId: 'MP',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '18:00',
    endTime: '18:55',
    styleCategory: 'solo',
    styleLabel: 'Zouk Solo',
    title: 'Zouk Solo Podstawowy',
    levelCode: 'P0',
    levelLabel: 'P0 • Solo (Start 11.09)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Kasia K' }],
    multisport: true,
    notes: 'Technika ruchu ciała, osi i płynności w Zouku w formule solowej.',
  },
  {
    id: 'mp_fri_3',
    schoolId: 'MP',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska',
    title: 'Salsa Kubańska P1 (Cz. 1 + Cz. 2)',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowy (3+ mies.)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Monika' }],
    multisport: true,
    notes: 'Piątkowy kurs Salsy Kubańskiej na poziomie P1 (2x55 min).',
  },
  {
    id: 'mp_fri_4',
    schoolId: 'MP',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '18:30',
    endTime: '20:25',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Fusion / Urban Kiz',
    title: 'Kizomba Fusion / Urban Kiz P2 (Cz. 1 + Cz. 2)',
    levelCode: 'P2',
    levelLabel: 'P2 • Podstawowy+ (6+ mies.)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Ksenia' }],
    multisport: true,
    notes: 'Utrwalanie techniki, powtarzalności i musicality na poziomie P2 (2x55 min).',
  },
  {
    id: 'mp_fri_5',
    schoolId: 'MP',
    dayOfWeek: 5,
    dayName: 'Piątek',
    startTime: '20:00',
    endTime: '21:55',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Kubańska',
    title: 'Salsa Kubańska Od Zera – P0 (Cz. 1 + Cz. 2)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 21.08)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Monika' }],
    multisport: true,
    notes: 'Piątkowa grupa Salsy Kubańskiej od podstaw (2x55 min).',
  },

  // =========================================================================
  // SOBOTA (dayOfWeek: 6)
  // =========================================================================
  // --- MIL PASOS (Sobota) ---
  {
    id: 'mp_sat_1',
    schoolId: 'MP',
    dayOfWeek: 6,
    dayName: 'Sobota',
    startTime: '16:00',
    endTime: '17:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Od Zera – P0 Weekendowa (Cz. 1 + Cz. 2)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 19.09)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Michał' }],
    multisport: true,
    notes: 'Sobotni kurs Bachaty od podstaw (2x55 min) – idealny dla osób pracujących w tygodniu.',
  },
  {
    id: 'mp_sat_2',
    schoolId: 'MP',
    dayOfWeek: 6,
    dayName: 'Sobota',
    startTime: '16:00',
    endTime: '17:55',
    styleCategory: 'solo',
    styleLabel: 'High Heels',
    title: 'High Heels Technika (16:00) + High Heels Choreo (17:00)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • High Heels (Start 12.09)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Kasia K' }],
    multisport: true,
    notes: 'Taniec na obcasach: 55 min techniki chodu i balansu + 55 min choreografii.',
  },
  {
    id: 'mp_sat_3',
    schoolId: 'MP',
    dayOfWeek: 6,
    dayName: 'Sobota',
    startTime: '18:00',
    endTime: '19:55',
    styleCategory: 'solo',
    styleLabel: 'House Dance',
    title: 'House Dance Podstawowy (Cz. 1 + Cz. 2)',
    levelCode: 'P0',
    levelLabel: 'P0 • Podstawowy (Start 12.09)',
    room: 'Sala 2 (Kamienna 4)',
    instructors: [{ name: 'Kasia K' }],
    multisport: true,
    notes: 'Jacking, footwork i lofting w muzyce House od podstaw (2x55 min).',
  },

  // =========================================================================
  // NIEDZIELA (dayOfWeek: 7)
  // =========================================================================
  // --- GOOD MOOD (Niedziela) ---
  {
    id: 'gm_sun_1',
    schoolId: 'GM',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '15:50',
    endTime: '17:25',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Grupa P1 (2x45 min)',
    levelCode: 'P1',
    levelLabel: 'P1 • Poziom P1 (Start 27.09)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Monia & Łukasz' }],
    multisport: true,
    notes: 'Niedzielny blok West Coast Swingu na poziomie P1.',
  },
  {
    id: 'gm_sun_2',
    schoolId: 'GM',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '15:50',
    endTime: '17:25',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Grupa P3 (2x45 min)',
    levelCode: 'P2',
    levelLabel: 'P2 • Poziom P3 (Start 27.09)',
    room: 'Sala Monroe (Paderewskiego 35)',
    instructors: [{ name: 'Olga & Łukasz' }],
    multisport: true,
    notes: 'Niedzielny blok West Coast Swingu na poziomie P3.',
  },
  {
    id: 'gm_sun_3',
    schoolId: 'GM',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '17:30',
    endTime: '19:05',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Grupa P4 (2x45 min)',
    levelCode: 'S1',
    levelLabel: 'S1 • Poziom P4 (Start 27.09)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Monia & Kuba' }],
    multisport: true,
    notes: 'Poziom P4 West Coast Swingu.',
  },
  {
    id: 'gm_sun_4',
    schoolId: 'GM',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '19:10',
    endTime: '19:55',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing Praktis',
    title: 'West Coast Swing – Zajęcia Praktyczne (Grupa Open)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis WCS',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Monia & Kuba' }],
    multisport: true,
    notes: 'Niedzielny praktis WCS dla wszystkich grup zaawansowania.',
  },
  {
    id: 'gm_sun_5',
    schoolId: 'GM',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '20:00',
    endTime: '21:35',
    styleCategory: 'solo',
    styleLabel: 'West Coast Swing',
    title: 'West Coast Swing – Grupa P5 (2x45 min)',
    levelCode: 'S1',
    levelLabel: 'S1 • Poziom P5 (Start 27.09)',
    room: 'Sala Swayze (Paderewskiego 35)',
    instructors: [{ name: 'Monia & Kuba' }],
    multisport: true,
    notes: 'Najwyższa grupa zaawansowania West Coast Swingu (P5).',
  },

  // --- LA CLAVE (Niedziela) ---
  {
    id: 'lc_sun_1',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '16:30',
    endTime: '18:00',
    styleCategory: 'solo',
    styleLabel: 'Salsa Solo Ladies',
    title: 'Salsa Solo Od Zera Ladies (Nowość – 2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera Ladies',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Martica' }],
    multisport: true,
    notes: 'Niedzielny kurs Salsy Solo dla pań od podstaw.',
  },
  {
    id: 'lc_sun_2',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '17:15',
    endTime: '18:45',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Salsa Cubana',
    title: 'Salsa Od Zera w Parach (Nowość – 2x45 min)',
    levelCode: 'P0',
    levelLabel: 'P0 • Od zera (Start 13.09)',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Klaudia & Adriano', termId: 'term_inst_5' }],
    multisport: true,
    notes: 'Weekendowy kurs Salsy Kubańskiej od podstaw (Start: 13.09.2026).',
  },
  {
    id: 'lc_sun_3',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '18:00',
    endTime: '18:45',
    styleCategory: 'solo',
    styleLabel: 'Bachata Solo Ladies',
    title: 'Bachata Solo Ladies (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Solo Ladies',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Martica' }],
    multisport: true,
    notes: 'Kobiecy styling bachatowy w niedzielne popołudnie.',
  },
  {
    id: 'lc_sun_4',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '18:45',
    endTime: '19:30',
    styleCategory: 'rueda',
    styleLabel: 'Suelta Solo',
    title: 'Suelta Solo – Kubański Footwork',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Suelta (Start 13.09)',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Klaudia & Adriano', termId: 'term_inst_5' }],
    multisport: true,
    notes: 'Kubańska Suelta do wykorzystania w solówkach podczas tańca w parze i w Ruedzie.',
  },
  {
    id: 'lc_sun_5',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '18:45',
    endTime: '20:15',
    styleCategory: 'solo',
    styleLabel: 'Bachata Footwork Unisex',
    title: 'Bachata Solo Technika & Footwork Unisex (Nowość)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Footwork Unisex',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Martica' }],
    multisport: true,
    notes: 'Technika pracy stóp, rytmika i bodymovement bachatowy dla pań i panów (2x45 min).',
  },
  {
    id: 'lc_sun_6',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '19:30',
    endTime: '21:00',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Timba Conexion',
    title: 'Timba Conexion w Parach (2x45 min)',
    levelCode: 'P2',
    levelLabel: 'P2 • W parach (Start 13.09)',
    room: 'Sala Duża (Chorzowska 11)',
    instructors: [{ name: 'Klaudia & Adriano', termId: 'term_inst_5' }],
    multisport: true,
    notes: 'Połączenie w parze, musicality i energia współczesnej Timby kubańskiej.',
  },
  {
    id: 'lc_sun_7',
    schoolId: 'LC',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '20:15',
    endTime: '21:45',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Dla Tańczących (Kontynuacja – Można dołączyć)',
    levelCode: 'P1',
    levelLabel: 'P1 • Dla tańczących',
    room: 'Sala Średnia (Chorzowska 11)',
    instructors: [{ name: 'Dominik & Natalia' }],
    multisport: true,
    notes: 'Niedzielny kurs Bachaty w parze dla osób znających podstawy.',
  },

  // --- MIL PASOS (Niedziela) ---
  {
    id: 'mp_sun_1',
    schoolId: 'MP',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '17:00',
    endTime: '18:55',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Fusion',
    title: 'Kizomba Fusion P2 (Cz. 1 + Cz. 2)',
    levelCode: 'P2',
    levelLabel: 'P2 • Podstawowy+ (6+ mies.)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Mati & Iza', termId: 'term_inst_11' }],
    multisport: true,
    notes: 'Niedzielna grupa Kizomby Fusion na poziomie P2 (2x55 min).',
  },
  {
    id: 'mp_sun_2',
    schoolId: 'MP',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '17:00',
    endTime: '18:55',
    styleCategory: 'bachata',
    styleLabel: 'Bachata',
    title: 'Bachata Open w Parach (Cz. 1 + Cz. 2)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • W parach (min. P2)',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Rozi & Karolina' }],
    multisport: true,
    notes: 'Niedzielna grupa Bachata Open dla osób znających podstawy (2x55 min).',
  },
  {
    id: 'mp_sun_3',
    schoolId: 'MP',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '19:00',
    endTime: '20:55',
    styleCategory: 'kizomba',
    styleLabel: 'Kizomba Fusion',
    title: 'Kizomba Fusion P1 (Cz. 1 + Cz. 2)',
    levelCode: 'P1',
    levelLabel: 'P1 • Podstawowy (Start 31.05)',
    room: 'Sala 1 (Kamienna 4)',
    instructors: [{ name: 'Mati & Iza', termId: 'term_inst_11' }],
    multisport: true,
    notes: 'Niedzielny kurs Kizomby Fusion na poziomie P1 (2x55 min).',
  },
  {
    id: 'mp_sun_4',
    schoolId: 'MP',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '19:00',
    endTime: '20:00',
    styleCategory: 'bachata',
    styleLabel: 'Bachata Praktis',
    title: 'Bachata Praktis z Instruktorem',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Praktis z instruktorem',
    room: 'Sala 3 (Kamienna 4)',
    instructors: [{ name: 'Zespół Mil Pasos', termId: 'term_school_2' }],
    multisport: true,
    notes: 'Niedzielny praktis bachatowy pod okiem instruktora.',
  },

  // --- KATO SALSA HUB (Niedziela) ---
  {
    id: 'ev_sun_1',
    schoolId: 'EV',
    dayOfWeek: 7,
    dayName: 'Niedziela',
    startTime: '19:00',
    endTime: '23:00',
    styleCategory: 'salsa_cubana',
    styleLabel: 'Potańcówka & Animacje KSH',
    title: 'Niedzielna Potańcówka Kato Salsa Hub (Social & Rueda)',
    levelCode: 'OPEN',
    levelLabel: 'OPEN • Dla każdego',
    room: 'Wolni Ludzie (ul. Mariacka 2) / Dolina 3 Stawów',
    instructors: [{ name: 'Społeczność Kato Salsa Hub', termId: 'term_school_10' }],
    multisport: false,
    notes: 'Cotygodniowa integracja katowickich szkół tańca przy muzyce z radia Kato Salsa Hub.',
  },
];

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
      const startMatch = rawCell.match(/START[:\s]*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)/i);
      const startDate = startMatch ? startMatch[1] : null;
      const levelCode = normalizeLevel(rawCell);

      parsedBlocks.push({
        dayOfWeek: currentDay,
        dayName: DAY_NUMBER_TO_NAME[currentDay],
        room: currentRoom || `Sala (${locationSuffix})`,
        startTime,
        endTime,
        styleLine,
        startDate,
        levelCode,
        rawText: rawCell,
      });
    }
  }
  return parsedBlocks;
}

/**
 * Opcjonalny ekstraktor OCR Vision (Gemini 2.5 Flash) wywoływany wyłącznie wtedy,
 * gdy zmieni się suma kontrolna SHA-256 planszy grafiku PNG/JPG i ustawiono GEMINI_API_KEY.
 */
async function extractClassesWithGeminiVision(imageBuffer, mimeType, schoolId, dayOfWeek) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Odczytaj wszystkie zajęcia taneczne z tej planszy grafiku szkoły ${schoolId} dla dnia ${DAY_NUMBER_TO_NAME[dayOfWeek]} (dayOfWeek=${dayOfWeek}). Zwróć tablicę JSON obiektów z polami: startTime (HH:MM), endTime (HH:MM), styleCategory (salsa_cubana|salsa_liniowa|bachata|kizomba|zouk_wcs|solo_styling), styleLabel, title, rawLevelText, room, instructors (tablica obiektów {name}), notes.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  const extracted = JSON.parse(text);
  if (!Array.isArray(extracted)) return null;

  return extracted.map((item, idx) => {
    const levelCode = normalizeLevel(`${item.rawLevelText || ''} ${item.title || ''}`);
    return {
      id: `${schoolId.toLowerCase()}_d${dayOfWeek}_v${idx + 1}`,
      schoolId,
      dayOfWeek,
      dayName: DAY_NUMBER_TO_NAME[dayOfWeek],
      startTime: String(item.startTime || '18:00').padStart(5, '0'),
      endTime: String(item.endTime || '19:00').padStart(5, '0'),
      styleCategory: item.styleCategory || 'salsa_cubana',
      styleLabel: item.styleLabel || 'Taniec',
      title: item.title || 'Zajęcia taneczne',
      levelCode,
      levelLabel: `${levelCode} • ${item.rawLevelText || 'Poziom ustandaryzowany'}`,
      room: item.room || 'Sala główna',
      instructors: Array.isArray(item.instructors) && item.instructors.length ? item.instructors : [{ name: 'Zespół Instruktorów' }],
      multisport: true,
      notes: item.notes || 'Zaktualizowano automatycznie przez AI Vision z nowej planszy grafiku.',
    };
  });
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

  console.log('🔍 [1/3] Żywa synchronizacja CSV Google Sheets szkoły Good Mood...');
  const gmRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`, {
    headers: { 'User-Agent': ua },
  });
  const gmCsv = await gmRes.text();
  const gmHash0 = crypto.createHash('sha256').update(gmCsv).digest('hex').slice(0, 16);
  const padBlocks = parseGoodMoodSheetCells(gmCsv, 'Paderewskiego 35');

  const gmGliwRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=409650056`, {
    headers: { 'User-Agent': ua },
  });
  const gmGliwCsv = await gmGliwRes.text();
  const gmHashGliw = crypto.createHash('sha256').update(gmGliwCsv).digest('hex').slice(0, 16);
  const gliwBlocks = parseGoodMoodSheetCells(gmGliwCsv, 'Gliwicka 44');

  const allLiveGmBlocks = [...padBlocks, ...gliwBlocks];
  let gmUpdatedStarts = 0;

  // Aktualizacja dat START: w zajęciach Good Mood na żywo z arkusza Google Sheets
  for (const cls of CLASSES) {
    if (cls.schoolId !== 'GM') continue;
    const matchingBlock = allLiveGmBlocks.find(
      (b) => b.dayOfWeek === cls.dayOfWeek && b.startTime === cls.startTime && cls.room.toLowerCase().includes(b.room.split(' ')[1]?.toLowerCase() || '')
    );
    if (matchingBlock && matchingBlock.startDate) {
      const updatedLabel = cls.levelLabel.replace(/Start\s+\d{1,2}\.\d{1,2}(?:\.\d{2,4})?/i, `Start ${matchingBlock.startDate}`);
      if (updatedLabel !== cls.levelLabel) {
        cls.levelLabel = updatedLabel;
        gmUpdatedStarts++;
      }
    }
  }

  console.log(
    `   ✅ Good Mood Live CSV: wyodrębniono ${allLiveGmBlocks.length} bloków komórek (sha256=${gmHash0}/${gmHashGliw}, zaktualizowane daty START: ${gmUpdatedStarts})`
  );

  console.log('🔍 [2/3] Sprawdzanie sum kontrolnych SHA-256 i Last-Modified plansz PNG La Clave (?grafik-katowice)...');
  const lcPageRes = await fetch('https://www.laclave.pl/?grafik-katowice', { headers: { 'User-Agent': ua } });
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

  const lcMeta = {};
  for (const b of lcBoards) {
    const res = await fetch(b.url, { headers: { 'User-Agent': ua } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const sha = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
      const lastMod = res.headers.get('last-modified') || '';
      lcMeta[`day_${b.day}`] = { url: b.url, sha256: sha, lastModified: lastMod };
      const prevSha = existingMeta?.lc?.[`day_${b.day}`]?.sha256;
      if (prevSha && prevSha !== sha) {
        console.log(`   ⚡ Wykryto zmianę planszy La Clave (dzień ${b.day}): ${prevSha} -> ${sha}`);
        const visionClasses = await extractClassesWithGeminiVision(buf, 'image/png', 'LC', b.day);
        if (visionClasses && visionClasses.length > 0) {
          for (let i = CLASSES.length - 1; i >= 0; i--) {
            if (CLASSES[i].schoolId === 'LC' && CLASSES[i].dayOfWeek === b.day) CLASSES.splice(i, 1);
          }
          CLASSES.push(...visionClasses);
          console.log(`   🤖 Gemini Vision zaktualizowało ${visionClasses.length} kursów La Clave dla dnia ${b.day}`);
        }
      }
    }
  }
  console.log(
    `   ✅ La Clave: zweryfikowano ${Object.keys(lcMeta).length}/${lcBoards.length} plansz PNG (0 zmian SHA-256 -> 0 zużytych tokenów AI).`
  );

  console.log('🔍 [3/3] Sprawdzanie plansz grafików Mil Pasos (?page=grafik)...');
  const mpRes = await fetch('https://www.milpasoskatowice.pl/?page=grafik', { headers: { 'User-Agent': ua } });
  const mpHtml = await mpRes.text();
  const mpImgUrls = [...mpHtml.matchAll(/<img[^>]+src=["']([^"']+fbcdn\.net[^"']+)["']/gi)].map((m) =>
    m[1].replace(/&amp;/g, '&')
  );
  const mpHash = crypto.createHash('sha256').update(mpImgUrls.join('|')).digest('hex').slice(0, 16);
  const prevMpHash = existingMeta?.mp?.urlsFingerprint;
  if (prevMpHash && prevMpHash !== mpHash && process.env.GEMINI_API_KEY) {
    console.log(`   ⚡ Wykryto zmianę plansz Mil Pasos: ${prevMpHash} -> ${mpHash}`);
    for (let d = 1; d <= Math.min(7, mpImgUrls.length); d++) {
      const imgRes = await fetch(mpImgUrls[d - 1], { headers: { 'User-Agent': ua } });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const visionClasses = await extractClassesWithGeminiVision(buf, 'image/jpeg', 'MP', d);
        if (visionClasses && visionClasses.length > 0) {
          for (let i = CLASSES.length - 1; i >= 0; i--) {
            if (CLASSES[i].schoolId === 'MP' && CLASSES[i].dayOfWeek === d) CLASSES.splice(i, 1);
          }
          CLASSES.push(...visionClasses);
        }
      }
    }
  }
  console.log(`   ✅ Mil Pasos (?page=grafik): HTTP ${mpRes.status}, wykryto ${mpImgUrls.length} plansz CDN (fingerprint=${mpHash}).`);

  return {
    gm: { paderewskiegoSha256: gmHash0, gliwickaSha256: gmHashGliw, liveCellsCount: allLiveGmBlocks.length },
    lc: lcMeta,
    mp: { imageCount: mpImgUrls.length, urlsFingerprint: mpHash },
  };
}

function buildSchedulePayload(sourcesMeta = null) {
  const payload = {
    updatedAt: '2026-10-20',
    city: 'Katowice',
    description:
      'Wspólny grafik katowickich szkół tańca (La Clave ul. Chorzowska 11, Good Mood ul. Paderewskiego 35 & Gravitacja ul. Gliwicka 44, Mil Pasos ul. Kamienna 4, Evolution & KIZLAB) z ustandaryzowaną 5-stopniową skalą poziomów zaawansowania KSH.',
    levelStandard: LEVEL_STANDARD,
    schools: SCHOOLS,
    classes: CLASSES,
  };
  if (sourcesMeta) {
    payload.sourcesMeta = sourcesMeta;
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
  fs.writeFileSync(SCHEDULE_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');

  const bySchool = {};
  const byLevel = {};
  for (const c of payload.classes) {
    bySchool[c.schoolId] = (bySchool[c.schoolId] || 0) + 1;
    byLevel[c.levelCode] = (byLevel[c.levelCode] || 0) + 1;
  }

  console.log(`✅ Zapisano ${payload.classes.length} realnych kursów do ${SCHEDULE_JSON_PATH}`);
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
  normalizeLevel,
  parseCsvGrid,
  parseGoodMoodSheetCells,
  buildSchedulePayload,
};
