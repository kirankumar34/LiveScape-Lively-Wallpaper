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
            ls_initialized:       true,
            ls_theme:             'dark',
            ls_blur:              0,
            ls_dim:               20,
            ls_parallax:          true,
            ls_particles:         true,
            ls_pause_hidden:      true,
            ls_clock_24h:         false,
            ls_clock_style:       'digital',
            ls_temp_unit:         'C',
            ls_performance_mode:  'auto',
            ls_auto_rotation:     false,
            ls_rotation_interval: 600000,
            ls_active_wallpaper_id: 'builtin-stars',
            ls_widgets: {
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
