/* ═════════════════════════════════════════════════════════
   background.js  v3.0 – Service Worker (Manifest V3)
   Handles: alarms for wallpaper rotation, install defaults,
   and message relay for storage reads from the popup.
   NOTE: IndexedDB (WallpaperDB) is NOT accessible from the
   service worker — all blob storage happens in newtab.html.
═════════════════════════════════════════════════════════ */

/* ── Install: set defaults in chrome.storage.local ── */
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        chrome.storage.local.set({
            livescape_initialized:       true,
            livescape_theme:             'dark',
            livescape_blur:              0,
            livescape_dim:               20,
            livescape_parallax:          true,
            livescape_particles:         true,
            livescape_pause_hidden:      true,
            livescape_clock_24h:         false,
            livescape_clock_style:       'digital',
            livescape_temp_unit:         'C',
            livescape_performance_mode:  'auto',
            livescape_auto_rotation:     false,
            livescape_rotation_interval: 600000,
            livescape_active_wallpaper_id: 'builtin-stars',
            livescape_widgets: {
                clock:     { visible: true },
                search:    { visible: true },
                weather:   { visible: true },
                todo:      { visible: true },
                notes:     { visible: true },
                bookmarks: { visible: true },
            }
        }, () => {
        });
    }
});

/* ── Wallpaper rotation alarm ── */
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'wallpaper-rotation') {
        // Send rotate message to all new-tab pages
        chrome.tabs.query({}, tabs => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'ROTATE_WALLPAPER' }).catch(() => {});
            });
        });
    }
});

/* ── Message handler ── */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SET_ALARM') {
        chrome.alarms.clear('wallpaper-rotation', () => {
            if (msg.interval) {
                chrome.alarms.create('wallpaper-rotation', {
                    periodInMinutes: msg.interval / 60000
                });
            }
            sendResponse({ success: true });
        });
        return true;
    }

    if (msg.type === 'CLEAR_ALARM') {
        chrome.alarms.clear('wallpaper-rotation', () => sendResponse({ success: true }));
        return true;
    }
});
