# BLUEPRINT & RUNBOOK: KATO SALSA HUB & DANCEPULS MONOREPO

## Nowoczesny standard inżynieryjny, testów jednostkowych, bezpieczeństwa i CI/CD dla platformy Kato Salsa Hub & DancePuls

---

## 1. Architektura Monorepo: Dwa Filary w Jednym Ekosystemie

Projekt stanowi monorepo łączące dwa ściśle współpracujące podprojekty:

### 1.1 Filar 1: Kato Salsa Hub (`katosalsahub.pl`)
- **Rola:** Główny portal społecznościowy tancerzy Salsy Cubana, Bachaty i Kizomby na Śląsku i w Zagłębiu.
- **Technologia:** Vanilla JS (ES6+), Vanilla CSS (tokens/custom properties), HTML5 Semantics.
- **Główne moduły:**
  - Odtwarzacz radiowy online z integracją **MediaSession API** (sterowanie z poziomu systemu operacyjnego / lockscreen).
  - **Salsopedia** (`assets/data/salsopedia.json` + `wiki.js` + `wiki.php`) – encyklopedia pojęć tanecznych z podziałem na kategorie i wyszukiwarką.
  - Formularz kontaktowy z zaawansowaną ochroną antybotową (Honeypot, token JS `js_check`, minimalny czas wysyłki `submission_seconds >= 2.5s`, filtr cyrylicy/linków, integracja Helpdesk osTicket z fallbackiem email).
  - Ochrona prywatności i RODO, polityka cookies (`cookies.js`).
- **Hosting docelowy (LH.pl):**
  - Produkcja: `/home/platne/serwer417204/public_html/katosalsahub.pl`
  - Staging: `/home/platne/serwer417204/public_html/staging.katosalsahub.pl`

### 1.2 Filar 2: DancePuls (`katosalsahub.pl/dancepuls` & `scripts/sync_engine.js`)
- **Rola:** Silnik agregacji, kuratorstwa i automatyzacji imprez, warsztatów i festiwali tanecznych (woj. śląskie i Kraków), zintegrowany bezpośrednio w strukturze portalu `katosalsahub.pl`.
- **Technologia:** Vanilla JS, Markdown / Flat-File JSON database (`katosalsahub.pl/assets/data/`), Node.js (`scripts/sync_engine.js`).
- **Główne moduły:**
  - Centralna baza imprez (SSOT): `katosalsahub.pl/assets/data/events_database.md` oraz skompilowany plik bazy `katosalsahub.pl/assets/data/events.json`.
  - Generator cyklicznych raportów weekendowych: `katosalsahub.pl/assets/data/latest_report.md`.
  - Silnik synchronizacji: `scripts/sync_engine.js` wspierany przez `scripts/venue-dictionary.js` (słownik lokacji i geolokalizacja) oraz `scripts/event-scrapers.js` (parsery FB, Krajownika, Sabaki, OnlyDance i Airdancii).
  - Publiczny widok kalendarza imprez i wspólnego grafiku szkół: `katosalsahub.pl/grafik.html`.
  - Panel roboczy kuratora i generator postów FB: `katosalsahub.pl/dancepuls/index.html` (`app.js`, `parser.js`, `post-generator.js`, `weather.js`).
- **Hosting docelowy (LH.pl – pojedynczy zintegrowany wdrożeniowo katalog):**
  - Produkcja: `/home/platne/serwer417204/public_html/katosalsahub.pl`
  - Staging: `/home/platne/serwer417204/public_html/staging.katosalsahub.pl`

---

## 2. Standardy Jakości i Quality Gate

Projekt stosuje rygorystyczny potok Platform-First & Zero-Bloat:
1. **Brak ciężkich zależności testowych:** Testy jednostkowe uruchamiane przez wbudowany w Node.js moduł `node:test` i `node:assert/strict`.
2. **Pre-commit hook:** Weryfikuje składnię JavaScript oraz uruchamia testy (`npm run check`) przed każdym zatwierdzeniem kodu.
3. **Commit-msg hook:** Pilnuje konwencji Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.).
4. **Link Integrity Checker:** Weryfikuje poprawność relatywnych ścieżek `src` i `href` w obu portalach w potoku CI, eliminując błędy 404.
5. **Audyt Lighthouse CI:** Automatyczna weryfikacja a11y, SEO i Best Practices na podstawie `.lighthouserc.json`.
6. **Pre-Deploy Snapshot:** Przed każdym wdrożeniem przez SFTP pobierana jest kopia bezpieczeństwa zdalnego serwera do artefaktów GitHub Actions (retencja 7 dni).

---

## 3. Komendy Deweloperskie

```bash
# Uruchomienie lokalnego serwera podglądu (obsługuje obie strony)
npm run dev
# Kato Salsa Hub: http://localhost:3000/
# DancePuls:      http://localhost:3000/dancepuls/

# Pełny Quality Gate (składnia + testy)
npm run check

# Uruchomienie testów jednostkowych
npm test

# Testy z raportem pokrycia kodu
npm run test:coverage

# Tryb czuwania testów (watch mode)
npm run test:watch

# Synchronizacja bazy wydarzeń i raportów DancePuls
npm run sync
```

---

## 4. Procedura Wdrożeniowa (Zero-Trust Sequential CI $\rightarrow$ CD)

1. Zmiany deweloperskie wprowadzać na gałęziach `feat/...` lub `fix/...`.
2. Push na gałąź `staging` lub `main` uruchamia **wyłącznie jeden potok weryfikacyjny**: `CI & Quality Gate` (`ci.yml` – Gitleaks, PHP, `node:test`, Playwright UI Smoke Test, Lighthouse CI).
3. Dopiero po zakończeniu `CI & Quality Gate` ze statusem `success` automatycznie wyzwala się potok wdrożeniowy `CD — Deploy to LH` (`deploy.yml` przez `on: workflow_run` z `cancel-in-progress: false`):
   - Pobiera *Pre-Deploy Snapshot* (Off-Site Backup z serwera LH.pl w trybie odczytu) do artefaktów GitHub Actions (retencja 7 dni, rotacja 2 najnowszych paczek).
   - Wdraża zwalidowany commit (`head_sha`) po SFTP z ochroną żywych plików (`--exclude-glob` dla `pending_edits.json`, `moderators.json`, `login_attempts.json`, `*.bak`, `rate_*.json`).
   - Dla gałęzi `main` automatycznie czyści cache Cloudflare CDN i tworzy tag wydania `vYYYY.MM.DD-<sha>`.

---

## 5. Standardy SEO, Wizytówka Google (GBP) i Gotowe Szablony (Kopiuj–Wklej)

### 5.1 Architektura Techniczna SEO (On-Page & IndexNow)
1. **Kanoniczne domeny (brak duplikacji `www`):**
   - W `.htaccess` wymuszone przekierowanie `301 Moved Permanently` z `www.katosalsahub.pl` na `https://katosalsahub.pl/`.
   - Każda strona posiada jawny `<link rel="canonical" ...>` (`index.html`, `grafik.html`, `salsopedia.html`, `privacy.html`, `dancepuls/index.html`).
2. **Ochrona snippetów w Google (`data-nosnippet`):**
   - Kontener czatu AI (`#ksh-ai-widget` w `ai-widget.js`) oraz baner cookies (`#cookie-banner`) posiadają atrybut `data-nosnippet`, dzięki czemu Googlebot nigdy nie używa komunikatu powitalnego bota ani tekstu RODO jako opisu strony w wyszukiwarce.
3. **Dane strukturalne `Schema.org` (JSON-LD w `katosalsahub.pl/index.html`):**
   - `Organization` + `DanceGroup` z 3 lokalizacjami `Place` (`Wolni Ludzie ul. Mariacka 2`, `Kamienny Krąg Dolina Trzech Stawów ul. Trzech Stawów 22`, `Amfiteatr NOSPR pl. Wojciecha Kilara 1`) oraz tablicą `sameAs` łączącą stronę z Fanpage'em FB (`https://www.facebook.com/KatoSalsaHub`), Grupą FB (`https://www.facebook.com/groups/519446499987373`) i Instagramem (`https://www.instagram.com/katosalsahub/`).
   - `WebSite` z `SearchAction` kierującym do `salsopedia.html?term={search_term_string}`.
   - `FAQPage` (4 najczęstsze pytania o salsę w Katowicach pod rozszerzone wyniki Rich Snippets).
   - `DanceEvent` – zawsze zaktualizowany do najbliższego własnego wydarzenia Kato Salsa Hub (potańcówka lub plener), aby Google wyświetlał imprezę w karuzeli **„Wydarzenia w pobliżu: Katowice”**.
4. **Szybka indeksacja (GSC + IndexNow API):**
   - Obie domeny (`https://katosalsahub.pl/` oraz `https://dancepuls.katosalsahub.pl/`) są zweryfikowane w Google Search Console z przesłanymi mapami `sitemap.xml`.
   - Publiczny identyfikator pliku IndexNow: `4f8b9d2e7a1c6f3b5e0d8a9c2b4f7e1a` (plik `/4f8b9d2e7a1c6f3b5e0d8a9c2b4f7e1a.txt`). Komenda CLI do natychmiastowego pingowania wyszukiwarek:
     ```bash
     INDEXNOW_ID="4f8b9d2e7a1c6f3b5e0d8a9c2b4f7e1a"
     curl -s -X POST "https://api.indexnow.org/indexnow" \
       -H "Content-Type: application/json; charset=utf-8" \
       -d "{\"host\":\"katosalsahub.pl\",\"key\":\"${INDEXNOW_ID}\",\"keyLocation\":\"https://katosalsahub.pl/${INDEXNOW_ID}.txt\",\"urlList\":[\"https://katosalsahub.pl/\",\"https://katosalsahub.pl/grafik.html\",\"https://katosalsahub.pl/salsopedia.html\"]}"
     ```

---

### 5.2 Szablon 1: Stopka SEO na dół każdego wydarzenia na Facebooku
*(Wklejać na sam dół opisu każdego nowego wydarzenia na FB – buduje pozycjonowanie na frazę „Salsa Katowice” i ruch na stronę)*:

```text
---
🌴 SALSA KATOWICE – KATO SALSA HUB 🌴
Szukasz informacji, gdzie tańczyć salsę w Katowicach i na Śląsku?
📍 Interaktywna mapa miejscówek i darmowych parkingów (Wolni Ludzie ul. Mariacka 2, Dolina Trzech Stawów, NOSPR), słownik ponad 200 figur Salsopedia oraz kubańskie radio 24/7 bez reklam czekają na naszej oficjalnej stronie:
👉 https://katosalsahub.pl/
📅 Aktualny rozkład wszystkich kursów, porównanie cenników szkół tańca (kalkulator karnetów i kart sportowych) oraz kalendarz imprez tanecznych na Śląsku:
👉 https://katosalsahub.pl/grafik.html

#SalsaKatowice #KatoSalsaHub #SalsaCubana #Katowice #TaniecKatowice #RuedaDeCasino #Timba #WolniLudzie
```

---

### 5.3 Szablon 2: Dodawanie wydarzenia w Wizytówce Google (`Posts` $\rightarrow$ `Event`)
> **⚠️ WAŻNE ZASADY GOOGLE BUSINESS PROFILE:**
> 1. **Limit tytułu (`Title*`):** maksymalnie **58 znaków** (dłuższe tytuły są ucinane). Zawsze zaczynaj od `Salsa Katowice: ...`.
> 2. **Zakaz adresów URL i `.pl` w polu `Description`:** filtr antyspamowy Google odrzuca opisy zawierające surowe domeny (np. `katosalsahub.pl`) błędem `Nieprawidłowa wartość`. Linki wklejaj wyłącznie w dedykowanym polu przycisku (`Button` $\rightarrow$ `Learn more`).

- **Tytuł (Niedzielna potańcówka – Wolni Ludzie, 53/58 znaków):**
  ```text
  Salsa Katowice: Habana Picante – Wolni Ludzie vol. XX
  ```
- **Tytuł (Plener taneczny – Dolina 3 Stawów / NOSPR, 51/58 znaków):**
  ```text
  Salsa Katowice: Salsowy Plener – Trzy Stawy vol. XX
  ```
- **Opis wydarzenia (Wolni Ludzie – bez `.pl` w treści):**
  ```text
  Niedzielna potańcówka salsy kubańskiej w sercu Katowic! Spotykamy się w lokalu Wolni Ludzie (ul. Mariacka 2, Katowice) od 15:00 do 18:00. Gramy gorącą Salsę Cubana (Casino), energetyczną Timbę, tańczymy w kole Rueda de Casino oraz bachatę i kizombę. Nie musisz mieć własnej pary – przyjdź solo lub ze znajomymi i poczuj kubański klimat! Darmowy parking w niedzielę pod NOSPR-em (spacerem przez kładkę).
  ```
- **Opis wydarzenia (Plener 3 Stawy – bez `.pl` w treści):**
  ```text
  Darmowy plener taneczny salsy kubańskiej w Katowicach! Spotykamy się w Dolinie Trzech Stawów (Kamienny Krąg przy ul. Trzech Stawów 22, obok przystani) na wspólnym tańcu pod chmurką. Gramy gorącą Salsę Cubana (Casino), energetyczną Timbę, Rueda de Casino oraz bachatę i kizombę. Wpadaj solo lub ze znajomymi!
  ```
- **Przycisk (`+ Button` $\rightarrow$ `Learn more`):**
  Link bezpośrednio do wydarzenia na Facebooku (`https://www.facebook.com/events/...`).

---

### 5.4 Szablon 3: Konfiguracja Wizytówki Google (`Kato Salsa Hub`) oraz punktu POI `Kamienny Krąg`
Panel zarządzania: **[https://business.google.com/locations](https://business.google.com/locations)** (lub wpisz `moja firma` w Google).

- **Nazwa profilu (podczas weryfikacji):** `Kato Salsa Hub` *(po pełnej weryfikacji można rozwinąć do `Kato Salsa Hub – Salsa Katowice`)*
- **Kategoria główna:** `Organizator imprez` (`Event planner`) lub `Szkoła tańca` (`Dance school`) *(unikaj ustawiania `Klub taneczny` jako kategorii głównej przy braku własnego budynku na wyłączność)*
- **Kategorie dodatkowe:** `Klub taneczny` (`Dance club`), `Zespół taneczny` (`Dance company`), `Stowarzyszenie lub organizacja` (`Association or organization`)
- **Adres stacjonarny vs. Obszar działania (KRYTYCZNE – Service Area Business):**
  - W sekcji **Lokalizacja (`Location`)** przełącznik **„Pokaż adres firmy klientom” (`Show business address to customers`)** musi być **WYŁĄCZONY (`OFF`)**, aby wizytówka nie kolidowała z adresem baru *Wolni Ludzie* (`ul. Mariacka 2`) ani restauracji *La Cantina* (`ul. Trzech Stawów 22`).
  - **Obszar działania (`Service area`):** `Katowice, Polska` (opcjonalnie dodatkowo: `Chorzów`, `Sosnowiec`, `Gliwice`, `Tychy`).
- **Godziny otwarcia (`Hours`):** `Open 24 hours` (Poniedziałek–Niedziela) lub `Open with no main hours` *(aby wizytówka nigdy nie wyświetlała czerwonego statusu „Zamknięte” w dni powszednie i zyskiwała bonus rankingowy „Openness” w Google Maps)*.
- **Punkt na mapie `Kamienny Krąg – Dolina Trzech Stawów` (Zwykłe miejsce POI w Google Maps, NIE wizytówka firmowa!):**
  - **Nigdy nie utrzymuj „Kamiennego Kręgu” jako wizytówki firmowej w `business.google.com`** (jeśli tam powstała – usuń ją przez *Ustawienia profilu firmy $\rightarrow$ Usuń profil firmy*).
  - Jako zwykłe oznaczenie miejsca na mapie (Google Maps $\rightarrow$ *Opublikuj* $\rightarrow$ *Dodaj miejsce*) zgłaszaj wyłącznie z kategorią **`Atrakcja turystyczna`** lub **`Punkt widokowy`**, ze szpilką GPS ustawioną dokładnie na **`50.2449289, 19.046362`** (**bez wpisywania numeru budynku `ul. Trzech Stawów 22`**, bez strony WWW i bez numeru telefonu).
- **Opis profilu (`Description` – do 750 znaków, bez `.pl`):**
  ```text
  Kato Salsa Hub to otwarta społeczność tancerzy salsy kubańskiej (Salsa Cubana / Casino), Timby, Rueda de Casino, Bachaty i Kizomby w Katowicach i na Śląsku. Organizujemy regularne niedzielne potańcówki i praktyki taneczne w lokalu Wolni Ludzie (ul. Mariacka 2, Katowice) oraz darmowe plenery taneczne w Dolinie Trzech Stawów (Kamienny Krąg) i w Strefie Kultury pod Amfiteatrem NOSPR. Na naszej stronie internetowej znajdziesz interaktywną mapę parkietów i darmowych parkingów w Katowicach, całodobowe radio kubańskie Timba Nation 24/7 bez reklam, aktualny kalendarz imprez tanecznych na Śląsku DancePuls oraz Salsopedię – encyklopedię ponad 200 figur salsy, szkół tańca i instruktorów. Dołącz solo lub w parze!
  ```
- **Kafelki Produktowe (`Edit products`):**
  1. **Kafelek 1:**
     - **Nazwa:** `Salsa Katowice – Potańcówki i Plenery!`
     - **Kategoria:** `Salsa Katowice`
     - **Opis:** `Cotygodniowe niedzielne potańcówki i praktyki salsy kubańskiej w lokalu Wolni Ludzie (ul. Mariacka 2, Katowice) oraz darmowe plenery taneczne w Dolinie Trzech Stawów i pod NOSPR-em. Tańczymy Salsę Cubana (Casino), Timbę, Rueda de Casino, Bachatę i Kizombę. Przyjdź solo lub w parze – na miejscu poznasz świetnych ludzi i sprawdzisz ponad 200 figur w naszej Salsopedii!`
     - **URL:** `https://katosalsahub.pl/`
  2. **Kafelek 2:**
     - **Nazwa:** `Wspólny Grafik Szkół Tańca Katowice (128 kursów)`
     - **Kategoria:** `Salsa Katowice`
     - **Opis:** `Porównaj w jednym miejscu 128 kursów Salsy Cubana, Ruedy, Bachaty i Kizomby w katowickich szkołach tańca (La Clave, Good Mood, Mil Pasos), sprawdź kalkulator cen karnetów, nadchodzące imprezy DancePuls i mapę 8 lokalizacji.`
     - **URL:** `https://katosalsahub.pl/grafik.html`
  3. **Kafelek 3:**
     - **Nazwa:** `Salsopedia – Ponad 200 Figur Salsy Kubańskiej`
     - **Kategoria:** `Salsa Katowice`
     - **Opis:** `Pierwsza polska otwarta encyklopedia salsy kubańskiej (Casino i Rueda de Casino), komend ruedowych, instrumentów oraz katalog szkół tańca i instruktorów w Katowicach.`
     - **URL:** `https://katosalsahub.pl/salsopedia.html`
- **Link do zbierania opinii od uczestników (z frazami „salsa w Katowicach”, „Wolni Ludzie”, „3 Stawy”):**
  - W panelu wizytówki kliknij **`Ask for reviews`** (`Poproś o opinie`).
  - Właściciel/administrator konta Google zarządzającego wizytówką **nie wystawia opinii samemu sobie**, natomiast **odpowiada na każdą opinię uczestników**, używając w odpowiedzi słów kluczowych (np. *„Dziękujemy za wspólny taniec! Cieszymy się, że salsa w Katowicach i nasze potańcówki w Wolnych Ludziach oraz plenery na 3 Stawach dają tyle kubańskiej energii!”*).

---

### 5.5 Szablon 4: Post powitalny dla nowych członków grupy FB (Onboarding + Ruch na stronę i SEO)
> **💡 INSTRUKCJA EDYCJI POSTA POWITALNEGO NA FACEBOOKU:**
> 1. **Nie kasuj podświetlonych na niebiesko imion i nazwisk** wygenerowanych przez Facebooka – to aktywne wzmianki (`@`), dzięki którym nowe osoby dostają powiadomienie.
> 2. Kliknij kursorem **na samym końcu po ostatnim nazwisku**, naciśnij **2x Enter** i wklej poniższy blok.
> 3. **Opcjonalny trik na większy ruch (CTR):** Jeśli po wklejeniu tekstu klikniesz `X` na domyślnym fioletowym obrazku powitalnym Facebooka, post automatycznie zaciągnie duży, klikalny kafel podglądu strony `https://katosalsahub.pl/` z naszym logo.

```text
🔥 ¡Hola! Witamy na pokładzie Kato Salsa Hub – największej społeczności Salsy Kubańskiej (Casino, Timba, Rueda de Casino), Bachaty i Kizomby w Katowicach i na Śląsku! 💃🕺

Żebyście od razu czuli się u nas jak w domu, łapcie nasz Pakiet Startowy Tancerza (zapiszcie sobie te linki!):

🌐 1. OFICJALNA STRONA & MAPA MIEJSCÓWEK (+ PARKINGI I RADIO 24/7):
Sprawdźcie, gdzie dokładnie tańczymy w Katowicach (lokal Wolni Ludzie na ul. Mariackiej 2, Kamienny Krąg w Dolinie Trzech Stawów, Amfiteatr NOSPR), gdzie zaparkować za darmo i posłuchajcie naszego kubańskiego radia Timba Nation 24/7 bez reklam:
👉 https://katosalsahub.pl/

📚 2. SALSOPEDIA – PONAD 200 FIGUR I KOMEND RUEDA DE CASINO:
Uczycie się salsy lub chodzicie na kursy? Na naszej stronie macie pierwszą w Polsce otwartą encyklopedię ponad 200 figur salsy kubańskiej, słownik komend ruedowych oraz bazę szkół i instruktorów w Katowicach:
👉 https://katosalsahub.pl/salsopedia.html

📅 3. WSPÓLNY GRAFIK SZKÓŁ I KALENDARZ IMPREZ NA ŚLĄSKU (DANCEPULS):
Aktualny rozkład 128 kursów tanecznych, salsotek, praktyk, warsztatów i plenerów w całym regionie:
👉 https://katosalsahub.pl/grafik.html

🎉 4. NAJBLIŻSZA POTAŃCÓWKA W KATOWICACH (NIEDZIELA 15:00–18:00):
Widzimy się w niedzielę w lokalu Wolni Ludzie (ul. Mariacka 2, Katowice) – wpadajcie solo lub ze znajomymi, na miejscu rotujemy w parach i tańczymy w kole!

💬 Dajcie znać w komentarzu: od jak dawna tańczycie (albo czy dopiero zaczynacie przygodę z salsą) i kiedy widzimy się na parkiecie! 👇🔥

#SalsaKatowice #KatoSalsaHub #SalsaCubana #Katowice #TaniecKatowice #RuedaDeCasino #Timba #WolniLudzie #Salsopedia
```


