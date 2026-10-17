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

### 1.2 Filar 2: DancePuls (`dancepuls.pl`)
- **Rola:** Silnik agregacji, kuratorstwa i automatyzacji imprez, warsztatów i festiwali tanecznych (woj. śląskie i Kraków).
- **Technologia:** Vanilla JS, Markdown / Flat-File JSON database, Node.js (`sync_engine.js`).
- **Główne moduły:**
  - Baza imprez: `dancepuls.pl/data/events_database.md` oraz skompilowany plik bazy `dancepuls.pl/data/events.json`.
  - Generator cyklicznych raportów weekendowych: `dancepuls.pl/data/latest_report.md`.
  - Silnik synchronizacji: `dancepuls.pl/tools/sync_engine.js` (pobiera zgłoszenia z Google Forms CSV, parsuje Markdown, aktualizuje JSON, generuje posty na FB i raporty).
  - Interaktywny kalendarz imprez z filtrami miast i stylów (`app.js`, `parser.js`, `weather.js`).
- **Hosting docelowy (LH.pl):**
  - Produkcja: `/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl`
  - Staging: `/home/platne/serwer417204/public_html/staging.katosalsahub.pl/dancepuls`

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
