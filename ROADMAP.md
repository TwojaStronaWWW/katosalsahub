# 🗺️ Roadmap & Rejestr Sprintów – Kato Salsa Hub & DancePuls

Ten dokument stanowi oficjalny rejestr planu wydań (Sprint Backlog) dla deweloperów i kontrybutorów projektu **Kato Salsa Hub** oraz **DancePuls**.  
Wszystkie zadania są synchronizowane z **GitHub Issues** oraz **GitHub Milestones**.

---

## 🏃 Podsumowanie Sprintów (GitHub Milestones)

| Sprint / Kamień Milowy | Cel i Filar | Liczba Zadań | Status |
|---|---|:---:|:---:|
| [**Sprint 1: Bezpieczeństwo i Kredencjały**](https://github.com/TwojaStronaWWW/katosalsahub/milestone/1) | Usunięcie haseł z kodu, zabezpieczenie API, blokada wycieków (Gitleaks) | 5 | 🚀 Zaplanowany |
| [**Sprint 2: RODO & Nowoczesne CI/CD**](https://github.com/TwojaStronaWWW/katosalsahub/milestone/2) | Minimalizacja danych w formularzu, Dependabot, auto-merge, UI smoke testy | 6 | ⏳ Oczekuje |
| [**Sprint 3: Automatyzacja DancePuls & Wiki**](https://github.com/TwojaStronaWWW/katosalsahub/milestone/3) | Sesja moderatora, cron raportów, deduplikacja, walidacja schematów | 6 | ⏳ Oczekuje |
| [**Sprint 4: Radio Player, Multimedia & PWA**](https://github.com/TwojaStronaWWW/katosalsahub/milestone/4) | Sterowanie lockscreen (MediaSession), PWA, WebP, Sleep timer, analityka | 6 | ⏳ Oczekuje |

---

## 📋 Szczegółowy Zakres Sprintów

### 🔴 Sprint 1: Bezpieczeństwo i Kredencjały (Hotfix & Security)
- [ ] **#1: [SEC] Usunięcie zahardkodowanego hasła administratora z `wiki.php` i `wiki.js`**
  - *Priorytet:* `CRITICAL` | *Etykiety:* `security`, `salsopedia`
  - *Opis:* Przeniesienie hasła do zmiennych środowiskowych i hashowanie `password_verify` / `hash_equals`.
- [ ] **#2: [SEC] Wyprowadzenie klucza API osTicket z `contact.php` do `.env`**
  - *Priorytet:* `CRITICAL` | *Etykiety:* `security`, `secrets`
  - *Opis:* Usunięcie stałej `A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6` z kodu źródłowego.
- [ ] **#3: [CICD] Wdrożenie skanera sekretów Gitleaks w pipeline CI (Wzorzec Gal Anonim)**
  - *Priorytet:* `HIGH` | *Etykiety:* `cicd`, `security`
  - *Opis:* Automatyczne sprawdzanie commitów i blokada wypychania kluczy/haseł na GitHub.
- [ ] **#4: [SEC] Zabezpieczenie plików JSON w `.htaccess` i wyłączenie `display_errors`**
  - *Priorytet:* `HIGH` | *Etykiety:* `security`, `apache`
  - *Opis:* Blokada `403 Forbidden` dla bezpośrednich wywołań `pending_edits.json` oraz wyłączenie raportowania błędów PHP na produkcji.
- [ ] **#5: [SEC] Usunięcie publicznego linku moderacji z footera stron**
  - *Priorytet:* `HIGH` | *Etykiety:* `salsopedia`, `security`
  - *Opis:* Wycięcie `#showPendingBtn` ze stopki stron publicznych.

---

### 🟠 Sprint 2: RODO & Nowoczesne CI/CD (Inspiracja z Gal Anonim)
- [ ] **#6: [PRIVACY] Zmiana pola w formularzu na „Imię lub pseudonim” (Minimalizacja RODO)**
  - *Priorytet:* `HIGH` | *Etykiety:* `gdpr`, `frontend`
  - *Opis:* Rezygnacja z wymagania pełnego nazwiska w kontakcie.
- [ ] **#7: [PRIVACY] Anonimizacja/maskowanie adresu IP i checkbox zgody RODO**
  - *Priorytet:* `HIGH` | *Etykiety:* `gdpr`, `security`
  - *Opis:* Maskowanie IP przed przekazaniem do ticketów oraz dodanie akceptacji polityki prywatności.
- [ ] **#8: [CICD] Konfiguracja Dependabot (`.github/dependabot.yml`)**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `cicd`, `automation`
  - *Opis:* Cotygodniowe sprawdzanie aktualizacji npm i GitHub Actions (wzorzec z Gal Anonim).
- [ ] **#9: [CICD] Workflow Dependabot Auto-Merge (`.github/workflows/dependabot-automerge.yml`)**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `cicd`, `automation`
  - *Opis:* Automatyczne scalanie bezpiecznych aktualizacji zależności (wzorzec z Gal Anonim).
- [ ] **#10: [CICD] Automatyczne czyszczenie starych artefaktów backupów przez GitHub CLI**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `cicd`, `storage`
  - *Opis:* Skrypt czyszczący archiwa backupu z runnera (utrzymanie limitu 380 MB / max 3 backupy).
- [ ] **#11: [CICD] UI Smoke Test w headless browserze z uploadem diagnostyki**
  - *Priorytet:* `HIGH` | *Etykiety:* `cicd`, `testing`
  - *Opis:* Headless Playwright testujący uruchomienie radia, brak błędów w konsoli JS i router SPA.

---

### 🟡 Sprint 3: Automatyzacja DancePuls & Moderacja Salsopedii
- [ ] **#12: [SALSOPEDIA] Bezpieczna sesja administratora i tokeny CSRF w `wiki.php`**
  - *Priorytet:* `HIGH` | *Etykiety:* `salsopedia`, `security`
- [ ] **#13: [SALSOPEDIA] Blokady zapisu `flock` dla plików JSON i backup przed modyfikacją**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `salsopedia`, `data-integrity`
- [ ] **#14: [DANCEPULS] Walidacja schematu bazy wydarzeń w CI (`events_database.md` / `events.json`)**
  - *Priorytet:* `HIGH` | *Etykiety:* `dancepuls`, `testing`
- [ ] **#15: [DANCEPULS] Cotygodniowy cron w GitHub Actions do generowania raportu**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `dancepuls`, `cicd`
- [ ] **#16: [DANCEPULS] Normalizacja adresów i geolokalizacja imprez na mapie**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `dancepuls`, `frontend`
- [ ] **#17: [DANCEPULS] Automatyczna deduplikacja wydarzeń z wielu źródeł**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `dancepuls`, `algorithms`

---

### 🟢 Sprint 4: Radio Player, Multimedia, PWA & Wydajność
- [ ] **#18: [RADIO] Integracja MediaSession API (sterowanie z lockscreenu telefonu)**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `radio`, `mobile`
- [ ] **#19: [RADIO] Wyłącznik czasowy (Sleep Timer) z płynnym wyciszaniem dźwięku**
  - *Priorytet:* `LOW` | *Etykiety:* `radio`, `ux`
- [ ] **#20: [RADIO] Parsowanie wykonawcy i tytułu ze strumienia Icecast**
  - *Priorytet:* `LOW` | *Etykiety:* `radio`, `multimedia`
- [ ] **#21: [PERF] Wdrożenie Service Workera i `manifest.json` (instalacja PWA)**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `pwa`, `performance`
- [ ] **#22: [PERF] Konwersja grafik do formatu WebP / AVIF i natywne `loading="lazy"`**
  - *Priorytet:* `MEDIUM` | *Etykiety:* `performance`, `images`
- [ ] **#23: [ANALYTICS] Lekka analityka Cookieless (zgodna z RODO, np. Umami)**
  - *Priorytet:* `LOW` | *Etykiety:* `analytics`, `gdpr`

---

## 🛠️ Jak pracować z zadaniami w Git i GitHub?

1. **Wybór zadania:** Weź zadanie ze Sprintu 1 (np. `#1`).
2. **Utworzenie gałęzi:**
   ```bash
   git checkout -b feat/sec-admin-password
   ```
3. **Commit z odniesieniem do issue:**
   ```bash
   git commit -m "fix(salsopedia): usunięcie hasła otwartym tekstem i autoryzacja przez ENV (fixes #1)"
   ```
4. **Wypchnięcie i Pull Request:**
   ```bash
   git push origin feat/sec-admin-password
   gh pr create --title "fix(salsopedia): bezpieczna autoryzacja" --body "Rozwiązuje #1"
   ```
5. Po scaleniu (merge) do `main` zadanie na tablicy i Milestone automatycznie oznaczają się jako zakończone!
