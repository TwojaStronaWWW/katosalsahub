# Kato Salsa Hub - Dokumentacja Techniczna

## 1. Przegląd Projektu
**Kato Salsa Hub** to centrum społeczności salsowej w Katowicach. Projekt jest zbudowany w oparciu o "Vanilla" HTML, CSS i JS, bez ciężkich frameworków, co zapewnia maksymalną wydajność i łatwość utrzymania.

**Główne Funkcjonalności:**
- **Wiki (Salsopedia)**: Encyklopedia terminów tanecznych (SPA wewnątrz strony).
- **Radio Player**: Odtwarzacz muzyki z ciągłym odtwarzaniem podczas nawigacji.
- **Wydarzenia**: Informacje o spotkaniach i szkołach.

## 2. Struktura Plików
```text
/
├── index.html          # Główny punkt wejścia (zawiera nawigację i stopkę)
├── salsopedia.html     # Fragment HTML ładowany dynamicznie (SPA)
├── assets/
│   ├── css/            # Modułowa architektura CSS
│   ├── js/             # Moduły JavaScript
│   ├── images/         # Zasoby graficzne
│   └── php/            # Backend (obsługa formularzy i wiki)
```

## 3. Architektura CSS
Style są podzielone na moduły w `assets/css/` dla łatwiejszego zarządzania:

| Plik | Opis |
|------|------|
| **`style.css`** | **Fundament**. Zmienne CSS (`:root`), Reset, typografia globalna i utility classes (np. `.container`). |
| **`components.css`** | **UI Kit**. Style dla powtarzalnych elementów: Przyciski (`.btn`), Karty (`.card`), Inputy, Modale. |
| **`sections.css`** | **Layout**. Style specyficzne dla sekcji strony (Hero, O Nas, Mapa, Footer). |
| **`radio.css`** | **Komponent Radia**. Wszystkie style związane z odtwarzaczem, animacją winyla i wizualizacją. |
| **`wiki.css`** | **Salsopedia**. Style specyficzne dla modułu wiki (grid, sidebar, wyszukiwarka). |

## 4. Kluczowe Komponenty i Wzorce

### A. System Radia (Single Source of Truth)
Radio jest "obywatelem pierwszej kategorii" w aplikacji.
- **Stan**: Zarządzany w `radio.js`.
- **Wizualizacja**: Klasa `body.radio-playing` jest **jedynym źródłem prawdy** dla UI.
- **Zasada**: Gdy radio gra, JS dodaje klasę `.radio-playing` do `<body>`.
    - CSS (`radio.css`) reaguje na tę klasę: kręci winylem, animuje przycisk w headerze, startuje fale dźwiękowe.
    - Dzięki temu nie musimy ręcznie aktualizować każdego elementu UI osobno.

### B. Router SPA (v3)
Aplikacja używa lekkiego routera (`router.js`) do nawigacji bez przeładowania strony.
- **Zasada**: Przechwytuje kliknięcia w linki wewnętrzne.
- **Działanie**: Pobiera treść nowej strony via `fetch`, parsuje ją i podmienia `#app-content`.
- **Zdarzenia**: Emituje zdarzenie `page:loaded` po każdej nawigacji, co pozwala innym skryptom (np. `wiki.js`) na inicjalizację.

### C. Karty (`.card`)
Główny element budulcowy interfejsu.
- **`.card`**: Bazowy styl (tło, padding, radius).
- **`.card--interactive`**: Wariant interaktywny (hover, focus ring, transformacja).
- **`.style-card`**, **`.onas-card`**: Warianty specyficzne dla sekcji (rozszerzają bazę).

## 5. Design System (W trakcie odświeżania)
Projekt przechodzi transformację z "Underground Dark" na "Midnight Lounge".

**Kolory (Zmienne w `style.css`):**
- **Tło (`--bg`)**: Głęboki, ciepły granat/grafit (np. `#13141f`).
- **Akcenty**:
    - `--yellow`: `#ffd32a` (Główny akcent)
    - `--orange`: `#ffa502`
    - `--red`: `#ff4757`

## 6. Salsopedia (Wiki)
Moduł wiki (`wiki.js`) działa w oparciu o architekturę sterowaną zdarzeniami.
- **Inicjalizacja**: Funkcja `mountWiki()` jest wywoływana tylko gdy router załaduje stronę z `salsopedia` w URL.
- **API**: Komunikuje się z `assets/php/wiki.php` do pobierania i wysyłania haseł.
- **Moderacja**: Posiada ukryty tryb weryfikacji dostępny dla administratorów (hasło w sessionStorage).

---
*Dokumentacja wygenerowana automatycznie: 2026-02-10*
