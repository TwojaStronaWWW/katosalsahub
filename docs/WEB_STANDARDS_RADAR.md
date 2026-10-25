# 📡 Rejestr Standardów Webowych i Protokół Ciągłej Aktualizacji (Evergreen Web Standards Radar)

Niniejszy dokument stanowi **oficjalną mapę źródeł referencyjnych (Upstream Gold Standards)** dla szablonu `_site-template` oraz wszystkich projektów potomnych w ekosystemie **TwojaStronaWWW**.

Jego celem jest zapewnienie, aby każdy Agent AI (Antigravity / Gemini / Claude / Copilot) oraz proces walidacji przy **tworzeniu nowego projektu, łączeniu zmian (merge/sync z `_site-template`) lub aktualizacji szablonu** automatycznie wiedział, skąd pobierać najnowsze praktyki inżynieryjne bez naruszania filozofii **Platform-First & Zero-Bloat**.

---

## 1. Mapa Przypisów Referencyjnych (`[REF-01]` – `[REF-08]`)

Wszystkie przypisy `[REF-XX]` w kodzie źródłowym (`.htaccess`, `index.html`, `assets/css/main.css`, `api/*.php`, `AGENTS.md`) odnoszą się do poniższych kanonicznych źródeł:

| Identyfikator | Obszar Architektury | Kanoniczne Źródło Upstream (URL / Repozytorium) | Co weryfikujemy i wdrażamy w `_site-template` |
| :--- | :--- | :--- | :--- |
| **`[REF-01]`** | **Serwer HTTP, `.htaccess`, Nagłówki i Kompresja** | `https://github.com/h5bp/server-configs-apache`<br>`https://observatory.mozilla.org/` | Kompresja `mod_brotli` + `mod_deflate`, nagłówki `Strict-Transport-Security`, `Content-Security-Policy`, `Cross-Origin-Opener-Policy` (`COOP`), `Cross-Origin-Resource-Policy` (`CORP`), `Permissions-Policy`, typy MIME (`avif`, `webp`, `webmanifest`, `md`) oraz wykluczenie cache dla `sw.js`. |
| **`[REF-02]`** | **Kolejność `<head>`, Nawigacja `0 ms` i Core Web Vitals** | `https://github.com/rviscomi/capo.js`<br>`https://web.dev/baseline` | Optymalna kolejność znaczników w `<head>` wg wag parsera Chromium (`charset` $\rightarrow$ `viewport` $\rightarrow$ `title` $\rightarrow$ `preconnect` $\rightarrow$ `stylesheet` $\rightarrow$ `meta/JSON-LD`), deklaratywne **Speculation Rules API** (`<script type="speculationrules">`) oraz `fetchpriority="high"` dla głównego zasobu LCP. |
| **`[REF-03]`** | **Nowoczesny Vanilla CSS & Stabilność Geometryczna (`CLS = 0`)** | `https://github.com/argyleink/open-props`<br>`https://web.dev/baseline` | Zmienne systemowe `:root` (`color-scheme: dark light`), `scrollbar-gutter: stable` na `html`, płynne przejścia między podstronami `@view-transition { navigation: auto; }` (z poszanowaniem `prefers-reduced-motion`), typografia `text-wrap: balance` (nagłówki) i `text-wrap: pretty` (akapity). |
| **`[REF-04]`** | **Dostępność Cyfrowa (WCAG 2.2 AA/AAA & WAI-ARIA)** | `https://github.com/w3c/aria-practices`<br>`https://github.com/alphagov/govuk-frontend` | Nawigacja klawiaturą (`.skip-link`, `focus-visible`, focus-trap w Lightboxie), role `alert`/`status`/`aria-live`, brak pustych linków `href="#"`, pełna obsługa czytników ekranu bez zewnętrznych bibliotek UI. |
| **`[REF-05]`** | **Bezpieczeństwo Aplikacji, Backendu PHP i CI/CD (ISO 27001 / OWASP)** | `https://github.com/OWASP/ASVS`<br>`https://github.com/OWASP/CheatSheetSeries` | Walidacja nagłówków **Fetch Metadata (`Sec-Fetch-Site`)** przeciwko żądaniom `cross-site`, tokeny CSRF (`random_bytes` + `hash_equals`), atomowe blokady `flock(LOCK_EX)` (Anti-TOCTOU), wczesne `@session_write_close()`, utwardzony klient cURL (`CURLOPT_FOLLOWLOCATION => false`, `CURLPROTO_HTTPS`), zegar monotoniczny (`getMonotonicMs()`), strażnik `NETWORK_FORBIDDEN` w testach jednostkowych, `persist-credentials: false` w GitHub Actions oraz hybrydowa bramka AI PR Review (`.gemini/config.yaml` + `ai-security-review.yml`). |
| **`[REF-06]`** | **Polityka Zgłaszania Podatności (RFC 9116)** | `https://securitytxt.org/`<br>`https://www.rfc-editor.org/rfc/rfc9116` | Plik `/.well-known/security.txt` z polami `Contact:`, `Expires:` (zawsze aktualna data w przyszłości w formacie ISO-8601), `Preferred-Languages:`, `Canonical:` oraz `Policy:`. |
| **`[REF-07]`** | **Optymalizacja dla Wyszukiwarek AI (GEO / AI Search)** | `https://llmstxt.org/` | Plik `/llms.txt` w głównym katalogu domeny powiązany w `<head>` (`<link rel="alternate" type="text/markdown" href="llms.txt">`) oraz zsynchronizowany z bazą wiedzy RAG (`docs/AI_KNOWLEDGE_TEMPLATE.md`) i `robots.txt` (`Allow: /llms.txt`). |
| **`[REF-08]`** | **SEO On-Page, Schema.org `@graph` & Wizytówka Google (GBP)** | `https://schema.org/docs/gs.html`<br>`https://www.indexnow.org/` | Przekierowanie `301` non-www, pełny graf JSON-LD (`Organization`/`LocalBusiness` z `sameAs`, `WebSite`, `FAQPage`), ochrona snippetów `data-nosnippet` na widgecie AI (`#tsw-ai-widget-root`) oraz klucz weryfikacyjny IndexNow API. |

---

## 2. Automatyczny Protokół Wykonawczy przy Łączeniu Projektu lub Aktualizacji Szablonu

Każdorazowo podczas wykonywania jednej z trzech operacji:
1. **Inicjalizacja nowego projektu** na bazie `_site-template`,
2. **Łączenie zmian (Merge / Sync)** pomiędzy `_site-template` a projektem docelowym (`twojastronawww.pl`, `fuegolingua.pl`, `katosalsahub.pl`, `raric.art`, `radar-p1` itp.),
3. **Cykliczna walidacja jakościowa (`npm run check`) lub audyt szablonu**,

**Agent AI oraz potok CI/CD wykonują automatycznie następującą procedurę 5 kroków:**

### Krok 1: Weryfikacja Daty Ważności i Domeny w `/.well-known/security.txt` (`[REF-06]`)
- Sprawdź pole `Expires:` w pliku `.well-known/security.txt`.
- Jeśli do wygaśnięcia pozostało mniej niż 30 dni (co jest automatycznie kontrolowane przez test w `tests/unit/repo-hygiene.test.js`), przedłuż datę `Expires:` o kolejny rok.
- Podczas łączenia z projektem docelowym podmień `twojadomena.pl` w polach `Canonical:` i `Policy:` na docelową domenę produkcyjną.

### Krok 2: Synchronizacja `/llms.txt` z Bazą Wiedzy RAG (`[REF-07]`)
- Podczas aktualizacji oferty, cennika lub godzin otwarcia w projekcie docelowym (lub w pliku wiedzy `<site_id>-knowledge.txt`), zaktualizuj jednocześnie plik `/llms.txt`, aby zewnętrzne wyszukiwarki AI (ChatGPT Search, Perplexity, Claude, Google AI Overviews) otrzymywały spójne dane z naszym wewnętrznym Asystentem AI.

### Krok 3: Kontrola Kolejności `<head>` (Capo.js) i Speculation Rules (`[REF-02]`)
- Upewnij się, że w każdym pliku `.html` deklaracje `<meta charset>`, `<meta name="viewport">`, `<title>`, `<link rel="preconnect">` i `<link rel="stylesheet">` znajdują się **przed** blokami JSON-LD `Schema.org` i meta tagami społecznościowymi.
- Upewnij się, że deklaracja `<script type="speculationrules">` wyklucza ścieżki `/api/*` oraz akcje administracyjne (`admin.php`, `logout`).

### Krok 4: Kontrola Nagłówków Bezpieczeństwa i Fetch Metadata (`[REF-01]`, `[REF-05]`)
- Zweryfikuj, czy każdy nowy endpoint PHP przyjmujący mutacje (`POST`/`DELETE`) korzysta z weryfikacji `Sec-Fetch-Site` (`verify_fetch_metadata()` lub bezpośredniej blokady `cross-site`), tokenów CSRF (`csrf_check()`) oraz atomowego zapisu `flock(LOCK_EX)`.

### Krok 5: Automatyczna Egzekucja Bramy Jakości (`npm run check`)
- Uruchom `npm run check` (obejmujący analizę składni JS oraz 100% testów w `tests/unit/*.test.js`).
- Testy w `tests/unit/repo-hygiene.test.js`, `tests/unit/html-integrity.test.js` oraz `tests/unit/css-integrity.test.js` pełnią rolę **automatycznego strażnika** wszystkich punktów `[REF-01]`–`[REF-08]` — jakiekolwiek pominięcie standardu podczas łączenia projektu natychmiast zablokuje commit (`pre-commit`) oraz potok GitHub Actions (`ci.yml`).
