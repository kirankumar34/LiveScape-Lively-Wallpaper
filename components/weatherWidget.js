/* ═════════════════════════════════════════════════════════
   weatherWidget.js
   Production-grade Weather Widget using Open-Meteo.
   No API keys, no CORS issues, robust geolocation caching.
   ═════════════════════════════════════════════════════════ */

const WeatherWidget = (() => {
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

    const CACHE_LIFETIME = 30 * 60 * 1000; // 30 minutes

    /* ───────────────────────────────────────────────────────
       RESILIENCE & FALLBACK UTILITIES
       ─────────────────────────────────────────────────────── */

    const RetryManager = {
        async fetchWithRetry(url, options = {}, retries = 2, delay = 500) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                if (retries > 0) {
                    console.debug(`Fetch failed. Retrying in ${delay}ms... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return RetryManager.fetchWithRetry(url, options, retries - 1, delay * 2);
                }
                throw error;
            }
        }
    };

    const WeatherFallbackManager = {
        getPlaceholder() {
            const unitSym = unit === 'F' ? '°F' : '°C';
            return {
                temp: `--${unitSym}`,
                desc: 'Weather unavailable',
                location: 'Location unavailable',
                humidity: '--%',
                wind: `-- ${unit === 'F' ? 'mph' : 'km/h'}`,
                visibility: '-- km',
                icon: '🌡️',
                forecast: [
                    { day: '—', icon: '🌡️', temp: `--${unitSym}` },
                    { day: '—', icon: '🌡️', temp: `--${unitSym}` },
                    { day: '—', icon: '🌡️', temp: `--${unitSym}` },
                    { day: '—', icon: '🌡️', temp: `--${unitSym}` }
                ],
                timestamp: Date.now()
            };
        },
        async getCachedWeather() {
            try {
                const cached = await StorageManager.get('weather_cache');
                return cached || null;
            } catch (e) {
                return null;
            }
        },
        async saveCache(weatherData) {
            try {
                await StorageManager.set({ weather_cache: weatherData });
            } catch (e) {
                // Fail silently
            }
        }
    };

    async function handleWeatherError(err) {
        console.debug("Weather fetch failed, loading fallback:", err);
        try {
            const cached = await WeatherFallbackManager.getCachedWeather();
            if (cached) {
                renderFromData(cached);
            } else {
                renderFromData(WeatherFallbackManager.getPlaceholder());
            }
        } catch (fallbackErr) {
            console.debug("Fatal weather fallback error:", fallbackErr);
        }
    }

    /* ───────────────────────────────────────────────────────
       LOCATION UTILITIES (Geolocation)
       ─────────────────────────────────────────────────────── */

    async function getCachedCoords() {
        try {
            const coords = await StorageManager.get('weather_coords');
            return coords || null;
        } catch (e) {
            return null;
        }
    }

    async function saveCoords(coords) {
        try {
            await StorageManager.set({ weather_coords: coords });
        } catch (e) {
            // Fail silently
        }
    }

    function requestGeolocation() {
        if (!navigator.geolocation) {
            // Fallback immediately if geolocation is not supported
            useDefaultLocation();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const coords = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    label: 'My Location'
                };
                await saveCoords(coords);
                fetchWeather(true);
            },
            async (err) => {
                console.debug("Geolocation failed or denied, using London default:", err);
                useDefaultLocation();
            },
            { timeout: 8000 }
        );
    }

    async function useDefaultLocation() {
        const defaultCoords = {
            lat: 51.5074,
            lon: -0.1278,
            label: 'London'
        };
        await saveCoords(defaultCoords);
        fetchWeather(true);
    }

    function isWidgetVisible() {
        const el = document.getElementById('widget-weather');
        if (!el) return false;
        if (typeof WidgetEngine !== 'undefined') {
            return WidgetEngine.getVisible('weather');
        }
        return el.style.display !== 'none';
    }

    /* ───────────────────────────────────────────────────────
       CORE LIFE CYCLE
       ─────────────────────────────────────────────────────── */

    async function init(config = {}) {
        try {
            unit = config.unit || 'C';

            // Check cache and render immediately
            const cached = await WeatherFallbackManager.getCachedWeather();
            if (cached) {
                renderFromData(cached);
            } else {
                showLoading();
            }

            fetchWeather();

            // Setup visibility-aware interval
            _setupWeatherTimer();
            PerformanceManager.on('pause', _onPause);
            PerformanceManager.on('resume', _onResume);
        } catch (err) {
            handleWeatherError(err);
        }
    }

    function _setupWeatherTimer() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            fetchWeather();
        }, 30 * 60 * 1000); // Poll strictly every 30 minutes
    }

    function _onPause() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    function _onResume() {
        if (!refreshInterval && PerformanceManager.shouldAnimate()) {
            fetchWeather();
            _setupWeatherTimer();
        }
    }

    async function fetchWeather(force = false) {
        try {
            // Cache check
            if (!force) {
                const cached = await WeatherFallbackManager.getCachedWeather();
                if (cached && (Date.now() - cached.timestamp < CACHE_LIFETIME)) {
                    renderFromData(cached);
                    return;
                }
            }

            const coords = await getCachedCoords();
            if (coords) {
                showLoading();
                const unitParam = unit === 'F' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
                const forecastData = await RetryManager.fetchWithRetry(
                    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max&timezone=auto${unitParam}`
                );
                renderOpenMeteoWeather(forecastData, coords.label);
            } else {
                // If weather widget is enabled, request permission
                if (isWidgetVisible()) {
                    requestGeolocation();
                } else {
                    // Fallback silently if hidden
                    const defaultCoords = { lat: 51.5074, lon: -0.1278, label: 'London' };
                    await saveCoords(defaultCoords);
                }
            }
        } catch (err) {
            handleWeatherError(err);
        }
    }

    function getWmoWeather(code) {
        if (code === 0) return { icon: '☀️', desc: 'Clear sky' };
        if (code === 1) return { icon: '🌤️', desc: 'Mainly clear' };
        if (code === 2) return { icon: '⛅', desc: 'Partly cloudy' };
        if (code === 3) return { icon: '☁️', desc: 'Overcast' };
        if (code === 45 || code === 48) return { icon: '🌫️', desc: 'Fog' };
        if (code === 51 || code === 53 || code === 55) return { icon: '🌧️', desc: 'Drizzle' };
        if (code === 56 || code === 57) return { icon: '❄️', desc: 'Freezing drizzle' };
        if (code === 61 || code === 63 || code === 65) return { icon: '🌧️', desc: 'Rain' };
        if (code === 66 || code === 67) return { icon: '❄️', desc: 'Freezing rain' };
        if (code === 71 || code === 73 || code === 75 || code === 77) return { icon: '❄️', desc: 'Snow' };
        if (code === 80 || code === 81 || code === 82) return { icon: '🌧️', desc: 'Showers' };
        if (code === 85 || code === 86) return { icon: '❄️', desc: 'Snow showers' };
        if (code === 95 || code === 96 || code === 99) return { icon: '⛈️', desc: 'Thunderstorm' };
        return { icon: '🌡️', desc: 'Unknown' };
    }

    function renderOpenMeteoWeather(data, locationLabel) {
        if (!data || !data.current) {
            throw new Error("Invalid OpenMeteo response structure");
        }

        const current = data.current;
        const wmo = getWmoWeather(current.weather_code);
        const temp = Math.round(current.temperature_2m);
        const desc = wmo.desc;
        const hum = current.relative_humidity_2m;
        const windSpeed = Math.round(current.wind_speed_10m);
        const windUnit = unit === 'F' ? 'mph' : 'km/h';
        const vis = Math.round((current.visibility || 10000) / 1000);
        const unitSym = unit === 'F' ? '°F' : '°C';

        const forecastList = [];
        if (data.daily && data.daily.time) {
            const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            data.daily.time.slice(0, 4).forEach((timeStr, index) => {
                const date = new Date(timeStr);
                const dayName = shortDays[date.getDay()];
                const wmoFcast = getWmoWeather(data.daily.weather_code[index]);
                const maxTemp = Math.round(data.daily.temperature_2m_max[index]);
                forecastList.push({
                    day: dayName,
                    icon: wmoFcast.icon,
                    temp: `${maxTemp}${unitSym}`
                });
            });
        }

        const parsedData = {
            temp: `${temp}${unitSym}`,
            desc: desc,
            location: locationLabel,
            humidity: `${hum}%`,
            wind: `${windSpeed} ${windUnit}`,
            visibility: `${vis} km`,
            icon: wmo.icon,
            forecast: forecastList,
            timestamp: Date.now()
        };

        renderFromData(parsedData);
        WeatherFallbackManager.saveCache(parsedData);
    }

    function renderFromData(data) {
        if (!data) return;
        showContent();

        const wrap = document.getElementById('weather-icon-wrap');
        const temp = document.getElementById('weather-temp');
        const desc = document.getElementById('weather-desc');
        const loc = document.getElementById('weather-location');
        const hum = document.getElementById('weather-humidity');
        const wind = document.getElementById('weather-wind');
        const vis = document.getElementById('weather-visibility');
        const fcast = document.getElementById('weather-forecast');

        if (wrap) wrap.textContent = data.icon || '🌡️';
        if (temp) temp.textContent = data.temp || '--';
        if (desc) desc.textContent = data.desc || '--';
        if (loc) loc.textContent = data.location || '--';
        if (hum) hum.textContent = data.humidity || '--%';
        if (wind) wind.textContent = data.wind || '--';
        if (vis) vis.textContent = data.visibility || '--';

        if (fcast && data.forecast) {
            fcast.innerHTML = '';
            data.forecast.forEach(day => {
                const el = document.createElement('div');
                el.className = 'forecast-day';
                el.innerHTML = `
                    <span class="day-name">${day.day}</span>
                    <span class="day-icon">${day.icon}</span>
                    <span class="day-temp">${day.temp}</span>
                `;
                fcast.appendChild(el);
            });
        }
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

    function onWidgetEnabled() {
        // Trigger geolocation check if no coordinates are stored yet
        getCachedCoords().then(coords => {
            if (!coords) {
                requestGeolocation();
            }
        });
    }

    function setApiKey(key) {
        // No-op - Open-Meteo does not require an API key
    }

    function setUnit(u) {
        unit = u;
        StorageManager.set({ temp_unit: u });
        fetchWeather(true); // Force refetch in the correct unit
    }

    function destroy() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
        PerformanceManager.off('pause', _onPause);
        PerformanceManager.off('resume', _onResume);
    }

    return { init, setApiKey, setUnit, onWidgetEnabled, destroy };
})();

window.WeatherWidget = WeatherWidget;
