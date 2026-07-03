/**
 * SKRYPT DO POBIERANIA WYDARZEŃ Z FACEBOOKA
 * 
 * INSTRUKCJA:
 * 1. Wejdź na stronę z wydarzeniami.
 * 2. Otwórz Konsolę (F12).
 * 3. Wklej kod i ENTER.
 * 4. Dane w schowku -> Wklej do Generatora.
 */

(async function() {
    console.log("🚀 Rozpoczynam pobieranie wydarzeń...");

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const events = [];

    // --- KONFIGURACJA I STAŁE ---
    const KEYWORDS_TO_CUT = [
        "proponowane wydarzenia", "popularne wśród znajomych", "goście", 
        "poznaj organizatora", "transparentność wydarzeń", "informacje o wydarzeniu",
        "szczegóły", "pokaż wszystkich", "pokaż mniej", "zaproszenie", "udostępnij"
    ];

    const EXCLUDED_TITLES = ["WARSZTATY", "KURS", "ZAJĘCIA"];

    // --- HELPERY ---
    function parseFBDate(text) {
        if (!text) return null;
        text = text.toUpperCase();
        const now = new Date();
        const currentYear = now.getFullYear();

        // Relatywne
        if (text.includes('DZISIAJ')) return now;
        if (text.includes('JUTRO')) { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
        if (text.includes('POJUTRZE')) { const d = new Date(now); d.setDate(d.getDate() + 2); return d; }

        // Miesiące
        const months = {'STY':0, 'LUT':1, 'MAR':2, 'KWI':3, 'MAJ':4, 'CZE':5, 'LIP':6, 'SIE':7, 'WRZ':8, 'PAŹ':9, 'PAZ':9, 'LIS':10, 'GRU':11};
        
        // Regex: "20 PAŹ" lub "PT., 20 PAŹ" lub "20.10"
        const regex = /(\d{1,2})\s+(STY|LUT|MAR|KWI|MAJ|CZE|LIP|SIE|WRZ|PAŹ|PAZ|LIS|GRU)/;
        const match = text.match(regex);
        if (match) {
             const day = parseInt(match[1]);
             const month = months[match[2]];
             const d = new Date(currentYear, month, day);
             
             // Korekta roku: jeśli data jest w przeszłości o więcej niż 2 miesiące, zakładamy przyszły rok
             // (np. skanujemy w Grudniu event na Styczeń -> Styczeń < Grudzień, więc year++)
             if (d < new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)) { 
                 d.setFullYear(currentYear + 1);
             }
             return d;
        }

        // Format DD.MM
        const regexDot = /(\d{1,2})\.(\d{1,2})/;
        const matchDot = text.match(regexDot);
        if (matchDot) {
             const day = parseInt(matchDot[1]);
             const month = parseInt(matchDot[2]) - 1;
             const d = new Date(currentYear, month, day);
             if (d < new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)) d.setFullYear(currentYear + 1);
             return d;
        }

        return null;
    }

    function cleanDescription(text) {
        let cleanText = text;
        const lowerText = cleanText.toLowerCase();
        let cutIndex = cleanText.length;
        
        KEYWORDS_TO_CUT.forEach(kw => {
            const idx = lowerText.indexOf(kw.toLowerCase());
            if (idx !== -1 && idx < cutIndex) cutIndex = idx;
        });
        
        return cleanText.substring(0, cutIndex).trim();
    }

    function copyToClipboard(text) {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }

    function finalize(eventsList) {
        if (eventsList.length > 0) {
            const json = JSON.stringify(eventsList, null, 2);
            copyToClipboard(json);
            console.log(`✅ Znaleziono ${eventsList.length} wydarzeń!`);
            console.table(eventsList);
            alert(`✅ Sukces! Skopiowano ${eventsList.length} wydarzeń do schowka.`);
        } else {
            console.warn("⚠️ Nie znaleziono wydarzeń.");
            alert("⚠️ Nie znaleziono wydarzeń. Przewiń stronę i spróbuj ponownie.");
        }
    }

    // ---------------------------------------------------------
    // TRYB: POJEDYNCZE WYDARZENIE
    // ---------------------------------------------------------
    
    // Helper: Extract JSON-LD
    function getJSONLD() {
        try {
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (const script of scripts) {
                let json = JSON.parse(script.innerText);
                if (Array.isArray(json)) {
                    const found = json.find(item => item['@type'] === 'Event' || item['@type'] === 'SocialEvent');
                    if (found) return found;
                } else if (json['@type'] === 'Event' || json['@type'] === 'SocialEvent') {
                    return json;
                }
            }
        } catch (e) {
            console.error("JSON-LD Error:", e);
        }
        return null;
    }

    // Bardziej elastyczne wykrywanie strony wydarzenia
    const isSingleEventPage = /\/events\/\d+/.test(window.location.href) || !!document.querySelector('meta[property="og:type"][content="article"]');
    
    if (isSingleEventPage) {
        console.log("🔍 Tryb: Pojedyncze wydarzenie");
        
        const jsonLD = getJSONLD();
        if (jsonLD) {
             console.log("✅ Znaleziono dane strukturalne (JSON-LD)!");
             events.push({
                 url: jsonLD.url || window.location.href.split('?')[0],
                 rawDate: jsonLD.startDate,
                 title: jsonLD.name,
                 location: jsonLD.location && jsonLD.location.name ? jsonLD.location.name + ', ' + (jsonLD.location.address?.streetAddress || '') : "Adres w opisie",
                 description: jsonLD.description || ""
             });
             finalize(events);
             return;
        }

        console.warn("⚠️ Brak JSON-LD, próba klasyczna...");
        let container = document.querySelector('div[role="main"]');
        const h1 = container ? container.querySelector('h1') : document.querySelector('h1');
        
        if (h1) {
            let title = h1.innerText;
            let detailsText = container ? container.innerText : document.body.innerText;
                        let date = "";
            if (!date) {
                const mainObj = document.querySelector('div[role="main"]') || document.body;
                
                // Szukamy najpierw bardzo blisko H1 (tytułu)
                const nearTitle = h1.parentElement.innerText.split('\n');
                for (const line of nearTitle) {
                    if (parseFBDate(line) && line.length < 50) {
                        date = line;
                        break;
                    }
                }

                const dateSelectors = [
                    'div[data-testid="event-permalink-details"]', 
                    'div#event_time_info', 
                    'span.x193iq5w.xeuugli[dir="auto"]',
                    'div.x1e56ztr.x1xmf6yo span[dir="auto"]' // Dodatkowy selektor FB
                ];
                for (const sel of dateSelectors) {
                    const elements = mainObj.querySelectorAll(sel);
                    for (const el of elements) {
                        const txt = el.innerText.trim();
                        const isSidebar = el.closest('aside') || el.closest('[role="complementary"]') || el.closest('.x78zum5.xdt5ytf.x1iyjqo2.x1n2onr6');
                        if (parseFBDate(txt) && !isSidebar && txt.length > 5 && txt.length < 100) { 
                            date = txt; 
                            console.log("📅 Znaleziona data (detale):", date);
                            break; 
                        }
                    }
                    if (date) break;
                }
            }

            // Ostatnia szansa: Szukanie w TEKŚCIE całego kontenera jeśli wciąż brak
            if (!date && detailsText) {
                const lines = detailsText.split('\n').slice(0, 10); // Sprawdzamy pierwsze 10 linii
                for (const line of lines) {
                    if (parseFBDate(line) && line.length > 5 && line.length < 80) {
                        date = line;
                        console.log("📅 Znaleziona data (fallback text):", date);
                        break;
                    }
                }
            }

            let location = "";
            const locLines = detailsText.split('\n').filter(l => l.includes(',') && /Katowice|Gliwice|Sosnowiec|Zabrze|Tychy|Chorzów|Bielsko|Kraków/i.test(l));
            if (locLines.length > 0) location = locLines[0];

            events.push({
                url: window.location.href.split('?')[0],
                rawDate: date || "BRAK DATY",
                title: title,
                location: location || "Adres w opisie",
                description: cleanDescription(detailsText)
            });
        }
        
        finalize(events);
        return; 
    }


    // ---------------------------------------------------------
    // TRYB: LISTA WYDARZEŃ
    // ---------------------------------------------------------
    console.log("🔍 Tryb: Lista wydarzeń");

    const today = new Date();
    today.setHours(0,0,0,0);

    // Filtr: OD dzisiaj (aby złapać bieżący weekend)
    const startWindow = new Date(today);

    // Limit: DO najbliższej niedzieli
    const limitDate = new Date(today);
    const dayOfWeek = today.getDay(); // 0-niedziela
    const daysToNextSunday = (7 - dayOfWeek) % 7;
    limitDate.setDate(today.getDate() + daysToNextSunday);
    limitDate.setHours(23, 59, 59, 999);

    console.log(`📅 Zakres skanowania listy: od dziś (${startWindow.toLocaleDateString()}) do najbliższej niedzieli (${limitDate.toLocaleDateString()})`);

    const links = Array.from(document.querySelectorAll('a[href*="/events/"]'));
    const uniqueLinks = new Set();
    
    links.forEach(link => {
        const href = link.href.split('?')[0];
        if(uniqueLinks.has(href) || !href.match(/\/events\/\d+/)) return;
        uniqueLinks.add(href);

        let container = link.closest('div[style*="border-radius"], div[class*="x1"], div[role="article"]');
        if(!container) container = link.parentElement.parentElement;
        if (container) {
            const textContent = container.innerText;
            const lines = textContent.split('\n').filter(l => l.trim().length > 0);
            
            let dateStr = "";
            let title = "";
            const isDateLine = (txt) => parseFBDate(txt) !== null;

            if (isDateLine(lines[0])) {
                dateStr = lines[0];
                title = lines[1] || "";
            } else if (isDateLine(lines[1])) {
                title = lines[0];
                dateStr = lines[1];
            } else {
                title = link.innerText;
                dateStr = lines.find(l => isDateLine(l)) || "";
            }

            const eventDate = parseFBDate(dateStr);
            if (eventDate) {
                const checkDate = new Date(eventDate);
                checkDate.setHours(0,0,0,0);
                // Sprawdzamy zakres OD NIEDZIELI
                if (checkDate < startWindow || checkDate > limitDate) return;
            } else {
                return;
            }

            if (EXCLUDED_TITLES.some(t => title.toUpperCase().includes(t))) return;

            console.log(`➕ Dodano: ${title}`);
            events.push({
                url: href,
                rawDate: dateStr,
                title: title,
                location: "",
                description: textContent
            });
        }
    });

    finalize(events);

})();
