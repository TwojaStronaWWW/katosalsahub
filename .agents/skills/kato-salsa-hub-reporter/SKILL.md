---
name: kato-salsa-hub-reporter
description: Generator cyklicznych raportów imprez, warsztatów i festiwali tanecznych (Salsa Cubana, Bachata, Kizomba) dla Kato Salsa Hub i DancePuls (woj. śląskie i Kraków). Użyj, gdy użytkownik pyta o zestawienie imprez, raport na weekend lub aktualizację bazy wydarzeń.
---

# Kato Salsa Hub & DancePuls Reporter

Zautomatyzowany generator zestawień imprezowych dla społeczności tanecznej na Śląsku oraz w Krakowie, połączony z aplikacją webową `dancepuls.pl` i silnikiem `dancepuls.pl/tools/sync_engine.js`.

## 1. Zakres Stylów i Geografii
- **Style:** Salsa (zwłaszcza Cubana/casino, timba, son, rueda), Bachata (wszystkie odmiany), Kizomba/Semba/Urban Kiz, tańce kubańskie.
- **Typy:** Imprezy, potańcówki (social), practisy, warsztaty, festiwale, maratony taneczne.
- **Wykluczenia:** Zwykły grafik regularnych kursów tygodniowych, czysty Zouk/WCS, lokalizacje poza woj. śląskim i Krakowem (np. Opole, Poronin, Murzasichle, Bartkowa).
- **Obszar:** Całe województwo śląskie (Katowice, Gliwice, Sosnowiec, Zabrze, Tychy, Chorzów, Bielsko-Biała, Cieszyn, Żywiec, Rybnik, Częstochowa, Dąbrowa Górnicza, Siewierz, Piekary Śląskie, Szczyrk, Wisła, Hucisko itd.) oraz miasto Kraków.

## 2. Stała Baza Danych, Skróty i Narzędzia
- **Baza główna (Single Source of Truth):** `dancepuls.pl/data/events_database.md`
  - Sekcje w bazie:
    - `## OPIS POSTA (SEKCJA 2)` — zredagowane, naturalne zdania na `PIĄTEK|...`, `SOBOTA|...`, `NIEDZIELA|...`
    - `## BIEŻĄCY WEEKEND (DD–DD.MM.RRRR)` — wydarzenia bieżącego weekendu (pt–nd)
    - `## PN–CZ BIEŻĄCEGO TYGODNIA` — wydarzenia pn–cz (poza ankietą weekendową, raportowane w Sekcji 6)
    - `## DALSZE TERMINY (KOLEJNE TYGODNIE)` — wszystkie przyszłe zapowiedzi i festiwale (Komentarz 2)
    - `## NIEPEWNE TROPY (POZA PUBLIKACJĄ)` — tropy wymagające potwierdzenia (trafiają wyłącznie do prywatnej Sekcji 6)
    - `## ARCHIWUM MINIONE` — zachowane minione edycje
  - Format wiersza: `data|miejsce|nazwa|style|źródło|uwagi/organizator`
  - Skróty linków automatycznie rozwijane przez `sync_engine.js`:
    - `F:ID` -> `https://www.facebook.com/events/ID/`
    - `O:ID` -> `https://onlydanceapp.com/event/ID`
  - Skróty miejsc (`VENUE_MAP`): `LC`, `EV`, `MP`, `GR`, `KL`, `TS`, `DL`, `SA`, `FT`, `PR`, `LO`, `ZW`, `MY` (dla `MY` lokal podawany po przecinku, np. `MY,Mojitos,Mikołajska13`).
- **JSON dla aplikacji DancePuls:** `dancepuls.pl/data/events.json`
- **Gotowy 6-sekcyjny raport:** `dancepuls.pl/data/latest_report.md`
- **Silnik automatyzacji:** `dancepuls.pl/tools/sync_engine.js` (uruchamiany przez `npm run report` lub `node dancepuls.pl/tools/sync_engine.js`).

## 3. Zasady Pracy Oszczędnej i Weryfikacji
1. **Praca przyrostowa:** Zaczynaj od `dancepuls.pl/data/events_database.md`. Znanych i potwierdzonych wydarzeń NIE wyszukuj ponownie; szukaj przyrostowo nowych ogłoszeń i sygnałów zmian od ostatniego sprawdzenia.
2. **Rotacja źródeł regionalnych:** Łącz niezależne zapytania, rotuj podregiony (Katowice/Aglomeracja, Rybnik/Gliwice/Tychy, Bielsko/Cieszyn/Żywiec, Częstochowa/Zagłębie, Kraków).
3. **Deduplikacja:** Klucz to `nazwa + termin + miejsce + organizator`, a nie sam URL. Nie usuwaj pozycji z powodu braku w dzisiejszych wynikach wyszukiwania.
4. **Sprawdzone źródła:**
   - Formularz Google KSH (CSV): sprawdzany automatycznie przez `sync_engine.js`.
   - Publiczna strona FB KSH: `https://www.facebook.com/KatoSalsaHub`.
   - Agregatory: Sabaki (`sabaki.dance`), OnlyDance (`onlydanceapp.com`), Danzly (`danz.ly`), Airdancia (`airdancia.com`), Krajownik (`krajownik.pl`), HappeningNext (`happeningnext.com`).
   - Oficjalne strony szkół: `milpasoskatowice.pl/?page=wydarzenia`, `spontanlatinonapaprach.pl`, `danceloveit.pl/bachata-party-bielsko/`, `salsasabrosa.pl`, `sklep.loftodance.pl/wydarzenia`, `jndance.pl`, `kizzryders.com/events/`.

## 4. Format Raportu (6 Sekcji)
1. **Sekcja 1 (PRYWATNIE):** Data raportu, liczba pozycji (`X pt + Y sb + Z nd`), nowości w bazie vs odziedziczone, stan arkusza zgłoszeń, faktycznie wykonana praca.
2. **Sekcja 2 (POST NA FB):** Gotowy post wg wzoru `🎉 Gdzie tańczymy w ten weekend? (DD-DD.MM)` — po 1–2 naturalne zdania na Piątek, Sobotę, Niedzielę; Katowice na pierwszym planie; warsztaty nazwane warsztatami; pisownia `Cubana` / `salsa cubana` przez `C`.
3. **Sekcja 3 (ANKIETA):** Jedna opcja na linię bez emoji: `PIĄTEK (DD.MM): Miasto - Miejsce (style)`. Gdy w tym samym miejscu i dniu jest więcej niż 1 wydarzenie, rozróżniaj krótką nazwą imprezy (`Miasto - Miejsce, krótka nazwa (style)`).
4. **Sekcja 4 (KOMENTARZ 1 — weekend):** Pełna lista z miejscami/stylami identycznymi z ankietą (`⭐` wyłącznie dla własnej imprezy KSH, `➡️` dla pozostałych), linkiem `🔗` i dokładną stopką KSH.
5. **Sekcja 5 (KOMENTARZ 2 — przyszłość):** Nagłówek `🎉 Zaplanowane wydarzenia — kolejne tygodnie`, pełna chronologiczna lista zapowiedzi w formacie `🗓️ DZIEŃ (DD.MM.RRRR)` (lub zakres dla festiwali / `OD DD.MM.RRRR`), `➡️ Miasto: Miejsce, nazwa (style)`, `🔗 link` oraz dokładna stopka KSH.
6. **Sekcja 6 (PRYWATNIE):** Wydarzenia `pn–cz` bieżącego tygodnia poza ankietą, wstrzymane/niepewne tropy z powodami, konflikty danych i kolejne konkretne kroki.
