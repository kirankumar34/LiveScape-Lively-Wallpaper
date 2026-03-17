/* ═════════════════════════════════════════════════════════
   settingsPanel.js
   Full settings sync, theme switching, slider controls,
   widget toggles, API key management
═════════════════════════════════════════════════════════ */

const SettingsPanel = (() => {

    function init(settings = {}) {
        setupAppearance(settings);
        setupWallpaperOptions(settings);
        setupWidgetToggles(settings);
        setupClockOptions(settings);
        setupApiKey(settings);
        setupPerformance(settings);
        setupDataSection();
    }

    /* ─── Appearance ─── */
    function setupAppearance(settings) {
        // Blur slider
        const blurSlider = document.getElementById('blur-slider');
        const blurValue = document.getElementById('blur-value');
        if (blurSlider) {
            blurSlider.value = settings.blur ?? 0;
            blurValue.textContent = `${blurSlider.value}px`;
            blurSlider.addEventListener('input', () => {
                const v = blurSlider.value;
                blurValue.textContent = `${v}px`;
                const overlay = document.getElementById('overlay-blur');
                if (overlay) {
                    overlay.style.backdropFilter = `blur(${v}px)`;
                    overlay.style.webkitBackdropFilter = `blur(${v}px)`;
                }
                StorageManager.set({ blur: parseFloat(v) });
            });
        }

        // Dim slider
        const dimSlider = document.getElementById('dim-slider');
        const dimValue = document.getElementById('dim-value');
        if (dimSlider) {
            dimSlider.value = settings.dim ?? 20;
            dimValue.textContent = `${dimSlider.value}%`;
            dimSlider.addEventListener('input', () => {
                const v = dimSlider.value;
                dimValue.textContent = `${v}%`;
                const overlay = document.getElementById('overlay-dim');
                if (overlay) overlay.style.background = `rgba(0,0,0,${v / 100})`;
                StorageManager.set({ dim: parseInt(v) });
            });
        }

        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.dataset.theme === (settings.theme || 'dark')) btn.classList.add('active');
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const theme = btn.dataset.theme;
                document.documentElement.dataset.theme = theme;
                StorageManager.set({ theme });
                UIController.toast(`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, 'info');
            });
        });
    }

    /* ─── Wallpaper Options ─── */
    function setupWallpaperOptions(settings) {
        // Auto-rotation toggle
        const autoToggle = document.getElementById('auto-rotation-toggle');
        const rotInterval = document.getElementById('rotation-interval');
        const rotRow = document.getElementById('rotation-interval-row');

        if (autoToggle) {
            autoToggle.checked = settings.auto_rotation || false;
            toggleRowVisibility(rotRow, autoToggle.checked);

            autoToggle.addEventListener('change', () => {
                const enabled = autoToggle.checked;
                StorageManager.set({ auto_rotation: enabled });
                toggleRowVisibility(rotRow, enabled);

                if (enabled) {
                    const interval = parseInt(rotInterval?.value || 600000);
                    chrome.runtime.sendMessage({ type: 'SET_ALARM', interval });
                    UIController.toast('Auto-rotation enabled', 'success');
                } else {
                    chrome.runtime.sendMessage({ type: 'CLEAR_ALARM' });
                    UIController.toast('Auto-rotation disabled', 'info');
                }
            });
        }

        if (rotInterval) {
            rotInterval.value = settings.rotation_interval || 600000;
            rotInterval.addEventListener('change', () => {
                const interval = parseInt(rotInterval.value);
                StorageManager.set({ rotation_interval: interval });
                if (autoToggle?.checked) {
                    chrome.runtime.sendMessage({ type: 'SET_ALARM', interval });
                }
            });
        }

        // Parallax toggle
        const parallaxToggle = document.getElementById('parallax-toggle');
        if (parallaxToggle) {
            parallaxToggle.checked = settings.parallax !== false;
            parallaxToggle.addEventListener('change', () => {
                WallpaperEngine.setParallax(parallaxToggle.checked);
                StorageManager.set({ parallax: parallaxToggle.checked });
            });
        }

        // Particles toggle
        const particlesToggle = document.getElementById('particles-toggle');
        if (particlesToggle) {
            particlesToggle.checked = settings.particles !== false;
            particlesToggle.addEventListener('change', () => {
                const canvas = document.getElementById('ambient-canvas');
                if (canvas) canvas.style.opacity = particlesToggle.checked ? '0.7' : '0';
                StorageManager.set({ particles: particlesToggle.checked });
            });
        }

        // Wallpaper Fit Option
        const fitSelect = document.getElementById('fit-mode');
        if (fitSelect) {
            fitSelect.value = settings.wallpaperFit || 'cover';
            fitSelect.addEventListener('change', () => {
                WallpaperEngine.applyFitMode(fitSelect.value);
            });
        }
    }

    /* ─── Widget Toggles ─── */
    function setupWidgetToggles(settings) {
        const widgetData = settings.widgets || {};

        document.querySelectorAll('.widget-toggle').forEach(toggle => {
            const id = toggle.dataset.widget;
            const visible = widgetData[id]?.visible !== false;
            toggle.checked = visible;

            toggle.addEventListener('change', () => {
                WidgetManager.setVisible(id, toggle.checked);
                // Sync widget panel toggles
                document.querySelectorAll(`.widget-toggle[data-widget="${id}"]`)
                    .forEach(t => { if (t !== toggle) t.checked = toggle.checked; });
            });
        });
    }

    /* ─── Clock Options ─── */
    function setupClockOptions(settings) {
        const clockStyle = document.getElementById('clock-style-select');
        if (clockStyle) {
            clockStyle.value = settings.clock_style || 'digital';
            clockStyle.addEventListener('change', () => {
                ClockWidget.setStyle(clockStyle.value);
            });
        }

        const clock24h = document.getElementById('clock-24h-toggle');
        if (clock24h) {
            clock24h.checked = settings.clock_24h || false;
            clock24h.addEventListener('change', () => {
                ClockWidget.set24h(clock24h.checked);
            });
        }

        // Temperature unit
        document.querySelectorAll('.unit-btn').forEach(btn => {
            if (btn.dataset.unit === (settings.temp_unit || 'C')) btn.classList.add('active');
            btn.addEventListener('click', () => {
                document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                WeatherWidget.setUnit(btn.dataset.unit);
            });
        });
    }

    /* ─── API Key ─── */
    function setupApiKey(settings) {
        const keyInput = document.getElementById('weather-api-key');
        const saveBtn = document.getElementById('save-api-key');

        if (keyInput && settings.weather_api_key) {
            keyInput.value = settings.weather_api_key;
        }

        saveBtn?.addEventListener('click', () => {
            const key = keyInput?.value.trim();
            if (!key) { UIController.toast('Please enter an API key', 'warning'); return; }
            WeatherWidget.setApiKey(key);
            UIController.toast('API key saved! Fetching weather…', 'success');
        });
    }

    /* ─── Performance ─── */
    function setupPerformance(settings) {
        const qualitySelect = document.getElementById('quality-select');
        if (qualitySelect) {
            qualitySelect.value = settings.quality || 'auto';
            qualitySelect.addEventListener('change', () => {
                PerformanceManager.setQuality(qualitySelect.value);
                StorageManager.set({ quality: qualitySelect.value });
                UIController.toast(`Quality: ${qualitySelect.value}`, 'info');
            });
        }

        const pauseToggle = document.getElementById('pause-hidden-toggle');
        if (pauseToggle) {
            pauseToggle.checked = settings.pause_hidden !== false;
            pauseToggle.addEventListener('change', () => {
                StorageManager.set({ pause_hidden: pauseToggle.checked });
            });
        }
    }

    /* ─── Data Section ─── */
    function setupDataSection() {
        document.getElementById('reset-layout-btn')?.addEventListener('click', () => {
            if (confirm('Reset all widget positions to default?')) {
                WidgetManager.resetLayout();
                UIController.toast('Layout reset to default', 'success');
            }
        });

        document.getElementById('export-settings-btn')?.addEventListener('click', () => {
            StorageManager.loadSettings().then(settings => {
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'livescape-settings.json';
                a.click();
                URL.revokeObjectURL(url);
                UIController.toast('Settings exported', 'success');
            });
        });
    }

    function toggleRowVisibility(row, visible) {
        if (row) row.style.display = visible ? 'flex' : 'none';
    }

    return { init };
})();

window.SettingsPanel = SettingsPanel;
