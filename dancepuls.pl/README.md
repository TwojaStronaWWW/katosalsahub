# 🕺 Dance Puls - Generator Zestawienia Imprez

Kompleksowe narzędzie do szybkiego tworzenia postów z zestawieniami imprez tanecznych (Salsa, Bachata, Kizomba) na grupy Facebookowe oraz Instagram. System automatyzuje proces zbierania danych z wydarzeń FB oraz zgłoszeń z formularzy CSV.

## 🚀 Główne Funkcje

- **Pełny Automat Facebook**: Skraper w formie skryptu konsolowego wyciąga dane JSON-LD bezpośrednio z FB i automatycznie wkleja je do generatora.
- **Skrzynka Odbiorcza (CSV)**: Integracja z arkuszami Google (np. z formularza zgłoszeniowego). Automatyczne filtrowanie starych wydarzeń.
- **Inteligentne Parsowanie**: Automatyczne rozpoznawanie dat, miast, klubów i stylów tanecznych na podstawie treści.
- **Live Preview**: Generowanie posta w czasie rzeczywistym z odliczaniem wydarzeń i odmienianiem numerów tygodni.
- **Pomocnik Ankiet**: Generowanie gotowych linii do ankiet na FB, kopiowanych jednym kliknięciem.
- **Pogoda**: Dynamiczny widżet pogodowy dla regionu (Silesia).

## 🛠️ Struktura Projektu

```text
├── index.html          # Główny interfejs aplikacji
├── README.md           # Dokumentacja projektu
├── css/
│   └── style.css       # Style (Modern Dark Mode + Glassmorphism)
├── tools/
│   ├── fb_scraper.js   # Skrypt do kopiowania danych z Facebooka
│   └── bookmarklet.js  # Skrypt bookmarkletu
├── js/
│   ├── app.js          # Główna logika aplikacji i zarządzanie stanem
│   ├── config.js       # Dane konfiguracyjne (miasta, style, linki)
│   ├── parser.js       # Logika przetwarzania danych ze schowka
│   ├── utils.js        # Funkcje pomocnicze (daty, formatowanie)
│   └── weather.js      # Integracja z API pogodowym
└── assets/             # Obrazy i inne zasoby statyczne
```

## 📖 Instrukcja Obsługi

### 1. Pobieranie danych z Facebooka
1. Kliknij przycisk **📋 Kopiuj Skraper** w generatorze.
2. Przejdź na widok wydarzeń na Facebooku.
3. Otwórz konsolę (F12) i wklej skrypt.
4. Skopiowane dane zostaną automatycznie wykryte po powrocie do generatora.

### 2. Korzystanie ze Skrzynki CSV
1. Podepnij link do eksportu CSV z arkusza Google w `js/app.js` (zmienna `HIDDEN_SHEET_URL`).
2. Kliknij **🔄 Sprawdź**, aby pobrać nowe zgłoszenia.
3. System automatycznie pominie stare wydarzenia. Kliknij **Zatwierdź**, aby przenieść zgłoszenie na główne listy.

### 3. Generowanie Posta na FB (Nowy Workflow)
Generator wykorzystuje dwuetapowy proces publikacji, zgodny z najlepszymi praktykami FB:

**Krok 1: Szkielet Zestawienia (Post główny)**
- Kliknij **📋 KOPIUJ SZKIELET ZESTAWIENIA DO POSTA FB**
- Kopiuje: pogrubiony tytuł tygodnia, nagłówki dni (Piątek-Niedziela), info "linki w komentarzu" oraz hashtagi
- Wklej jako główny post na FB

**Krok 2: Podsumowanie (Komentarz)**
- Kliknij **📋 KOPIUJ PODSUMOWANIE DO KOMENTARZA NA FB**
- Kopiuje: szczegółową listę wszystkich imprez z linkami
- Wklej w pierwszym komentarzu pod postem

💡 **Dlaczego dwa kroki?** Facebook lepiej promuje posty z krótkimi nagłówkami i linkami umieszczonymi w komentarzach (lepsze zasięgi organiczne).

### 4. Dodatkowe Funkcje
- **🌐 Otwórz zakładki**: Automatycznie otwiera wszystkie strony FB z wydarzeniami (skonfigurowane w `config.js`)
- **🔢 Szybka Ankieta**: Generuje gotowe opcje do ankiet FB (prawa kolumna)
- **Drag & Drop**: Przeciągaj wydarzenia, aby zmienić kolejność w podsumowaniu

## ⚙️ Konfiguracja

Wszystkie kluczowe dane znajdują się w `js/config.js`:
- `miejscaWgMiasta`: Słownik klubów i miejsc podzielony na miasta.
- `style`: Lista dostępnych tagów tanecznych.
- `styleKeywords`: Słowa kluczowe używane do automatycznego dopasowania stylów.

## 📝 Technologia

Projekt oparty o **Vanilla JS**, **Modern CSS** oraz **HTML5**. Nie wymaga serwera do działania (może być uruchamiany bezpośrednio z pliku, choć zalecany jest prosty local-server do obsługi modułów ES6).

---
*Autor: Dance Puls Team*
