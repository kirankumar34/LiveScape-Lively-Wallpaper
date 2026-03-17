/* ═════════════════════════════════════════════════════════
   js/app.js  v3.0
   Extension boot sequence.
   Order: Storage → Performance → Engine → UI / Widgets.
═════════════════════════════════════════════════════════ */

(async function boot() {
    try {
        // 1. Open IndexedDB & Load Settings
        await StorageManager.openDB();
        const settings = await StorageManager.loadSettings();

        // 2. Apply theme early to prevent flash
        document.documentElement.dataset.theme = settings.theme || 'dark';

        // 3. Init Performance Manager
        PerformanceManager.init(settings.performance_mode || 'auto');
        const profile = PerformanceManager.getProfile();
        const tierLabels = { low: '🔋 Low-End', medium: '⚖️ Mid-Range', high: '🚀 High-End' };
        const tierEl = document.getElementById('device-tier-label');
        if (tierEl) tierEl.textContent = tierLabels[profile.tier] || profile.tier;

        // 4. Init Wallpaper Engine
        WallpaperEngine.init();
        WallpaperEngine.setBlur(settings.blur ?? 0);
        WallpaperEngine.setDim(settings.dim ?? 20);
        WallpaperEngine.applyFitMode(settings.wallpaperFit || 'cover');

        // 5. Restore active wallpaper
        await WallpaperEngine.restoreFromStorage();

        // 6. Init Widgets (if present)
        if (typeof ClockWidget !== 'undefined') {
            ClockWidget.init({
                style: settings.clock_style || 'digital',
                use24h: settings.clock_24h || false,
            });
        }
        if (typeof WeatherWidget !== 'undefined') {
            WeatherWidget.init({
                apiKey: settings.weather_api_key || '',
                unit: settings.temp_unit || 'C',
            });
        }
        if (typeof SearchWidget !== 'undefined') SearchWidget.init();
        if (typeof NotesWidget !== 'undefined') NotesWidget.init();
        if (typeof TodoWidget !== 'undefined') TodoWidget.init();

        // Widget Manager
        if (typeof WidgetEngine !== 'undefined') {
            WidgetEngine.init();
            const widgetData = settings.widgets || {};
            Object.keys(widgetData).forEach(id => {
                if (widgetData[id]?.visible === false) {
                    WidgetEngine.setVisible(id, false);
                }
            });
        }

        // 7. Init Settings Panel
        if (typeof SettingsPanel !== 'undefined') {
            SettingsPanel.init(settings);
        }

        // 8. Init UI Controller
        if (typeof UIController !== 'undefined') {
            UIController.init();
        }

        // 9. Auto-rotation setup
        if (settings.auto_rotation) {
            chrome.runtime.sendMessage({
                type: 'SET_ALARM',
                interval: settings.rotation_interval || 600000
            }).catch(() => {});
        }

        chrome.runtime.onMessage.addListener(msg => {
            if (msg.type === 'ROTATE_WALLPAPER') WallpaperEngine.nextWallpaper();
            if (msg.type === 'SHUFFLE_WALLPAPER') WallpaperEngine.shuffleWallpaper();
        });

    } catch (err) {
    }
})();
