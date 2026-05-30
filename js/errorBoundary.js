/* ═══════════════════════════════════════════════════════════════
   js/errorBoundary.js  v1.0.0
   Global Error Handling, Crash Recovery, and Safe Mode pipeline.
   Loaded first to catch syntax, runtime, and load-time exceptions.
═══════════════════════════════════════════════════════════════ */

(function () {
    const errorLogs = [];
    let isSafeMode = false;

    // Track load crashes
    const startupTime = Date.now();
    let crashCount = parseInt(localStorage.getItem('ls_crash_count') || '0', 10);

    // If we crashed within 8 seconds of boot, increment count
    window.addEventListener('beforeunload', () => {
        if (Date.now() - startupTime < 8000) {
            // Smooth boot: if no errors were thrown, we clear crashCount or reduce it.
            // But we only increment if an error was actually logged during this session.
            if (errorLogs.length > 0) {
                localStorage.setItem('ls_crash_count', String(crashCount + 1));
            }
        } else {
            // Clean run of > 8s resets the crash count
            localStorage.setItem('ls_crash_count', '0');
        }
    });

    // Check if we are in a crash loop (e.g. 3 consecutive crashes)
    if (crashCount >= 3) {
        isSafeMode = true;
        // Prompt Safe Mode
        console.warn("LiveScape: Multiple boot failures detected. Safe Mode active.");
        window.addEventListener('DOMContentLoaded', () => {
            _showSafeModeBanner();
        });
    }

    function _showSafeModeBanner() {
        const banner = document.createElement('div');
        banner.id = 'safe-mode-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100000;
            background: rgba(185, 28, 28, 0.95);
            color: #ffffff;
            padding: 16px 24px;
            border-radius: 12px;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            gap: 16px;
            border: 1px solid rgba(255,255,255,0.2);
            animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        banner.innerHTML = `
            <div>
                <strong style="display:block;font-size:15px;margin-bottom:2px;">⚠️ Safe Mode Active</strong>
                <span>Multiple startup crashes detected. Your settings or layout might be corrupt.</span>
            </div>
            <div style="display:flex;gap:8px;">
                <button id="safe-mode-reset-btn" style="background:#ffffff;color:#991b1b;border:none;padding:8px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;outline:none;">Reset Settings</button>
                <button id="safe-mode-dismiss-btn" style="background:rgba(255,255,255,0.2);color:#ffffff;border:none;padding:8px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;outline:none;">Dismiss</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('safe-mode-reset-btn')?.addEventListener('click', async () => {
            if (confirm("This will reset all settings, widget positions, and scheduler options to defaults. Your uploaded wallpapers will be preserved. Proceed?")) {
                localStorage.setItem('ls_crash_count', '0');
                if (typeof StorageManager !== 'undefined') {
                    try {
                        await StorageManager.set(StorageManager.DEFAULTS || {});
                        await StorageManager.set({ widgetLayout: {} });
                    } catch (e) {
                        chrome.storage.local.clear();
                    }
                } else {
                    chrome.storage.local.clear();
                }
                location.reload();
            }
        });

        document.getElementById('safe-mode-dismiss-btn')?.addEventListener('click', () => {
            localStorage.setItem('ls_crash_count', '0');
            banner.remove();
        });
    }

    // Capture unhandled runtime errors
    window.onerror = function (message, source, lineno, colno, error) {
        const errorInfo = {
            message: message || "Unknown error",
            source: source || "inline",
            line: lineno,
            col: colno,
            stack: error ? error.stack : "",
            time: new Date().toISOString()
        };
        errorLogs.push(errorInfo);
        console.error("LiveScape Caught Error:", errorInfo);

        // Toast error to UI if UIController is loaded
        if (typeof UIController !== 'undefined' && typeof UIController.toast === 'function') {
            UIController.toast(`Error: ${message}`, 'error', 5000);
        }

        // Return false to let standard browser logging continue
        return false;
    };

    // Capture unhandled promise rejections
    window.onunhandledrejection = function (event) {
        const errorInfo = {
            message: event.reason ? (event.reason.message || event.reason) : "Unhandled rejection",
            source: "Promise Rejection",
            stack: event.reason ? event.reason.stack : "",
            time: new Date().toISOString()
        };
        errorLogs.push(errorInfo);
        console.error("LiveScape Caught Rejection:", errorInfo);

        if (typeof UIController !== 'undefined' && typeof UIController.toast === 'function') {
            UIController.toast(`Promise Error: ${errorInfo.message}`, 'error', 5000);
        }
    };

    // Expose error logs for Debug Mode
    window.LiveScapeErrors = {
        getLogs: () => [...errorLogs],
        clearLogs: () => { errorLogs.length = 0; },
        isSafeMode: () => isSafeMode,
        triggerSafeMode: () => {
            localStorage.setItem('ls_crash_count', '3');
            location.reload();
        }
    };
})();

const ErrorBoundaryManager = (() => {
    const errorLogs = [];

    function logError(category, error, details = {}) {
        const errInfo = {
            category,
            message: error.message || error.toString(),
            stack: error.stack || '',
            details,
            time: new Date().toISOString()
        };
        errorLogs.push(errInfo);
        console.error(`[ErrorBoundaryManager] Category: ${category}`, errInfo);
        
        if (typeof UIController !== 'undefined' && typeof UIController.toast === 'function') {
            UIController.toast(`System [${category}]: ${errInfo.message}`, 'error', 5000);
        }
    }

    function wrap(category, fn, fallbackValue = null) {
        try {
            return fn();
        } catch (err) {
            logError(category, err);
            return fallbackValue;
        }
    }

    async function wrapAsync(category, fn, fallbackValue = null) {
        try {
            return await fn();
        } catch (err) {
            logError(category, err);
            return fallbackValue;
        }
    }

    return {
        logError,
        wrap,
        wrapAsync,
        getLogs: () => [...errorLogs]
    };
})();

window.ErrorBoundaryManager = ErrorBoundaryManager;
