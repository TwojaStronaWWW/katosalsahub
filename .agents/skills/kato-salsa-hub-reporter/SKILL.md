---
name: kato-salsa-hub-reporter
description: Generator cyklicznych raportów imprez, warsztatów i festiwali tanecznych (Salsa Cubana, Bachata, Kizomba) dla Kato Salsa Hub i DancePuls (woj. śląskie i Kraków). Użyj, gdy użytkownik pyta o zestawienie imprez, raport na weekend lub aktualizację bazy wydarzeń.
---

# Kato Salsa Hub & DancePuls Reporter

Zautomatyzowany generator zestawień imprezowych dla społeczności tanecznej na Śląsku oraz w Krakowie.

## 1. Zakres Stylów i Geografii
- **Style:** Salsa (zwłaszcza Cubana/casino, timba, son, rueda), Bachata (wszystkie odmiany), Kizomba/Semba, tańce kubańskie.
- **Typy:** Imprezy, potańcówki (social), practisy, warsztaty, festiwale, maratony taneczne.
- **Wykluczenia:** Zwykły grafik regularnych kursów tygodniowych.
- **Obszar:** Całe województwo śląskie (Katowice, Gliwice, Sosnowiec, Zabrze, Tychy, Chorzów, Bielsko-Biała, Cieszyn, Żywiec, Rybnik, Częstochowa, Dąbrowa Górnicza, Siewierz, Piekary Śląskie, Szczyrk, Wisła itd.) oraz miasto Kraków.

## 2. Stała Baza Danych i Narzędzia
- **Baza główna:** `dancepuls.pl/data/events_database.md`
- **JSON dla DancePuls:** `dancepuls.pl/data/events.json`
- **Gotowy raport:** `dancepuls.pl/data/latest_report.md`
- **Silnik automatyzacji:** `dancepuls.pl/tools/sync_engine.js` (uruchamiany przez `node dancepuls.pl/tools/sync_engine.js` lub `npm run report`)
- Format bazy: `data|miejsce|nazwa|style|źródło|uwagi/organizator`.

## 3. Sprawdzone Źródła i Agregatory
### Kalendarze i agregatory:
- **Sabaki:**
  - Katowice: `https://sabaki.dance/events/Katowice`
  - Kraków: `https://sabaki.dance/events/Krakow`
  - Bielsko-Biała: `https://sabaki.dance/events/Bielsko-Biala`
- **Krakowski kalendarz Sergio:** `https://events.sergiocarcamo.com/krakow/salsa-events/`
- **OnlyDance:** `https://onlydanceapp.com/`
- **Danzly:** `https://danz.ly/`
- **Airdancia:** `https://airdancia.com/`
- **Krajownik:** `https://krajownik.pl/`
- **HappeningNext:** `https://happeningnext.com/`

### Oficjalne strony organizatorów i szkół:
- **Kato Salsa Hub:** `https://katosalsahub.pl` oraz `https://www.facebook.com/KatoSalsaHub`
- **Mil Pasos Katowice:** `https://www.milpasoskatowice.pl/?page=wydarzenia`
- **Spontan Latino na Paprach:** `https://spontanlatinonapaprach.pl/` oraz grupa FB
- **DANCE#LOVEit & Corazon Bielsko:** `https://danceloveit.pl/bachata-party-bielsko/`
- **Sabrosa Kraków:** `https://salsasabrosa.pl/`
- **LOFToDANCE Kraków:** `https://sklep.loftodance.pl/wydarzenia`
- **JNdance Studio:** `https://jndance.pl/`
- **Kizz Ryders:** `https://kizzryders.com/events/`
- **Organizatorzy obserwowani regionalnie:** La Clave, Marcepan, Good Mood, Evolution Dance, NOSPR, Nowy Dekameron, Mohito Gliwice/Tychy, Havana Rybnik, El Pachanguero Rybnik, Częstotańcz, Este Loco Częstochowa, Forum Tańca Kraków, VivaSalsa Kraków, AloCubano, KIZLAB Katowice, Dance++, Beleza Siewierz, AllDance Bielsko-Biała.

### Formularz zgłoszeniowy KSH:
- Formularz Google: `https://tiny.pl/2bc8z7649`
- Eksport CSV z Google Sheets: `https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/export?format=csv&gid=1833510316` (automatycznie pobierany przez `sync_engine.js`)

## 4. Format Raportu (6 Sekcji)
- **Sekcja 1 (PRYWATNIE):** Data, liczba pozycji, nowości, faktycznie wykonana praca, rotacje regionalne.
- **Sekcja 2 (POST na FB):** Gotowy do wklejenia post na grupę/fanpage (po 1–2 naturalne zdania na Piątek, Sobotę, Niedzielę, Katowice na pierwszym planie, "Cubana" przez 'C').
- **Sekcja 3 (ANKIETA):** Format linijka po linijce: `PIĄTEK (DD.MM): Miasto - Miejsce (style)` bez emoji.
- **Sekcja 4 (KOMENTARZ 1 — weekend):** Zestawienie z bezpośrednimi linkami i stopką KSH.
- **Sekcja 5 (KOMENTARZ 2 — przyszłość):** Zestawienie kolejnych tygodni chronologicznie ze stopką KSH.
- **Sekcja 6 (PRYWATNIE):** Pominięcia, niepewne tropy, kolejne kroki.

### Stała Stopka KSH (dla Sekcji 4 i 5):
```text
@wszyscy Do zobaczenia na parkiecie! 💃🕺

📝 PS1: Chcesz zgłosić imprezę? Wypełnij krótki formularz, a dodamy ją do następnego zestawienia: 👉 https://tiny.pl/2bc8z7649

📻 PS2: Chcesz posłuchać radia gdzie puszczają salsę bez reklam i w dodatku z opcją zablokowania telefonu? Masz taką opcję na naszej stronie: 👉 https://katosalsahub.pl

☕ PS3: Podoba Ci się to, co robię? Jeśli chcesz, możesz postawić mi wirtualną kawę – to daje mi mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub

#Salsa #Bachata #Kizomba #Taniec #Silesia #Katowice
```
