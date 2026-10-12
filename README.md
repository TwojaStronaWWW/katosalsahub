<p align="center">
  <img src="katosalsahub.pl/assets/images/logo.png" alt="Kato Salsa Hub Logo" width="160" onerror="this.src='https://katosalsahub.pl/assets/images/logo.png'" />
</p>

<h1 align="center">Kato Salsa Hub & DancePuls — Społecznościowa Platforma Taneczna</h1>

<p align="center">
  <strong>Oficjalny portal społeczności tancerzy Salsy, Bachaty i Kizomby na Śląsku oraz inteligentny agregator wydarzeń DancePuls.</strong><br>
  Vanilla JS SPA • Optymalizacja Cloudflare • Internetowy Radio Player • Baza wiedzy Salsopedia • Automatyzacja wydań i potoków CI/CD.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platforma-Kato%20Salsa%20Hub%20%7C%20DancePuls-blue?logo=javascript&logoColor=white" alt="Platforma">
  <img src="https://img.shields.io/badge/Stack-Vanilla%20JS%20%7C%20HTML5%20%7C%20CSS3-yellow?logo=javascript&logoColor=black" alt="Vanilla Stack">
  <img src="https://img.shields.io/badge/CDN%20%26%20Security-Cloudflare-orange?logo=cloudflare" alt="Cloudflare">
  <img src="https://img.shields.io/badge/Automatyzacja-Sync%20Engine%20Node.js-brightgreen?logo=node.js" alt="Node.js Engine">
  <img src="https://img.shields.io/badge/Helpdesk-osTicket%20(ITIL%204)-purple" alt="osTicket">
  <img src="https://img.shields.io/badge/Fundacja-Kato%20Salsa%20Hub-red" alt="Fundacja">
</p>

<p align="center">
  <a href="https://katosalsahub.pl" target="_blank">
    <img src="https://img.shields.io/badge/%F0%9F%8C%90_ODWIED%C5%B9_KATOSALSAHUB.PL-e63946?style=for-the-badge" alt="Odwiedź Kato Salsa Hub" />
  </a>
  <a href="https://dancepuls.pl" target="_blank">
    <img src="https://img.shields.io/badge/%F0%9F%94%A5_ODKRYJ_WYDARZENIA_DANCEPULS.PL-1d3557?style=for-the-badge" alt="Odwiedź DancePuls" />
  </a>
</p>

---

## 📸 Podgląd Serwisu

<p align="center">
  <img src="katosalsahub.pl/assets/images/og-preview.png" alt="Podgląd Kato Salsa Hub" width="850" onerror="this.style.display='none'" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);" />
</p>

---

## 🎯 Czym jest Kato Salsa Hub & DancePuls?

**Kato Salsa Hub** to oddolna inicjatywa społeczna oraz oficjalny portal **Fundacji Kato Salsa Hub**, integrujący tancerzy muzyki latynoskiej (Salsa, Bachata, Kizomba) na terenie Katowic, aglomeracji śląskiej i Małopolski.

Projekt rozwiązuje kluczowe wyzwania społeczności tanecznej:
- **Centralny Kalendarz Taneczny (`dancepuls.pl`):** Agregacja imprez, festiwali, maratonów i warsztatów z wielu źródeł (social media, szkoły tańca, kluby) w jednym, responsywnym widoku.
- **Dedykowany Odtwarzacz Radiowy (Radio Player):** Płynny streaming stacji muzycznych (Salsa Dura, Bachata Sensual, Kizomba) z obsługą API `MediaSession` (sterowanie z poziomu lockscreena telefonu).
- **Encyklopedia Taneczna (Salsopedia):** Baza wiedzy o stylach tańca (Salsa Casino, Linear On1/On2, Timba), etykiecie na parkiecie i historii muzyki afro-kubańskiej.
- **Oficjalne Biuro Obsługi (Helpdesk osTicket):** Bezpieczny system zgłoszeń dla uczestników i wolontariuszy pod domeną `hd.twojastronawww.pl`.

---

## ✨ Kluczowe Możliwości i Moduły

### 🎪 Ekosystem Serwisów i Aplikacji
| Moduł / Domena | Technologia | Specyfikacja i Gwarancje |
| :--- | :--- | :--- |
| **Kato Salsa Hub** (`katosalsahub.pl`) | Vanilla JS SPA & CSS Grid | Wizytówka fundacji, relacje ze spotkań plenerowych, integracja social media, harmonogram. |
| **DancePuls** (`dancepuls.pl`) | Dynamiczny silnik filtrowania JS | Interaktywny kalendarz imprez, podział na miasta (Katowice, Kraków, Gliwice) i style muzyczne. |
| **Radio Player** | HTML5 Audio & `MediaSession API` | Płynne przełączanie kanałów, automatyczne ponawianie połączenia, sterowanie z powiadomień mobilnych. |
| **Silnik Synchronizacji** (`tools/sync_engine.js`) | Node.js Automatyzacja | Agregacja, normalizacja i deduplikacja wydarzeń, generowanie raportów i powiadomień. |
| **Helpdesk & Zgłoszenia** | osTicket (ITIL 4) | Bezpieczne formularze kontaktowe zintegrowane z centralnym systemem obsługi zgłoszeń. |

---

## 🏛️ Architektura i Bezpieczeństwo

```plaintext
katosalsahub/
├── .github/
│   ├── workflows/                  # Potoki CI/CD i automatyzacji
│   └── dependabot.yml              # Nadzór nad zależnościami narzędziowymi
├── dancepuls.pl/                   # Moduł agregatora imprez tanecznych
│   ├── assets/                     # Skrypty i arkusze filtrów wydarzeń
│   ├── data/                       # Baza wydarzeń JSON
│   └── tools/                      # sync_engine.js – silnik synchronizacji danych
├── katosalsahub.pl/                # Główny portal społecznościowy i wizytówka fundacji
│   ├── assets/                     # Komponenty Vanilla UI, Radio Player, style
│   ├── index.html                  # Semantyczny szkielet SPA
│   └── wiki.php                    # Baza wiedzy Salsopedia
├── ROADMAP.md                      # Oficjalny rejestr sprintów i plan wydań
├── package.json                    # Narzędzia synchronizacji i raportowania
└── README.md                       # Pełna dokumentacja projektu
```

---

## 🛡️ Brama Jakości & Bezpieczeństwo (Wzorzec Gal Anonim)

Zgodnie ze standardami inżynierskimi wypracowanymi w projektach **Gal Anonim** i **TwojaStronaWWW**:
* **Ochrona Przed Wyciekiem Sekretów:** Wdrożony audyt kodu i blokada hardkodowanych haseł oraz tokenów API.
* **Optymalizacja Wydajności Cloudflare:** Pełne buforowanie zasobów statycznych, certyfikaty SSL/TLS, ochrona DDoS i optymalizacja ładowania zasobów mobilnych.
* **Zgodność z RODO:** Minimalizacja pól formularza kontaktowego, przejrzysta polityka cookies i prywatności.

---

## 💻 Komendy Deweloperskie

```bash
# 1. Sklonuj repozytorium
git clone https://github.com/TwojaStronaWWW/katosalsahub.git
cd katosalsahub

# 2. Uruchomienie silnika synchronizacji wydarzeń DancePuls
npm run sync

# 3. Wygenerowanie raportu stanu bazy wydarzeń
npm run report
```

---

## 🗺️ Mapa Rozwoju (Roadmap)

Rejestr sprintów, kamieni milowych i zgłoszonych zadań rozwojowych znajduje się w pliku:  
👉 **[ROADMAP.md](ROADMAP.md)**

* **Sprint 1:** Bezpieczeństwo i Kredencjały (Hotfix & Secrets audit).
* **Sprint 2:** RODO & Nowoczesne potoki CI/CD (Quality Gate, smoke testy).
* **Sprint 3:** Automatyzacja DancePuls & Baza Wiedzy Wiki.
* **Sprint 4:** Radio Player, PWA & Optymalizacja Multimediów.

---

## 👥 Zarząd i Społeczność

* **Organizacja:** Fundacja Kato Salsa Hub (KRS w toku)
* **Prezes Zarządu & Architektura:** Krzysztof Początek
* **Partner Technologiczny:** [TwojaStronaWWW](https://github.com/TwojaStronaWWW)
* **Prawa autorskie:** &copy; 2026 Fundacja Kato Salsa Hub. Wszelkie prawa zastrzeżone.
