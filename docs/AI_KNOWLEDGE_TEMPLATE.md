# BAZA WIEDZY RAG: SZABLON PROJEKTU (<SITE_ID>-knowledge.txt)
> **Instrukcja wdrożeniowa:** Skopiuj ten plik do repozytorium `VPS/services/ai-router/data/<site_id>-knowledge.txt` (gdzie `<site_id>` odpowiada atrybutowi `data-site-id` w tagu `<script type="module" src="assets/js/ai-widget.js" data-site-id="...">`), uzupełnij poniższe sekcje realnymi danymi firmy klienta oraz dopisz domenę produkcyjną do `ALLOWED_ORIGINS` w `/opt/devops-stack/.env`.
> Jeśli witryna posiada dynamiczną bazę wiedzy na stronie (np. encyklopedię / słownik JSON jak Salsopedia), dodaj atrybut `data-kb-url="assets/data/baza.json"` — widget będzie automatycznie wyliczał wersję wiedzy (`kb_version`), przekazywał dopasowane wpisy w `dynamic_context` oraz inwalidował pamięć podręczną (Response Cache) po każdej zmianie w bazie.

---

## 1. O nas i główny profil działalności:
- Nazwa marki / firmy: **[Wpisz nazwę firmy]**
- Czym się zajmujemy: **[Krótki, konkretny opis działalności w 2–3 zdaniach]**
- Lokalizacja / tryb działania: **[Stacjonarnie (adres i godziny otwarcia) / 100% Online / Cała Polska]**
- Co nas wyróżnia: **[3 kluczowe wyróżniki oferty dla klienta]**

## 2. Dla kogo jest nasza oferta?
1. **[Grupa docelowa 1 – np. klienci indywidualni / osoby początkujące]**
2. **[Grupa docelowa 2 – np. firmy B2B / klienci zaawansowani]**
3. **[Grupa docelowa 3 – np. specyficzna branża lub cel]**

## 3. Jak wygląda współpraca / zapisy (Krok po kroku)?
1. **Krok 1:** **[Np. Bezpłatna konsultacja wstępna / wycena w 24h]**
2. **Krok 2:** **[Np. Dobór wariantu / realizacja projektu]**
3. **Krok 3:** **[Np. Odbiór / regularne spotkania]**

## 4. Cennik i Warianty Oferty:
- **Pakiet / Usługa Podstawowa:** **[Nazwa]** – **[Cena zł brutto/netto]** (**[Co zawiera]**)
- **Pakiet / Usługa Rozszerzona:** **[Nazwa]** – **[Cena zł brutto/netto]** (**[Co zawiera]**)
- **Pakiet / Usługa Premium / VIP:** **[Nazwa]** – **[Cena zł brutto/netto]** (**[Co zawiera]**)
- **Zniżki / Pakiety grupowe:** **[Zasady rabatowania, np. -10% przy pakiecie lub grupie]**

## 5. Twarde Reguły Anty-Halucynacyjne (Guardrails – Czego NIE obiecywać):
- Głównym zakresem działalności jest **[wpisz główną usługę]**.
- Czego firma **NIE wykonuje**: **[Wypisz usługi, o które klienci często pytają, ale firma ich nie świadczy]**.
- W przypadku zapytań o nietypowe zlecenia, wyceny indywidualne spoza cennika lub terminy: **nie zgaduj i nie wymyślaj cen**. Poinformuj uczciwie, że wymaga to indywidualnego potwierdzenia i odeślij do kontaktu mailowego, telefonicznego lub przez formularz na dole strony.

## 6. Dane Kontaktowe:
- **E-mail:** **[kontakt@twojadomena.pl]**
- **Telefon:** **[+48 XXX XXX XXX]**
- **Strona WWW:** **[https://twojadomena.pl]**
- **Social Media:** **[Instagram / Facebook / LinkedIn]**
- **Formularz kontaktowy:** dostępny bezpośrednio na dole strony głównej.

## 7. Dynamiczne Centrum Wiedzy (Wiki / JSON), Response Cache & Ekstraktor Leadów 1-Klik:
- **Główne centrum wiedzy na stronie:** jeśli projekt posiada żywą bazę pojęć, produktów lub FAQ (np. `salsopedia.json` / `wiki.php`), `ai-widget.js` pobiera ją dynamicznie i wylicza deterministyczny skrót wersji `kb_version` (`computeKnowledgeVersion`).
- **Response Cache (`< 5 ms` / 0 tokenów):** gdy użytkownik zapyta drugi raz o to samo, odpowiedź jest serwowana natychmiast z pamięci podręcznej (`localStorage` + cache na VPS), bez zużywania limitów API i czasu oczekiwania.
- **Automatyczna aktualizacja po zmianie w bazie wiedzy:** każda modyfikacja wpisu w bazie wiedzy (lub zdarzenie `salsopedia:updated`) zmienia `kb_version`, automatycznie unieważniając przestarzałe wpisy w cache i odświeżając wiedzę asystenta również dla wcześniej zapisanych zapytań.
- **Natychmiastowa ekstrakcja telefonu i e-maila (`📞 TELEFON` / `✉️ E-MAIL` na samej górze Ntfy):** gdy klient wpisze na czacie numer telefonu lub adres e-mail, `ai-widget.js` celowo omija lokalny cache (`hasContactPii`), a router na VPS wyciąga namiar bezpośrednio do tytułu (`Title:`) i dwóch pierwszych linii powiadomienia Push w **Ntfy.sh** (z przyciskami 1-Klik `Zadzwoń` i `Napisz e-mail`).

