# PLAYBOOK SEO & WIZYTÓWKA GOOGLE (GOOGLE BUSINESS PROFILE): STANDARD TWOJASTRONAWWW

Kompletna procedura wdrożenia technicznego SEO, indeksacji w Google Search Console, IndexNow API oraz konfiguracji Wizytówki Google (Google Business Profile) dla każdego projektu na bazie `_site-template` (wypracowana produkcyjnie na wdrożeniu Kato Salsa Hub & DancePuls).

---

## 1. CHECKLISTA TECHNICZNEGO SEO (ON-PAGE & SERWER)

### 1.1 Przekierowanie `301` z `www.` na czystą domenę w `.htaccess`
Google traktuje `https://www.twojadomena.pl` oraz `https://twojadomena.pl` jako dwie osobne strony (duplikacja treści i rozbicie mocy SEO). W pliku `.htaccess` zawsze musi znajdować się uniwersalna reguła:
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
  RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]
</IfModule>
```

### 1.2 Kanoniczne URL-e i Mapa Witryny (`canonical` + `sitemap.xml` + `robots.txt`)
- Każda podstrona HTML musi posiadać jawny tag `<link rel="canonical" href="https://twojadomena.pl/...">` (bez `www`).
- W `robots.txt` umieszczamy pełny link do mapy witryny (oraz subdomen projektu, jeśli istnieją):
  ```text
  User-agent: *
  Allow: /

  Sitemap: https://twojadomena.pl/sitemap.xml
  ```

### 1.3 Ochrona Snippetów w Google (`data-nosnippet`)
> **⚠️ KRYTYCZNA PUŁAPKA SEO:** Jeśli na stronie działa wbudowany widget czatu AI (`ai-widget.js`) lub baner cookies (`#cookie-banner`), Googlebot może pobrać powitalny komunikat czatu (*„Cześć! Jestem wirtualnym asystentem...”*) i wyświetlić go w wynikach wyszukiwania Google zamiast właściwego opisu strony (`<meta name="description">`).

- Kontener główny widgetu AI (`#tsw-ai-widget-root` w `assets/js/ai-widget.js`) oraz banery cookies zawsze muszą posiadać atrybut:
  ```html
  <div id="tsw-ai-widget-root" data-nosnippet></div>
  <div id="cookie-banner" data-nosnippet></div>
  ```

### 1.4 Wykluczenie plików weryfikacyjnych `google*.html` z audytu Lighthouse CI
Pliki weryfikacyjne Google Search Console (np. `google0b6228584fad3500.html`) nie posiadają znaczników `<title>`, `lang` ani `meta viewport`, przez co skan całego katalogu w Lighthouse CI zakończy się błędem `SEO: 0`.
- W `.lighthouserc.json` zawsze deklaruj jawną tablicę `url` z właściwymi podstronami projektu:
  ```json
  "collect": {
    "staticDistDir": "./",
    "url": [
      "http://localhost/index.html"
    ],
    "numberOfRuns": 2
  }
  ```

### 1.5 Graf Danych Strukturalnych `Schema.org` (`@graph` JSON-LD)
W sekcji `<head>` pliku `index.html` umieszczamy połączony graf JSON-LD obejmujący:
1. **`Organization` + `LocalBusiness` / branżowy podtyp** (z polami `name`, `alternateName`, `url`, `logo`, `description`, `areaServed`, `location` oraz tablicą `sameAs` zawierającą linki do oficjalnego Fanpage'a Facebook i profilu Instagram).
2. **`WebSite`** (powiązany przez `publisher` z `#organization`).
3. **`FAQPage`** (4–6 najczęstszych pytań klientów z lokalnymi frazami kluczowymi pod rozszerzone wyniki Rich Snippets w Google).
4. **`Event` / `DanceEvent`** (jeśli firma organizuje wydarzenia cykliczne – dzięki temu Google wyświetla je w karuzeli **„Wydarzenia w pobliżu”**).

---

## 2. BŁYSKAWICZNA INDEKSACJA (GOOGLE SEARCH CONSOLE + INDEXNOW API)

1. **Google Search Console (`https://search.google.com/search-console`):**
   - Dodaj usługę typu **Prefiks adresu URL** (`https://twojadomena.pl/`).
   - Zweryfikuj własność plikiem HTML `google*.html` w katalogu głównym.
   - W sekcji **Mapy witryn (Sitemaps)** prześlij `sitemap.xml`.
   - W górnym pasku **Sprawdź dowolny adres URL** wpisz `https://twojadomena.pl/` i kliknij **Poproś o zindeksowanie** (`Request indexing`).
2. **Natychmiastowy Ping IndexNow API (Bing, Yandex, Naver, Seznam):**
   ```bash
   curl -s -X POST "https://api.indexnow.org/indexnow" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d '{
       "host": "twojadomena.pl",
       "key": "<TWOJ_KLUCZ_INDEXNOW>",
       "keyLocation": "https://twojadomena.pl/<TWOJ_KLUCZ_INDEXNOW>.txt",
       "urlList": [
         "https://twojadomena.pl/"
       ]
     }'
   ```

---

## 3. WIZYTÓWKA GOOGLE (GOOGLE BUSINESS PROFILE) – ZASADY I PUŁAPKI

Panel zarządzania wizytówką: **[https://business.google.com/](https://business.google.com/)** (lub wpisz w Google hasło `moja firma`).

### 3.1 Nazwa i Kategorie (Jak wejść do Top 3 Map Google na frazy lokalne)
- **Nazwa wizytówki:** Połącz nazwę marki z główną frazą lokalną, np.:
  `Nazwa Marki – Główna Usługa Miasto` *(np. `Kato Salsa Hub – Salsa Katowice`)*.
- **Kategoria główna + Kategorie dodatkowe (`Edit profile` $\rightarrow$ `Business category`):**
  Poza kategorią główną zawsze dodaj 2–3 kategorie poboczne odpowiadające zapytaniom klientów.

### 3.2 Weryfikacja wizytówki (Sklep stacjonarny vs. Obszar działania)
- Jeżeli projekt jest społecznością, portalem lub firmą usługową działającą w mieście/wielu punktach bez własnego szyldu na drzwiach biura:
  - Podczas tworzenia wizytówki **nie zaznaczaj** opcji sklepu stacjonarnego (która wymusza trudną weryfikację wideo szyldu i zaplecza),
  - Zaznacz **„Dostarczam produkty i świadczę usługi u klientów” (Obszar działania / Service Area Business)** i wpisz miasto (np. `Katowice, Polska`). Taka wizytówka przechodzi weryfikację znacznie szybciej (często automatycznie od ręki).

### 3.3 ⚠️ ZAKAZ KROPKI DOMENOWEJ (`.pl` / `.com`) W OPISACH WIZYTÓWKI, WYDARZEŃ I PRODUKTÓW!
- **Pułapka:** Filtr antyspamowy Google Business Profile **odrzuca każdy opis** (opis firmy, opis wydarzenia, opis produktu), w którego treści znajduje się surowa nazwa domeny z kropką (np. `twojadomena.pl`), zwracając lakoniczny błąd **`Nieprawidłowa wartość` (`Invalid value`)**.
- **Rozwiązanie:** W treści opisów nigdy nie pisz `.pl` / `https://`. Adresy URL wklejaj **wyłącznie** w dedykowanych polach na linki (`Website`, `Product landing page URL` lub przycisk `Button` $\rightarrow$ `Learn more`).

### 3.4 Godziny otwarcia a algorytm „Openness” w Google Maps (`Hours`)
- **Pułapka:** Od aktualizacji algorytmu lokalnego Google, wizytówki mające status **„Zamknięte” (`Closed`)** w chwili, gdy użytkownik wpisuje zapytanie w Google (np. wieczorem lub w inny dzień tygodnia), spadają w rankingu Map Google, a czerwony napis „Zamknięte” zniechęca do kliknięcia.
- **Rozwiązanie dla portali, społeczności i usług online:**
  - **Opcja A (Rekomendowana):** Ustaw w `Hours` dla wszystkich dni tygodnia (`Monday`–`Sunday`) opcję **`24 hours` (Otwarte całą dobę)** – wizytówka zawsze świeci na zielono i otrzymuje bonus rankingowy.
  - **Opcja B:** Wybierz **`Open with no main hours`** (Otwarte bez określonych godzin) – Google zalicza pole do siły profilu, ale nigdy nie wyświetla napisu „Zamknięte”.

### 3.5 Kafelki Produktowe (`Edit products`) i Wydarzenia (`Posts` $\rightarrow$ `Event`)
1. **Kafelki Produktowe (`Edit products`):**
   - Dodaj 2–3 kafelki wizualne ze zdjęciem, których nazwa i kategoria zawierają główną frazę kluczową (`Usługa Miasto`), opis (bez `.pl`) oraz link docelowy `Product landing page URL`.
2. **Wydarzenia (`Posts` $\rightarrow$ `Add post` $\rightarrow$ `Event`):**
   - **Limit tytułu (`Title*`):** Maksymalnie **58 znaków** (zawsze zaczynaj od `Fraza Miasto: ...`).
   - **Opis (`Description`):** Do 1500 znaków, ze słowami kluczowymi, bez `.pl`.
   - **Przycisk (`+ Button` $\rightarrow$ `Learn more`):** Pełny link do wydarzenia lub strony zapisów.

### 3.6 Opinie (`Reviews`) i Sygnały Społecznościowe (`Social Signals`)
1. **Zakaz wystawiania opinii z konta właściciela:** Nigdy nie dodawaj opinii z tego samego konta Google, które zarządza wizytówką (grozi blokadą opinii lub zawieszeniem wizytówki).
2. **Opinie ze słowami kluczowymi:** Wyślij uczestnikom/klientom link z kafelka **`Ask for reviews`** i poproś, aby w treści opinii użyli naturalnie głównej frazy i lokalizacji (Google pogrubia słowa z opinii w wynikach wyszukiwania!).
3. **Odpowiedzi właściciela na opinie:** Jako właściciel odpowiadaj na każdą opinię, wplatając w odpowiedź główne słowa kluczowe i dzielnice/miejsca.
4. **Stopka SEO w wydarzeniach i postach na Facebooku:** Na dole każdego wydarzenia na FB wklejaj stopkę z pełnym linkiem `https://twojadomena.pl/` oraz hashtagami lokalnymi.
