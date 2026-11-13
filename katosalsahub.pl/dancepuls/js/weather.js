
export function initWeather(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Katowice Coords
    const LAT = 50.2649;
    const LON = 19.0238;

    // Calculate dates: Next Friday, Saturday, Sunday
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0-Sun, 1-Mon...
    
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    
    // We need 3 days: Fri, Sat, Sun
    const dates = [];
    for(let i=0; i<3; i++) {
        const d = new Date(nextFriday);
        d.setDate(nextFriday.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }

    const startDate = dates[0];
    const endDate = dates[2];

    // ZMIANA: Pobieramy hourly zamiast daily
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,weathercode&timezone=Europe%2FBerlin&start_date=${startDate}&end_date=${endDate}`;

    // Controls container logic
    let preferredHour = 21; // Default
    
    function render(data) {
        if (!data || !data.hourly) return;
        
        const { time, weathercode, temperature_2m } = data.hourly;
        
        let html = `
            <div class="weather-hours">
                <label class="weather-hour-label${preferredHour === 18 ? ' is-active-18' : ''}">
                    <input type="radio" name="w-hour" value="18" ${preferredHour === 18 ? 'checked' : ''} class="weather-radio-hidden"> 18:00
                </label>
                <span>|</span>
                <label class="weather-hour-label${preferredHour === 21 ? ' is-active-21' : ''}">
                    <input type="radio" name="w-hour" value="21" ${preferredHour === 21 ? 'checked' : ''} class="weather-radio-hidden"> 21:00
                </label>
            </div>
            <div class="weather-days">
        `;
        
        // We have 3 days. API returns hourly data sequentially. 
        // 0-23 corresponds to Day 1.
        // 24-47 corresponds to Day 2.
        // 48-71 corresponds to Day 3.
        
        const days = ['PIĄ', 'SOB', 'ND'];
        
        for (let i = 0; i < 3; i++) {
            // Calculate index for the preferred hour
            // Day i start index = i * 24
            const hourIndex = (i * 24) + preferredHour;
            
            // Safety check
            if (hourIndex >= time.length) continue;

            const dateStr = dates[i];
            const dateObj = new Date(dateStr);
            const dd = dateObj.getDate().toString().padStart(2, '0');
            const mm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const dateLabel = `(${dd}.${mm})`;
            const dayName = days[i];

            const temp = Math.round(temperature_2m[hourIndex]);
            const code = weathercode[hourIndex];
            let icon = '❓';
            
            // WMO Codes Mapping
            if (code === 0) icon = '🌙'; // Clear/Night likely
            else if (code >= 1 && code <= 3) icon = '⛅';
            else if (code >= 45 && code <= 48) icon = '🌫';
            else if (code >= 51 && code <= 67) icon = '🌧';
            else if (code >= 71 && code <= 77) icon = '❄️';
            else if (code >= 80 && code <= 82) icon = '🌧';
            else if (code >= 95) icon = '⚡';
            
            html += `
                <div class="weather-day-card">
                    <div class="weather-day-label">${dayName} ${dateLabel}</div>
                    <div class="weather-day-temp">${icon} ${temp}°</div>
                </div>
            `;
        }
        html += `</div>`;
        container.innerHTML = html;
        
        // Re-attach listeners because innerHTML wiped them
        container.querySelectorAll('input[name="w-hour"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                preferredHour = parseInt(e.target.value, 10);
                render(data);
            });
        });
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

    fetch(url, controller ? { signal: controller.signal } : {})
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(data => {
            render(data);
        })
        .catch(err => {
            console.error('Weather error:', err);
            container.innerHTML = '<span class="weather-error">⚠️ Błąd pogody</span>';
        })
        .finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
        });
}
