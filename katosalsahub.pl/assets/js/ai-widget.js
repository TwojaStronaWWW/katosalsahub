/**
 * Uniwersalny Widget Asystenta AI — Kato Salsa Hub & Platform Standard v3.0
 *
 * Skumulowane najlepsze praktyki z ekosystemu TwojaStronaWWW, Fuego Lingua oraz Kato Salsa Hub:
 * - Zero-Bloat Vanilla JS ES6+ (brak zewnętrznych zależności, 0 kluczy API na frontendzie)
 * - Obsługa 11-modelowej kaskady High-Availability (6 dostawców API) po stronie VPS
 * - Priorytetowe przekazywanie leadów kontaktowych (telefon / e-mail omija cache i wyzwala Ntfy 1-Klik)
 * - Dynamic Knowledge Base (live RAG z bazy JSON/Wiki, np. Salsopedii `salsopedia.json` / `wiki.php`)
 * - Inteligentny Response Cache (Query Cache) w localStorage/sessionStorage:
 *   dwukrotne zadanie tego samego pytania zwraca odpowiedź natychmiast (0 ms) bez odpytywania AI
 * - Automatyczna inwalidacja cache i odświeżanie zapisanych odpowiedzi przy zmianie bazy wiedzy
 *   (nasłuchiwanie zdarzenia `salsopedia:updated`, `storage` oraz kontrola sumy kontrolnej `kbVersion`)
 * - Multi-Turn Memory (pamięć ostatnich 8 wiadomości w `sessionStorage`)
 * - Bezpieczny parser Markdown z pełnym escapowaniem HTML (ochrona XSS / OWASP)
 * - Zero-Downtime Local Fallback (pełna odpowiedź merytoryczna nawet przy braku sieci)
 * - Pełna dostępność WCAG 2.1 AA (ARIA, obsługa klawiatury, Escape, RWD 100dvh)
 */

const CATEGORY_LABELS = {
  steps: 'Kroki (Podstawy)',
  figures: 'Figury (Casino / Rueda)',
  dance: 'Taniec',
  styles: 'Style Tańca',
  music: 'Muzyka',
  instruments: 'Instrumenty',
  history: 'Historia',
  gods: 'Bogowie (Orishas)',
  bands: 'Zespoły i Artyści',
  instructors: 'Instruktorzy',
  schools: 'Szkoły Tańca'
};

/**
 * Bezpieczne formatowanie podstawowego Markdownu z ochroną przed XSS.
 * @param {string} text
 * @returns {string}
 */
function formatMarkdown(text) {
  if (!text) return '';
  let safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Pogrubienia **tekst**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Kursywa *tekst*
  safe = safe.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // Wypunktowania (- element lub * element)
  safe = safe.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  safe = safe.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  safe = safe.replace(/<\/ul>\s*<ul>/g, '');

  // Klikalne adresy URL (https://...), e-mail oraz linki wewnętrzne (#kontakt, salsopedia.html)
  safe = safe.replace(
    /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="tsw-ai-link">$1</a>'
  );
  safe = safe.replace(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    '<a href="mailto:$1" class="tsw-ai-link">$1</a>'
  );
  safe = safe.replace(
    /(^|\s)(#[a-zA-Z0-9_-]+)\b/g,
    '$1<a href="$2" class="tsw-ai-link">$2</a>'
  );
  safe = safe.replace(
    /(^|[\s(])((?:salsopedia|grafik)\.html(?:#[a-zA-Z0-9_-]+)?)/g,
    '$1<a href="$2" class="tsw-ai-link">$2</a>'
  );

  // Podział na akapity i nowe linie
  safe = safe.replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
  safe = safe.replace(/<\/li><br>/g, '</li>').replace(/<\/ul><br>/g, '</ul>');

  return safe;
}

/**
 * Normalizuje treść zapytania na potrzeby klucza pamięci podręcznej (Query Cache).
 * Dzięki temu zapytania "Co to jest Enchufla?" i "co to jest enchufla ?!" mają ten sam klucz
 * i drugie identyczne pytanie nie odpytuje ponownie modelu AI.
 * @param {string} text
 * @returns {string}
 */
function normalizeCacheQuery(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[?!.,;:()"'«»„”`~[\]{}/\\|_+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizuje tekst do wyszukiwania pełnotekstowego w bazie wiedzy (usuwanie diakrytyków PL/ES).
 * @param {string} text
 * @returns {string}
 */
function normalizeSearchText(text) {
  return normalizeCacheQuery(text);
}

/**
 * Wylicza deterministyczny skrót (FNV-1a 32-bit) reprezentujący wersję dynamicznej bazy wiedzy.
 * Każda zmiana w Salsopedii (dodanie hasła, zmiana definicji, weryfikacja, usunięcie)
 * natychmiast generuje nowy identyfikator wersji wiedzy.
 * @param {Array<Object>} entries
 * @returns {string}
 */
function computeKnowledgeVersion(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'kb_v0_empty';
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i] || {};
    const cats = Array.isArray(item.category) ? item.category.join(',') : String(item.category || '');
    const record = `${item.id || ''}|${item.term || ''}|${item.definition || ''}|${cats}|${item.status || ''}|${item.verification_count || 0}|${item.last_updated || ''}`;
    for (let j = 0; j < record.length; j++) {
      hash ^= record.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return `kb_v${entries.length}_${hash.toString(16)}`;
}

/**
 * Przeszukuje dynamiczną bazę wiedzy (np. Salsopedię) pod kątem zapytania użytkownika.
 * Obsługuje odmianę fleksyjną (rdzenie słów), nazwy pojęć, definicje, kategorie i źródła.
 * @param {string} question
 * @param {Array<Object>} entries
 * @param {number} limit
 * @returns {Array<Object>}
 */
function searchKnowledgeEntries(question, entries, limit = 5) {
  if (!question || !Array.isArray(entries) || entries.length === 0) return [];

  const qNorm = normalizeSearchText(question);
  if (!qNorm) return [];

  const stopWords = new Set([
    'co', 'to', 'jest', 'sa', 'jak', 'jaki', 'jaka', 'jakie', 'gdzie', 'kiedy',
    'czy', 'na', 'w', 'we', 'z', 'ze', 'do', 'od', 'po', 'o', 'i', 'a', 'oraz',
    'lub', 'albo', 'mi', 'sie', 'tym', 'ten', 'ta', 'te', 'oznacza', 'znaczy',
    'opowiedz', 'wyjasnij', 'powiedz', 'czym', 'kim', 'kto', 'mozna', 'jakis',
    'salsopedii', 'salsopedia', 'salsa', 'salsie', 'tancu', 'taniec', 'figura', 'krok'
  ]);

  const rawTokens = qNorm.split(' ').filter((t) => t.length >= 2 && !stopWords.has(t));
  const stems = rawTokens.map((t) => {
    if (t.length >= 6) return t.replace(/(ach|ami|owi|iem|om|ie|ow|ej|ym|im|ia|iu|ek|ka|ki|ce|ke|y|a|e|i|u|o)$/, '');
    if (t.length >= 5) return t.replace(/(ie|ow|ej|ym|ia|ka|ki|ce|y|a|e|i|u)$/, '');
    return t;
  }).filter((s) => s.length >= 3);

  const categoryAliases = {
    steps: ['krok', 'kroki', 'podstaw', 'basico', 'guapea'],
    figures: ['figur', 'rueda', 'ruedzie', 'komend', 'casino', 'wystep'],
    styles: ['styl', 'odmian', 'gatun', 'rodzaj'],
    music: ['muzyk', 'rytm', 'clave', 'utwor', 'piosen', 'radio', 'timba nation', 'maikiu', 'zeno'],
    instruments: ['instrument', 'beben', 'bebny', 'perkuj', 'perkus', 'conga', 'timbales', 'bongo', 'campana', 'guiro', 'guira', 'marakas', 'tres', 'bata', 'cajon', 'chekere', 'requinto', 'clave'],
    bands: ['zespol', 'orkiestr', 'artyst', 'kapel', 'spiewa', 'muzykant', 'van', 'havana'],
    history: ['histori', 'korzen', 'pochodz', 'tradycj', 'kuba'],
    gods: ['orish', 'orisza', 'bog', 'bostw', 'santeri', 'yorub', 'afro', 'chango', 'eleggua', 'yemaya', 'oshun'],
    instructors: ['instruktor', 'nauczyciel', 'prowadz', 'trener', 'uczy'],
    schools: ['szkol', 'kurs', 'zajec', 'lekcj', 'gdzie uczyc', 'good mood']
  };

  const matchedCategories = new Set();
  for (const [catKey, keywords] of Object.entries(categoryAliases)) {
    if (keywords.some((kw) => qNorm.includes(kw))) {
      matchedCategories.add(catKey);
    }
  }

  const scored = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || !entry.term) continue;

    const termNorm = normalizeSearchText(entry.term);
    const termClean = termNorm.replace(/\([^)]*\)/g, '').trim();
    const defNorm = normalizeSearchText(entry.definition || '');
    const cats = Array.isArray(entry.category) ? entry.category : (entry.category ? [entry.category] : []);

    let score = 0;

    // 1. Dokładne lub bezpośrednie wystąpienie nazwy hasła w pytaniu
    if (termNorm && qNorm === termNorm) {
      score += 120;
    } else if (termClean && termClean.length >= 3 && qNorm.includes(termClean)) {
      score += 85;
    } else if (termNorm && termNorm.length >= 3 && qNorm.includes(termNorm)) {
      score += 80;
    }

    // 2. Dopasowanie poszczególnych słów i rdzeni (stemming) w nazwie hasła
    for (const token of rawTokens) {
      if (termNorm.split(' ').includes(token)) {
        score += 45;
      } else if (token.length >= 3 && termNorm.includes(token)) {
        score += 30;
      }
      if (token.length >= 3 && defNorm.includes(token)) {
        score += 10;
      }
    }

    for (const stem of stems) {
      if (stem.length >= 3 && termNorm.includes(stem)) {
        score += 22;
      }
      if (stem.length >= 4 && defNorm.includes(stem)) {
        score += 6;
      }
    }

    // 3. Dopasowanie po kategorii
    for (const cat of cats) {
      if (matchedCategories.has(cat)) {
        score += 14;
      }
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || String(a.entry.term).localeCompare(String(b.entry.term), 'pl'));
  return scored.slice(0, limit).map((s) => s.entry);
}

const KSH_CORE_CONTEXT = [
  'PODSTAWOWE INFORMACJE O DZIAŁALNOŚCI KATO SALSA HUB (SALSA KATOWICE):',
  '- Kim jesteśmy (WAŻNE — TYLKO SALSA): Jesteśmy niezależną społecznością i Fundacją Kato Salsa Hub (https://katosalsahub.pl/) łączącą miłośników Salsy (Salsy Kubańskiej / Casino, Timby, Ruedy de Casino, Sonu Kubańskiego, Rumby oraz Salsy Liniowej) w Katowicach i na całym Śląsku ponad podziałami szkolnymi. Nasza społeczność i fundacja skupia się wyłącznie na Salsie i kulturze kubańskiej (nie zajmujemy się bachatą ani kizombą).',
  '- NIEDZIELNE POTAŃCÓWKI W WOLNYCH LUDZIACH (POD DACHEM): W KAŻDĄ NIEDZIELĘ w godz. 15:00–18:00 spotykamy się i tańczymy Salsę w lokalu Wolni Ludzie (ul. Mariacka 2, Katowice — róg ul. Mielęckiego). Wstęp otwarty dla każdego poziomu (od początkujących po zaawansowanych), nie trzeba mieć własnej pary! W niedziele oraz po godz. 17:00 wszystkie ulice wokół (Warszawska, Tylna Mariacka, Dworcowa, Wojewódzka, pl. Szramka) są DARMOWE, a jako główny Parking Rekomendowany polecamy ogromny, bezpłatny w niedzielę parking pod NOSPR-em (12 min wyznaczoną trasą pieszą przez kładkę).',
  '- PLENERY TANECZNE W KATOWICACH (WIOSNA–LATO I CIEPŁE DNI): 1) Kamienny Krąg w Dolinie Trzech Stawów (ul. Trzech Stawów 22, obok przystani i La Cantina) — w razie deszczu tańczymy pod zadaszoną wiatą przy przystani kajakowej UKS 4 / SUP Tomi (ul. Trzech Stawów 10); na mapie zaznaczyliśmy 3 toalety (w tym przy AMO Pizza) oraz 13-minutową trasę pieszą z darmowego Parkingu Rekomendowanego (Południe / Rolkostrada). 2) Amfiteatr pod NOSPR-em w Strefie Kultury (pl. Wojciecha Kilara 1, od wschodniej strony NOSPR przy fontannach) z darmowym w weekendy parkingiem od ul. Olimpijskiej.',
  '- WSPÓLNY GRAFIK I PORÓWNYWARKA CENNIKÓW SZKÓŁ TAŃCA W KATOWICACH (https://katosalsahub.pl/grafik.html): Tworzymy i prowadzimy ujednolicony, wspólny grafik katowickich szkół tańca (130 kursów tygodniowo: La Clave, Good Mood, Mil Pasos, Evolution) z ustandaryzowaną 5-stopniową skalą poziomów zaawansowania KSH (P0 Od zera, P1 Podstawowy, P2 Podstawowy+, S1 Średniozaawansowany/Zaawansowany, OPEN), kalkulatorem opłacalności cenników (La Clave: 45 min, karnety BEZTERMINOWE 4x 109 zł / 8x 189 zł / 10x 219 zł / Open 300 zł, dopłaty w blokach +15 zł i +10 zł lub 3. jednostka gratis przy 2 skreśleniach; Good Mood: 60 min, ważność 28 dni, 4h 100 zł [student 90 zł] / 8h 170 zł [student 160 zł] / Open 260 zł; Mil Pasos: 55 min, ważność 4 tyg., 4h 119 zł / 8h 199 zł / 12h 249 zł / 16h 299 zł / Open 399 zł, -10% dla studentów), kalendarzem wydarzeń i mapą szkół.',
  '- SALSOPEDIA (https://katosalsahub.pl/salsopedia.html): Tworzymy otwartą, społecznościową encyklopedię ponad 200 haseł (figury Casino, komendy Rueda de Casino, rytmy, instrumenty, historia, bóstwa Orishas, zespoły, instruktorzy i śląskie szkoły tańca) z edytorem Salsopedia Studio.',
  '- RADIO TIMBA NATION 24/7 (ODTWARZACZ NA STRONIE): Timba Nation Radio to niezależna internetowa stacja radiowa z Zurychu (Szwajcaria), założona i prowadzona przez DJ Maikiu na platformie Zeno.FM (https://zeno.fm/radio/timba-nation-radio/). To NIE jest radio tworzone ani finansowane przez Kato Salsa Hub — nasza społeczność udostępnia na stronie głównej dedykowany odtwarzacz tego strumienia (z podglądem granego utworu na żywo, obsługą ekranu blokady telefonu MediaSession oraz wyłącznikiem czasowym Sleep Timer: 15, 30, 60 min). Stacja gra 24/7 współczesną kubańską Timbę i Salsę Cubana (w tym autorskie sety DJ Maikiu - Cuban Salsa Mix) bez komercyjnych bloków reklamowych, ponieważ jest autorskim, pasjonackim projektem muzycznym DJ Maikiu promującym kubańską muzykę.',
  '- DANCEPULS (https://dancepuls.katosalsahub.pl/): Tworzymy cotygodniowy radar i agregator imprez tanecznych, warsztatów i festiwali na Śląsku i w Krakowie, publikowany co tydzień z ankietą na naszej grupie FB (https://www.facebook.com/groups/519446499987373), fanpage\'u FB (https://www.facebook.com/KatoSalsaHub) oraz Instagramie (https://www.instagram.com/katosalsahub/). Formularz zgłaszania imprez: https://tiny.pl/2bc8z7649.',
  '- INTEGRACJE, SPOTKANIA COMIESIĘCZNE I WYJAZDY: Organizujemy comiesięczne spotkania grupowe społeczności z systemem opasek (Leaders/Followers), grupy zniżkowe KSH na festiwale oraz wielki wiosenny Wyjazd Integracyjny Kato Salsa Hub (9–11 kwietnia, do 100 osób).'
].join('\n');

/**
 * Buduje zwięzły kontekst dynamiczny (RAG) z pasujących haseł Salsopedii / bazy wiedzy
 * oraz stałej karty działalności Kato Salsa Hub do przekazania routerowi AI.
 * @param {string} question
 * @param {Array<Object>} entries
 * @returns {string}
 */
function buildDynamicContext(question, entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const matches = searchKnowledgeEntries(question, safeEntries, 6);

  const lines = matches.map((item) => {
    const cats = Array.isArray(item.category)
      ? item.category.map((c) => CATEGORY_LABELS[c] || c).join(', ')
      : (CATEGORY_LABELS[item.category] || item.category || 'Ogólne');
    const verifiedBadge = item.status === 'verified' ? ' [Zweryfikowane]' : '';
    return `- ${item.term} (${cats})${verifiedBadge}: ${item.definition}`;
  });

  if (lines.length === 0) {
    return KSH_CORE_CONTEXT;
  }

  return (
    `${KSH_CORE_CONTEXT}\n\n` +
    `Aktualne powiązane hasła z Salsopedii (${safeEntries.length} pojęć w bazie):\n` +
    lines.join('\n')
  );
}

/**
 * Zwraca lokalną odpowiedź awaryjną (Zero-Downtime Fallback) dopasowaną do branży witryny
 * oraz dynamicznej bazy wiedzy (np. Salsopedii).
 * @param {string} question
 * @param {string} siteId
 * @param {Array<Object>} [knowledgeEntries=[]]
 * @returns {string}
 */
function getLocalFallbackAnswer(question, siteId = 'katosalsahub', knowledgeEntries = []) {
  const q = String(question || '').toLowerCase();
  const qNorm = normalizeSearchText(question);

  // ===========================================================================
  // 1. KATO SALSA HUB & SALSOPEDIA (Główne centrum wiedzy + wiedza o portalu)
  // ===========================================================================
  if (siteId === 'katosalsahub') {
    // 1a-0. Priorytetowe pytania o Wolnych Ludzi, niedziele 15:00-18:00, plenery, lokalizacje, parkingi oraz całą działalność KSH
    const isActivityOrEventScheduleQuestion =
      qNorm.includes('wolni ludzie') ||
      qNorm.includes('wolnych ludzi') ||
      qNorm.includes('mariack') ||
      qNorm.includes('niedziel') ||
      qNorm.includes('15 00') ||
      qNorm.includes('18 00') ||
      qNorm.includes('dzialalnosc') ||
      qNorm.includes('czym sie zajmuj') ||
      qNorm.includes('czym zajmuj') ||
      qNorm.includes('fundacj') ||
      qNorm.includes('spolecznosc') ||
      qNorm.includes('co robicie') ||
      qNorm.includes('kim jestescie') ||
      qNorm.includes('o was') ||
      qNorm.includes('wyjazd integracyjn') ||
      qNorm.includes('spotkania grupowe');

    if (isActivityOrEventScheduleQuestion) {
      return (
        `🌴 **Czym zajmuje się społeczność i Fundacja Kato Salsa Hub?**\n` +
        `Jesteśmy niezależną społecznością i fundacją łączącą miłośników **Salsy** (Salsy Kubańskiej / Casino, Timby, Ruedy de Casino oraz Sonu) w Katowicach i na całym Śląsku ponad podziałami szkolnymi:\n` +
        `- **🍹 Niedzielne potańcówki w Wolnych Ludziach (ul. Mariacka 2, Katowice):** W **każdą niedzielę w godz. 15:00–18:00** spotykamy się na otwartych potańcówkach i praktykach pod dachem (**Salsa Kubańska / Casino, Timba, Rueda de Casino, Son** — nie musisz mieć własnej pary!). W niedziele ulice wokół są darmowe, a jako główny **Parking Rekomendowany** polecamy bezpłatny w niedzielę **Parking pod NOSPR-em** (12 min spacerem przez kładkę).\n` +
        `- **💃 Darmowe plenery taneczne:** W sezonie wiosenno-letnim tańczymy na **Kamiennym Kręgu w Dolinie Trzech Stawów (ul. Trzech Stawów 22)** — w razie deszczu pod wiatą **UKS 4 / SUP Tomi (ul. Trzech Stawów 10)** — oraz pod **Amfiteatrem NOSPR (pl. Wojciecha Kilara 1)**.\n` +
        `- **🗓️ Wspólny Grafik Szkół Tańca (grafik.html), 📖 Salsopedia (salsopedia.html) i 📊 DancePuls:** Tworzymy ujednolicony **Wspólny Grafik Szkół Tańca w Katowicach** (130 kursów z ustandaryzowanymi poziomami P0–OPEN), społecznościową encyklopedię **Salsopedię** (ponad 200 haseł), agregator imprez **DancePuls** (https://dancepuls.katosalsahub.pl/), udostępniamy odtwarzacz **Radia Timba Nation 24/7** (stacji DJ Maikiu z Zurychu na Zeno.FM) oraz organizujemy wyjazdy i spotkania integracyjne!`
      );
    }

    // 1a-1. Priorytetowe pytania o Radio Timba Nation 24/7, DJ Maikiu, Zeno.FM, brak reklam i wyłącznik czasowy (Sleep Timer)
    const isRadioQuestion =
      qNorm.includes('radio') ||
      qNorm.includes('radia') ||
      qNorm.includes('radiu') ||
      qNorm.includes('timba nation') ||
      qNorm.includes('maikiu') ||
      qNorm.includes('zeno') ||
      qNorm.includes('odtwarzacz') ||
      qNorm.includes('stream') ||
      qNorm.includes('sleep') ||
      qNorm.includes('timer') ||
      qNorm.includes('wylacznik czasow') ||
      qNorm.includes('reklam');

    if (isRadioQuestion) {
      return (
        `📻 **Radio Timba Nation 24/7 — skąd pochodzi i dlaczego gra bez reklam?**\n` +
        `- **Skąd jest to radio:** **Timba Nation Radio** to niezależna internetowa stacja radiowa z **Zurychu (Szwajcaria)**, założona i prowadzona przez **DJ Maikiu** na platformie **Zeno.FM** (https://zeno.fm/radio/timba-nation-radio/). To nie jest nasza własna rozgłośnia — na portalu Kato Salsa Hub udostępniamy tancerzom zintegrowany odtwarzacz tego strumienia.\n` +
        `- **Dlaczego gra bez reklam:** Stacja jest autorskim, pasjonackim projektem muzycznym **DJ Maikiu** promującym współczesną kubańską **Timbę, Salsę Cubana (Casino) i Son** (w tym jego autorskie sety *Cuban Salsa Mix*), dzięki czemu nadaje czystą muzykę 24/7 bez komercyjnych bloków reklamowych.\n` +
        `- **Funkcje naszego odtwarzacza:** Wyświetla aktualnie grany utwór na żywo, działa przy zablokowanym ekranie telefonu (MediaSession) i posiada **wyłącznik czasowy (Sleep Timer: 15, 30 lub 60 min)** z płynnym wyciszaniem dźwięku!`
      );
    }

    const matches = searchKnowledgeEntries(question, knowledgeEntries, 4);

    // 1a. Pytania o konkretne hasła w Salsopedii (gdy znaleziono dopasowanie o wysokim priorytecie)
    const isGeneralMetaQuestion =
      (qNorm.includes('czym jest salsopedia') ||
        qNorm.includes('co to jest salsopedia') ||
        qNorm.includes('jak dziala salsopedia') ||
        qNorm.includes('jak dodac haslo') ||
        qNorm.includes('jak edytowac')) &&
      matches.length === 0;

    if (!isGeneralMetaQuestion && matches.length > 0) {
      const top = matches[0];
      const topNorm = normalizeSearchText(top.term);
      const topClean = topNorm.replace(/\([^)]*\)/g, '').trim();
      const directHit =
        (topClean && qNorm.includes(topClean)) ||
        matches.length >= 1;

      if (directHit) {
        if (matches.length === 1 || (topClean && qNorm === topClean)) {
          const cats = Array.isArray(top.category)
            ? top.category.map((c) => CATEGORY_LABELS[c] || c).join(', ')
            : (CATEGORY_LABELS[top.category] || top.category || 'Salsopedia');
          const statusInfo = top.status === 'verified'
            ? `*(Hasło zweryfikowane merytorycznie — potwierdzenia: ${top.verification_count || 1})*`
            : '*(Hasło społecznościowe w Salsopedii)*';
          return (
            `📖 **${top.term}** (${cats}):\n` +
            `${top.definition}\n\n` +
            `${statusInfo} Pełny słownik znajdziesz w zakładce salsopedia.html.`
          );
        }

        const listItems = matches.slice(0, 3).map((item) => {
          const cats = Array.isArray(item.category)
            ? item.category.map((c) => CATEGORY_LABELS[c] || c).join(', ')
            : (CATEGORY_LABELS[item.category] || item.category || 'Salsopedia');
          return `- **${item.term}** (*${cats}*): ${item.definition}`;
        });

        return (
          `W **Salsopedii** (aktualnie **${knowledgeEntries.length || 'ponad 200'} haseł**) znalazłem następujące informacje:\n` +
          listItems.join('\n') +
          `\n\nWszystkie pojęcia możesz przeglądać, filtrować i współtworzyć w widoku salsopedia.html.`
        );
      }
    }

    // 1b. Pytania o samą Salsopedię, jej działanie, moderację, weryfikację i kategorie
    if (
      qNorm.includes('salsoped') ||
      qNorm.includes('wikiped') ||
      qNorm.includes('encykloped') ||
      qNorm.includes('slownik') ||
      qNorm.includes('dodac haslo') ||
      qNorm.includes('moderacj') ||
      qNorm.includes('weryfikacj')
    ) {
      const totalCount = knowledgeEntries.length > 0 ? knowledgeEntries.length : 'ponad 200';
      return (
        `**Salsopedia** (salsopedia.html) to nasze główne, społecznościowe centrum wiedzy o kulturze kubańskiej i latynoskiej (obecnie liczy **${totalCount} haseł**):\n` +
        `- **11 kategorii tematycznych:** Kroki, Figury (Casino / Rueda), Taniec, Style, Muzyka, Instrumenty, Historia, Bogowie (Orishas), Zespoły i Artyści, Instruktorzy oraz Szkoły Tańca.\n` +
        `- **Salsopedia Studio & Live Diff:** Każdy tancerz może kliknąć **„+ Dodaj hasło”** lub zaproponować poprawkę z podglądem na żywo i porównywarką zmian.\n` +
        `- **Społecznościowa weryfikacja:** Hasła są weryfikowane przez instruktorów i społeczność, a każda zmiana w Salsopedii natychmiast aktualizuje moją wiedzę!`
      );
    }

    // 1c. Pytania o muzykę kubańską (gdy nie padło słowo radio)
    if (qNorm.includes('muzyk')) {
      return (
        `📻 **Muzyka kubańska i Radio Timba Nation 24/7 na naszej stronie:**\n` +
        `- Na stronie głównej udostępniamy odtwarzacz **Timba Nation Radio** — niezależnej stacji kubańskiej z **Zurychu (Szwajcaria)** prowadzonej przez **DJ Maikiu** na platformie **Zeno.FM**, grającej 24/7 wyselekcjonowaną **Timbę, Salsę Cubana i Son** bez reklam.\n` +
        `- Nasz odtwarzacz wyświetla aktualnie grany utwór, działa przy zablokowanym ekranie telefonu (MediaSession) oraz posiada **wyłącznik czasowy (Sleep Timer: 15, 30 lub 60 min)**!`
      );
    }

    // 1c-bis. Pytania o cenniki, karnety i opłacalność szkół tańca w Katowicach (La Clave, Good Mood, Mil Pasos)
    if (
      !qNorm.includes('od podstaw') &&
      !qNorm.includes('p0') &&
      (qNorm.includes('cennik') ||
        qNorm.includes('karnet') ||
        qNorm.includes('ile kosztuj') ||
        qNorm.includes('cena') ||
        qNorm.includes('ceny') ||
        qNorm.includes('oplaca'))
    ) {
      return (
        `💰 **Porównanie cenników 3 szkół tańca w Katowicach (kalkulator na grafik.html):**\n` +
        `- **🔴 La Clave (ul. Chorzowska 11):** jednostka **45 min**, karnety ilościowe są **BEZTERMINOWE** (Start 4x: **109 zł**, Eko 8x: **189 zł**, Pro 10x: **219 zł**, Open 4 tyg.: **300 zł**, jednorazowe: **30 zł**). W blokach 2–3x45 min: dopłata do 2. jednostki **+15 zł**, do 3. **+10 zł** (lub przy 2 skreśleniach z karnetu 3. jednostka **gratis**!).\n` +
        `- **🟡 Good Mood (ul. Paderewskiego 35 / Gliwicka 44):** jednostka **55–60 min**, ważność **28 dni** (4h: **100 zł** [student **90 zł**], 8h: **170 zł** [student **160 zł**], najtańszy **Open: 260 zł**, jednorazowe 1h: **35 zł**, 2h: **55 zł**).\n` +
        `- **🔵 Mil Pasos (ul. Kamienna 4):** jednostka **55 min**, ważność **4 tygodnie**, **-10% dla studentów** (4h: **119 zł**, 8h: **199 zł**, 12h: **249 zł**, 16h: **299 zł** [~18,69 zł/jedn.], Open: **399 zł**, Day Pass: **90 zł**).\n` +
        `- **💳 Karty sportowe:** Wszystkie 3 szkoły honorują karty **Multisport**, **Medicover Sport**, **FitProfit** oraz **PZU Sport**.\n` +
        `Pełny interaktywny kalkulator przeliczający koszt **60 minut tańca** znajdziesz w zakładce **Cenniki Szkół** na stronie grafik.html!`
      );
    }

    // 1d. Pytania o Wspólny Grafik Szkół, DancePuls, imprezy, sociale, warsztaty i kalendarz wydarzeń
    if (
      qNorm.includes('grafik') ||
      qNorm.includes('rozklad') ||
      qNorm.includes('dancepuls') ||
      qNorm.includes('imprez') ||
      qNorm.includes('potancow') ||
      qNorm.includes('social') ||
      qNorm.includes('wydarzen') ||
      qNorm.includes('kalendarz') ||
      qNorm.includes('weekend') ||
      qNorm.includes('festiwal')
    ) {
      return (
        `🔥 **Wspólny Grafik Szkół Tańca i imprezy Kato Salsa Hub:**\n` +
        `- **🗓️ Wspólny Grafik Szkół w Katowicach (grafik.html):** Zintegrowany rozkład 130 kursów tygodniowo (La Clave, Good Mood, Mil Pasos, Evolution) z ujednoliconą skalą poziomów (**P0, P1, P2, S1, OPEN**) oraz mapą szkół.\n` +
        `- **🍹 W każdą niedzielę od 15:00 do 18:00 — Wolni Ludzie (ul. Mariacka 2, Katowice):** Nasze regularne potańcówki i praktyki salsy pod dachem (Salsa Cubana / Casino, Timba, Rueda de Casino, Son).\n` +
        `- **💃 Plenery w Katowicach & 📊 DancePuls:** W ciepłe dni tańczymy na **Kamiennym Kręgu w Dolinie Trzech Stawów (ul. Trzech Stawów 22)** oraz pod **Amfiteatrem NOSPR (pl. Wojciecha Kilara 1)**, a pełne zestawienie imprez na Śląsku znajdziesz na **https://dancepuls.katosalsahub.pl/**.`
      );
    }

    // 1e. Pytania o lokalizacje, gdzie tańczymy, Wolnych Ludzi, parkingi, NOSPR, Dolinę Trzech Stawów i Katowice
    if (
      qNorm.includes('gdzie') ||
      qNorm.includes('lokalizac') ||
      qNorm.includes('katowic') ||
      qNorm.includes('trzech staw') ||
      qNorm.includes('3 staw') ||
      qNorm.includes('kamienn') ||
      qNorm.includes('pod dachem') ||
      qNorm.includes('wiat') ||
      qNorm.includes('toalet') ||
      qNorm.includes('nospr') ||
      qNorm.includes('parking') ||
      qNorm.includes('zaparkow') ||
      qNorm.includes('dojazd') ||
      qNorm.includes('slask') ||
      qNorm.includes('adres') ||
      qNorm.includes('mapa')
    ) {
      return (
        `📍 **Gdzie tańczymy i jak zaparkować w Katowicach?**\n` +
        `- **🍹 Wolni Ludzie – Pod dachem (ul. Mariacka 2, róg ul. Mielęckiego):** Spotykamy się tu **w każdą niedzielę w godz. 15:00–18:00**! W niedziele oraz po godz. 17:00 wszystkie parkingi miejskie wokół (ul. Warszawska, Tylna Mariacka, Dworcowa, Wojewódzka, pl. Szramka) są **DARMOWE**, a jako **Parking Rekomendowany** z ogromną liczbą miejsc polecamy darmowy w niedzielę **Parking pod NOSPR-em** (12 min wyznaczoną trasą pieszą przez kładkę nad al. Roździeńskiego).\n` +
        `- **💃 Kamienny Krąg (Dolina Trzech Stawów):** Główny parkiet plenerowy (ul. Trzech Stawów 22). W razie deszczu przenosimy się pod **zadaszoną wiatę przy przystani kajakowej** (UKS 4 / SUP Tomi, ul. Trzech Stawów 10). Na mapie zaznaczyliśmy 3 toalety oraz prostą 13-minutową trasę pieszą z darmowego **Parkingu Rekomendowanego (Południe / Rolkostrada)**.\n` +
        `- **🏛️ Amfiteatr pod NOSPR-em i Szkoły Partnerskie:** Plenerowy parkiet od wschodniej strony NOSPR (pl. Wojciecha Kilara 1) oraz szkoły tańca w centrum Katowic (m.in. La Clave, Mil Pasos, Good Mood, Evolution Dance Studio, KIZLAB, VAMULA.pl, Gravitacja / Dance++). Pełną mapę i plik KML znajdziesz w sekcji **#mapa** oraz w salsopedia.html!`
      );
    }

    // 1f. Pytania o kursy od podstaw (P0), cennik, Multisport, strój i zapisy
    if (
      qNorm.includes('cena') ||
      qNorm.includes('cennik') ||
      qNorm.includes('koszt') ||
      qNorm.includes('karnet') ||
      qNorm.includes('multisport') ||
      qNorm.includes('medicover') ||
      qNorm.includes('fitprofit') ||
      qNorm.includes('od podstaw') ||
      qNorm.includes('p0') ||
      qNorm.includes('poczatkuj') ||
      qNorm.includes('par') ||
      qNorm.includes('ubrac') ||
      qNorm.includes('but')
    ) {
      return (
        `💃 **Jak zacząć tańczyć w Katowicach (Kursy P0 i informacje praktyczne):**\n` +
        `- **Poziom P0 (od zupełnych podstaw):** Nie potrzebujesz pary ani doświadczenia — na zajęciach i na naszych niedzielnych praktykach w **Wolnych Ludziach (ul. Mariacka 2, 15:00–18:00)** rotujemy w parach w luźnej, wspierającej atmosferze.\n` +
        `- **Karty sportowe i karnety:** Katowickie szkoły (La Clave, Good Mood, Mil Pasos) honorują karty **Multisport**, **Medicover Sport**, **FitProfit** oraz **PZU Sport** (pojedyncze wejście to **30–35 PLN**, karnet 4 wejść **90–119 PLN**, w La Clave karnety ilościowe są **bezterminowe**, a pełny kalkulator cen znajdziesz w zakładce **Cenniki Szkół** na grafik.html).\n` +
        `- **Jak się ubrać:** Wygodny strój i zmienne obuwie na gładkiej, czystej podeszwie (np. sneakersy).`
      );
    }

    // 1g. Pytania o style tańca (Salsa Cubana / Casino, Rueda, Timba, Son, Rumba, Afro)
    if (
      qNorm.includes('styl') ||
      qNorm.includes('rued') ||
      qNorm.includes('casino') ||
      qNorm.includes('timb') ||
      qNorm.includes('rumb') ||
      qNorm.includes('son')
    ) {
      return (
        `🎶 **Style tańca w społeczności Kato Salsa Hub:**\n` +
        `- **Salsa Kubańska (Casino) & Timba:** Energetyczny taniec po kole i improwizacja do współczesnej muzyki kubańskiej.\n` +
        `- **Rueda de Casino:** Spektakularny taniec wielu par w kole na komendę lidera (*Cantante* — figury takie jak *Dile Que No*, *Enchufla*, *Dame*, *Setenta*).\n` +
        `- **Son Cubano, Rumba (Guaguancó, Yambú, Columbia), Afro Cubano i Salsa Liniowa:** Od tradycyjnych korzeni kubańskich po taniec liniowy. Zapytaj mnie o dowolną figurę z **Salsopedii** lub sprawdź kursy we **Wspólnym Grafiku Szkół** (grafik.html)!`
      );
    }

    // 1h. Domyślna odpowiedź Kato Salsa Hub
    return (
      `Cześć! 💃🕺 Jestem Asystentem **Kato Salsa Hub**. Chętnie odpowiem na każde pytanie o naszą działalność i salsę w Katowicach:\n` +
      `- **🍹 Niedzielne potańcówki w Wolnych Ludziach (ul. Mariacka 2):** w **każdą niedzielę od 15:00 do 18:00** + darmowe parkingi,\n` +
      `- **💃 Plenery taneczne:** Kamienny Krąg w **Dolinie Trzech Stawów** (z wiatą w razie deszczu) oraz **Amfiteatr NOSPR**,\n` +
      `- **🗓️ Wspólny Grafik Szkół Tańca (grafik.html), 📖 Salsopedia (ponad 200 haseł), 📻 Radio Timba Nation 24/7, 📊 DancePuls** oraz nasze wyjazdy i spotkania integracyjne.\n` +
      `O co chcesz zapytać?`
    );
  }

  // ===========================================================================
  // 2. FUEGO LINGUA (Szkoła języka hiszpańskiego)
  // ===========================================================================
  if (siteId === 'fuegolingua') {
    if (q.includes('cen') || q.includes('koszt') || q.includes('ile') || q.includes('pakiet')) {
      return (
        'Oferujemy elastyczne pakiety dopasowane do Twoich potrzeb:\n' +
        '- **Lekcja próbna (30 min):** **0 zł** (weryfikacja poziomu i celów)\n' +
        '- **Zajęcia indywidualne 1-na-1 (60 min):** od **99 zł** (w pakiecie 10 lekcji: **890 zł**)\n' +
        '- **Kurs w mini-grupie (2-4 osoby):** od **49 zł** / 60 min\n' +
        '- **Hiszpański w parze (Duo):** **69 zł** / os. za 60 min\n' +
        'Napisz do nas przez formularz **#kontakt** lub na **kontakt@fuegolingua.pl**, aby odebrać darmową lekcję!'
      );
    }
    if (q.includes('próbn') || q.includes('probn') || q.includes('darmow') || q.includes('bezpłatn') || q.includes('bezplatn') || q.includes('zacząć')) {
      return (
        '**Bezpłatna lekcja próbna trwa 30 minut** i jest całkowicie niezobowiązująca! ' +
        'Poznajemy się, sprawdzamy Twój poziom, rozmawiamy po hiszpańsku i ustalamy plan nauki. ' +
        'Zapisz się przez formularz w sekcji **#kontakt** lub napisz na **kontakt@fuegolingua.pl**.'
      );
    }
    return (
      '¡Hola! 🇪🇸 W **Fuego Lingua** uczymy żywego języka hiszpańskiego online i stacjonarnie (od podstaw A1 do C1, w tym konwersacje, DELE/SIELE oraz hiszpański biznesowy). ' +
      'Pierwsza **lekcja próbna (30 min) jest bezpłatna (0 zł)**! Zostaw wiadomość w sekcji **#kontakt** lub napisz na **kontakt@fuegolingua.pl**.'
    );
  }

  // ===========================================================================
  // 3. TWOJASTRONAWWW / DOMYŚLNY SZABLON B2B
  // ===========================================================================
  if (q.includes('cen') || q.includes('koszt') || q.includes('ile') || q.includes('wycen') || q.includes('pakiet') || q.includes('abonament')) {
    return (
      'Oferujemy przejrzyste pakiety dopasowane do etapu rozwoju firmy:\n' +
      '- **Strona One-Page / Landing Page:** od **1 900 PLN netto** (lub **199 PLN / mies.**)\n' +
      '- **Strona Firmowa Multi-Page (3-7 podstron):** od **3 500 PLN netto** (lub **299 PLN / mies.**)\n' +
      '- **Dedykowana Platforma + Asystent AI RAG:** od **5 900 PLN netto** (lub **449 PLN / mies.**)\n' +
      'Każda wycena i konsultacja jest bezpłatna — napisz na **kontakt@twojastronawww.pl** lub przejdź do sekcji **#kontakt**!'
    );
  }

  if (q.includes('wordpress') || q.includes('szybk') || q.includes('wydajn') || q.includes('lighthouse') || q.includes('technolog')) {
    return (
      'Rezygnujemy z ciężkich kreatorów i przeładowanego WordPressa na rzecz czystej architektury **Platform-First (HTML5, CSS3, Vanilla JS ES6+)** oraz globalnej sieci **Cloudflare CDN**. ' +
      'Dzięki temu nasze strony ładują się w **poniżej 0,8 sekundy**, osiągają **95-100/100 pkt w Google Lighthouse** i są odporne na typowe luki wtyczek.'
    );
  }

  if (q.includes('proces') || q.includes('współprac') || q.includes('wspolprac') || q.includes('krok') || q.includes('czas') || q.includes('jak długo') || q.includes('etap')) {
    return (
      'Współpraca przebiega w **4 prostych krokach** i trwa zazwyczaj **od 5 do 14 dni roboczych**:\n' +
      '- **1. Konsultacja i strategia** (1-2 dni) — poznajemy cele biznesowe i grupę docelową\n' +
      '- **2. Projekt UX/UI i copywriting** (2-4 dni) — tworzymy układ nastawiony na konwersję\n' +
      '- **3. Kodowanie, testy i integracja AI** (3-5 dni) — budujemy ultraszybką stronę z wynikami 95-100/100\n' +
      '- **4. Wdrożenie produkcyjne i opieka** — konfigurujemy domenę, SSL, Cloudflare i analitykę.'
    );
  }

  if (q.includes('ai') || q.includes('asystent') || q.includes('czat') || q.includes('bot') || q.includes('rag')) {
    return (
      'Wdrażamy **inteligentnych Asystentów AI (RAG)** wytrenowanych wyłącznie na bazie wiedzy Twojej firmy i Salsopedii. ' +
      'Asystent posiada pamięć podręczną zapytań (**Response Cache**), automatycznie aktualizuje odpowiedzi po zmianie bazy wiedzy i działa 24/7. ' +
      'Skontaktuj się z nami przez **#kontakt**, aby przetestować demo dla Twojej branży!'
    );
  }

  return (
    'Dziękuję za wiadomość! Chętnie pomożemy dopasować rozwiązanie do Twoich potrzeb. ' +
    'Skorzystaj z formularza w sekcji **#kontakt** lub napisz bezpośrednio na **kontakt@twojastronawww.pl** — odpowiadamy zazwyczaj w ciągu kilku godzin.'
  );
}

/**
 * Szybkie podpowiedzi (Quick Prompts) dopasowane do identyfikatora witryny.
 */
const QUICK_PROMPTS_MAP = {
  twojastronawww: [
    'Ile kosztuje strona WWW?',
    'Jak wygląda proces współpracy?',
    'Dlaczego kod zamiast WordPressa?',
    'Jak działa asystent AI na stronie?'
  ],
  fuegolingua: [
    'Bezpłatna lekcja próbna',
    'Ile kosztuje kurs hiszpańskiego?',
    'Zajęcia indywidualne czy grupowe?',
    'Hiszpański w biznesie / branżowy'
  ],
  katosalsahub: [
    'Co dzieje się w Wolnych Ludziach w niedzielę (15:00–18:00)?',
    'Gdzie tańczymy w Katowicach i gdzie za darmo zaparkować?',
    'Czym zajmuje się społeczność i Fundacja Kato Salsa Hub?',
    'Wyjaśnij figury: Dile Que No, Enchufla i Setenta'
  ]
};

/**
 * Inicjalizuje widget czatu AI w drzewie DOM.
 * @param {Document} [doc=document]
 * @param {Window} [win=window]
 * @param {Object} [options={}]
 */
function initAiWidget(doc = globalThis.document, win = globalThis.window, options = {}) {
  if (!doc || !doc.body) return null;

  // Zapobieganie wielokrotnej inicjalizacji
  const existingRoot = doc.getElementById('tsw-ai-widget-root');
  if (existingRoot && !options.forceReinit) {
    return null;
  }
  if (existingRoot && options.forceReinit) {
    existingRoot.remove?.();
  }

  const scriptEl =
    doc.querySelector('script[data-site-id]') ||
    doc.querySelector('script[src*="ai-widget.js"]') ||
    doc.querySelector('script[src*="widget.js"]');

  const siteId = (
    options.siteId ||
    scriptEl?.getAttribute('data-site-id') ||
    'katosalsahub'
  ).toLowerCase();

  const isLocalhost =
    win?.location?.hostname === 'localhost' || win?.location?.hostname === '127.0.0.1';
  const defaultRouterUrl = isLocalhost
    ? 'http://localhost:8085/chat-router.php'
    : 'https://ai.twojastronawww.pl/chat-router.php';
  const routerUrl =
    options.routerUrl || scriptEl?.getAttribute('data-router-url') || defaultRouterUrl;
  const title =
    options.title ||
    scriptEl?.getAttribute('data-title') ||
    (siteId === 'katosalsahub' ? 'Asystent Kato Salsa Hub' : 'Asystent AI');
  const kbUrl =
    options.kbUrl ||
    scriptEl?.getAttribute('data-kb-url') ||
    (siteId === 'katosalsahub' ? 'assets/data/salsopedia.json' : '');
  const kbApiUrl =
    options.kbApiUrl ||
    scriptEl?.getAttribute('data-kb-api') ||
    (siteId === 'katosalsahub' ? 'assets/php/wiki.php?action=list' : '');

  const storageKey = 'tsw_ai_history_' + siteId;
  const cacheStorageKey = 'tsw_ai_cache_v42_' + siteId;
  const cacheTtlMs = Number(options.cacheTtlMs) || 24 * 60 * 60 * 1000;
  const quickPrompts = QUICK_PROMPTS_MAP[siteId] || QUICK_PROMPTS_MAP.katosalsahub;

  // Stan dynamicznej bazy wiedzy (np. Salsopedii) i wersji wiedzy
  const existingGlobalTerms = Array.isArray(win?.__SALSOPEDIA_TERMS__) && win.__SALSOPEDIA_TERMS__.length > 0
    ? win.__SALSOPEDIA_TERMS__
    : (Array.isArray(win?.AppState?.terms) && win.AppState.terms.length > 0 ? win.AppState.terms : []);
  let knowledgeEntries = Array.isArray(options.initialKnowledge)
    ? [...options.initialKnowledge]
    : [...existingGlobalTerms];
  let kbVersion = computeKnowledgeVersion(knowledgeEntries);

  // Pamięć podręczna odpowiedzi (Response Cache): zapobiega ponownemu odpytywaniu AI przy tym samym pytaniu,
  // oraz automatycznie inwaliduje wpisy, gdy zmieni się kbVersion (np. po aktualizacji Salsopedii).
  let responseCache = { kbVersion, entries: {} };

  function loadResponseCache() {
    try {
      const storage = win?.localStorage || win?.sessionStorage;
      const raw = storage?.getItem(cacheStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.entries) {
          if (knowledgeEntries.length > 0 && parsed.kbVersion !== kbVersion) {
            responseCache = { kbVersion, entries: {} };
            saveResponseCache();
          } else {
            responseCache = {
              kbVersion: parsed.kbVersion || kbVersion,
              entries: parsed.entries || {}
            };
          }
        }
      }
    } catch (_) {
      responseCache = { kbVersion, entries: {} };
    }
  }

  function saveResponseCache() {
    try {
      const storage = win?.localStorage || win?.sessionStorage;
      storage?.setItem(cacheStorageKey, JSON.stringify(responseCache));
    } catch (_) {}
  }

  function hasContactPii(text) {
    const s = String(text || '');
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phoneRegex = /(?:\+?48[\s.\-()]*)?(?:\d[\s.\-()]*){8}\d/;
    return emailRegex.test(s) || phoneRegex.test(s);
  }

  function getCachedAnswer(question) {
    const normQ = normalizeCacheQuery(question);
    if (!normQ || hasContactPii(question)) return null;

    if (knowledgeEntries.length > 0 && responseCache.kbVersion !== kbVersion) {
      responseCache = { kbVersion, entries: {} };
      saveResponseCache();
      return null;
    }

    const item = responseCache.entries?.[normQ];
    if (!item || !item.answer) return null;

    const now = Date.now();
    if (item.ts && now - item.ts > cacheTtlMs) {
      delete responseCache.entries[normQ];
      saveResponseCache();
      return null;
    }

    if (knowledgeEntries.length > 0 && item.kbVersion && item.kbVersion !== kbVersion) {
      delete responseCache.entries[normQ];
      saveResponseCache();
      return null;
    }

    return item.answer;
  }

  function setCachedAnswer(question, answer, source = 'ai') {
    const normQ = normalizeCacheQuery(question);
    if (!normQ || !answer || hasContactPii(question)) return;
    if (!responseCache.entries || responseCache.kbVersion !== kbVersion) {
      responseCache = { kbVersion, entries: {} };
    }
    responseCache.kbVersion = kbVersion;
    responseCache.entries[normQ] = {
      answer: String(answer),
      kbVersion,
      source,
      ts: Date.now()
    };
    saveResponseCache();
  }

  const style = doc.createElement('style');
  style.id = 'tsw-ai-widget-styles';
  style.textContent = `
    .tsw-ai-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--red, #d90429) 0%, var(--orange, #fb5607) 100%);
      color: #ffffff;
      box-shadow: 0 8px 24px rgba(217, 4, 41, 0.45);
      border: 2px solid rgba(255, 255, 255, 0.35);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
    }
    .tsw-ai-btn:hover,
    .tsw-ai-btn:focus-visible {
      transform: scale(1.08);
      box-shadow: 0 12px 30px rgba(251, 86, 7, 0.6);
      outline: 3px solid var(--yellow, #ffbe0b);
      outline-offset: 2px;
    }
    .tsw-ai-btn svg {
      width: 28px;
      height: 28px;
      fill: currentColor;
    }
    .fab-add,
    #addTermBtn {
      bottom: 100px !important;
      right: 27px !important;
    }
    .tsw-ai-window {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 395px;
      max-width: calc(100vw - 32px);
      height: 550px;
      max-height: calc(100vh - 120px);
      background: var(--bg-dark, #0f172a);
      border: 1px solid rgba(255, 190, 11, 0.28);
      border-radius: 18px;
      box-shadow: 0 22px 48px rgba(0, 0, 0, 0.78);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: opacity 0.25s, transform 0.25s, visibility 0.25s;
      opacity: 0;
      transform: translateY(16px) scale(0.96);
      visibility: hidden;
      pointer-events: none;
    }
    .tsw-ai-window.tsw-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      visibility: visible;
      pointer-events: auto;
    }
    @media (max-width: 600px) {
      .tsw-ai-btn {
        bottom: 16px;
        right: 16px;
        width: 54px;
        height: 54px;
      }
      .fab-add,
      #addTermBtn {
        bottom: 84px !important;
        right: 16px !important;
      }
      .tsw-ai-window {
        bottom: 80px;
        right: 12px;
        left: 12px;
        width: auto;
        max-width: none;
        height: min(500px, calc(100vh - 100px));
        max-height: calc(100dvh - 100px);
      }
    }
    .tsw-ai-header {
      background: linear-gradient(135deg, #1a1118 0%, #0f172a 100%);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 190, 11, 0.18);
    }
    .tsw-ai-title {
      color: #f8fafc;
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tsw-ai-dot {
      width: 9px;
      height: 9px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 10px #10b981;
    }
    .tsw-ai-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tsw-ai-icon-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #cbd5e1;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 6px 8px;
      transition: background 0.15s, color 0.15s;
    }
    .tsw-ai-icon-btn:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
    }
    .tsw-ai-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #0a0a0f;
    }
    .tsw-ai-msg {
      max-width: 88%;
      padding: 11px 14px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.55;
      word-wrap: break-word;
    }
    .tsw-ai-msg ul {
      margin: 6px 0 4px 18px;
      padding: 0;
    }
    .tsw-ai-msg li {
      margin-bottom: 4px;
    }
    .tsw-ai-msg strong {
      color: var(--yellow, #ffbe0b);
      font-weight: 700;
    }
    .tsw-ai-link {
      color: var(--yellow, #ffbe0b);
      text-decoration: underline;
      font-weight: 600;
    }
    .tsw-ai-msg-bot {
      background: #181822;
      color: #f1f5f9;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .tsw-ai-msg-user {
      background: linear-gradient(135deg, var(--red, #d90429) 0%, var(--orange, #fb5607) 100%);
      color: #ffffff;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .tsw-ai-msg-user strong {
      color: #ffffff;
    }
    .tsw-ai-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 16px 10px;
      background: #0a0a0f;
    }
    .tsw-ai-chips.tsw-hidden {
      display: none;
    }
    .tsw-ai-chip {
      background: rgba(255, 190, 11, 0.1);
      color: #fde68a;
      border: 1px solid rgba(255, 190, 11, 0.32);
      border-radius: 999px;
      padding: 6px 11px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }
    .tsw-ai-chip:hover {
      background: rgba(255, 190, 11, 0.22);
      transform: translateY(-1px);
    }
    .tsw-ai-form {
      display: flex;
      padding: 12px;
      background: #14141d;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      gap: 8px;
    }
    .tsw-ai-input {
      flex: 1;
      background: #0a0a0f;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 10px;
      padding: 10px 12px;
      color: #f8fafc;
      font-size: 13.5px;
      outline: none;
    }
    .tsw-ai-input:focus {
      border-color: var(--yellow, #ffbe0b);
    }
    .tsw-ai-input.tsw-input-listening {
      border-color: var(--red, #d90429);
      box-shadow: 0 0 0 2px rgba(217, 4, 41, 0.25);
    }
    .tsw-ai-voice-btn {
      width: 40px;
      min-width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #cbd5e1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
    }
    .tsw-ai-voice-btn:hover,
    .tsw-ai-voice-btn:focus-visible {
      background: rgba(255, 190, 11, 0.14);
      border-color: var(--yellow, #ffbe0b);
      color: var(--yellow, #ffbe0b);
      outline: none;
    }
    .tsw-ai-voice-btn svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
      pointer-events: none;
    }
    .tsw-ai-voice-btn.tsw-listening {
      background: linear-gradient(135deg, var(--red, #d90429) 0%, var(--orange, #fb5607) 100%);
      border-color: rgba(255, 255, 255, 0.5);
      color: #ffffff;
      animation: tswVoicePulse 1.3s infinite ease-in-out;
    }
    @keyframes tswVoicePulse {
      0% { box-shadow: 0 0 0 0 rgba(217, 4, 41, 0.65); }
      70% { box-shadow: 0 0 0 8px rgba(217, 4, 41, 0); }
      100% { box-shadow: 0 0 0 0 rgba(217, 4, 41, 0); }
    }
    .tsw-ai-send {
      background: linear-gradient(135deg, var(--red, #d90429) 0%, var(--orange, #fb5607) 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 0 16px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .tsw-ai-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .tsw-ai-typing {
      font-size: 12px;
      color: #94a3b8;
      font-style: italic;
    }
  `;
  doc.head?.appendChild(style);

  const root = doc.createElement('div');
  root.id = 'tsw-ai-widget-root';
  root.setAttribute('data-nosnippet', '');
  root.innerHTML = `
    <button class="tsw-ai-btn" id="tswAiToggleBtn" type="button" aria-label="Otwórz czat z asystentem AI" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
    </button>
    <div class="tsw-ai-window" id="tswAiWindow" role="dialog" aria-label="${title}">
      <div class="tsw-ai-header">
        <div class="tsw-ai-title"><span class="tsw-ai-dot"></span> ${title}</div>
        <div class="tsw-ai-actions">
          <button class="tsw-ai-icon-btn" id="tswAiClearBtn" type="button" title="Nowa rozmowa" aria-label="Wyczyść historię rozmowy">&#x21bb;</button>
          <button class="tsw-ai-icon-btn" id="tswAiCloseBtn" type="button" title="Zamknij" aria-label="Zamknij okno czatu">&times;</button>
        </div>
      </div>
      <div class="tsw-ai-messages" id="tswAiMessages" aria-live="polite"></div>
      <div class="tsw-ai-chips" id="tswAiChips"></div>
      <form class="tsw-ai-form" id="tswAiForm">
        <input type="text" class="tsw-ai-input" id="tswAiInput" placeholder="Zadaj pytanie (np. o Salsopedię)..." maxlength="500" autocomplete="off" required />
        <button type="button" class="tsw-ai-voice-btn" id="tswAiVoiceBtn" title="Zadaj pytanie głosem (mikrofon)" aria-label="Zadaj pytanie głosem" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
        </button>
        <button type="submit" class="tsw-ai-send" id="tswAiSend">Wyślij</button>
      </form>
    </div>
  `;
  doc.body.appendChild(root);

  const toggleBtn = doc.getElementById('tswAiToggleBtn');
  const closeBtn = doc.getElementById('tswAiCloseBtn');
  const clearBtn = doc.getElementById('tswAiClearBtn');
  const chatWindow = doc.getElementById('tswAiWindow');
  const chatForm = doc.getElementById('tswAiForm');
  const chatInput = doc.getElementById('tswAiInput');
  const voiceBtn = doc.getElementById('tswAiVoiceBtn');
  const messagesContainer = doc.getElementById('tswAiMessages');
  const chipsContainer = doc.getElementById('tswAiChips');
  const sendBtn = doc.getElementById('tswAiSend');

  // Obsługa dyktowania głosowego (Web Speech API — Tryb Bezpieczny: tekst trafia na żywo do pola tekstowego)
  const defaultPlaceholder = chatInput?.getAttribute('placeholder') || 'Zadaj pytanie (np. o Salsopedię)...';
  const SpeechRecognitionCtor = win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
  let recognition = null;
  let isListening = false;
  let voiceBaseText = '';
  let lastVoiceErrorPlaceholder = '';

  function setVoiceListeningState(active, customPlaceholder = '') {
    isListening = Boolean(active);
    if (voiceBtn) {
      voiceBtn.classList.toggle('tsw-listening', isListening);
      voiceBtn.setAttribute('aria-pressed', String(isListening));
      voiceBtn.setAttribute(
        'title',
        isListening ? 'Zatrzymaj dyktowanie (Słucham...)' : 'Zadaj pytanie głosem (mikrofon)'
      );
      voiceBtn.setAttribute(
        'aria-label',
        isListening ? 'Zatrzymaj dyktowanie głosowe' : 'Zadaj pytanie głosem'
      );
    }
    if (chatInput) {
      chatInput.classList.toggle('tsw-input-listening', isListening);
      chatInput.setAttribute(
        'placeholder',
        customPlaceholder || (isListening ? '🎙️ Słucham... mów teraz po polsku' : defaultPlaceholder)
      );
    }
  }

  function stopVoiceRecognition() {
    lastVoiceErrorPlaceholder = '';
    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch (_) {}
    }
    setVoiceListeningState(false);
  }

  function toggleVoiceRecognition() {
    if (isListening) {
      stopVoiceRecognition();
      chatInput?.focus?.();
      return false;
    }

    const Ctor = win?.SpeechRecognition || win?.webkitSpeechRecognition || SpeechRecognitionCtor;
    if (typeof Ctor !== 'function') {
      setVoiceListeningState(false, 'Dyktowanie głosowe wymaga Chrome, Edge lub Safari');
      chatInput?.focus?.();
      return false;
    }

    try {
      if (!recognition) {
        recognition = new Ctor();
        recognition.lang = 'pl-PL';
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          lastVoiceErrorPlaceholder = '';
          setVoiceListeningState(true);
        };

        recognition.onresult = (event) => {
          if (!chatInput || !event || !event.results) return;
          lastVoiceErrorPlaceholder = '';
          let finalChunk = '';
          let interimChunk = '';
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res && res[0] && res[0].transcript ? String(res[0].transcript) : '';
            if (res.isFinal) {
              finalChunk += transcript;
            } else {
              interimChunk += transcript;
            }
          }
          const spoken = (finalChunk + interimChunk).replace(/\s+/g, ' ').trim();
          const combined = [voiceBaseText, spoken].filter(Boolean).join(' ').slice(0, 500);
          chatInput.value = combined;
        };

        recognition.onerror = (event) => {
          const code = event?.error || '';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            lastVoiceErrorPlaceholder = '⚠️ Zezwól na mikrofon (ikona obok adresu URL)';
          } else if (code === 'audio-capture') {
            lastVoiceErrorPlaceholder = '⚠️ Nie wykryto mikrofonu w urządzeniu';
          } else if (code === 'no-speech') {
            lastVoiceErrorPlaceholder = '🎙️ Nie usłyszałem głosu — kliknij mikrofon ponownie';
          } else if (code === 'network') {
            lastVoiceErrorPlaceholder = '⚠️ Przeglądarka blokuje usługę mowy (np. tarcza Brave)';
          } else {
            lastVoiceErrorPlaceholder = defaultPlaceholder;
          }
          setVoiceListeningState(false, lastVoiceErrorPlaceholder);
        };

        recognition.onend = () => {
          setVoiceListeningState(false, lastVoiceErrorPlaceholder || defaultPlaceholder);
          if (chatInput?.value) {
            chatInput?.focus?.();
          }
        };
      }

      lastVoiceErrorPlaceholder = '';
      voiceBaseText = String(chatInput?.value || '').trim();
      setVoiceListeningState(true);
      recognition.start();
      return true;
    } catch (_) {
      setVoiceListeningState(false);
      return false;
    }
  }

  voiceBtn?.addEventListener('click', toggleVoiceRecognition);

  // Pamięć rozmowy (Multi-Turn History w sessionStorage)
  let conversationHistory = [];
  try {
    const raw = win?.sessionStorage?.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) conversationHistory = parsed.slice(-8);
    }
  } catch (_) {}

  loadResponseCache();

  function saveHistory() {
    try {
      win?.sessionStorage?.setItem(storageKey, JSON.stringify(conversationHistory.slice(-8)));
    } catch (_) {}
  }

  /**
   * Aktualizuje pamięć podręczną i historię po zmianie bazy wiedzy (np. edycji hasła w Salsopedii).
   * Nawet jeśli klient zadał pytanie wcześniej (i jest ono zapisane w cache lub w bieżącej rozmowie),
   * funkcja natychmiast inwaliduje stary cache i aktualizuje zapisane odpowiedzi na podstawie nowej wiedzy!
   * @param {Array<Object>} newEntries
   * @returns {boolean} true jeśli wersja bazy wiedzy uległa zmianie
   */
  function updateKnowledgeEntries(newEntries) {
    if (!Array.isArray(newEntries)) return false;
    const nextVersion = computeKnowledgeVersion(newEntries);
    const hasChanged = nextVersion !== kbVersion;

    knowledgeEntries = [...newEntries];
    kbVersion = nextVersion;

    if (hasChanged) {
      // 1. Natychmiastowa inwalidacja wcześniej zapisanych odpowiedzi w Response Cache
      responseCache = { kbVersion: nextVersion, entries: {} };
      saveResponseCache();

      // 2. Aktualizacja zapisanych w sesji (conversationHistory) odpowiedzi na pytania dotyczące zmienionych haseł
      let historyUpdated = false;
      for (let i = 0; i < conversationHistory.length - 1; i++) {
        if (conversationHistory[i].role === 'user' && conversationHistory[i + 1].role === 'model') {
          const userQ = conversationHistory[i].text;
          const matchingTerms = searchKnowledgeEntries(userQ, knowledgeEntries, 3);
          if (matchingTerms.length > 0) {
            const refreshedAnswer = getLocalFallbackAnswer(userQ, siteId, knowledgeEntries);
            if (refreshedAnswer && refreshedAnswer !== conversationHistory[i + 1].text) {
              conversationHistory[i + 1].text = refreshedAnswer;
              setCachedAnswer(userQ, refreshedAnswer, 'kb-live-refresh');
              historyUpdated = true;
            }
          }
        }
      }

      if (historyUpdated) {
        saveHistory();
        renderInitialView();
      }
    }

    return hasChanged;
  }

  /**
   * Pobiera najnowszą bazę wiedzy z API (`wiki.php?action=list`) lub statycznego pliku JSON (`salsopedia.json`).
   * @returns {Promise<string>} aktualny identyfikator kbVersion
   */
  async function refreshKnowledge() {
    const fetchFn = win?.fetch || globalThis.fetch;
    if (typeof fetchFn !== 'function') return kbVersion;

    // Jeżeli na stronie działa już załadowany stan Salsopedii (wiki.js __SALSOPEDIA_TERMS__ / AppState.terms), zsynchronizuj go
    const liveTerms = win?.__SALSOPEDIA_TERMS__ || win?.AppState?.terms;
    if (Array.isArray(liveTerms) && liveTerms.length > 0) {
      updateKnowledgeEntries(liveTerms);
    }

    const urlsToTry = [kbApiUrl, kbUrl].filter(Boolean);
    for (const url of urlsToTry) {
      try {
        const res = await fetchFn(url, { cache: 'no-store' });
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            updateKnowledgeEntries(data);
            break;
          }
        }
      } catch (_) {
        // Cichy fallback do kolejnego źródła lub stanu lokalnego
      }
    }
    return kbVersion;
  }

  function appendMessageElement(role, text) {
    if (!messagesContainer) return null;
    const msg = doc.createElement('div');
    msg.className = 'tsw-ai-msg ' + (role === 'user' ? 'tsw-ai-msg-user' : 'tsw-ai-msg-bot');
    if (role === 'user') {
      msg.textContent = text;
    } else {
      msg.innerHTML = formatMarkdown(text);
    }
    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return msg;
  }

  function setChipsVisible(visible) {
    if (!chipsContainer) return;
    chipsContainer.classList.toggle('tsw-hidden', !visible);
    chipsContainer.style.display = visible ? 'flex' : 'none';
  }

  function renderChips() {
    if (!chipsContainer) return;
    chipsContainer.innerHTML = '';
    if (conversationHistory.length > 0) {
      setChipsVisible(false);
      return;
    }
    setChipsVisible(true);
    quickPrompts.forEach((promptText) => {
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'tsw-ai-chip';
      chip.textContent = promptText;
      chip.addEventListener('click', () => {
        sendQuestion(promptText);
      });
      chipsContainer.appendChild(chip);
    });
  }

  function renderInitialView() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    const welcomeText =
      siteId === 'katosalsahub'
        ? `Cześć! 💃🕺 Jestem wirtualnym asystentem **${title}**. Moim głównym centrum wiedzy jest **Salsopedia**, ale odpowiem też na wszystkie pytania o nasze potańcówki salsy w Katowicach, **Wspólny Grafik Szkół Tańca (grafik.html)**, **Radio Timba Nation** i **DancePuls**. O co chcesz zapytać?`
        : `Cześć! 👋 Jestem wirtualnym doradcą **${title}**. W czym mogę Ci pomóc? Zapytaj o ofertę, wycenę lub współpracę!`;

    appendMessageElement('model', welcomeText);
    for (let i = 0; i < conversationHistory.length; i++) {
      appendMessageElement(conversationHistory[i].role, conversationHistory[i].text);
    }
    renderChips();
  }

  function toggleChat() {
    if (!chatWindow || !toggleBtn) return;
    const isOpen = chatWindow.classList.toggle('tsw-open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      chatInput?.focus?.();
      if (kbUrl || kbApiUrl) {
        refreshKnowledge();
      }
    } else {
      stopVoiceRecognition();
    }
  }

  function closeChat() {
    if (!chatWindow || !toggleBtn) return;
    stopVoiceRecognition();
    chatWindow.classList.remove('tsw-open');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.focus?.();
  }

  toggleBtn?.addEventListener('click', toggleChat);
  closeBtn?.addEventListener('click', closeChat);
  clearBtn?.addEventListener('click', () => {
    stopVoiceRecognition();
    conversationHistory = [];
    saveHistory();
    renderInitialView();
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatWindow?.classList.contains('tsw-open')) {
      closeChat();
    }
  });

  // Nasłuchiwanie na żywo na zmiany w Salsopedii / bazie wiedzy na stronie (w tej samej karcie oraz między kartami)
  const handleKnowledgeEvent = (e) => {
    const terms = e?.detail?.terms || win?.__SALSOPEDIA_TERMS__ || win?.AppState?.terms;
    if (Array.isArray(terms)) {
      updateKnowledgeEntries(terms);
    } else {
      refreshKnowledge();
    }
  };
  win?.addEventListener?.('salsopedia:updated', handleKnowledgeEvent);
  doc.addEventListener?.('salsopedia:updated', handleKnowledgeEvent);
  win?.addEventListener?.('storage', (e) => {
    if (!e || e.key === 'ksh_salsopedia_sync') {
      refreshKnowledge();
    }
  });

  async function sendQuestion(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || sendBtn?.disabled) return;

    stopVoiceRecognition();

    // Synchronizuj stan wiedzy z globalnym __SALSOPEDIA_TERMS__ / AppState.terms (jeśli użytkownik/moderator właśnie edytował Salsopedię)
    const liveGlobalTerms = win?.__SALSOPEDIA_TERMS__ || win?.AppState?.terms;
    if (Array.isArray(liveGlobalTerms) && liveGlobalTerms.length > 0) {
      updateKnowledgeEntries(liveGlobalTerms);
    }

    setChipsVisible(false);
    appendMessageElement('user', trimmed);
    if (chatInput) chatInput.value = '';

    // 1. Sprawdź Response Cache: jeśli klient pyta po raz drugi o to samo, a baza wiedzy (Salsopedia)
    //    nie zmieniła się od ostatniego razu -> zwróć odpowiedź natychmiast BEZ odpytywania AI!
    const cachedAnswer = getCachedAnswer(trimmed);
    if (cachedAnswer) {
      appendMessageElement('model', cachedAnswer);
      conversationHistory.push({ role: 'user', text: trimmed });
      conversationHistory.push({ role: 'model', text: cachedAnswer });
      conversationHistory = conversationHistory.slice(-8);
      saveHistory();
      if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return { answer: cachedAnswer, cached: true, kbVersion };
    }

    const typingMsg = doc.createElement('div');
    typingMsg.className = 'tsw-ai-msg tsw-ai-msg-bot tsw-ai-typing';
    typingMsg.textContent = 'Asystent pisze...';
    messagesContainer?.appendChild(typingMsg);
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (sendBtn) sendBtn.disabled = true;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 9000) : null;

    const dynamicContext = buildDynamicContext(trimmed, knowledgeEntries);

    try {
      const fetchFn = win?.fetch || globalThis.fetch;
      const res = await fetchFn(routerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller?.signal,
        body: JSON.stringify({
          site_id: siteId,
          question: trimmed,
          kb_version: kbVersion,
          dynamic_context: dynamicContext,
          history: conversationHistory.slice(-8)
        })
      });

      const data = await res.json();
      typingMsg.remove?.();

      if (res.ok && data && data.success && data.answer) {
        appendMessageElement('model', data.answer);
        setCachedAnswer(trimmed, data.answer, 'ai');
        conversationHistory.push({ role: 'user', text: trimmed });
        conversationHistory.push({ role: 'model', text: data.answer });
        conversationHistory = conversationHistory.slice(-8);
        saveHistory();
        return { answer: data.answer, cached: Boolean(data.cached), kbVersion };
      } else {
        const fallback = getLocalFallbackAnswer(trimmed, siteId, knowledgeEntries);
        appendMessageElement('model', fallback);
        setCachedAnswer(trimmed, fallback, 'fallback');
        conversationHistory.push({ role: 'user', text: trimmed });
        conversationHistory.push({ role: 'model', text: fallback });
        conversationHistory = conversationHistory.slice(-8);
        saveHistory();
        return { answer: fallback, cached: false, kbVersion };
      }
    } catch (_) {
      typingMsg.remove?.();
      const fallback = getLocalFallbackAnswer(trimmed, siteId, knowledgeEntries);
      appendMessageElement('model', fallback);
      setCachedAnswer(trimmed, fallback, 'fallback');
      conversationHistory.push({ role: 'user', text: trimmed });
      conversationHistory.push({ role: 'model', text: fallback });
      conversationHistory = conversationHistory.slice(-8);
      saveHistory();
      return { answer: fallback, cached: false, kbVersion };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (sendBtn) sendBtn.disabled = false;
      if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  chatForm?.addEventListener('submit', (e) => {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    sendQuestion(chatInput?.value || '');
  });

  renderInitialView();

  // Automatyczne załadowanie dynamicznej bazy wiedzy w tle (jeśli skonfigurowano kbUrl/kbApiUrl i nie podano initialKnowledge)
  if ((kbUrl || kbApiUrl) && knowledgeEntries.length === 0 && !options.skipInitialFetch) {
    refreshKnowledge();
  }

  return {
    root,
    toggleBtn,
    closeBtn,
    clearBtn,
    chatWindow,
    chatForm,
    chatInput,
    voiceBtn,
    messagesContainer,
    chipsContainer,
    sendBtn,
    toggleChat,
    closeChat,
    sendQuestion,
    toggleVoiceRecognition,
    stopVoiceRecognition,
    isVoiceListening: () => isListening,
    getHistory: () => conversationHistory,
    getKnowledgeVersion: () => kbVersion,
    getKnowledgeEntries: () => knowledgeEntries,
    updateKnowledgeEntries,
    refreshKnowledge,
    getCachedAnswer,
    clearCache: () => {
      responseCache = { kbVersion, entries: {} };
      saveResponseCache();
    }
  };
}

function autoInitAiWidget() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('tsw-ai-widget-root')) return;
  if (document.body) {
    initAiWidget(document, globalThis.window);
  }
}

if (typeof document !== 'undefined') {
  if (document.body) {
    autoInitAiWidget();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitAiWidget);
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', autoInitAiWidget);
  }
}

if (typeof window !== 'undefined') {
  window.initAiWidget = initAiWidget;
  window.formatMarkdown = formatMarkdown;
  window.getLocalFallbackAnswer = getLocalFallbackAnswer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatMarkdown,
    normalizeCacheQuery,
    normalizeSearchText,
    computeKnowledgeVersion,
    searchKnowledgeEntries,
    buildDynamicContext,
    getLocalFallbackAnswer,
    initAiWidget
  };
}
