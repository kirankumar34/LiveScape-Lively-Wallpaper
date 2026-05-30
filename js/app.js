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
        await ErrorBoundaryManager.wrapAsync('WallpaperRestore', () => WallpaperEngine.restoreFromStorage());

        // 5a. Init Audio Engine (connects to <video>, restores volume state)
        if (typeof AudioEngine !== 'undefined') {
            await ErrorBoundaryManager.wrapAsync('AudioEngine', () => AudioEngine.init());
        }

        // 6. Init Widgets (if present)
        if (typeof ClockWidget !== 'undefined') {
            ErrorBoundaryManager.wrap('ClockWidget', () => {
                ClockWidget.init({
                    style: settings.clock_style || 'digital',
                    use24h: settings.clock_24h || false,
                });
            });
        }
        if (typeof WeatherWidget !== 'undefined') {
            ErrorBoundaryManager.wrap('WeatherWidget', () => {
                WeatherWidget.init({
                    apiKey: settings.weather_api_key || '',
                    unit: settings.temp_unit || 'C',
                });
            });
        }
        if (typeof SearchWidget !== 'undefined') {
            ErrorBoundaryManager.wrap('SearchWidget', () => SearchWidget.init());
        }
        if (typeof NotesWidget !== 'undefined') {
            ErrorBoundaryManager.wrap('NotesWidget', () => NotesWidget.init());
        }
        if (typeof TodoWidget !== 'undefined') {
            ErrorBoundaryManager.wrap('TodoWidget', () => TodoWidget.init());
        }

        // Widget Manager
        if (typeof WidgetEngine !== 'undefined') {
            await ErrorBoundaryManager.wrapAsync('WidgetEngine', () => WidgetEngine.init());
        }

        // 7. Init Settings Panel
        if (typeof SettingsPanel !== 'undefined') {
            ErrorBoundaryManager.wrap('SettingsPanel', () => SettingsPanel.init(settings));
        }

        // 8. Init UI Controller
        if (typeof UIController !== 'undefined') {
            ErrorBoundaryManager.wrap('UIController', () => UIController.init());
        }

        // 9. Init Scene Scheduler (after all engines ready)
        if (typeof SceneScheduler !== 'undefined') {
            await SceneScheduler.init();
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
        console.error("LiveScape Boot Error:", err);
        // Expose to window.onerror so crash counter increments
        window.dispatchEvent(new ErrorEvent('error', {
            error: err,
            message: err.message
        }));
    }
})();
