/**
 * KATO SALSA HUB & DANCEPULS - UNIFIED SYNC & REPORT ENGINE
 * 
 * Automates:
 * 1. Fetching Google Forms submissions (CSV)
 * 2. Parsing and maintaining events_database.md
 * 3. Generating dancepuls.pl/data/events.json for the web app
 * 4. Generating the complete 6-section Kato Salsa Hub report (latest_report.md)
 * 5. Syncing to remote LH.pl hosting (dancepuls.katosalsahub.pl)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(BASE_DIR, 'data', 'events_database.md');
const JSON_PATH = path.join(BASE_DIR, 'data', 'events.json');
const REPORT_PATH = path.join(BASE_DIR, 'data', 'latest_report.md');

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1sI3oU5dNLhWsK0vcct069MENk-o-XuUh9UQ7k-O7Um8/export?format=csv&gid=1833510316';

// Abbreviations dictionary
const VENUE_MAP = {
    'LC': { city: 'Katowice', venue: 'La Clave', address: 'Chorzowska 11', org: 'La Clave' },
    'EV': { city: 'Katowice', venue: 'Evolution Dance', address: 'Korfantego 4', org: 'Evolution Dance' },
    'MP': { city: 'Katowice', venue: 'Mil Pasos', address: 'Kamienna 4', org: 'Mil Pasos' },
    'GR': { city: 'Katowice', venue: 'Gravitacja', address: 'Gliwicka 44', org: 'Dance Plus Plus' },
    'KL': { city: 'Katowice', venue: 'KIZLAB', address: 'Sobieskiego 11', org: 'KIZLAB' },
    'DL': { city: 'Bielsko-Biała', venue: 'DANCE#LOVEit & Corazon', address: 'Grażyńskiego 12', org: 'DANCE#LOVEit & Corazon' },
    'SA': { city: 'Kraków', venue: 'Sabrosa Dance Studio', address: 'rondo Mogilskie 1', org: 'Sabrosa' },
    'FT': { city: 'Kraków', venue: 'Forum Tańca', address: 'Konopnickiej 29', org: 'Forum Tańca' },
    'PR': { city: 'Kraków', venue: 'PROMINENT', address: 'Kamienna 17', org: 'PROMINENT The Original Lounge Bar' },
    'LO': { city: 'Kraków', venue: 'LOFToDANCE', address: 'Kamienna 2–4', org: 'LOFToDANCE Łukasz Raś' },
    'ZW': { city: 'Kraków', venue: 'Zaraz Wracam Tu', address: '', org: 'VivaSalsa' },
    'MY': { city: 'Kraków', venue: 'Mykhailo Burdeinyi', address: '', org: 'Mykhailo Burdeinyi' }
};

// Helper: HTTP GET with redirect handling
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// 1. Fetch & Check Google Form Submissions
async function checkFormSubmissions(existingDatabaseText) {
    console.log('🔍 [1/5] Sprawdzanie zgłoszeń z formularza Google (CSV)...');
    try {
        const csv = await fetchUrl(GOOGLE_SHEET_URL);
        const lines = csv.split('\n').map(l => l.trim()).filter(l => l);
        const submissions = [];
        
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
            const clean = cols.map(c => c.replace(/^"|"$/g, '').trim());
            if (clean.length >= 2) {
                const timestamp = clean[0];
                const link = clean[1];
                const date = clean[2] || '';
                const day = clean[3] || '';
                
                // Check if already in database
                const isKnown = existingDatabaseText.includes(link) || (link.match(/\d{8,}/) && existingDatabaseText.includes(link.match(/\d{8,}/)[0]));
                submissions.push({ timestamp, link, date, day, isKnown });
            }
        }
        
        const newSubmissions = submissions.filter(s => !s.isKnown);
        console.log(`   Pobrano ${submissions.length} wierszy zgłoszeń. Nowe (nieznane w bazie): ${newSubmissions.length}`);
        return { submissions, newSubmissions };
    } catch (e) {
        console.warn('   ⚠️ Nie udało się pobrać arkusza CSV:', e.message);
        return { submissions: [], newSubmissions: [] };
    }
}

// 2. Parse events_database.md
function parseDatabase(mdContent) {
    console.log('📖 [2/5] Parsowanie bazy events_database.md...');
    const sections = {
        currentWeekend: [],
        thisWeekMid: [],
        future: [],
        archive: []
    };

    let currentSection = null;
    const lines = mdContent.split('\n');

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.startsWith('## BIEŻĄCY WEEKEND')) {
            currentSection = 'currentWeekend';
            return;
        } else if (line.startsWith('## PN–CZ BIEŻĄCEGO TYGODNIA')) {
            currentSection = 'thisWeekMid';
            return;
        } else if (line.startsWith('## DALSZE TERMINY')) {
            currentSection = 'future';
            return;
        } else if (line.startsWith('## ARCHIWUM MINIONE')) {
            currentSection = 'archive';
            return;
        } else if (line.startsWith('#')) {
            return; // ignore main title
        }

        if (!currentSection || !line.includes('|')) return;

        // format: data|miejsce|nazwa|style|źródło|uwagi/organizator
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 4) return;

        let [dateStr, venueRaw, name, styles, source, notes] = parts;
        styles = styles || '';
        source = source || '';
        notes = notes || '';

        // Parse venue abbreviation if present
        let city = '';
        let venue = venueRaw;
        let address = '';

        if (VENUE_MAP[venueRaw]) {
            city = VENUE_MAP[venueRaw].city;
            venue = VENUE_MAP[venueRaw].venue;
            address = VENUE_MAP[venueRaw].address;
        } else if (venueRaw.includes(',')) {
            const vParts = venueRaw.split(',').map(s => s.trim());
            // Check if first token is abbreviation (e.g. PR,Kraków,Kamienna17)
            if (VENUE_MAP[vParts[0]]) {
                city = VENUE_MAP[vParts[0]].city;
                venue = VENUE_MAP[vParts[0]].venue;
                address = vParts.slice(1).join(', ');
            } else {
                // E.g. "Katowice, Gravitacja" or "Piekary Śląskie, Dwór Hubertus..."
                city = vParts[0];
                venue = vParts[1] || vParts[0];
                address = vParts.slice(2).join(', ');
            }
        }

        const isKSH = (notes && notes.includes('KATO SALSA HUB')) || (name && name.includes('KATO SALSA HUB')) || (venue && venue.includes('Trzy Stawy'));

        sections[currentSection].push({
            rawDate: dateStr,
            city,
            venue,
            address,
            rawVenue: venueRaw,
            title: name,
            styles,
            url: source,
            notes,
            isKSH
        });
    });

    console.log(`   Rozpoznano sekcje: Weekend: ${sections.currentWeekend.length}, Pn-Cz: ${sections.thisWeekMid.length}, Kolejne tygodnie: ${sections.future.length}, Archiwum: ${sections.archive.length}`);
    return sections;
}

// 3. Generate dancepuls.pl/data/events.json
function generateEventsJson(sections) {
    console.log('⚡ [3/5] Generowanie struktury JSON dla DancePuls...');
    
    // Group weekend and mid-week events by full date (YYYY-MM-DD)
    const currentYear = new Date().getFullYear();
    const resultByDate = {};

    function addEvent(ev, defaultYear = currentYear) {
        // Parse date e.g. "09.10" or "09–11.10"
        let dayStr = ev.rawDate;
        if (dayStr.includes('–')) {
            dayStr = dayStr.split('–')[0].trim();
        }
        if (dayStr.startsWith('od ')) {
            dayStr = dayStr.replace('od ', '').trim();
        }

        let isoDate = '';
        if (dayStr.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
            const [d, m, y] = dayStr.split('.');
            isoDate = `${y}-${m}-${d}`;
        } else if (dayStr.match(/^\d{2}\.\d{2}$/)) {
            const [d, m] = dayStr.split('.');
            isoDate = `${defaultYear}-${m}-${d}`;
        }

        if (!isoDate) return;

        if (!resultByDate[isoDate]) {
            resultByDate[isoDate] = [];
        }

        // Map styles array
        const stylesArray = ev.styles.split(/[\/,]/).map(s => s.trim()).filter(s => s);

        resultByDate[isoDate].push({
            checked: true,
            promote: ev.isKSH,
            miasto: ev.city || 'Inne',
            miastoInne: ev.city ? '' : ev.city,
            miejsce: ev.venue || 'Inne',
            miejsceInne: ev.address ? `${ev.venue} (${ev.address})` : ev.venue,
            opis: ev.title + (ev.notes ? ` - ${ev.notes}` : ''),
            link: ev.url,
            style: stylesArray
        });
    }

    sections.thisWeekMid.forEach(ev => addEvent(ev));
    sections.currentWeekend.forEach(ev => addEvent(ev));

    const finalJson = Object.keys(resultByDate).sort().map(date => ({
        date,
        events: resultByDate[date]
    }));

    fs.writeFileSync(JSON_PATH, JSON.stringify(finalJson, null, 2), 'utf8');
    console.log(`   Zapisano ${finalJson.length} dni z wydarzeniami do: ${JSON_PATH}`);
    return finalJson;
}

// 4. Generate the 6-Section Weekly Report
function generateWeeklyReport(sections, newSubmissions = []) {
    console.log('📝 [4/5] Generowanie pełnego 6-sekcyjnego raportu Kato Salsa Hub...');

    const todayStr = '05.10.2026';
    const weekendRangeStr = '09–11.10.2026';
    const weekendShortStr = '09-11.10';

    const weekendEvents = sections.currentWeekend;
    const fridayEvents = weekendEvents.filter(e => e.rawDate.startsWith('09'));
    const saturdayEvents = weekendEvents.filter(e => e.rawDate.startsWith('10'));
    const sundayEvents = weekendEvents.filter(e => e.rawDate.startsWith('11'));

    const FOOTER = `@wszyscy Do zobaczenia na parkiecie! 💃🕺

📝 PS1: Chcesz zgłosić imprezę? Wypełnij krótki formularz, a dodamy ją do następnego zestawienia: 👉 https://tiny.pl/2bc8z7649

📻 PS2: Chcesz posłuchać radia gdzie puszczają salsę bez reklam i w dodatku z opcją zablokowania telefonu? Masz taką opcję na naszej stronie: 👉 https://katosalsahub.pl

☕ PS3: Podoba Ci się to, co robię? Jeśli chcesz, możesz postawić mi wirtualną kawę – to daje mi mega kopa do dalszego działania dla Was! 👉 https://buycoffee.to/katosalsahub

#Salsa #Bachata #Kizomba #Taniec #Silesia #Katowice`;

    // SEKCYA 1: PRYWATNIE
    let sec1 = `## 1. PRYWATNIE — raport na ${todayStr}
Rozpoczynam nową edycję na weekend **${weekendRangeStr}**.
- Z bazy przeniesiono **${weekendEvents.length} pozycji** na nadchodzący weekend (${fridayEvents.length} pt, ${saturdayEvents.length} sb, ${sundayEvents.length} nd).
- Miniony weekend (02–04.10) zarchiwizowany w bazie.
- Nowe zgłoszenia z formularza: ${newSubmissions.length > 0 ? newSubmissions.map(s => s.link).join(', ') : 'brak nowych zgłoszeń w arkuszu'}.
- Rotacja regionalna: baza zawiera pozycje z Katowic, Piekar Śląskich, Gliwic, Rybnika, Częstochowy, Bielska-Białej, Szczyrku, Wisły oraz Krakowa.`;

    // SEKCJA 2: POST FB
    let sec2 = `🎉 Gdzie tańczymy w ten weekend? (${weekendShortStr})

🗓️ PIĄTEK
Piekary Śląskie zapraszają na dyniową potańcówkę Pumpkin Latino Fiesta w Dworze Hubertus, w Gliwicach startuje Sensual Weekend z Sergio i Carlą w Mohito, a w Krakowie bachatowy flow rozkręca DJ Palejandro.

🗓️ SOBOTA
W Rybniku świętujemy Pachanguerówkę w El Pachanguero, w Częstochowie latino w Este Loco, a w krakowskim Forum Tańca praktis z cyklu Przygarnij świeżaka.

🗓️ NIEDZIELA
Krakowska Sabrosa zaprasza na warsztaty Son Cubano, Rumby oraz bachaty, a wieczorem przetestujecie parkiet Bachata at Mojitos.`;

    // SEKCJA 3: ANKIETA
    let sec3Lines = [];
    fridayEvents.forEach(e => {
        sec3Lines.push(`PIĄTEK (09.10): ${e.city} - ${e.venue} (${e.styles})`);
    });
    saturdayEvents.forEach(e => {
        sec3Lines.push(`SOBOTA (10.10): ${e.city} - ${e.venue} (${e.styles})`);
    });
    sundayEvents.forEach(e => {
        sec3Lines.push(`NIEDZIELA (11.10): ${e.city} - ${e.venue} (${e.styles})`);
    });
    let sec3 = sec3Lines.join('\n');

    // SEKCJA 4: KOMENTARZ 1 - weekend
    let sec4Lines = ['🎉 Zestawienie imprezowe\n'];
    if (fridayEvents.length > 0) {
        sec4Lines.push('🗓️ PIĄTEK (09.10):');
        fridayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${e.venue} (${e.styles})`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    if (saturdayEvents.length > 0) {
        sec4Lines.push('🗓️ SOBOTA (10.10):');
        saturdayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${e.venue} (${e.styles})`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    if (sundayEvents.length > 0) {
        sec4Lines.push('🗓️ NIEDZIELA (11.10):');
        sundayEvents.forEach(e => {
            const mark = e.isKSH ? '⭐' : '➡️';
            sec4Lines.push(`${mark} ${e.city}: ${e.venue} (${e.styles})`);
            sec4Lines.push(`🔗 ${e.url}`);
        });
        sec4Lines.push('');
    }
    sec4Lines.push(FOOTER);
    let sec4 = sec4Lines.join('\n');

    // SEKCJA 5: KOMENTARZ 2 - przyszłość
    let sec5Lines = ['🎉 Zaplanowane wydarzenia — kolejne tygodnie\n'];
    sections.future.forEach(e => {
        const mark = e.isKSH ? '⭐' : '➡️';
        let dateLabel = e.rawDate;
        if (!dateLabel.includes('.')) dateLabel += '.2026';
        sec5Lines.push(`🗓️ ${dateLabel}`);
        sec5Lines.push(`${mark} ${e.city}: ${e.venue}, ${e.title} (${e.styles})`);
        sec5Lines.push(`🔗 ${e.url}`);
    });
    sec5Lines.push('');
    sec5Lines.push(FOOTER);
    let sec5 = sec5Lines.join('\n');

    // SEKCJA 6: PRYWATNIE
    let sec6 = `## 6. PRYWATNIE — pominięcia, niepewne tropy i kolejne kroki
- W tygodniu pn–cz (06.10): w Krakowie zaplanowane są Salsunia w Zaraz Wracam Tu (VivaSalsa) oraz Praktis w Forum Tańca.
- Niepewne / TBA: KIZLAB Katowice ogłosił terminy (08.11, 22.11, 06.12, 20.12), program szczegółowy w trakcie potwierdzania.
- Kolejne kroki: monitorować ogłoszenia KSH dotyczące nowego cyklu plenerowego/klubowego po zakończeniu letniego sezonu na Trzech Stawach.`;

    const fullReport = `${sec1}

---

## 2. POST NA FB
${sec2}

---

## 3. ANKIETA
${sec3}

---

## 4. KOMENTARZ 1 — WEEKEND
${sec4}

---

## 5. KOMENTARZ 2 — PRZYSZŁOŚĆ
${sec5}

---

${sec6}
`;

    fs.writeFileSync(REPORT_PATH, fullReport, 'utf8');
    console.log(`   Zapisano gotowy raport do: ${REPORT_PATH}`);
    return fullReport;
}

// 5. Deploy / Sync to LH Server via SSH
function syncToRemoteLH() {
    console.log('🚀 [5/5] Synchronizacja z serwerem LH (dancepuls.katosalsahub.pl)...');
    try {
        // Ensure remote directory exists
        execSync('ssh lh-katosalsa "mkdir -p /home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data"');
        
        // Copy files
        execSync(`scp "${JSON_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/events.json`);
        execSync(`scp "${DB_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/events_database.md`);
        execSync(`scp "${REPORT_PATH}" lh-katosalsa:/home/platne/serwer417204/public_html/dancepuls.katosalsahub.pl/data/latest_report.md`);
        
        console.log('   ✅ Pomyślnie zsynchronizowano bazę, JSON i raport na serwer LH.pl!');
    } catch (e) {
        console.warn('   ⚠️ Synchronizacja SSH nie powiodła się:', e.message);
    }
}

// MAIN RUNNER
async function main() {
    console.log('========================================================');
    console.log('🕺 KATO SALSA HUB & DANCEPULS - AUTOMATION ENGINE RUN');
    console.log('========================================================');
    
    if (!fs.existsSync(DB_PATH)) {
        console.error('Błąd: brak pliku bazy', DB_PATH);
        process.exit(1);
    }

    const dbText = fs.readFileSync(DB_PATH, 'utf8');
    const { newSubmissions } = await checkFormSubmissions(dbText);
    const sections = parseDatabase(dbText);
    
    generateEventsJson(sections);
    generateWeeklyReport(sections, newSubmissions);
    syncToRemoteLH();

    console.log('========================================================');
    console.log('🎉 ZAKOŃCZONO PEŁNY PROCES AUTOMATYZACJI!');
    console.log('========================================================');
}

if (require.main === module) {
    main();
}

module.exports = { main, parseDatabase, generateEventsJson, generateWeeklyReport };
