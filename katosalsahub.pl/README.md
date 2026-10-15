# Kato Salsa Hub & Salsopedia - Instrukcja Obsługi

Witaj w dokumentacji projektu **Kato Salsa Hub**. Poniżej znajdziesz instrukcje jak zarządzać stroną, Salsopedią i rozwiązywać typowe problemy.

---

## 1. Salsopedia (Baza Wiedzy)

### Dodawanie nowego hasła
1. Wejdź na stronę **Salsopedia**.
2. Kliknij czerwony przycisk **"+"** (plus) w prawym dolnym rogu lub **"Zaproponuj hasło"** w panelu bocznym.
3. Wypełnij formularz:
   - **Hasło:** Nazwa figury lub pojęcia.
   - **Kategorie:** Wybierz z listy (możesz zaznaczyć kilka).
   - **Podkategorie:** Opcjonalnie (np. Prowadzenie, W parach, Rytmika).
   - **Proponowana nowa kategoria:** Jeśli nie ma na liście, wpisz własną.
   - **Źródła:** Kliknij "Dodaj kolejne źródło", aby wkleić odnośnik.
   - **Definicja:** Opis figury lub pojęcia.
4. Kliknij **"Wyślij do moderacji"**.

Hasło trafi na listę oczekujących do weryfikacji.

### Moderacja (Zatwierdzanie haseł)
Jako administrator zatwierdzasz zgłoszone hasła, aby stały się publiczne:

1. Wejdź na stronę `salsopedia.html?admin=1` (lub naciśnij skrót klawiszowy `Ctrl + Shift + M` na stronie Salsopedii).
2. Wprowadź hasło administratora skonfigurowane na serwerze w zmiennej środowiskowej `KATO_ADMIN_SECRET` (w pliku `.env` poza katalogiem publicznym).
3. Po zalogowaniu nawiązywana jest bezpieczna sesja `HttpOnly` chroniona tokenem CSRF.
4. Przełącz zakładkę na **"Do moderacji"** i użyj przycisków:
   - 🟢 **Zatwierdź:** Hasło zostanie natychmiast opublikowane (z automatycznym utworzeniem kopii zapasowej `.bak`).
   - 🔴 **Odrzuć:** Zgłoszenie zostanie usunięte z kolejki.

---

## 2. Radio (Timba Nation)
Radio działa w tle, nawet gdy przechodzisz między podstronami (SPA):
- **Play / Stop:** Kliknij przycisk Play w nagłówku lub w sekcji Radio, bądź steruj odtwarzaniem z ekranu blokady telefonu (MediaSession API).
- **Teraz na antenie:** Automatycznie wyświetla aktualnego wykonawcę i tytuł ze strumienia.
- **Wyłącznik czasowy (Sleep Timer):** Ustaw automatyczne wyłączenie po 15, 30 lub 60 minutach z płynnym wyciszeniem dźwięku (fade-out).

---

## 3. Formularz Kontaktowy (RODO & Helpdesk)
Znajduje się na stronie głównej w sekcji "Kontakt":
- Zgodnie z zasadą minimalizacji danych RODO formularz wymaga jedynie **Imienia lub pseudonimu**, adresu e-mail oraz akceptacji Polityki Prywatności.
- Zgłoszenia są przekazywane do systemu Helpdesk (osTicket) przy użyciu klucza `OSTICKET_API_KEY` ze zmiennych środowiskowych serwera, a adres IP nadawcy podlega automatycznemu maskowaniu ostatniego oktetu.

---

## 4. Rozwiązywanie Problemów

| Problem | Rozwiązanie |
|---------|-------------|
| **Nie widzę nowych zmian na stronie** | Naciśnij `Ctrl + F5` (Windows) lub `Cmd + Shift + R` (Mac), aby wymusić odświeżenie pamięci podręcznej. |
| **Nie mogę się zalogować do moderacji** | Upewnij się, że zmienna `KATO_ADMIN_SECRET` jest poprawnie ustawiona w pliku `.env` na serwerze. |
| **Radio przerywa** | Sprawdź łącze internetowe. Strumień jest zewnętrzny (Zeno.fm). |
