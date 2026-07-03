# Kato Salsa Hub & Salsopedia - Instrukcja Obsługi

Witaj w dokumentacji projektu **Kato Salsa Hub**. Poniżej znajdziesz instrukcje jak zarządzać stroną, Salsopedią i rozwiązywać typowe problemy.

---

## 1. Salsopedia (Baza Wiedzy)

### Dodawanie nowego hasła
1. Wejdź na stronę **Salsopedia**.
2. Kliknij czerwony przycisk **"+"** (plus) w prawym dolnym rogu.
3. Wypełnij formularz:
   - **Hasło:** Nazwa figury lub pojęcia.
   - **Kategorie:** Wybierz z listy (możesz zaznaczyć kilka).
   - **Podkategorie:** Opcjonalnie (np. Enchufla, Dile Que No).
   - **Twoja Kategoria:** Jeśli nie ma na liście, wpisz własną.
   - **Źródła:** Kliknij "Dodaj źródło", aby wkleić link do YouTube/Facebooka.
   - **Definicja:** Opis figury. Możesz używać składni `[Hasło]` aby stworzyć link do innej definicji.
4. Kliknij **"Wyślij do moderacji"**.

hasło trafi na listę oczekujących.

### Moderacja (Zatwierdzanie haseł)
Jako administrator, musisz zatwierdzić zgłoszone hasła, aby stały się publiczne.

1. Wejdź na stronę **Salsopedia**.
2. Zjedź na sam dół strony (do stopki).
3. Kliknij mały link **"[Moderacja]"**.
4. Wpisz hasło administratora: `katoAdmin2024`.
   *(Hasło zostanie zapamiętane w przeglądarce do czasu zamknięcia karty)*.
5. Zobaczysz listę haseł oznaczonych jako "Oczekuje na moderację...".
6. Użyj przycisków:
   - 🟢 **Zatwierdź:** Hasło zostanie opublikowane natychmiast.
   - 🔴 **Odrzuć:** Hasło zostanie trwale usunięte.

---

## 2. Radio (Timba Nation)
Radio działa w tle, nawet gdy przechodzisz między podstronami (SPA).
- **Play:** Kliknij przycisk Play w nagłówku lub w sekcji Radio.
- **Stop:** Kliknij to samo miejsce, aby zatrzymać.
- Jeśli radio przestanie grać po odświeżeniu strony, musisz włączyć je ponownie (ograniczenia przeglądarek w autoodtwarzaniu).

---

## 3. Formularz Kontaktowy
Znajduje się na stronie głównej w sekcji "Kontakt".
- Wiadomości są wysyłane na Twój adres e-mail (skonfigurowany w `assets/php/contact.php`).
- W razie problemów z dostarczaniem maili, sprawdź logi na serwerze:
  `https://katosalsahub.pl/assets/data/email_debug.txt`

---

## 4. Rozwiązywanie Problemów

| Problem | Rozwiązanie |
|---------|-------------|
| **Nie widzę nowych zmian na stronie** | Naciśnij `Ctrl + F5` (Windows) lub `Cmd + Shift + R` (Mac), aby wymusić odświeżenie. |
| **Błędy "SyntaxError" w konsoli** | To stary błąd pamięci podręcznej. Zrobiliśmy "Cache Busting", więc po odświeżeniu powinien zniknąć na zawsze. |
| **Nie mogę się zalogować do moderacji** | Upewnij się, że wpisujesz hasło `katoAdmin2024` (bez spacji). Sprawdź czy nie masz blokady wyskakujących okienek (pop-up). |
| **Radio przerywa** | Sprawdź łącze internetowe. Strumień jest zewnętrzny, więc zależy od nadawcy (Zenoplapa). |

---

## Dla Dewelopera (Struktura Plików)
- `assets/data/salsopedia.json` - Główna baza haseł.
- `assets/data/pending_edits.json` - Hasła oczekujące.
- `assets/php/` - Skrypty backendowe (mail, zapis plików).
- `assets/js/wiki.js` - Logika Salsopedii.
- `assets/js/router.js` - Nawigacja bez przeładowania (SPA).

*Dokumentacja wygenerowana przez Antigravity (Salsopedia V6)*
