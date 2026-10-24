const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupMockDom } = require('../helpers/mock-dom.js');
const {
  formatMarkdown,
  getLocalFallbackAnswer,
  searchKnowledgeEntries,
  buildDynamicContext,
  initAiWidget
} = require('../../katosalsahub.pl/assets/js/ai-widget.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SALSOPEDIA_PATH = path.join(ROOT_DIR, 'katosalsahub.pl', 'assets', 'data', 'salsopedia.json');
const REAL_SALSOPEDIA = JSON.parse(fs.readFileSync(SALSOPEDIA_PATH, 'utf-8'));

describe('Asystent AI Kato Salsa Hub v3.0 (katosalsahub.pl/assets/js/ai-widget.js)', () => {
  it('formatMarkdown bezpiecznie escapuje HTML (ochrona XSS) i formatuje pogrubienia, listy oraz linki do Salsopedii', () => {
    assert.equal(formatMarkdown(''), '');
    const xss = formatMarkdown('<script>alert("xss")</script> **Casino** i *Timba*');
    assert.ok(!xss.includes('<script>'));
    assert.ok(xss.includes('&lt;script&gt;'));
    assert.ok(xss.includes('<strong>Casino</strong>'));
    assert.ok(xss.includes('<em>Timba</em>'));

    const withLinks = formatMarkdown('Sprawdź salsopedia.html, napisz na kontakt@katosalsahub.pl lub wejdź w #kontakt\n- Punkt 1\n- Punkt 2');
    assert.ok(withLinks.includes('href="salsopedia.html"'));
    assert.ok(withLinks.includes('href="mailto:kontakt@katosalsahub.pl"'));
    assert.ok(withLinks.includes('href="#kontakt"'));
    assert.ok(withLinks.includes('<ul class="tsw-ai-list"><li>Punkt 1</li><li>Punkt 2</li></ul>'));
  });

  it('czerpie wiedzę z pełnej bazy Salsopedii (salsopedia.json) oraz odpowiada na pytania o portal, radio i DancePuls', () => {
    // 1. Pytania o konkretne figury i pojęcia z prawdziwej bazy salsopedia.json
    const dqn = getLocalFallbackAnswer('Co oznacza figura Dile Que No?', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(dqn, /Dile Que No/i);
    assert.match(dqn, /Guapea|Cross Body Lead/i);

    const orishas = getLocalFallbackAnswer('Kim jest bogini Yemaya w Salsopedii?', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(orishas, /Yemaya/i);
    assert.match(orishas, /ocean/i);

    const school = getLocalFallbackAnswer('Opowiedz o szkole La Clave w Katowicach', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(school, /La Clave/i);
    assert.match(school, /Chorzowska 11/i);

    const instructor = getLocalFallbackAnswer('Kim są instruktorzy Pedro y Bella?', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(instructor, /Pedro y Bella/i);
    assert.match(instructor, /Kizomb|VAMULA|Bachata/i);

    // 2. Dynamiczny kontekst RAG dla routera AI
    const ctx = buildDynamicContext('Wyjaśnij figury Enchufla i Setenta', REAL_SALSOPEDIA);
    assert.match(ctx, /Enchufla/);
    assert.match(ctx, /Setenta/);
    assert.ok(searchKnowledgeEntries('Los Van Van', REAL_SALSOPEDIA).length > 0);

    // 3. Pytania o działanie Salsopedii, Radio Timba Nation (DJ Maikiu z Zurychu na Zeno.FM), DancePuls, lokalizacje (w tym Wolni Ludzie w niedziele 15:00-18:00) i działalność KSH
    assert.match(getLocalFallbackAnswer('Czym jest Salsopedia i jak dodać hasło?', 'katosalsahub', REAL_SALSOPEDIA), /Salsopedia Studio/i);

    const radioFallback = getLocalFallbackAnswer('Dlaczego te radio jest bez reklam i skąd pochodzi?', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(radioFallback, /Timba Nation/i);
    assert.match(radioFallback, /DJ Maikiu/i);
    assert.match(radioFallback, /Zurych|Szwajcari/i);
    assert.match(radioFallback, /Zeno\.FM/i);
    assert.doesNotMatch(radioFallback, /tworzymy z pasji dla naszej śląskiej społeczności/i);

    const radioCtx = buildDynamicContext('Czyje jest Radio Timba Nation i dlaczego nie ma reklam?', REAL_SALSOPEDIA);
    assert.match(radioCtx, /DJ Maikiu/i);
    assert.match(radioCtx, /Zurych/i);
    assert.match(radioCtx, /Zeno\.FM/i);

    assert.match(getLocalFallbackAnswer('Gdzie znaleźć kalendarz imprez DancePuls na weekend?', 'katosalsahub', []), /DancePuls/i);
    assert.match(getLocalFallbackAnswer('Gdzie tańczymy na Dolinie Trzech Stawów?', 'katosalsahub', []), /Dolina Trzech Stawów/i);
    assert.match(getLocalFallbackAnswer('Jak zacząć od podstaw P0 i czy działa Multisport?', 'katosalsahub', []), /Multisport/i);

    const wolni = getLocalFallbackAnswer('Co dzieje się w Wolnych Ludziach w każdą niedzielę?', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(wolni, /15:00–18:00/);
    assert.match(wolni, /Mariacka 2/i);
    assert.match(wolni, /Wspólny Grafik Szkół Tańca/i);
    assert.doesNotMatch(wolni, /Bachat|Kizomb/i);

    const kshActivity = getLocalFallbackAnswer('Czym zajmuje się społeczność i Fundacja Kato Salsa Hub?', 'katosalsahub', REAL_SALSOPEDIA);
    assert.match(kshActivity, /Salsy/i);
    assert.match(kshActivity, /Wspólny Grafik Szkół Tańca/i);
    assert.match(kshActivity, /grafik\.html/i);
    assert.doesNotMatch(kshActivity, /Bachat|Kizomb/i);

    const kshCtx = buildDynamicContext('Czym zajmuje się społeczność i Fundacja Kato Salsa Hub?', REAL_SALSOPEDIA);
    assert.match(kshCtx, /15:00–18:00/);
    assert.match(kshCtx, /Wolni Ludzie/i);
    assert.match(kshCtx, /WSPÓLNY GRAFIK SZKÓŁ TAŃCA/i);
    assert.match(kshCtx, /nie zajmujemy się bachatą ani kizombą/i);
  });

  it('initAiWidget tworzy strukturę DOM, obsługuje otwieranie/zamykanie (w tym Escape) i chroni przed duplikacją', () => {
    const { document, window } = setupMockDom(
      '<script src="assets/js/ai-widget.js" data-site-id="katosalsahub" data-title="Asystent Kato Salsa Hub"></script>'
    );

    const api = initAiWidget(document, window, { initialKnowledge: REAL_SALSOPEDIA });
    assert.ok(api);
    assert.equal(initAiWidget(document, window), null, 'Druga inicjalizacja bez forceReinit musi zwrócić null');

    assert.equal(api.toggleBtn.getAttribute('aria-expanded'), 'false');
    api.toggleChat();
    assert.equal(api.toggleBtn.getAttribute('aria-expanded'), 'true');
    assert.equal(api.chatWindow.classList.contains('tsw-open'), true);

    document.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(api.chatWindow.classList.contains('tsw-open'), false);
  });

  it('Response Cache: dwukrotne zadanie tego samego pytania nie odpytuje ponownie AI (0 zapytań sieciowych przy powtórzeniu)', async () => {
    const { document, window } = setupMockDom();

    let fetchCalls = 0;
    window.fetch = async () => {
      fetchCalls++;
      return {
        ok: true,
        json: async () => ({
          success: true,
          answer: 'W **Salsopedii** figura **Enchufla** to podstawowy obrót z zamianą miejsc na 1-2-3 i 5-6-7.'
        })
      };
    };

    const api = initAiWidget(document, window, {
      siteId: 'katosalsahub',
      initialKnowledge: REAL_SALSOPEDIA
    });

    // 1. Pierwsze zapytanie -> odpytuje AI Router (fetchCalls === 1)
    const res1 = await api.sendQuestion('Co to jest Enchufla?');
    assert.equal(fetchCalls, 1);
    assert.equal(res1.cached, false);

    // 2. Drugie identyczne zapytanie (nawet z inną wielkością liter i znakami zapytania) -> zwraca z cache bez odpytywania AI!
    const res2 = await api.sendQuestion('  co to jest ENCHUFLA?! ');
    assert.equal(fetchCalls, 1, 'Drugie pytanie o to samo nie może wywołać kolejnego żądania do AI');
    assert.equal(res2.cached, true);
    assert.equal(res2.answer, res1.answer);

    // 3. Wiadomość z numerem telefonu lub e-mailem (lead kontaktowy) -> omija cache, aby wyzwolić Ntfy 1-Klik na VPS
    await api.sendQuestion('Proszę o kontakt na +48 (600) 700 800 lub kontakt@firma.pl');
    assert.equal(fetchCalls, 2);
    assert.equal(api.getCachedAnswer('Proszę o kontakt na +48 (600) 700 800 lub kontakt@firma.pl'), null);

    await api.sendQuestion('Proszę o kontakt na +48 (600) 700 800 lub kontakt@firma.pl');
    assert.equal(fetchCalls, 3);
  });

  it('Dynamic Salsopedia Sync: zmiana w Salsopedii automatycznie inwaliduje cache i aktualizuje wcześniej zapisane odpowiedzi', async () => {
    const { document, window } = setupMockDom();

    const initialSalsopedia = [
      {
        id: 'term_32',
        term: 'Enchufla',
        definition: 'Stara definicja Enchufla: obrót i zamiana miejsc na 1-2-3.',
        category: ['figures', 'steps'],
        status: 'unverified',
        verification_count: 0
      }
    ];

    let aiNetworkCalls = 0;
    window.fetch = async () => {
      aiNetworkCalls++;
      throw new Error('Tryb lokalny Salsopedii');
    };

    const api = initAiWidget(document, window, {
      siteId: 'katosalsahub',
      initialKnowledge: initialSalsopedia
    });

    const initialVersion = api.getKnowledgeVersion();

    // 1. Klient zadaje pytanie o Enchufla -> odpowiedź trafia do historii i do Response Cache
    const firstAsk = await api.sendQuestion('Co to jest Enchufla?');
    assert.equal(aiNetworkCalls, 1);
    assert.match(firstAsk.answer, /Stara definicja Enchufla/);
    assert.ok(api.getCachedAnswer('Co to jest Enchufla?'));

    // 2. Klient zadaje pytanie drugi raz przed zmianą -> odpowiedź z cache (brak wywołania sieciowego)
    const secondAsk = await api.sendQuestion('Co to jest Enchufla?');
    assert.equal(aiNetworkCalls, 1);
    assert.equal(secondAsk.cached, true);

    // 3. W Salsopedii następuje zmiana definicji i weryfikacja hasła Enchufla (zdarzenie salsopedia:updated)
    const updatedSalsopedia = [
      {
        id: 'term_32',
        term: 'Enchufla',
        definition: 'Nowa zweryfikowana definicja Enchufla: obrót partnerki pod lewą ręką na 1-2-3 oraz zamiana miejsc na 5-6-7.',
        category: ['figures', 'steps'],
        status: 'verified',
        verification_count: 5
      }
    ];

    window.dispatchEvent({
      type: 'salsopedia:updated',
      detail: { terms: updatedSalsopedia }
    });

    // Wersja bazy wiedzy zmieniła się automatycznie
    const updatedVersion = api.getKnowledgeVersion();
    assert.notEqual(updatedVersion, initialVersion);

    // Nawet wcześniej zapisane w rozmowie (historii) odpowiedzi zostały automatycznie zaktualizowane nową wiedzą!
    const history = api.getHistory();
    const modelTurns = history.filter((h) => h.role === 'model');
    assert.ok(modelTurns.length >= 1);
    for (const turn of modelTurns) {
      assert.match(turn.text, /Nowa zweryfikowana definicja Enchufla/);
      assert.doesNotMatch(turn.text, /Stara definicja Enchufla/);
    }

    // Zaktualizowana odpowiedź jest również gotowa w cache pod nową wersją wiedzy
    const cachedAfterUpdate = api.getCachedAnswer('Co to jest Enchufla?');
    assert.ok(cachedAfterUpdate);
    assert.match(cachedAfterUpdate, /Nowa zweryfikowana definicja Enchufla/);
  });

  it('Dyktowanie głosowe (Web Speech API — Tryb Bezpieczny): rozpoznaje mowę po polsku na żywo do pola tekstowego bez automatycznego wysyłania', () => {
    const { document, window } = setupMockDom();

    let lastInstance = null;
    window.webkitSpeechRecognition = class MockSpeechRecognition {
      constructor() {
        this.lang = '';
        this.continuous = true;
        this.interimResults = false;
        this.maxAlternatives = 1;
        this.started = false;
        lastInstance = this;
      }
      start() {
        this.started = true;
        if (typeof this.onstart === 'function') this.onstart();
      }
      stop() {
        this.started = false;
        if (typeof this.onend === 'function') this.onend();
      }
    };

    const api = initAiWidget(document, window, {
      siteId: 'katosalsahub',
      initialKnowledge: REAL_SALSOPEDIA
    });

    assert.ok(api.voiceBtn, 'Przycisk mikrofonu #tswAiVoiceBtn musi istnieć w formularzu czatu');
    assert.equal(api.voiceBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(api.isVoiceListening(), false);

    // 1. Kliknięcie mikrofonu uruchamia nasłuchiwanie pl-PL z interimResults=true
    api.voiceBtn.click();
    assert.ok(lastInstance, 'Instancja SpeechRecognition powinna zostać utworzona');
    assert.equal(lastInstance.lang, 'pl-PL');
    assert.equal(lastInstance.interimResults, true);
    assert.equal(lastInstance.continuous, false);
    assert.equal(api.isVoiceListening(), true);
    assert.equal(api.voiceBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(api.voiceBtn.classList.contains('tsw-listening'), true);

    // 2. Transkrypcja na żywo (interim) wpisuje tekst do pola #tswAiInput
    lastInstance.onresult({
      results: [
        Object.assign([{ transcript: 'Co to jest ' }], { isFinal: true }),
        Object.assign([{ transcript: 'Dile Que No' }], { isFinal: false })
      ]
    });
    assert.equal(api.chatInput.value, 'Co to jest Dile Que No');

    // 3. Zakończenie wypowiedzi wyłącza mikrofon, ale zostawia tekst w polu do weryfikacji przed wysłaniem (Tryb 1 Bezpieczny)
    lastInstance.stop();
    assert.equal(api.isVoiceListening(), false);
    assert.equal(api.voiceBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(api.voiceBtn.classList.contains('tsw-listening'), false);
    assert.equal(api.chatInput.value, 'Co to jest Dile Que No');
    assert.equal(api.getHistory().length, 0, 'Tryb bezpieczny nie może wysłać wiadomości automatycznie bez kliknięcia Wyślij');
  });

  it('Fail-Closed Cache Invalidation oraz strażnik sieci NETWORK_FORBIDDEN chronią przed uszkodzonym localStorage i wyciekiem zapytań', async () => {
    const { document, window } = setupMockDom(
      '<script src="assets/js/ai-widget.js" data-site-id="katosalsahub"></script>'
    );

    await assert.rejects(
      () => window.fetch('https://example.com/unmocked'),
      /NETWORK_FORBIDDEN/
    );

    window.localStorage.setItem(
      'tsw_ai_cache_katosalsahub',
      JSON.stringify({
        kbVersion: 'kb_v0_empty',
        entries: {
          'co to jest casino': { answer: '', ts: -100 },
          'dile que no': { answer: 'Poprawna odpowiedź', ts: Date.now() + 99999999 }
        }
      })
    );

    const api = initAiWidget(document, window, {
      siteId: 'katosalsahub',
      skipInitialFetch: true
    });

    assert.equal(api.getCachedAnswer('co to jest casino'), null);
    assert.equal(api.getCachedAnswer('dile que no'), null);
  });
});
