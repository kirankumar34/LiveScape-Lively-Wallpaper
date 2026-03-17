/* ═════════════════════════════════════════════════════════
   weatherWidget.js
   OpenWeatherMap integration with icons, forecast, units
═════════════════════════════════════════════════════════ */

const WeatherWidget = (() => {
    let apiKey = '';
    let unit = 'C';
    let refreshInterval = null;

    const WEATHER_ICONS = {
        '01d': '☀️', '01n': '🌙',
        '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️',
        '04d': '☁️', '04n': '☁️',
        '09d': '🌧️', '09n': '🌧️',
        '10d': '🌦️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️',
        '13d': '❄️', '13n': '❄️',
        '50d': '🌫️', '50n': '🌫️',
    };

    function init(config = {}) {
        apiKey = config.apiKey || '';
        unit = config.unit || 'C';

        if (apiKey) {
            fetchWeather();
            // Refresh every 10 minutes
            refreshInterval = setInterval(fetchWeather, 10 * 60 * 1000);
        } else {
            showError();
        }

    }

    function fetchWeather() {
        if (!apiKey) { showError(); return; }

        // Try geolocation first
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
                () => fetchByCityName('London'), // Fallback
                { timeout: 8000 }
            );
        } else {
            fetchByCityName('London');
        }
    }

    async function fetchByCoords(lat, lon) {
        const unitParam = unit === 'F' ? 'imperial' : 'metric';
        try {
            showLoading();
            const [current, forecast] = await Promise.all([
                fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${unitParam}&appid=${apiKey}`).then(r => r.json()),
                fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${unitParam}&cnt=15&appid=${apiKey}`).then(r => r.json()),
            ]);
            renderWeather(current, forecast);
        } catch (err) {
            showError();
        }
    }

    async function fetchByCityName(city) {
        const unitParam = unit === 'F' ? 'imperial' : 'metric';
        try {
            showLoading();
            const [current, forecast] = await Promise.all([
                fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=${unitParam}&appid=${apiKey}`).then(r => r.json()),
                fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=${unitParam}&cnt=15&appid=${apiKey}`).then(r => r.json()),
            ]);
            renderWeather(current, forecast);
        } catch (err) {
            showError();
        }
    }

    function renderWeather(current, forecast) {
        if (current.cod !== 200) { showError(); return; }

        showContent();

        const icon = WEATHER_ICONS[current.weather[0].icon] || '🌡️';
        const temp = Math.round(current.main.temp);
        const desc = current.weather[0].description;
        const city = current.name + ', ' + current.sys.country;
        const hum = current.main.humidity;
        const wind = Math.round(current.wind.speed * 3.6); // m/s → km/h
        const vis = Math.round((current.visibility || 10000) / 1000);
        const unitSym = unit === 'F' ? '°F' : '°C';

        document.getElementById('weather-icon-wrap').textContent = icon;
        document.getElementById('weather-temp').textContent = `${temp}${unitSym}`;
        document.getElementById('weather-desc').textContent = desc;
        document.getElementById('weather-location').textContent = city;
        document.getElementById('weather-humidity').textContent = `${hum}%`;
        document.getElementById('weather-wind').textContent = `${wind} km/h`;
        document.getElementById('weather-visibility').textContent = `${vis} km`;

        // 3-day forecast (from 3h intervals)
        if (forecast && forecast.list) {
            renderForecast(forecast.list, unitSym);
        }
    }

    function renderForecast(list, unitSym) {
        const container = document.getElementById('weather-forecast');
        if (!container) return;

        // Group by day
        const days = {};
        const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const dayKey = date.toDateString();
            if (!days[dayKey]) {
                days[dayKey] = {
                    name: shortDays[date.getDay()],
                    temps: [],
                    icon: item.weather[0].icon
                };
            }
            days[dayKey].temps.push(Math.round(item.main.temp));
        });

        container.innerHTML = '';
        Object.values(days).slice(0, 4).forEach(day => {
            const maxT = Math.max(...day.temps);
            const el = document.createElement('div');
            el.className = 'forecast-day';
            el.innerHTML = `
        <span class="day-name">${day.name}</span>
        <span class="day-icon">${WEATHER_ICONS[day.icon] || '🌡️'}</span>
        <span class="day-temp">${maxT}${unitSym}</span>
      `;
            container.appendChild(el);
        });
    }

    function showLoading() {
        document.getElementById('weather-loading')?.classList.remove('hidden');
        document.getElementById('weather-content')?.classList.add('hidden');
        document.getElementById('weather-error')?.classList.add('hidden');
    }

    function showContent() {
        document.getElementById('weather-loading')?.classList.add('hidden');
        document.getElementById('weather-content')?.classList.remove('hidden');
        document.getElementById('weather-error')?.classList.add('hidden');
    }

    function showError() {
        document.getElementById('weather-loading')?.classList.add('hidden');
        document.getElementById('weather-content')?.classList.add('hidden');
        document.getElementById('weather-error')?.classList.remove('hidden');
    }

    function setApiKey(key) {
        apiKey = key;
        StorageManager.set({ weather_api_key: key });
        if (key) fetchWeather();
    }

    function setUnit(u) {
        unit = u;
        StorageManager.set({ temp_unit: u });
        if (apiKey) fetchWeather();
    }

    function destroy() {
        if (refreshInterval) clearInterval(refreshInterval);
    }

    return { init, setApiKey, setUnit, destroy };
})();

window.WeatherWidget = WeatherWidget;
