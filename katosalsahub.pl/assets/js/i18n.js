/**
 * Kato Salsa Hub — Lightweight Zero-Bloat i18n Engine (PL / ES-CU / EN-GB)
 * Obsługuje przełączanie języka w locie (0 przeładowań, 0 zewnętrznych bibliotek, CLS = 0):
 * - pl: Polski (domyślny)
 * - es: Español de Cuba (es-CU — autentyczny kubański hiszpański: casino, timba, sabor, gozadera, parqueo, guagua, bajo techo, llégate)
 * - en: British English (en-GB — brytyjski angielski: car park, city centre, open-air, sheltered pavilion, organise, encyclopaedia, practise)
 */

(function () {
const STORAGE_KEY = 'ksh_lang';
const SUPPORTED_LANGS = ['pl', 'es', 'en'];
const LANG_HTML_MAP = {
  pl: 'pl',
  es: 'es-CU',
  en: 'en-GB'
};

const DEFAULT_TRACK_TITLES = new Set([
  'Kubańska Energia 24/7 (Salsa & Timba)',
  'Energía Cubana 24/7 (Salsa y Timba)',
  'Energía Cubana 24/7 (Salsa & Timba)',
  'Cuban Energy 24/7 (Salsa & Timba)'
]);

const TRANSLATIONS = {
  pl: {
    'meta.title.index': 'Salsa Katowice – Kursy, Potańcówki, Plenery | Kato Salsa Hub',
    'meta.title.schedule': 'Wspólny Grafik Szkół Tańca Katowice & Imprezy DancePuls | Kato Salsa Hub',
    'meta.title.wiki': 'Salsopedia - Encyklopedia Salsy Kubańskiej | Kato Salsa Hub',
    'meta.title.privacy': 'Polityka Prywatności - Kato Salsa Hub',
    'nav.langAria': 'Wybierz język',
    'nav.radioAria': 'Włącz radio',
    'nav.radioStopAria': 'Zatrzymaj radio',
    'nav.start': 'Start',
    'nav.about': 'O nas',
    'nav.styles': 'Style',
    'nav.schedule': 'Grafik',
    'nav.wiki': 'Salsopedia',
    'nav.radio': 'Radio',
    'nav.map': 'Lokacja',
    'nav.photos': 'Zdjęcia',
    'nav.faq': 'FAQ',
    'nav.contact': 'Kontakt',
    'hero.badge': '🌴 Salsa Katowice • Kubańska Energia na Śląsku 🌴',
    'hero.line1': 'Zatańcz',
    'hero.line2': 'z nami salsę',
    'hero.line3': 'w Katowicach',
    'hero.subtitle': 'Otwarta społeczność salsy kubańskiej, timby i rueda de casino w Katowicach. Tańczymy razem, na luzie – po prostu wpadaj! 💃🕺',
    'hero.btnPrimary': 'Bądź na bieżąco z wydarzeniami',
    'hero.btnSchedule': '📅 Wspólny Grafik Szkół',
    'hero.btnSecondary': 'Gdzie i kiedy tańczymy',
    'about.tag': 'Salsa Katowice – Kim jesteśmy',
    'about.title': 'Społeczność Salsy w Katowicach',
    'about.c1.title': 'Otwarta Społeczność',
    'about.c1.text': 'Każdy jest mile widziany – od osób szukających <a href="grafik.html" data-page="schedule"><strong>kursu salsy od podstaw w Katowicach</strong></a> po zaawansowanych tancerzy. Na katowickich parkietach poznasz ludzi, którzy kochają kubańskie rytmy tak samo jak Ty!',
    'about.c2.title': 'Autentyczny Klimat',
    'about.c2.text': 'Salsa w Katowicach to nie tylko kursy i kroki z <a href="salsopedia.html" data-page="wiki"><strong>Salsopedii (200+ figur)</strong></a> – to styl życia! Kubańska energia, gorąca timba, rueda de casino i niepowtarzalna atmosfera Karaibów w samym sercu Śląska.',
    'about.c3.title': 'Regularne Potańcówki i Plenery',
    'about.c3.text': 'Spotykamy się na darmowych plenerach w Dolinie Trzech Stawów i pod NOSPR-em oraz na niedzielnych praktykach w lokalu Wolni Ludzie (ul. Mariacka 2 w Katowicach).',
    'styles.tag': 'Co tańczymy w Katowicach',
    'styles.title': 'Style Tańca – Salsa Kubańska i Rytmy Latino',
    'styles.salsa.desc': 'To nie tylko taniec, to rozmowa ciał! Żywiołowa, pełna radości improwizacja w parze (Casino), gdzie skomplikowane węzły rąk przeplatają się z kubańskim "sabor". Podstawa, od której zaczyna się Twoja przygoda!',
    'styles.timba.desc': 'Kubańska odmiana salsy z dużą dawką ekspresji, szybkim tempem i niesamowitą energią!',
    'styles.rueda.desc': 'Taniec w kole z wywoływanymi figurami. Energia grupy, synchronizacja i mnóstwo zabawy!',
    'styles.linear.title': 'Salsa Liniowa <span class="style-icon">💃</span>',
    'styles.linear.desc': 'Elegancki styl tańczony w linii, znany z efektownych obrotów i precyzyjnego prowadzenia.',
    'styles.son.desc': 'Ojciec salsy. Elegancki, rytmiczny, tańczony "na kontrazas". Klasyka, styl i tradycja.',
    'styles.rumba.desc': 'Afrykańskie korzenie. Guaguancó, Yambú, Columbia. Gra uwodzenia, czyste emocje i rytm bębnów.',
    'styles.afro.desc': 'Święte tańce Orishas (Yoruba). Eleggua, Chango, Ochun. Pierwotna energia, kontakt z ziemią i duchowość zaklęta w ruchu.',
    'styles.reggaeton.desc': 'Ulica Hawany! Nowoczesna, drapieżna energia Kuby. Izolacje ciała, mocny beat i nieskrępowana ekspresja "a lo cubano".',
    'radio.tag': 'Posłuchaj',
    'radio.desc': 'Najlepsze kubańskie rytmy non-stop! Puść muzykę i poczuj klimat Hawany w swoim domu.',
    'radio.nowPlaying': 'Teraz na antenie',
    'radio.defaultTrack': 'Kubańska Energia 24/7 (Salsa & Timba)',
    'radio.playBtn': '▶ Włącz radio',
    'radio.stopBtn': '⏹ Wyłącz radio',
    'radio.loadingBtn': '⏳ Łączenie...',
    'radio.sleepAria': 'Wyłącznik czasowy radia',
    'radio.sleepLabel': '<i class="fas fa-moon"></i> Wyłącznik czasowy:',
    'radio.sleepCancel': 'Wyłącz timer',
    'radio.sleepTooltipPrefix': 'Wyłączenie radia za',
    'map.tag': 'Salsa Katowice – Miejscówki',
    'map.title': 'Gdzie Tańczymy <span class="text-gradient">Salsę w Katowicach?</span> 📍',
    'map.subtitle': 'Tańczymy salsę plenerowo w Dolinie Trzech Stawów i pod NOSPR-em w Katowicach, a w niedziele także pod dachem w lokalu Wolni Ludzie (ul. Mariacka 2). Wybierz strefę, sprawdź darmowe parkingi i włącz nawigację jednym kliknięciem!',
    'map.tabsAria': 'Wybierz widok mapy',
    'map.tab.stawy': '💃 Kamienny Krąg',
    'map.tab.nospr': '🏛️ Amfiteatr NOSPR',
    'map.wolni.label': 'Śródmieście: Wolni Ludzie (ul. Mariacka 2) i darmowe parkingi',
    'map.stawy.label': 'Dolina 3 Stawów: Kamienny Krąg, Wiata i 3 Toalety',
    'map.nospr.label': 'Strefa Kultury: Amfiteatr i Parking Rekomendowany pod NOSPR-em',
    'map.wolni.title': 'Wolni Ludzie – Pod dachem',
    'map.wolni.addr': 'ul. Mariacka 2, Katowice (róg ul. Mielęckiego)',
    'map.wolni.badge': 'Niedziele 15:00–18:00',
    'map.wolni.p1': '<strong>💃 Kiedy tańczymy:</strong> w <strong>każdą niedzielę od 15:00 do 18:00</strong> — otwarte potańcówki i praktyki (Salsa Cubana, Timba, Rueda de Casino, Son).',
    'map.wolni.p2': '<strong>📸 Fotorelacja z 18.10 (65 zdjęć):</strong> zobacz klimat naszych niedziel w obiektywie Jacka Cupiała — <a href="https://photos.app.goo.gl/faiU7NhFAgpTEPRt9" target="_blank" rel="noopener noreferrer">Otwórz galerię zdjęć</a>!',
    'map.wolni.p3': '<strong>⭐ Parking Rekomendowany (12 min):</strong> ogromny, darmowy w niedzielę parking pod NOSPR-em z wyznaczoną trasą pieszą przez kładkę!',
    'map.wolni.p4': '<strong>🅿️ Darmowe ulice wokół (niedziele i po 17:00):</strong> Warszawska / Św. Stanisława (1 min), Tylna Mariacka / Dworcowa (2 min), Wojewódzka (3 min), pl. Szramka (4 min).',
    'map.stawy.title': 'Kamienny Krąg – 3 Stawy',
    'map.stawy.addr': 'ul. Trzech Stawów 22, Katowice (obok przystani i La Cantina)',
    'map.stawy.badge': 'Plener',
    'map.stawy.p1': '<strong>☔ Wiata w razie deszczu:</strong> zadaszona wiata przy przystani kajakowej UKS 4 / SUP Tomi (ul. Trzech Stawów 10).',
    'map.stawy.p2': '<strong>⭐ Parking Rekomendowany (13 min):</strong> darmowy parking Południe / Rolkostrada z zaznaczoną trasą pieszą + Najbliższy przy La Cantina (1 min).',
    'map.stawy.p3': '<strong>🚻 Infrastruktura:</strong> 3 toalety na mapie oraz przystanek <em>Kolonia Zuzanna</em>.',
    'map.nospr.title': 'Amfiteatr i Parking NOSPR',
    'map.nospr.addr': 'pl. Wojciecha Kilara 1 / ul. Olimpijska, Katowice',
    'map.nospr.badge': 'Strefa Kultury',
    'map.nospr.p1': '<strong>💃 Parkiet plenerowy:</strong> od wschodniej strony gmachu NOSPR przy fontannach.',
    'map.nospr.p2': '<strong>⭐ Darmowy w niedzielę parking rekomendowany:</strong> ogromne parkingi od ul. Olimpijskiej i Muzeum Śląskiego (2 min pod NOSPR, 12 min trasą pieszą na Mariacką 2).',
    'map.showBtn': '<i class="fas fa-crosshairs"></i> Pokaż na mapie',
    'map.navBtn': '<i class="fas fa-parking"></i> Nawiguj na Parking Rekomendowany',
    'faq.tag': 'Warto wiedzieć',
    'faq.title': 'Salsa w Katowicach – <span class="text-gradient">Pytania i Odpowiedzi</span> 💬',
    'faq.subtitle': 'Stawiasz pierwsze kroki na śląskich parkietach lub szukasz informacji o naszych potańcówkach? Sprawdź odpowiedzi na najczęstsze pytania!',
    'faq.q1': 'Gdzie można potańczyć salsę w Katowicach?',
    'faq.a1': 'Społeczność <strong>Kato Salsa Hub</strong> spotyka się w trzech głównych punktach w Katowicach: pod dachem w lokalu <strong>Wolni Ludzie (ul. Mariacka 2)</strong> w <strong>każdą niedzielę od 15:00 do 18:00</strong> oraz w sezonie wiosenno-letnim na darmowych plenerach tanecznych w <strong>Dolinie Trzech Stawów (Kamienny Krąg przy ul. Trzech Stawów 22)</strong> i w <strong>Strefie Kultury pod Amfiteatrem NOSPR (pl. Wojciecha Kilara 1)</strong>.',
    'faq.q2': 'Czy na salsotekę lub plener w Katowicach trzeba przyjść z własną parą?',
    'faq.a2': 'Nie! Salsa kubańska (Casino) oraz Rueda de Casino w Katowicach opierają się na integracji i swobodnej rotacji w parach. Większość uczestników przychodzi solo – na miejscu błyskawicznie poznasz innych tancerzy i włączysz się do wspólnej zabawy.',
    'faq.q3': 'Jakie style tańca królują na potańcówkach Kato Salsa Hub?',
    'faq.a3': 'Sercem naszych spotkań w Katowicach jest <strong>Salsa Cubana (Casino)</strong>, energetyczna <strong>Timba</strong>, taniec w kole <strong>Rueda de Casino</strong> oraz tradycyjny <strong>Son Cubano, Rumba i Afro</strong>.',
    'faq.q4': 'Skąd czerpać wiedzę o figurach salsy i aktualnych imprezach na Śląsku?',
    'faq.a4': 'Na naszej stronie znajdziesz <a href="grafik.html" data-page="schedule"><strong>Wspólny Grafik Szkół Tańca</strong></a> w Katowicach, <a href="salsopedia.html" data-page="wiki"><strong>Salsopedię</strong></a> – otwartą encyklopedię ponad 200 figur salsy kubańskiej, szkół tańca i instruktorów, całodobowe radio kubańskie <strong>Timba Nation</strong> oraz cotygodniowy rozkład imprez tanecznych <strong>DancePuls</strong>.',
    'faq.q5': 'Gdzie zapisać się na kurs salsy w Katowicach i które szkoły tańca polecacie?',
    'faq.a5': 'Wszystkie kursy salsy w Katowicach (od grup od całkowitych podstaw P0 po poziomy zaawansowane) zebraliśmy w jednym miejscu! Sprawdź nasz <a href="grafik.html" data-page="schedule"><strong>Wspólny Grafik Szkół Tańca w Katowicach</strong></a> (ponad 120 grup w szkołach <strong>La Clave</strong> przy ul. Chorzowskiej 11, <strong>Good Mood</strong> przy ul. Paderewskiego 35 / Gliwickiej 44 oraz <strong>Mil Pasos</strong> przy ul. Kamiennej 4) wraz z porównywarką cen karnetów i mapą szkół.',
    'contact.tag': 'Napisz do nas',
    'contact.title': 'Skontaktuj się z nami',
    'contact.desc': 'Masz pytania o salsę w Katowicach? Chcesz dołączyć do społeczności? A może organizujesz event taneczny na Śląsku i potrzebujesz tancerzy? Napisz!',
    'contact.loc': 'Katowice – ul. Mariacka 2 / Dolina Trzech Stawów / NOSPR',
    'contact.fbGroup': 'Grupa Facebook: Kato Salsa Hub',
    'contact.fbPage': 'Fanpage Facebook: @KatoSalsaHub',
    'contact.gallery': 'Galeria zdjęć: Wolni Ludzie (18.10 – 65 ujęć)',
    'contact.nameLabel': 'Imię lub pseudonim',
    'contact.namePh': 'np. Janek, SalsaLover',
    'contact.emailLabel': 'Email',
    'contact.emailPh': 'jan@example.com',
    'contact.msgLabel': 'Wiadomość',
    'contact.msgPh': 'Twoja wiadomość...',
    'contact.gdpr': 'Akceptuję <a href="privacy.html">Politykę Prywatności</a> i wyrażam zgodę na przetwarzanie podanych danych w celu obsługi mojego zapytania w systemie Helpdesk.',
    'contact.submit': 'Wyślij wiadomość',
    'contact.sending': 'Wysyłanie...',
    'contact.errRequired': 'Wypełnij wszystkie pola (imię lub pseudonim, e-mail oraz wiadomość)!',
    'contact.errGdpr': 'Zaakceptuj Politykę Prywatności, aby wysłać wiadomość.',
    'contact.msgSuccess': 'Dziękujemy! Twoja wiadomość została wysłana.',
    'contact.msgError': 'Wystąpił błąd podczas wysyłania.',
    'contact.msgNetError': 'Wystąpił błąd połączenia.',
    'footer.tagline': 'Salsa Katowice – Kubańska energia w sercu Śląska',
    'footer.where': 'Gdzie tańczymy',
    'footer.privacy': 'Polityka Prywatności',
    'footer.createdBy': 'Stworzone przez',
    'cookie.title': '🍪 Ciasteczka i Prywatność',
    'cookie.text': 'Używamy ciasteczek, aby zapewnić najlepszą jakość korzystania z naszej strony. Sprawdź naszą <a href="privacy.html">Politykę Prywatności</a>.',
    'cookie.accept': 'Akceptuję',
    'wiki.subtitle': 'Twoja otwarta encyklopedia wiedzy o salsie kubańskiej, muzyce i kulturze afro-kubańskiej.',
    'wiki.searchPh': 'Szukaj pojęcia (np. Vacilala, Enchufla, Timba, Clave)...',
    'wiki.clearSearch': 'Wyczyść szukanie',
    'wiki.categories': 'Kategorie',
    'wiki.cat.all': 'Wszystkie',
    'wiki.cat.steps': 'Kroki (Podstawy)',
    'wiki.cat.figures': 'Figury (Casino / Rueda)',
    'wiki.cat.dance': 'Taniec',
    'wiki.cat.styles': 'Style Tańca',
    'wiki.cat.music': 'Muzyka',
    'wiki.cat.instruments': 'Instrumenty',
    'wiki.cat.bands': 'Zespoły i Artyści',
    'wiki.cat.history': 'Historia',
    'wiki.cat.gods': 'Bogowie (Orishas)',
    'wiki.cat.instructors': 'Instruktorzy',
    'wiki.cat.schools': 'Szkoły Tańca',
    'wiki.sub.lead': 'Prowadzenie',
    'wiki.sub.follow': 'Podążanie',
    'wiki.sub.partnerwork': 'W parach',
    'wiki.sub.shines': 'Solo / Shines',
    'wiki.sub.technique': 'Technika',
    'wiki.sub.rhythm': 'Rytmika',
    'wiki.proposeBtn': '<i class="fas fa-plus"></i> Zaproponuj hasło',
    'wiki.modPanelBtn': '<i class="fas fa-user-shield"></i> Panel Moderacji',
    'wiki.filterLabel': 'Aktualny widok:',
    'wiki.filterAll': 'Wszystkie hasła',
    'wiki.resetFilter': 'Pokaż wszystkie',
    'wiki.loading': 'Wczytywanie bazy wiedzy...',
    'wiki.noResultsTitle': 'Nie znaleziono takiego hasła',
    'wiki.noResultsDesc': 'Znasz to pojęcie? Dodaj je do Salsopedii i pomóż rozwijać społeczność taneczną!',
    'wiki.noResultsBtn': 'Dodaj to hasło!',
    'wiki.fabTitle': 'Dodaj nowe hasło',
    'wiki.resultsShown': 'Wyświetlono: {shown} z {total} haseł',
    'wiki.resultsUnverified': 'Do weryfikacji w tym widoku: {shown} haseł',
    'wiki.authorLabel': 'Autor:',
    'wiki.unverifiedBadge': 'Niezweryfikowane',
    'wiki.unverifiedTitle': 'Szablonowa odpowiedź oczekująca na weryfikację merytoryczną',
    'wiki.verifyBtn': 'Zgłoś poprawkę',
    'wiki.verifyTitle': 'Zaproponuj poprawkę lub uzupełnienie do tego hasła',
    'wiki.expandBtn': 'Rozwiń pełny opis',
    'wiki.collapseBtn': 'Zwiń opis',
    'wiki.modalTitleAdd': 'Dodaj nowe hasło',
    'wiki.modalSubtitle': 'Wprowadź dane po lewej stronie i obserwuj podgląd karty oraz automatyczne linkowanie na żywo po prawej.',
    'wiki.termLabel': 'Nazwa pojęcia / hasła <span class="required">*</span>',
    'wiki.termPh': 'np. Vacilala, Timba, Enchufla Doble',
    'wiki.mainCatsLabel': 'Kategorie Główne <span class="required">*</span> <span class="label-hint">(kliknij, aby zaznaczyć)</span>',
    'wiki.subCatsLabel': 'Podkategorie <span class="label-hint">(opcjonalnie — kliknij, aby zaznaczyć)</span>',
    'wiki.defLabel': 'Definicja / Opis pojęcia <span class="required">*</span>',
    'wiki.insertLinkBtn': '<i class="fas fa-link"></i> Wstaw link [Hasło]',
    'wiki.defPh': 'Opisz dokładnie to pojęcie: jak się wykonuje ruch, jakie ma korzenie, z czego wynika... Słowa kluczowe lub frazy w nawiasach [Hasło] zostaną automatycznie podlinkowane.',
    'wiki.sourcesLabel': 'Źródła / Odnośniki <span class="label-hint">(Książka, instruktor, wideo, link)</span>',
    'wiki.addSourceBtn': '<i class="fas fa-plus"></i> Dodaj kolejne źródło',
    'wiki.authorInputLabel': 'Twój Podpis / Ksywka <span class="required">*</span>',
    'wiki.authorInputPh': 'np. TancerzKato, Ania',
    'wiki.authorLinkLabel': 'Profil Instagram / Facebook <span class="label-hint">(opcjonalnie)</span>',
    'wiki.userCatLabel': 'Proponowana nowa kategoria <span class="label-hint">(jeśli brakuje odpowiedniej)</span>',
    'wiki.userCatPh': 'np. Stroje, Festiwale, Reguły parkietu...',
    'wiki.modNote': '<i class="fas fa-info-circle"></i> Zgłoszenia społeczności trafiają do kolejki moderacji i są weryfikowane przed publikacją.',
    'wiki.submitBtn': '<i class="fas fa-paper-plane"></i> Wyślij do moderacji',
    'wiki.cancelBtn': 'Anuluj',
    'wiki.livePreviewTitle': '<i class="fas fa-eye"></i> Podgląd karty na żywo',
    'schedule.title': 'Wspólny Grafik & Wydarzenia',
    'schedule.subtitle': 'Porównaj kursy katowickich szkół tańca (La Clave, Good Mood, Mil Pasos), sprawdź imprezy z DancePuls i znajdź swój parkiet na mapie.',
    'schedule.searchPh': 'Szukaj szkoły, instruktora, stylu lub poziomu (np. P0, La Clave, Galas, Rueda, Bachata)...',
    'schedule.tab.classes': 'Grafik Szkół',
    'schedule.tab.pricing': 'Cenniki Szkół',
    'schedule.tab.events': 'Imprezy DancePuls',
    'schedule.tab.map': 'Mapa Szkół',
    'schedule.schoolsTitle': 'Szkoły Tańca (Katowice)',
    'schedule.schoolsAll': 'Wszystkie szkoły',
    'schedule.levelsTitle': 'Poziom (Standard KSH)',
    'schedule.levelsAll': 'Wszystkie poziomy',
    'schedule.level.p0': '🟢 P0 • Od zera / Start (0–2 mies.)',
    'schedule.level.p1': '🔵 P1 • Podstawowy (2–5 mies.)',
    'schedule.level.p2': '🔷 P2 / P3 • Podstawowy+ (6–9 mies.)',
    'schedule.level.s1': '🟣 S1+ / P4+ • Śr.-Zaaw. i Zaaw.',
    'schedule.level.open': '🟡 Open / Solo / Praktis',
    'schedule.stylesTitle': 'Style Tańca',
    'schedule.stylesAll': 'Wszystkie style',
    'schedule.style.linear': 'Salsa Liniowa (New York On2 / LA)',
    'schedule.style.solo': 'Solo, Lady Style, WCS & Inne',
    'schedule.instructorsBtn': '<i class="fas fa-book-open"></i> Sylwetki Instruktorów w Salsopedii',
    'schedule.submitEventBtn': '<i class="fas fa-calendar-plus"></i> Zgłoś wydarzenie do DancePuls',
    'schedule.filterAll': 'Wszystkie pozycje',
    'schedule.resetFilter': 'Wyczyść filtry',
    'schedule.day.all': 'Cały tydzień',
    'schedule.day.today': '⚡ Dzisiaj',
    'schedule.day.1': 'Poniedziałek',
    'schedule.day.2': 'Wtorek',
    'schedule.day.3': 'Środa',
    'schedule.day.4': 'Czwartek',
    'schedule.day.5': 'Piątek',
    'schedule.day.6': 'Sobota',
    'schedule.day.7': 'Niedziela',
    'privacy.back': '← Wróć do strony głównej',
    'privacy.title': 'Polityka Prywatności',
    'privacy.s1.title': '1. Informacje ogólne i Administrator',
    'privacy.s1.p1': 'Niniejsza polityka prywatności określa zasady przetwarzania i ochrony danych osobowych przekazywanych przez użytkowników w związku z korzystaniem z serwisu społecznościowego katosalsahub.pl prowadzonego przez społeczność Kato Salsa Hub.',
    'privacy.s2.title': '2. Pliki Cookies i Analityka Cookieless',
    'privacy.s2.p1': 'Serwis stosuje zasadę minimalizacji danych (Privacy by Design). Wykorzystujemy wyłącznie techniczne pamięci przeglądarki niezbędne do zapamiętania akceptacji komunikatu prywatności oraz działania aplikacji webowej (PWA).',
    'privacy.s2.p2': 'Statystyki odwiedzin prowadzone są w modelu <strong>Cookieless</strong> (bez śledzących plików cookies i z poszanowaniem nagłówka Do Not Track), co pozwala nam rozwijać portal bez profilowania użytkowników.',
    'privacy.s3.title': '3. Formularz kontaktowy, Minimalizacja RODO i System Helpdesk',
    'privacy.s3.p1': 'W formularzu kontaktowym stosujemy zasadę minimalizacji danych – nie wymagamy podawania pełnego imienia i nazwiska, wystarczy <strong>imię lub pseudonim</strong> oraz adres e-mail potrzebny do udzielenia odpowiedzi.',
    'privacy.s3.p2': 'Przesłane zapytania są obsługiwane za pośrednictwem wewnętrznego systemu zgłoszeniowego <strong>Helpdesk</strong> wyłącznie w celu prowadzenia korespondencji zwrotnej. Przed zarejestrowaniem zgłoszenia adres IP nadawcy podlega automatycznej anonimizacji (maskowaniu ostatniego członu adresu IP), a dane nie są udostępniane podmiotom trzecim w celach marketingowych.',
    'privacy.s4.title': '4. Prawa użytkownika i Kontakt',
    'privacy.s4.p1': 'Każdej osobie przysługuje prawo dostępu do treści swoich danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania. W sprawach dotyczących prywatności prosimy o kontakt poprzez formularz na stronie głównej.',
    'ai.toggleAria': 'Otwórz czat z asystentem AI',
    'ai.title': 'Asystent Kato Salsa Hub',
    'ai.clearTitle': 'Nowa rozmowa',
    'ai.closeTitle': 'Zamknij',
    'ai.placeholder': 'Zadaj pytanie (np. o Salsopedię)...',
    'ai.send': 'Wyślij',
    'ai.welcome': 'Cześć! 💃🕺 Jestem wirtualnym asystentem **Asystent Kato Salsa Hub**. Moim głównym centrum wiedzy jest **Salsopedia**, ale odpowiem też na wszystkie pytania o nasze potańcówki w Katowicach, style tańca, **Radio Timba Nation** i **DancePuls**. O co chcesz zapytać?'
  },

  es: {
    'meta.title.index': 'Salsa Katowice – Matinées, Descargas al Aire Libre y Comunidad | Kato Salsa Hub ⚡',
    'meta.title.schedule': 'Horario de Escuelas de Baile en Katowice y Fiestas DancePuls | Kato Salsa Hub',
    'meta.title.wiki': 'Salsopedia – Enciclopedia de Salsa Cubana y Timba | Kato Salsa Hub',
    'meta.title.privacy': 'Política de Privacidad - Kato Salsa Hub',
    'nav.langAria': 'Elegir idioma',
    'nav.radioAria': 'Prender la radio',
    'nav.radioStopAria': 'Apagar la radio',
    'nav.start': 'Inicio',
    'nav.about': 'Nosotros',
    'nav.styles': 'Estilos',
    'nav.schedule': 'Horario',
    'nav.wiki': 'Salsopedia',
    'nav.radio': 'Radio',
    'nav.map': 'Ubicación',
    'nav.photos': 'Fotos',
    'nav.faq': 'Preguntas',
    'nav.contact': 'Contacto',
    'hero.badge': '🌴 Salsa Katowice • Energía Cubana en Silesia 🌴',
    'hero.line1': 'Baila',
    'hero.line2': 'casino con nosotros',
    'hero.line3': 'en Katowice',
    'hero.subtitle': 'Comunidad abierta de salsa cubana (casino), timba y rueda de casino en Katowice. Bailamos juntos, a lo cubano y en confianza: ¡llégate na\' más! 💃🕺',
    'hero.btnPrimary': 'Entérate de las próximas fiestas',
    'hero.btnSchedule': '📅 Horario de Escuelas',
    'hero.btnSecondary': 'Dónde y cuándo bailamos',
    'about.tag': 'Salsa Katowice – Quiénes somos',
    'about.title': 'La Familia Salsera de Katowice',
    'about.c1.title': 'Comunidad Abierta',
    'about.c1.text': 'Aquí todo el mundo es bienvenido: desde los que dan sus primeros pasos hasta los casineros más duros. ¡En las pistas de Katowice vas a conocer gente que lleva el ritmo cubano en la sangre igual que tú!',
    'about.c2.title': 'Sabor Auténtico',
    'about.c2.text': 'La salsa en Katowice no son solo talleres y conteos: ¡es pura gozadera y estilo de vida! Energía cubana, timba caliente, rueda de casino y el verdadero ambiente de La Habana en el mismo corazón de Silesia.',
    'about.c3.title': 'Matinées y Descargas al Aire Libre',
    'about.c3.text': 'Nos juntamos en las descargas gratuitas al aire libre en el Valle de los Tres Estanques (Dolina Trzech Stawów) y frente al NOSPR, y los domingos en las matinées bajo techo en el local Wolni Ludzie (c/ Mariacka 2, Katowice).',
    'styles.tag': 'Qué bailamos en Katowice',
    'styles.title': 'Estilos de Baile – Salsa Cubana y Ritmos Latinos',
    'styles.salsa.desc': '¡No es solo baile, es una conversación cuerpo a cuerpo! Improvisación viva y llena de alegría en pareja (Casino), donde los nudos de brazos se mezclan con el verdadero «sabor» cubano. ¡La base donde empieza tu aventura!',
    'styles.timba.desc': '¡La potencia musical de Cuba con máxima expresión, cambios de marcha, velocidad y una energía que te vuela la cabeza!',
    'styles.rueda.desc': 'Baile en círculo con figuras cantadas por el líder (cantante). ¡Energía de grupo, sincronización y tremenda gozadera!',
    'styles.linear.title': 'Salsa en Línea <span class="style-icon">💃</span>',
    'styles.linear.desc': 'Estilo elegante bailado en línea, famoso por sus giros espectaculares y una guía súper limpia y precisa.',
    'styles.son.desc': 'El padre de la salsa. Elegante, cadencioso y bailado «a contratiempo». Clásico, con clase y pura tradición oriental.',
    'styles.rumba.desc': 'Raíces afrocubanas puras: Guaguancó, Yambú y Columbia. Juego de seducción (vacunao), sentimiento y el toque vivo del tambor.',
    'styles.afro.desc': 'Danzas sagradas de los Orishas (Yoruba): Elegguá, Changó, Ochún. Energía ancestral, conexión con la tierra y espiritualidad en movimiento.',
    'styles.reggaeton.desc': '¡La calle de La Habana! Energía urbana, moderna y explosiva de Cuba. Aislamientos corporales, bajo pesado y expresión libre «a lo cubano».',
    'radio.tag': 'Escucha en vivo',
    'radio.desc': '¡Los mejores ritmos cubanos sin parar! Dale play a la música y siente el ambiente del Malecón habanero en tu propia casa.',
    'radio.nowPlaying': 'Sonando ahora',
    'radio.defaultTrack': 'Energía Cubana 24/7 (Salsa y Timba)',
    'radio.playBtn': '▶ Prender la radio',
    'radio.stopBtn': '⏹ Apagar la radio',
    'radio.loadingBtn': '⏳ Conectando...',
    'radio.sleepAria': 'Temporizador de apagado de la radio',
    'radio.sleepLabel': '<i class="fas fa-moon"></i> Apagado automático:',
    'radio.sleepCancel': 'Quitar timer',
    'radio.sleepTooltipPrefix': 'Apagado de la radio en',
    'map.tag': 'Salsa Katowice – Nuestros Puntos',
    'map.title': '¿Dónde Bailamos <span class="text-gradient">Salsa en Katowice?</span> 📍',
    'map.subtitle': 'Bailamos salsa al aire libre en el Valle de los Tres Estanques (Dolina Trzech Stawów) y junto al NOSPR en Katowice, y los domingos bajo techo en el local Wolni Ludzie (c/ Mariacka 2). ¡Elige la zona, revisa el parqueo gratis y activa el GPS con un toque!',
    'map.tabsAria': 'Elige la vista del mapa',
    'map.tab.stawy': '💃 Círculo de Piedra',
    'map.tab.nospr': '🏛️ Anfiteatro NOSPR',
    'map.wolni.label': 'Centro: Wolni Ludzie (c/ Mariacka 2) y parqueo gratuito',
    'map.stawy.label': 'Valle 3 Estanques: Círculo de Piedra, Glorieta techada y 3 Baños',
    'map.nospr.label': 'Zona de Cultura: Anfiteatro y Parqueo Recomendado junto al NOSPR',
    'map.wolni.title': 'Wolni Ludzie – Bajo techo',
    'map.wolni.addr': 'c/ Mariacka 2, Katowice (esquina con c/ Mielęckiego)',
    'map.wolni.badge': 'Domingos 15:00–18:00',
    'map.wolni.p1': '<strong>💃 Cuándo bailamos:</strong> <strong>todos los domingos de 15:00 a 18:00</strong> — matinées y prácticas abiertas (Salsa Cubana, Timba, Rueda, Bachata, Kizomba).',
    'map.wolni.p2': '<strong>📸 Fotos del 18.10 (65 fotos):</strong> mira el ambiente de nuestros domingos por el lente de Jacek Cupiał — ¡<a href="https://photos.app.goo.gl/faiU7NhFAgpTEPRt9" target="_blank" rel="noopener noreferrer">Abrir galería de fotos</a>!',
    'map.wolni.p3': '<strong>⭐ Parqueo Recomendado (12 min):</strong> ¡parqueo enorme y gratuito los domingos junto al NOSPR con ruta peatonal marcada por la pasarela!',
    'map.wolni.p4': '<strong>🅿️ Calles gratis alrededor (domingos y después de las 17:00):</strong> Warszawska / Św. Stanisława (1 min), Tylna Mariacka / Dworcowa (2 min), Wojewódzka (3 min), pl. Szramka (4 min).',
    'map.stawy.title': 'Círculo de Piedra – 3 Estanques',
    'map.stawy.addr': 'c/ Trzech Stawów 22, Katowice (junto al muelle y La Cantina)',
    'map.stawy.badge': 'Al aire libre',
    'map.stawy.p1': '<strong>☔ Techo si llueve:</strong> glorieta techada junto al muelle de kayaks UKS 4 / SUP Tomi (c/ Trzech Stawów 10).',
    'map.stawy.p2': '<strong>⭐ Parqueo Recomendado (13 min):</strong> parqueo gratuito Sur / Pista de patinaje con sendero peatonal + el más cercano en La Cantina (1 min).',
    'map.stawy.p3': '<strong>🚻 Infraestructura:</strong> 3 baños marcados en el mapa y parada de guagua <em>Kolonia Zuzanna</em>.',
    'map.nospr.title': 'Anfiteatro y Parqueo NOSPR',
    'map.nospr.addr': 'pl. Wojciecha Kilara 1 / c/ Olimpijska, Katowice',
    'map.nospr.badge': 'Zona de Cultura',
    'map.nospr.p1': '<strong>💃 Pista al aire libre:</strong> en el lado este del edificio NOSPR, junto a las fuentes.',
    'map.nospr.p2': '<strong>⭐ Parqueo recomendado gratis el domingo:</strong> amplios parqueos desde c/ Olimpijska y el Museo de Silesia (a 2 min del NOSPR, 12 min caminando a Mariacka 2).',
    'map.showBtn': '<i class="fas fa-crosshairs"></i> Ver en el mapa',
    'map.navBtn': '<i class="fas fa-parking"></i> Ir al Parqueo Recomendado',
    'faq.tag': 'Vale la pena saberlo',
    'faq.title': 'Salsa en Katowice – <span class="text-gradient">Preguntas y Respuestas</span> 💬',
    'faq.subtitle': '¿Estás dando tus primeros pasos en las pistas de Silesia o buscas detalles de nuestras fiestas? ¡Mira las respuestas a las dudas más frecuentes!',
    'faq.q1': '¿Dónde se puede bailar salsa en Katowice?',
    'faq.a1': 'La comunidad <strong>Kato Salsa Hub</strong> se reúne en tres puntos principales de Katowice: bajo techo en el local <strong>Wolni Ludzie (c/ Mariacka 2)</strong> <strong>todos los domingos de 15:00 a 18:00</strong>, y en temporada de primavera-verano en las descargas gratuitas al aire libre en el <strong>Valle de los Tres Estanques (Círculo de Piedra en c/ Trzech Stawów 22)</strong> y en la <strong>Zona de Cultura frente al Anfiteatro NOSPR (pl. Wojciecha Kilara 1)</strong>.',
    'faq.q2': '¿Hace falta ir con pareja a las fiestas o descargas en Katowice?',
    'faq.a2': '¡Para nada! La salsa cubana (Casino) y la Rueda de Casino en Katowice se basan en compartir y rotar libremente de pareja. La mayoría de la gente llega sola: allí mismo conocerás a otros bailadores y te sumarás a la gozadera desde el primer tema.',
    'faq.q3': '¿Qué estilos de baile suenan en los eventos de Kato Salsa Hub?',
    'faq.a3': 'El corazón de nuestros encuentros en Katowice es la <strong>Salsa Cubana (Casino)</strong>, la <strong>Timba</strong> bien arriba, el baile en grupo <strong>Rueda de Casino</strong> y el tradicional <strong>Son Cubano, Rumba y Afro</strong>. En las pistas de Silesia y en nuestro radar de eventos DancePuls también encontrarás fiestas que combinan salsa con bachata y kizomba.',
    'faq.q4': '¿Dónde aprender sobre figuras de salsa y ver las fiestas de la semana en Silesia?',
    'faq.a4': 'En nuestra web tienes el <a href="grafik.html" data-page="schedule"><strong>Horario Unificado de Escuelas</strong></a> de Katowice, la <a href="salsopedia.html" data-page="wiki"><strong>Salsopedia</strong></a> — una enciclopedia abierta con más de 200 figuras de salsa cubana, escuelas de baile y profesores, además de la emisora cubana 24/7 <strong>Timba Nation Radio</strong> y la cartelera semanal <strong>DancePuls</strong>.',
    'faq.q5': '¿Dónde apuntarse a clases de salsa en Katowice y qué escuelas recomiendan?',
    'faq.a5': '¡Reunimos todas las clases de salsa en Katowice (desde grupos desde cero P0 hasta niveles avanzados) en un solo lugar! Revisa nuestro <a href="grafik.html" data-page="schedule"><strong>Horario de Escuelas de Baile en Katowice</strong></a> (más de 120 grupos en <strong>La Clave</strong> c/ Chorzowska 11, <strong>Good Mood</strong> c/ Paderewskiego 35 y <strong>Mil Pasos</strong> c/ Kamienna 4) con comparador de precios y mapa.',
    'contact.tag': 'Escríbenos',
    'contact.title': 'Ponte en contacto con nosotros',
    'contact.desc': '¿Tienes dudas sobre la salsa en Katowice? ¿Quieres sumarte a nuestra familia salsera? ¿O estás organizando un evento de baile en Silesia y buscas bailadores? ¡Déjanos un mensaje!',
    'contact.loc': 'Katowice – c/ Mariacka 2 / Valle de los Tres Estanques / NOSPR',
    'contact.fbGroup': 'Grupo de Facebook: Kato Salsa Hub',
    'contact.fbPage': 'Página de Facebook: @KatoSalsaHub',
    'contact.gallery': 'Galería de fotos: Wolni Ludzie (18.10 – 65 fotos)',
    'contact.nameLabel': 'Nombre o apodo',
    'contact.namePh': 'ej. Yaniel, SalseroKato',
    'contact.emailLabel': 'Correo electrónico',
    'contact.emailPh': 'yaniel@ejemplo.cu',
    'contact.msgLabel': 'Mensaje',
    'contact.msgPh': 'Escribe tu mensaje aquí...',
    'contact.gdpr': 'Acepto la <a href="privacy.html">Política de Privacidad</a> y doy mi consentimiento para el tratamiento de los datos proporcionados con el fin de atender mi consulta en el sistema Helpdesk.',
    'contact.submit': 'Enviar mensaje',
    'contact.sending': 'Enviando...',
    'contact.errRequired': '¡Completa todos los campos (nombre o apodo, correo y mensaje)!',
    'contact.errGdpr': 'Acepta la Política de Privacidad para poder enviar el mensaje.',
    'contact.msgSuccess': '¡Gracias! Tu mensaje ha sido enviado con éxito.',
    'contact.msgError': 'Ocurrió un problema al enviar el mensaje.',
    'contact.msgNetError': 'Error de conexión. Inténtalo de nuevo.',
    'footer.tagline': 'Salsa Katowice – Energía cubana en el corazón de Silesia',
    'footer.where': 'Dónde bailamos',
    'footer.privacy': 'Política de Privacidad',
    'footer.createdBy': 'Creado por',
    'cookie.title': '🍪 Cookies y Privacidad',
    'cookie.text': 'Usamos cookies técnicas para que disfrutes nuestra web al máximo. Revisa nuestra <a href="privacy.html">Política de Privacidad</a>.',
    'cookie.accept': '¡Dale, acepto!',
    'wiki.subtitle': 'Tu enciclopedia abierta sobre la salsa cubana (casino), la timba y la cultura afrocubana.',
    'wiki.searchPh': 'Busca un término (ej. Vacilala, Enchufla, Timba, Clave)...',
    'wiki.clearSearch': 'Limpiar búsqueda',
    'wiki.categories': 'Categorías',
    'wiki.cat.all': 'Todas',
    'wiki.cat.steps': 'Pasos (Bases)',
    'wiki.cat.figures': 'Figuras (Casino / Rueda)',
    'wiki.cat.dance': 'Baile',
    'wiki.cat.styles': 'Estilos de Baile',
    'wiki.cat.music': 'Música',
    'wiki.cat.instruments': 'Instrumentos',
    'wiki.cat.bands': 'Orquestas y Artistas',
    'wiki.cat.history': 'Historia',
    'wiki.cat.gods': 'Orishas (Deidades)',
    'wiki.cat.instructors': 'Profesores',
    'wiki.cat.schools': 'Escuelas de Baile',
    'wiki.sub.lead': 'Guía (Líder)',
    'wiki.sub.follow': 'Seguidor(a)',
    'wiki.sub.partnerwork': 'En pareja',
    'wiki.sub.shines': 'Pasitos libres / Suelta',
    'wiki.sub.technique': 'Técnica',
    'wiki.sub.rhythm': 'Rítmica',
    'wiki.proposeBtn': '<i class="fas fa-plus"></i> Proponer término',
    'wiki.modPanelBtn': '<i class="fas fa-user-shield"></i> Panel de Moderación',
    'wiki.filterLabel': 'Vista actual:',
    'wiki.filterAll': 'Todos los términos',
    'wiki.resetFilter': 'Mostrar todos',
    'wiki.loading': 'Cargando base de conocimientos...',
    'wiki.noResultsTitle': 'No encontramos ese término',
    'wiki.noResultsDesc': '¿Conoces esta figura o concepto? ¡Súmalo a la Salsopedia y aporta a la comunidad!',
    'wiki.noResultsBtn': '¡Añadir este término!',
    'wiki.fabTitle': 'Proponer nuevo término',
    'wiki.resultsShown': 'Mostrando: {shown} de {total} términos',
    'wiki.resultsUnverified': 'Por verificar en esta vista: {shown} términos',
    'wiki.authorLabel': 'Autor:',
    'wiki.unverifiedBadge': 'Sin verificar',
    'wiki.unverifiedTitle': 'Entrada pendiente de verificación por los profesores',
    'wiki.verifyBtn': 'Sugerir mejora',
    'wiki.verifyTitle': 'Propón una mejora o ampliación para este término',
    'wiki.expandBtn': 'Ver descripción completa',
    'wiki.collapseBtn': 'Ocultar descripción',
    'wiki.modalTitleAdd': 'Proponer nuevo término',
    'wiki.modalSubtitle': 'Completa los datos a la izquierda y mira la vista previa en vivo a la derecha.',
    'wiki.termLabel': 'Nombre del término / figura <span class="required">*</span>',
    'wiki.termPh': 'ej. Vacilala, Timba, Enchufla Doble',
    'wiki.mainCatsLabel': 'Categorías Principales <span class="required">*</span> <span class="label-hint">(toca para marcar)</span>',
    'wiki.subCatsLabel': 'Subcategorías <span class="label-hint">(opcional — toca para marcar)</span>',
    'wiki.defLabel': 'Definición / Descripción <span class="required">*</span>',
    'wiki.insertLinkBtn': '<i class="fas fa-link"></i> Insertar enlace [Término]',
    'wiki.defPh': 'Describe bien el concepto: cómo se ejecuta el movimiento, de dónde viene... Las palabras entre corchetes [Término] se enlazarán automáticamente.',
    'wiki.sourcesLabel': 'Fuentes / Enlaces <span class="label-hint">(Libro, profesor, video, link)</span>',
    'wiki.addSourceBtn': '<i class="fas fa-plus"></i> Añadir otra fuente',
    'wiki.authorInputLabel': 'Tu Firma / Apodo <span class="required">*</span>',
    'wiki.authorInputPh': 'ej. SalseroKato, Yaniel',
    'wiki.authorLinkLabel': 'Perfil de Instagram / Facebook <span class="label-hint">(opcional)</span>',
    'wiki.userCatLabel': 'Nueva categoría propuesta <span class="label-hint">(si falta alguna)</span>',
    'wiki.userCatPh': 'ej. Vestuario, Festivales, Códigos de pista...',
    'wiki.modNote': '<i class="fas fa-info-circle"></i> Los aportes de la comunidad pasan por moderación antes de publicarse.',
    'wiki.submitBtn': '<i class="fas fa-paper-plane"></i> Enviar a moderación',
    'wiki.cancelBtn': 'Cancelar',
    'wiki.livePreviewTitle': '<i class="fas fa-eye"></i> Vista previa de la tarjeta',
    'schedule.title': 'Horario de Escuelas y Fiestas',
    'schedule.subtitle': 'Compara las clases de las academias de baile en Katowice (La Clave, Good Mood, Mil Pasos), revisa las fiestas de DancePuls y ubica tu pista en el mapa.',
    'schedule.searchPh': 'Busca escuela, profesor, estilo o nivel (ej. P0, La Clave, Galas, Rueda, Bachata)...',
    'schedule.tab.classes': 'Horario Escuelas',
    'schedule.tab.pricing': 'Precios y Pases',
    'schedule.tab.events': 'Fiestas DancePuls',
    'schedule.tab.map': 'Mapa de Escuelas',
    'schedule.schoolsTitle': 'Escuelas de Baile (Katowice)',
    'schedule.schoolsAll': 'Todas las escuelas',
    'schedule.levelsTitle': 'Nivel (Estándar KSH)',
    'schedule.levelsAll': 'Todos los niveles',
    'schedule.level.p0': '🟢 P0 • Desde cero / Inicio (0–2 meses)',
    'schedule.level.p1': '🔵 P1 • Básico (2–5 meses)',
    'schedule.level.p2': '🔷 P2 / P3 • Básico+ (6–9 meses)',
    'schedule.level.s1': '🟣 S1+ / P4+ • Intermedio y Avanzado',
    'schedule.level.open': '🟡 Open / Pasos Libres / Práctica',
    'schedule.stylesTitle': 'Estilos de Baile',
    'schedule.stylesAll': 'Todos los estilos',
    'schedule.style.linear': 'Salsa en Línea (New York On2 / LA)',
    'schedule.style.solo': 'Pasos Libres, Estilo Chicas, WCS y Otros',
    'schedule.instructorsBtn': '<i class="fas fa-book-open"></i> Perfiles de Profesores en Salsopedia',
    'schedule.submitEventBtn': '<i class="fas fa-calendar-plus"></i> Enviar fiesta a DancePuls',
    'schedule.filterAll': 'Todas las clases',
    'schedule.resetFilter': 'Limpiar filtros',
    'schedule.day.all': 'Toda la semana',
    'schedule.day.today': '⚡ Hoy',
    'schedule.day.1': 'Lunes',
    'schedule.day.2': 'Martes',
    'schedule.day.3': 'Miércoles',
    'schedule.day.4': 'Jueves',
    'schedule.day.5': 'Viernes',
    'schedule.day.6': 'Sábado',
    'schedule.day.7': 'Domingo',
    'privacy.back': '← Volver a la página principal',
    'privacy.title': 'Política de Privacidad',
    'privacy.s1.title': '1. Información General y Responsable',
    'privacy.s1.p1': 'La presente política de privacidad define las reglas de tratamiento y protección de los datos personales facilitados por los usuarios al utilizar el portal comunitario katosalsahub.pl, gestionado por la comunidad Kato Salsa Hub.',
    'privacy.s2.title': '2. Cookies Técnicas y Analítica Sin Cookies (Cookieless)',
    'privacy.s2.p1': 'El portal aplica el principio de minimización de datos (Privacy by Design). Utilizamos únicamente el almacenamiento técnico del navegador indispensable para recordar la aceptación del aviso de privacidad y el funcionamiento de la aplicación web progresiva (PWA).',
    'privacy.s2.p2': 'Las estadísticas de visitas funcionan bajo el modelo <strong>Cookieless</strong> (sin cookies de rastreo y respetando la cabecera Do Not Track), lo que nos permite mejorar el portal sin perfilar a los usuarios.',
    'privacy.s3.title': '3. Formulario de Contacto, Minimización RGPD y Sistema Helpdesk',
    'privacy.s3.p1': 'En el formulario de contacto aplicamos la minimización de datos: no exigimos nombre y apellidos completos; basta con tu <strong>nombre o apodo</strong> y un correo electrónico para poder responderte.',
    'privacy.s3.p2': 'Las consultas enviadas se gestionan a través del sistema interno de tickets <strong>Helpdesk</strong> exclusivamente para responder tu mensaje. Antes de registrar la solicitud, la dirección IP del remitente se anonimiza automáticamente (enmascarando el último octeto de la IP) y los datos jamás se comparten con terceros con fines comerciales.',
    'privacy.s4.title': '4. Derechos del Usuario y Contacto',
    'privacy.s4.p1': 'Toda persona tiene derecho a acceder a sus datos, rectificarlos, suprimirlos o limitar su tratamiento. Para cualquier consulta sobre privacidad, escríbenos a través del formulario en la página principal.',
    'ai.toggleAria': 'Abrir chat con el asistente de Kato Salsa Hub',
    'ai.title': 'Asistente Kato Salsa Hub',
    'ai.clearTitle': 'Nueva conversación',
    'ai.closeTitle': 'Cerrar',
    'ai.placeholder': 'Haz una pregunta (ej. sobre Salsopedia)...',
    'ai.send': 'Enviar',
    'ai.welcome': '¡Hola, mi gente! 💃🕺 Soy el asistente virtual de **Kato Salsa Hub**. Mi base principal es la **Salsopedia**, y también te cuento todo sobre nuestras matinées los domingos en **Wolni Ludzie**, las descargas al aire libre en Katowice, **Timba Nation Radio** y **DancePuls**. ¿Qué quieres saber?'
  },

  en: {
    'meta.title.index': 'Salsa Katowice – Socials, Open-Air Dances & Community | Kato Salsa Hub ⚡',
    'meta.title.schedule': 'Katowice Dance School Timetables & DancePuls Events | Kato Salsa Hub',
    'meta.title.wiki': 'Salsopedia – Cuban Salsa & Timba Encyclopaedia | Kato Salsa Hub',
    'meta.title.privacy': 'Privacy Policy - Kato Salsa Hub',
    'nav.langAria': 'Select language',
    'nav.radioAria': 'Turn on radio',
    'nav.radioStopAria': 'Stop radio',
    'nav.start': 'Home',
    'nav.about': 'About Us',
    'nav.styles': 'Styles',
    'nav.schedule': 'Timetable',
    'nav.wiki': 'Salsopedia',
    'nav.radio': 'Radio',
    'nav.map': 'Locations',
    'nav.photos': 'Photos',
    'nav.faq': 'FAQ',
    'nav.contact': 'Contact',
    'hero.badge': '🌴 Salsa Katowice • Cuban Energy in Silesia 🌴',
    'hero.line1': 'Dance',
    'hero.line2': 'salsa with us',
    'hero.line3': 'in Katowice',
    'hero.subtitle': 'An open community of Cuban salsa, timba and rueda de casino dancers in Katowice. We dance together in a relaxed, friendly atmosphere – simply drop in! 💃🕺',
    'hero.btnPrimary': 'Keep up with upcoming events',
    'hero.btnSchedule': '📅 School Timetables',
    'hero.btnSecondary': 'Where and when we dance',
    'about.tag': 'Salsa Katowice – Who we are',
    'about.title': 'The Salsa Community in Katowice',
    'about.c1.title': 'Open Community',
    'about.c1.text': 'Everyone is welcome – from complete beginners taking their very first steps to seasoned dancers. On the dance floors of Katowice, you will meet people who love Cuban rhythms just as much as you do!',
    'about.c2.title': 'Authentic Atmosphere',
    'about.c2.text': 'Salsa in Katowice is more than just classes and steps – it is a way of life! Cuban energy, fiery timba, rueda de casino and the unmistakable spirit of the Caribbean right in the heart of Silesia.',
    'about.c3.title': 'Regular Socials & Open-Air Dances',
    'about.c3.text': 'We meet for free open-air socials at Three Ponds Valley (Dolina Trzech Stawów) and outside the NOSPR concert hall, as well as Sunday afternoon practices indoors at Wolni Ludzie (2 Mariacka Street, Katowice).',
    'styles.tag': 'What we dance in Katowice',
    'styles.title': 'Dance Styles – Cuban Salsa & Latin Rhythms',
    'styles.salsa.desc': 'More than just a dance – it is a conversation in motion! Lively, joyful partner improvisation (Casino), where intricate arm knots blend with authentic Cuban "sabor". The foundation where your journey begins!',
    'styles.timba.desc': 'Cuba\'s high-octane evolution of salsa, packed with musicality, fast tempo and electrifying energy!',
    'styles.rueda.desc': 'Dancing in a circle with figures called out by the leader. Group energy, synchronisation and brilliant fun!',
    'styles.linear.title': 'Cross-Body Salsa <span class="style-icon">💃</span>',
    'styles.linear.desc': 'An elegant linear style (On1 / On2), renowned for dazzling spins and precise lead-and-follow technique.',
    'styles.son.desc': 'The forefather of salsa. Elegant, rhythmic and danced "contratiempo". Pure class, cadence and Cuban tradition.',
    'styles.rumba.desc': 'Afro-Cuban roots: Guaguancó, Yambú and Columbia. A playful game of courtship, raw emotion and the pulse of the drums.',
    'styles.afro.desc': 'Sacred dances of the Orishas (Yoruba): Eleggua, Chango, Ochun. Primal energy, grounding and spirituality expressed through movement.',
    'styles.reggaeton.desc': 'The streets of Havana! Modern, fierce urban energy from Cuba. Body isolations, heavy beats and uninhibited expression "a lo cubano".',
    'radio.tag': 'Listen Live',
    'radio.desc': 'The finest Cuban rhythms non-stop! Put the music on and feel the Havana atmosphere right in your own home.',
    'radio.nowPlaying': 'Now on air',
    'radio.defaultTrack': 'Cuban Energy 24/7 (Salsa & Timba)',
    'radio.playBtn': '▶ Turn on radio',
    'radio.stopBtn': '⏹ Turn off radio',
    'radio.loadingBtn': '⏳ Connecting...',
    'radio.sleepAria': 'Radio sleep timer',
    'radio.sleepLabel': '<i class="fas fa-moon"></i> Sleep timer:',
    'radio.sleepCancel': 'Cancel timer',
    'radio.sleepTooltipPrefix': 'Radio sleep timer:',
    'map.tag': 'Salsa Katowice – Our Venues',
    'map.title': 'Where Do We Dance <span class="text-gradient">Salsa in Katowice?</span> 📍',
    'map.subtitle': 'We dance salsa open-air at Three Ponds Valley (Dolina Trzech Stawów) and outside NOSPR in Katowice, and on Sundays indoors at Wolni Ludzie (2 Mariacka Street). Choose a zone, check the free car parks and launch navigation with a single click!',
    'map.tabsAria': 'Select map view',
    'map.tab.stawy': '💃 Stone Circle',
    'map.tab.nospr': '🏛️ NOSPR Amphitheatre',
    'map.wolni.label': 'City Centre: Wolni Ludzie (2 Mariacka St) & free car parks',
    'map.stawy.label': '3 Ponds Valley: Stone Circle, Sheltered Pavilion & 3 Toilets',
    'map.nospr.label': 'Culture Zone: Amphitheatre & Recommended Car Park by NOSPR',
    'map.wolni.title': 'Wolni Ludzie – Indoors',
    'map.wolni.addr': '2 Mariacka Street, Katowice (corner of Mielęckiego St)',
    'map.wolni.badge': 'Sundays 15:00–18:00',
    'map.wolni.p1': '<strong>💃 When we dance:</strong> <strong>every Sunday from 15:00 to 18:00</strong> — open socials and practice sessions (Cuban Salsa, Timba, Rueda, Bachata, Kizomba).',
    'map.wolni.p2': '<strong>📸 Photo gallery from 18 Oct (65 photos):</strong> see the vibe of our Sunday socials captured by Jacek Cupiał — <a href="https://photos.app.goo.gl/faiU7NhFAgpTEPRt9" target="_blank" rel="noopener noreferrer">Open photo gallery</a>!',
    'map.wolni.p3': '<strong>⭐ Recommended Car Park (12 min):</strong> huge car park by NOSPR (free on Sundays) with a signposted walking route across the footbridge!',
    'map.wolni.p4': '<strong>🅿️ Free street parking nearby (Sundays & after 17:00):</strong> Warszawska / Św. Stanisława (1 min), Tylna Mariacka / Dworcowa (2 min), Wojewódzka (3 min), pl. Szramka (4 min).',
    'map.stawy.title': 'Stone Circle – 3 Ponds Valley',
    'map.stawy.addr': '22 Trzech Stawów St, Katowice (next to the marina & La Cantina)',
    'map.stawy.badge': 'Open-Air',
    'map.stawy.p1': '<strong>☔ Shelter in case of rain:</strong> covered pavilion by the UKS 4 / SUP Tomi kayak marina (10 Trzech Stawów St).',
    'map.stawy.p2': '<strong>⭐ Recommended Car Park (13 min):</strong> free South / Rollerblade Track car park with a marked walking path + closest bays by La Cantina (1 min).',
    'map.stawy.p3': '<strong>🚻 Facilities:</strong> 3 public toilets marked on the map and the <em>Kolonia Zuzanna</em> bus stop.',
    'map.nospr.title': 'NOSPR Amphitheatre & Car Park',
    'map.nospr.addr': '1 Wojciecha Kilara Sq / Olimpijska St, Katowice',
    'map.nospr.badge': 'Culture Zone',
    'map.nospr.p1': '<strong>💃 Open-air dance floor:</strong> on the eastern side of the NOSPR concert hall, right by the fountains.',
    'map.nospr.p2': '<strong>⭐ Recommended car park (free on Sundays):</strong> vast car parks off Olimpijska St and the Silesian Museum (2 min to NOSPR, 12 min walk to 2 Mariacka St).',
    'map.showBtn': '<i class="fas fa-crosshairs"></i> Show on map',
    'map.navBtn': '<i class="fas fa-parking"></i> Navigate to Recommended Car Park',
    'faq.tag': 'Good to know',
    'faq.title': 'Salsa in Katowice – <span class="text-gradient">Questions & Answers</span> 💬',
    'faq.subtitle': 'Taking your first steps on the dance floors of Silesia or looking for details about our socials? Check out the answers to our most frequently asked questions!',
    'faq.q1': 'Where can you dance salsa in Katowice?',
    'faq.a1': 'The <strong>Kato Salsa Hub</strong> community meets at three main venues in Katowice: indoors at <strong>Wolni Ludzie (2 Mariacka Street)</strong> <strong>every Sunday from 15:00 to 18:00</strong>, and during the spring–summer season at free open-air socials in <strong>Three Ponds Valley (Stone Circle at 22 Trzech Stawów St)</strong> and in the <strong>Culture Zone outside the NOSPR Amphitheatre (1 Wojciecha Kilara Sq)</strong>.',
    'faq.q2': 'Do I need to bring a partner to a salsa social or open-air dance in Katowice?',
    'faq.a2': 'Not at all! Cuban salsa (Casino) and Rueda de Casino in Katowice are all about socialising and rotating partners freely. Most dancers come solo – you will quickly meet everyone on the dance floor and join the fun right away.',
    'faq.q3': 'Which dance styles are played at Kato Salsa Hub socials?',
    'faq.a3': 'At the heart of our Katowice socials is <strong>Cuban Salsa (Casino)</strong>, energetic <strong>Timba</strong>, circle dancing <strong>Rueda de Casino</strong>, as well as traditional <strong>Son Cubano, Rumba and Afro</strong>. Across Silesian dance floors and in our DancePuls event radar, you will also find parties blending salsa with bachata and kizomba.',
    'faq.q4': 'Where can I learn about salsa figures and check upcoming events in Silesia?',
    'faq.a4': 'On our website you will find the <a href="grafik.html" data-page="schedule"><strong>Unified Dance School Timetable</strong></a> in Katowice, <a href="salsopedia.html" data-page="wiki"><strong>Salsopedia</strong></a> – an open encyclopaedia of over 200 Cuban salsa figures, dance schools and instructors, the 24/7 Cuban station <strong>Timba Nation Radio</strong>, and our weekly <strong>DancePuls</strong> event guide.',
    'faq.q5': 'Where can I sign up for salsa classes in Katowice and which dance schools do you recommend?',
    'faq.a5': 'We have gathered all salsa classes in Katowice (from complete beginner P0 groups to advanced levels) in one place! Check out our <a href="grafik.html" data-page="schedule"><strong>Katowice Dance School Timetable</strong></a> (over 120 weekly classes at <strong>La Clave</strong> 11 Chorzowska St, <strong>Good Mood</strong> 35 Paderewskiego St and <strong>Mil Pasos</strong> 4 Kamienna St) complete with a pass price comparator and school map.',
    'contact.tag': 'Get in touch',
    'contact.title': 'Contact Us',
    'contact.desc': 'Have questions about salsa in Katowice? Keen to join our community? Or perhaps you are organising a dance event in Silesia and need dancers? Drop us a line!',
    'contact.loc': 'Katowice – 2 Mariacka St / Three Ponds Valley / NOSPR',
    'contact.fbGroup': 'Facebook Group: Kato Salsa Hub',
    'contact.fbPage': 'Facebook Page: @KatoSalsaHub',
    'contact.gallery': 'Photo gallery: Wolni Ludzie (18 Oct – 65 shots)',
    'contact.nameLabel': 'First name or nickname',
    'contact.namePh': 'e.g. Oliver, SalsaLover',
    'contact.emailLabel': 'Email address',
    'contact.emailPh': 'oliver@example.co.uk',
    'contact.msgLabel': 'Message',
    'contact.msgPh': 'Your message...',
    'contact.gdpr': 'I accept the <a href="privacy.html">Privacy Policy</a> and consent to the processing of the provided details in order to handle my enquiry via the Helpdesk system.',
    'contact.submit': 'Send message',
    'contact.sending': 'Sending...',
    'contact.errRequired': 'Please fill in all fields (first name or nickname, email address and message)!',
    'contact.errGdpr': 'Please accept the Privacy Policy to send your message.',
    'contact.msgSuccess': 'Thank you! Your message has been sent.',
    'contact.msgError': 'An error occurred whilst sending your message.',
    'contact.msgNetError': 'A connection error occurred. Please try again.',
    'footer.tagline': 'Salsa Katowice – Cuban energy in the heart of Silesia',
    'footer.where': 'Where we dance',
    'footer.privacy': 'Privacy Policy',
    'footer.createdBy': 'Created by',
    'cookie.title': '🍪 Cookies & Privacy',
    'cookie.text': 'We use essential cookies to ensure you get the best experience on our website. Read our <a href="privacy.html">Privacy Policy</a>.',
    'cookie.accept': 'Accept',
    'wiki.subtitle': 'Your open encyclopaedia of Cuban salsa, music and Afro-Cuban culture.',
    'wiki.searchPh': 'Search for a term (e.g. Vacilala, Enchufla, Timba, Clave)...',
    'wiki.clearSearch': 'Clear search',
    'wiki.categories': 'Categories',
    'wiki.cat.all': 'All',
    'wiki.cat.steps': 'Steps (Basics)',
    'wiki.cat.figures': 'Figures (Casino / Rueda)',
    'wiki.cat.dance': 'Dance',
    'wiki.cat.styles': 'Dance Styles',
    'wiki.cat.music': 'Music',
    'wiki.cat.instruments': 'Instruments',
    'wiki.cat.bands': 'Bands & Artists',
    'wiki.cat.history': 'History',
    'wiki.cat.gods': 'Gods (Orishas)',
    'wiki.cat.instructors': 'Instructors',
    'wiki.cat.schools': 'Dance Schools',
    'wiki.sub.lead': 'Leading',
    'wiki.sub.follow': 'Following',
    'wiki.sub.partnerwork': 'Partnerwork',
    'wiki.sub.shines': 'Solo / Shines',
    'wiki.sub.technique': 'Technique',
    'wiki.sub.rhythm': 'Rhythm & Timing',
    'wiki.proposeBtn': '<i class="fas fa-plus"></i> Suggest a term',
    'wiki.modPanelBtn': '<i class="fas fa-user-shield"></i> Moderation Panel',
    'wiki.filterLabel': 'Current view:',
    'wiki.filterAll': 'All entries',
    'wiki.resetFilter': 'Show all',
    'wiki.loading': 'Loading knowledge base...',
    'wiki.noResultsTitle': 'No matching entry found',
    'wiki.noResultsDesc': 'Know this figure or concept? Add it to Salsopedia and help grow our dance community!',
    'wiki.noResultsBtn': 'Add this entry!',
    'wiki.fabTitle': 'Suggest a new entry',
    'wiki.resultsShown': 'Showing: {shown} of {total} entries',
    'wiki.resultsUnverified': 'Awaiting verification in this view: {shown} entries',
    'wiki.authorLabel': 'Author:',
    'wiki.unverifiedBadge': 'Unverified',
    'wiki.unverifiedTitle': 'Template entry awaiting instructor verification',
    'wiki.verifyBtn': 'Suggest an edit',
    'wiki.verifyTitle': 'Suggest a correction or addition to this entry',
    'wiki.expandBtn': 'Read full description',
    'wiki.collapseBtn': 'Show less',
    'wiki.modalTitleAdd': 'Suggest a new entry',
    'wiki.modalSubtitle': 'Enter the details on the left and watch the live card preview and automatic linking on the right.',
    'wiki.termLabel': 'Term / figure name <span class="required">*</span>',
    'wiki.termPh': 'e.g. Vacilala, Timba, Enchufla Doble',
    'wiki.mainCatsLabel': 'Main Categories <span class="required">*</span> <span class="label-hint">(click to select)</span>',
    'wiki.subCatsLabel': 'Subcategories <span class="label-hint">(optional — click to select)</span>',
    'wiki.defLabel': 'Definition / Description <span class="required">*</span>',
    'wiki.insertLinkBtn': '<i class="fas fa-link"></i> Insert link [Term]',
    'wiki.defPh': 'Describe this concept clearly: how the movement is executed, its roots and musical context... Words in brackets [Term] will be linked automatically.',
    'wiki.sourcesLabel': 'Sources / References <span class="label-hint">(Book, instructor, video, link)</span>',
    'wiki.addSourceBtn': '<i class="fas fa-plus"></i> Add another source',
    'wiki.authorInputLabel': 'Your Name / Nickname <span class="required">*</span>',
    'wiki.authorInputPh': 'e.g. KatoDancer, Oliver',
    'wiki.authorLinkLabel': 'Instagram / Facebook Profile <span class="label-hint">(optional)</span>',
    'wiki.userCatLabel': 'Proposed new category <span class="label-hint">(if none fits)</span>',
    'wiki.userCatPh': 'e.g. Footwear, Festivals, Dance floor etiquette...',
    'wiki.modNote': '<i class="fas fa-info-circle"></i> Community submissions are reviewed by moderators before publication.',
    'wiki.submitBtn': '<i class="fas fa-paper-plane"></i> Submit for moderation',
    'wiki.cancelBtn': 'Cancel',
    'wiki.livePreviewTitle': '<i class="fas fa-eye"></i> Live card preview',
    'schedule.title': 'School Timetables & Events',
    'schedule.subtitle': 'Compare classes across Katowice dance schools (La Clave, Good Mood, Mil Pasos), check upcoming DancePuls socials and find your dance floor on the map.',
    'schedule.searchPh': 'Search school, instructor, style or level (e.g. P0, La Clave, Galas, Rueda, Bachata)...',
    'schedule.tab.classes': 'School Timetables',
    'schedule.tab.pricing': 'School Pricing',
    'schedule.tab.events': 'DancePuls Events',
    'schedule.tab.map': 'School Map',
    'schedule.schoolsTitle': 'Dance Schools (Katowice)',
    'schedule.schoolsAll': 'All schools',
    'schedule.levelsTitle': 'Level (KSH Standard)',
    'schedule.levelsAll': 'All levels',
    'schedule.level.p0': '🟢 P0 • Complete Beginner (0–2 mos)',
    'schedule.level.p1': '🔵 P1 • Elementary (2–5 mos)',
    'schedule.level.p2': '🔷 P2 / P3 • Improver (6–9 mos)',
    'schedule.level.s1': '🟣 S1+ / P4+ • Intermediate & Adv.',
    'schedule.level.open': '🟡 Open / Solo / Practise',
    'schedule.stylesTitle': 'Dance Styles',
    'schedule.stylesAll': 'All styles',
    'schedule.style.linear': 'Cross-Body Salsa (New York On2 / LA)',
    'schedule.style.solo': 'Solo Footwork, Ladies Styling, WCS & More',
    'schedule.instructorsBtn': '<i class="fas fa-book-open"></i> Instructor Profiles in Salsopedia',
    'schedule.submitEventBtn': '<i class="fas fa-calendar-plus"></i> Submit an event to DancePuls',
    'schedule.filterAll': 'All entries',
    'schedule.resetFilter': 'Clear filters',
    'schedule.day.all': 'Full week',
    'schedule.day.today': '⚡ Today',
    'schedule.day.1': 'Monday',
    'schedule.day.2': 'Tuesday',
    'schedule.day.3': 'Wednesday',
    'schedule.day.4': 'Thursday',
    'schedule.day.5': 'Friday',
    'schedule.day.6': 'Saturday',
    'schedule.day.7': 'Sunday',
    'privacy.back': '← Back to homepage',
    'privacy.title': 'Privacy Policy',
    'privacy.s1.title': '1. General Information & Data Controller',
    'privacy.s1.p1': 'This privacy policy sets out the rules for processing and protecting personal data provided by users in connection with using the katosalsahub.pl community portal run by the Kato Salsa Hub community.',
    'privacy.s2.title': '2. Cookies & Cookieless Analytics',
    'privacy.s2.p1': 'Our website follows the principle of data minimisation (Privacy by Design). We only use essential technical browser storage required to remember your privacy banner preference and operate the Progressive Web App (PWA).',
    'privacy.s2.p2': 'Visitor statistics are collected using a <strong>Cookieless</strong> model (without tracking cookies and honouring the Do Not Track header), allowing us to improve the portal without profiling users.',
    'privacy.s3.title': '3. Contact Form, GDPR Minimisation & Helpdesk System',
    'privacy.s3.p1': 'In our contact form we practise strict data minimisation – we do not ask for your full legal name; a <strong>first name or nickname</strong> and an email address to reply to your enquiry are sufficient.',
    'privacy.s3.p2': 'Submitted enquiries are handled via our internal <strong>Helpdesk</strong> ticketing system solely for the purpose of replying to your message. Before a ticket is recorded, the sender\'s IP address is automatically anonymised (by masking the final octet of the IP address), and data is never shared with third parties for marketing purposes.',
    'privacy.s4.title': '4. User Rights & Contact',
    'privacy.s4.p1': 'Every user has the right to access, rectify, erase or restrict the processing of their data. For any matters regarding privacy, please get in touch via the contact form on our homepage.',
    'ai.toggleAria': 'Open chat with the Kato Salsa Hub assistant',
    'ai.title': 'Kato Salsa Hub Assistant',
    'ai.clearTitle': 'New conversation',
    'ai.closeTitle': 'Close',
    'ai.placeholder': 'Ask a question (e.g. about Salsopedia)...',
    'ai.send': 'Send',
    'ai.welcome': 'Hello! 💃🕺 I am the **Kato Salsa Hub** virtual assistant. My main knowledge base is **Salsopedia**, and I can also answer all your questions about our Sunday socials at **Wolni Ludzie**, open-air dances in Katowice, **Timba Nation Radio** and **DancePuls**. What would you like to ask?'
  }
};

const AI_QUICK_PROMPTS_I18N = {
  pl: [
    'Co dzieje się w Wolnych Ludziach w niedzielę (15:00–18:00)?',
    'Gdzie tańczymy w Katowicach i gdzie za darmo zaparkować?',
    'Czym zajmuje się społeczność i Fundacja Kato Salsa Hub?',
    'Wyjaśnij figury: Dile Que No, Enchufla i Setenta'
  ],
  es: [
    '¿Qué hay los domingos en Wolni Ludzie (15:00–18:00)?',
    '¿Dónde bailamos en Katowice y dónde hay parqueo gratis?',
    '¿Qué hace la comunidad y Fundación Kato Salsa Hub?',
    'Explícame las figuras: Dile Que No, Enchufla y Setenta'
  ],
  en: [
    'What happens at Wolni Ludzie on Sundays (15:00–18:00)?',
    'Where do we dance in Katowice and where is free parking?',
    'What does the Kato Salsa Hub community & Foundation do?',
    'Explain the figures: Dile Que No, Enchufla and Setenta'
  ]
};

let currentLang = 'pl';

function normalizeLangCode(raw) {
  if (!raw || typeof raw !== 'string') return 'pl';
  const clean = raw.trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.includes(clean) ? clean : 'pl';
}

function detectInitialLang(win = globalThis.window) {
  try {
    if (win && win.location && win.location.search) {
      const params = new URLSearchParams(win.location.search);
      const urlLang = params.get('lang');
      if (urlLang && SUPPORTED_LANGS.includes(normalizeLangCode(urlLang))) {
        return normalizeLangCode(urlLang);
      }
    }
  } catch {
    // Ignoruj błędy URLSearchParams
  }

  try {
    const saved = win && win.localStorage ? win.localStorage.getItem(STORAGE_KEY) : null;
    if (saved && SUPPORTED_LANGS.includes(normalizeLangCode(saved))) {
      return normalizeLangCode(saved);
    }
  } catch {
    // Ignoruj blokadę localStorage
  }

  return 'pl';
}

function getLang() {
  return currentLang;
}

function t(key, secondArg = null, thirdArg = null) {
  let lang = currentLang;
  let vars = null;

  if (typeof secondArg === 'string') {
    lang = normalizeLangCode(secondArg);
    vars = thirdArg && typeof thirdArg === 'object' ? thirdArg : null;
  } else if (secondArg && typeof secondArg === 'object') {
    vars = secondArg;
    if (typeof thirdArg === 'string') {
      lang = normalizeLangCode(thirdArg);
    }
  } else if (typeof thirdArg === 'object' && thirdArg !== null) {
    vars = thirdArg;
  }

  const dict = TRANSLATIONS[lang] || TRANSLATIONS.pl;
  let val = dict[key] !== undefined ? dict[key] : (TRANSLATIONS.pl[key] !== undefined ? TRANSLATIONS.pl[key] : key);

  if (vars && typeof val === 'string') {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return val;
}

function applyTranslationsToDom(doc = globalThis.document, lang = currentLang) {
  if (!doc) return;
  const safeLang = normalizeLangCode(lang);
  const dict = TRANSLATIONS[safeLang] || TRANSLATIONS.pl;

  // 1. Aktualizuj <html lang="...">
  if (doc.documentElement && typeof doc.documentElement.setAttribute === 'function') {
    doc.documentElement.setAttribute('lang', LANG_HTML_MAP[safeLang] || 'pl');
  }

  // 2. Aktualizuj <title> na podstawie obecnego widoku
  const pathname = (globalThis.window && globalThis.window.location && globalThis.window.location.pathname) || '';
  if (pathname.includes('salsopedia')) {
    doc.title = dict['meta.title.wiki'] || doc.title;
  } else if (pathname.includes('grafik')) {
    doc.title = dict['meta.title.schedule'] || doc.title;
  } else if (pathname.includes('privacy')) {
    doc.title = dict['meta.title.privacy'] || doc.title;
  } else if (dict['meta.title.index']) {
    doc.title = dict['meta.title.index'];
  }

  // 3. Elementy tekstowe [data-i18n]
  const textEls = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n]') : [];
  textEls.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key && dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // 4. Elementy z bezpiecznym HTML wewnętrznym [data-i18n-html]
  const htmlEls = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n-html]') : [];
  htmlEls.forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key && dict[key] !== undefined) {
      el.innerHTML = dict[key];
    }
  });

  // 5. Placeholdery pól formularzy [data-i18n-placeholder]
  const placeholderEls = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n-placeholder]') : [];
  placeholderEls.forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && dict[key] !== undefined) {
      el.setAttribute('placeholder', dict[key]);
    }
  });

  // 6. Atrybuty dostępności [data-i18n-aria-label] i [data-i18n-title]
  const ariaEls = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n-aria-label]') : [];
  ariaEls.forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key && dict[key] !== undefined) {
      el.setAttribute('aria-label', dict[key]);
    }
  });

  const titleEls = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n-title]') : [];
  titleEls.forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key && dict[key] !== undefined) {
      el.setAttribute('title', dict[key]);
    }
  });

  // 7. Atrybuty data-label na przełącznikach mapy [data-i18n-label] + aktywna etykieta #map-active-label
  const labelEls = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n-label]') : [];
  labelEls.forEach((el) => {
    const key = el.getAttribute('data-i18n-label');
    if (key && dict[key] !== undefined) {
      el.setAttribute('data-label', dict[key]);
    }
  });

  const activeMapTab = doc.querySelector ? doc.querySelector('.map-tab-btn.is-active') : null;
  const mapActiveLabel = doc.getElementById ? doc.getElementById('map-active-label') : null;
  if (activeMapTab && mapActiveLabel) {
    const updatedLabel = activeMapTab.getAttribute('data-label');
    if (updatedLabel) {
      mapActiveLabel.textContent = updatedLabel;
    }
  }

  // 8. Synchronizacja przycisków przełącznika języka (.lang-btn)
  const langBtns = doc.querySelectorAll ? doc.querySelectorAll('.lang-btn[data-lang]') : [];
  langBtns.forEach((btn) => {
    const btnLang = normalizeLangCode(btn.getAttribute('data-lang'));
    const isActive = btnLang === safeLang;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // 9. Domyślny tytuł ścieżki radia (jeśli nie gra żywy utwór z Zeno.FM)
  const trackTitleEl = doc.getElementById ? doc.getElementById('radio-track-title') : null;
  if (trackTitleEl && DEFAULT_TRACK_TITLES.has(trackTitleEl.textContent.trim())) {
    trackTitleEl.textContent = dict['radio.defaultTrack'] || trackTitleEl.textContent;
  }

  // 10. Odśwież UI odtwarzacza radiowego (przycisk Play/Stop i tooltipy)
  if (globalThis.window && typeof globalThis.window.updateGlobalRadioUI === 'function') {
    globalThis.window.updateGlobalRadioUI();
  }

  // 11. Odśwież Salsopedię (liczniki, odznaki kategorii, przyciski w kartach)
  if (globalThis.window && typeof globalThis.window.refreshWikiLanguage === 'function') {
    globalThis.window.refreshWikiLanguage();
  }

  // 12. Odśwież interfejs Asystenta AI (#tsw-ai-widget-root)
  updateAiWidgetLanguage(doc, safeLang, dict);
}

function updateAiWidgetLanguage(doc, safeLang, dict) {
  if (!doc || typeof doc.getElementById !== 'function') return;
  const toggleBtn = doc.getElementById('tswAiToggleBtn');
  const clearBtn = doc.getElementById('tswAiClearBtn');
  const closeBtn = doc.getElementById('tswAiCloseBtn');
  const inputEl = doc.getElementById('tswAiInput');
  const sendBtn = doc.getElementById('tswAiSend');
  const chatWindow = doc.getElementById('tswAiWindow');

  if (toggleBtn && dict['ai.toggleAria']) toggleBtn.setAttribute('aria-label', dict['ai.toggleAria']);
  if (chatWindow && dict['ai.title']) {
    chatWindow.setAttribute('aria-label', dict['ai.title']);
    const titleEl = chatWindow.querySelector ? chatWindow.querySelector('.tsw-ai-title') : null;
    if (titleEl) {
      titleEl.innerHTML = `<span class="tsw-ai-dot"></span> ${dict['ai.title']}`;
    }
  }
  if (clearBtn && dict['ai.clearTitle']) {
    clearBtn.setAttribute('title', dict['ai.clearTitle']);
    clearBtn.setAttribute('aria-label', dict['ai.clearTitle']);
  }
  if (closeBtn && dict['ai.closeTitle']) {
    closeBtn.setAttribute('title', dict['ai.closeTitle']);
    closeBtn.setAttribute('aria-label', dict['ai.closeTitle']);
  }
  if (inputEl && dict['ai.placeholder']) {
    inputEl.setAttribute('placeholder', dict['ai.placeholder']);
  }
  if (sendBtn && dict['ai.send']) {
    sendBtn.textContent = dict['ai.send'];
  }

  // Jeśli rozmowa jest na wiadomości powitalnej (1 wiadomość bota i brak odpowiedzi użytkownika), przetłumacz powitanie i chipy
  const messagesBox = doc.getElementById('tswAiMessages');
  const chipsBox = doc.getElementById('tswAiChips');
  if (messagesBox && messagesBox.children && messagesBox.children.length === 1) {
    const firstMsg = messagesBox.children[0];
    if (firstMsg && firstMsg.classList && firstMsg.classList.contains('tsw-ai-msg-bot') && dict['ai.welcome']) {
      if (globalThis.window && typeof globalThis.window.formatMarkdown === 'function') {
        firstMsg.innerHTML = globalThis.window.formatMarkdown(dict['ai.welcome']);
      }
    }
    if (chipsBox && chipsBox.children) {
      const prompts = AI_QUICK_PROMPTS_I18N[safeLang] || AI_QUICK_PROMPTS_I18N.pl;
      const chipBtns = chipsBox.querySelectorAll ? chipsBox.querySelectorAll('.tsw-ai-chip') : [];
      chipBtns.forEach((chip, idx) => {
        if (prompts[idx]) {
          chip.textContent = prompts[idx];
        }
      });
    }
  }
}

function setLanguage(lang, doc = globalThis.document, win = globalThis.window) {
  const nextLang = normalizeLangCode(lang);
  currentLang = nextLang;

  try {
    if (win && win.localStorage) {
      win.localStorage.setItem(STORAGE_KEY, nextLang);
    }
  } catch {
    // Ignoruj blokadę storage
  }

  applyTranslationsToDom(doc, nextLang);

  if (doc && typeof doc.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    doc.dispatchEvent(new CustomEvent('ksh:langchange', { detail: { lang: nextLang } }));
  }

  return nextLang;
}

function initI18n(doc = globalThis.document, win = globalThis.window) {
  if (!doc) return;
  currentLang = detectInitialLang(win);

  if (doc.body && doc.body.dataset && doc.body.dataset.i18nBound !== '1') {
    doc.body.dataset.i18nBound = '1';
    doc.body.addEventListener('click', (e) => {
      if (!e || !e.target || typeof e.target.closest !== 'function') return;
      const btn = e.target.closest('.lang-btn[data-lang]');
      if (!btn) return;
      e.preventDefault();
      const targetLang = btn.getAttribute('data-lang');
      if (targetLang) {
        setLanguage(targetLang, doc, win);
      }
    });
  }

  applyTranslationsToDom(doc, currentLang);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initI18n(document, globalThis.window));
  } else {
    initI18n(document, globalThis.window);
  }

  document.addEventListener('page:loaded', () => {
    applyTranslationsToDom(document, currentLang);
  });
}

if (typeof window !== 'undefined') {
  window.kshI18n = {
    getLang,
    setLanguage,
    t,
    applyTranslationsToDom,
    TRANSLATIONS,
    SUPPORTED_LANGS
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUPPORTED_LANGS,
    LANG_HTML_MAP,
    TRANSLATIONS,
    getLang,
    setLanguage,
    t,
    applyTranslationsToDom,
    initI18n
  };
}
})();
