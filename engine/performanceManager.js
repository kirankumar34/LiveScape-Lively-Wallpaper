/* ═══════════════════════════════════════════════════════════════
   engine/performanceManager.js
   Responsibilities:
     1. Detect device capability (low / medium / high)
     2. Monitor live FPS
     3. Adaptive quality: auto-downgrade if FPS drops
     4. Tab visibility pausing
     5. Idle detection (pause after 60s inactivity)
   Emits events via a simple listener system.
═══════════════════════════════════════════════════════════════ */

const PerformanceManager = (() => {

    /* ───────────────────────────────────────────────────────
       DEVICE TIER PROFILES
    ─────────────────────────────────────────────────────── */
    const PROFILES = {
        low: {
            tier:              'low',
            label:             'Low-End',
            targetFPS:         15,
            frameInterval:     1000 / 15,   // ms between frames
            particleCount:     0,
            enableCanvas:      false,
            enableParallax:    false,
            enableWebGL:       false,
            videoPlaybackRate: 0.8,
            renderScale:       0.75          // canvas resolution multiplier
        },
        medium: {
            tier:              'medium',
            label:             'Mid-Range',
            targetFPS:         24,
            frameInterval:     1000 / 24,
            particleCount:     30,
            enableCanvas:      true,
            enableParallax:    false,
            enableWebGL:       false,
            videoPlaybackRate: 1.0,
            renderScale:       1.0
        },
        high: {
            tier:              'high',
            label:             'High-End',
            targetFPS:         30,
            frameInterval:     1000 / 30,
            particleCount:     60,
            enableCanvas:      true,
            enableParallax:    true,
            enableWebGL:       true,
            videoPlaybackRate: 1.0,
            renderScale:       Math.min(window.devicePixelRatio || 1, 1.5)
        }
    };

    /* ───────────────────────────────────────────────────────
       STATE
    ─────────────────────────────────────────────────────── */
    let _detectedTier  = 'medium';  // from hardware
    let _activeTier    = 'medium';  // actual in use (may be overridden)
    let _userOverride  = null;      // 'low' | 'medium' | 'high' | null

    // FPS monitoring
    let _fpsFrameCount = 0;
    let _fpsLastTime   = 0;
    let _currentFPS    = 0;
    let _fpsRafId      = null;

    // Adaptive degradation
    let _lowFPSStrikes  = 0;
    const LOW_FPS_LIMIT  = 12;   // below this → consider downgrade
    const STRIKE_LIMIT   = 5;    // consecutive checks before downgrade

    // Tab visibility
    let _isHidden = false;
    let _isWindowFocused = true;
    let _onBatterySaver = false;
    let _isCanvasVisible = true;
    let _canvasObserver = null;

    // Idle detection
    let _idleTimer   = null;
    let _isIdle      = false;
    const IDLE_MS    = 60_000;   // 60 seconds

    // Listeners
    const _listeners = {
        tierChange:  [],
        fpsUpdate:   [],
        pause:       [],
        resume:      [],
    };

    /* ───────────────────────────────────────────────────────
       DEVICE DETECTION
    ─────────────────────────────────────────────────────── */

    /**
     * Probe the hardware and return 'low' | 'medium' | 'high'.
     * Uses CPU core count, reported device memory, and WebGL2
     * availability as signals.
     */
    function detectTier() {
        const cores  = navigator.hardwareConcurrency || 2;
        const memGB  = navigator.deviceMemory        || 2;  // Chrome only; undefined elsewhere
        const px     = screen.width * screen.height;

        // WebGL2 probe
        let hasWebGL2 = false;
        try {
            const c = document.createElement('canvas');
            hasWebGL2 = !!c.getContext('webgl2');
        } catch (_) {}

        const is4K    = px >= 3840 * 2160;
        const isLowRes = px <= 1366 * 768;

        if (cores <= 4 && memGB <= 4) return 'low';
        if (cores >= 8 && memGB >= 8 && (hasWebGL2 || is4K)) return 'high';
        return 'medium';
    }

    /* ───────────────────────────────────────────────────────
       FOCUS & BATTERY SAVE & CANVAS VISIBILITY OBSERVATION
    ─────────────────────────────────────────────────────── */

    function _initFocusTracking() {
        window.addEventListener('blur', () => {
            _isWindowFocused = false;
            _listeners.pause.forEach(fn => fn('blur'));
        });
        window.addEventListener('focus', () => {
            _isWindowFocused = true;
            if (!_isHidden && !_isIdle && _isCanvasVisible) {
                _listeners.resume.forEach(fn => fn('focus'));
            }
        });
    }

    function _initBatterySaverCheck() {
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                const checkBattery = () => {
                    const isLowBatteryDischarging = !battery.charging && battery.level <= 0.20;
                    if (isLowBatteryDischarging !== _onBatterySaver) {
                        _onBatterySaver = isLowBatteryDischarging;
                        if (_onBatterySaver) {
                            applyTier('low'); // Force Battery Saver profile
                            if (typeof AudioEngine !== 'undefined') AudioEngine.mute();
                        } else {
                            applyTier(_userOverride || _detectedTier);
                        }
                    }
                };
                checkBattery();
                battery.addEventListener('levelchange', checkBattery);
                battery.addEventListener('chargingchange', checkBattery);
            });
        }
    }

    function initCanvasObserver(canvasEl) {
        if (typeof IntersectionObserver !== 'undefined' && canvasEl) {
            if (_canvasObserver) _canvasObserver.disconnect();
            _canvasObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    _isCanvasVisible = entry.isIntersecting;
                    if (!_isCanvasVisible) {
                        _listeners.pause.forEach(fn => fn('intersect'));
                    } else {
                        if (!_isHidden && !_isIdle && _isWindowFocused) {
                            _listeners.resume.forEach(fn => fn('intersect'));
                        }
                    }
                });
            }, { threshold: 0.1 });
            _canvasObserver.observe(canvasEl);
        }
    }

    /* ───────────────────────────────────────────────────────
       INIT
    ─────────────────────────────────────────────────────── */

    /**
     * Initialise the performance manager.
     * Call once at boot, after DOM is ready.
     * @param {string|null} savedOverride  — from chrome.storage, e.g. 'low' | 'auto'
     */
    function init(savedOverride) {
        _detectedTier = detectTier();
        applyTier(savedOverride === 'auto' || !savedOverride
            ? _detectedTier
            : (PROFILES[savedOverride] ? savedOverride : _detectedTier)
        );

        _startFPSMonitor();
        _initVisibilityPausing();
        _initIdleDetection();
        _initFocusTracking();
        _initBatterySaverCheck();
    }

    /* ───────────────────────────────────────────────────────
       TIER MANAGEMENT
    ─────────────────────────────────────────────────────── */

    /** Apply a tier (updates profile, notifies listeners). */
    function applyTier(tier) {
        if (!PROFILES[tier]) return;
        const prev = _activeTier;
        _activeTier = tier;
        document.documentElement.dataset.perfTier = tier;
        if (prev !== tier) {
            _listeners.tierChange.forEach(fn => fn(PROFILES[tier], PROFILES[prev]));
        }
    }

    /**
     * User or app override.
     * @param {'auto'|'low'|'medium'|'high'} mode
     */
    function setMode(mode) {
        _userOverride = (mode === 'auto') ? null : mode;
        applyTier(_userOverride || _detectedTier);
        StorageManager.set({ performance_mode: mode });
    }

    /** @returns {Object} active profile */
    function getProfile() {
        return { ...PROFILES[_activeTier] };
    }

    function getTier()  { return _activeTier; }

    /* ───────────────────────────────────────────────────────
       FPS MONITOR + ADAPTIVE QUALITY
    ─────────────────────────────────────────────────────── */

    function _startFPSMonitor() {
        let lastSec = performance.now();
        let frames  = 0;

        function tick(ts) {
            _fpsRafId = requestAnimationFrame(tick);
            frames++;

            if (ts - lastSec >= 1000) {
                _currentFPS  = frames;
                frames       = 0;
                lastSec      = ts;

                _listeners.fpsUpdate.forEach(fn => fn(_currentFPS));
                _checkAdaptive(_currentFPS);
            }
        }
        _fpsRafId = requestAnimationFrame(tick);
    }

    /**
     * Auto-downgrade tier if FPS is consistently low.
     * Never auto-upgrades (prevents oscillation).
     */
    function _checkAdaptive(fps) {
        // Don't downgrade if user pinned a mode
        if (_userOverride) return;

        if (fps < LOW_FPS_LIMIT) {
            _lowFPSStrikes++;
            if (_lowFPSStrikes >= STRIKE_LIMIT) {
                _lowFPSStrikes = 0;
                const downgrade = _activeTier === 'high' ? 'medium'
                                : _activeTier === 'medium' ? 'low'
                                : null;
                if (downgrade) {
                    applyTier(downgrade);
                }
            }
        } else {
            _lowFPSStrikes = Math.max(0, _lowFPSStrikes - 1);
        }
    }

    /** @returns {number} current measured FPS */
    function getFPS() { return _currentFPS; }

    /* ───────────────────────────────────────────────────────
       TAB VISIBILITY PAUSING
    ─────────────────────────────────────────────────────── */

    function _initVisibilityPausing() {
        document.addEventListener('visibilitychange', () => {
            _isHidden = document.hidden;
            if (_isHidden) {
                _listeners.pause.forEach(fn => fn('hidden'));
            } else {
                if (!_isIdle) _listeners.resume.forEach(fn => fn('visible'));
            }
        });
    }

    /** @returns {boolean} true if tab is currently hidden */
    function isHidden() { return _isHidden; }

    /* ───────────────────────────────────────────────────────
       IDLE DETECTION
    ─────────────────────────────────────────────────────── */

    function _initIdleDetection() {
        const resetIdle = () => {
            clearTimeout(_idleTimer);
            if (_isIdle) {
                _isIdle = false;
                if (!_isHidden) _listeners.resume.forEach(fn => fn('activity'));
            }
            _idleTimer = setTimeout(_onIdle, IDLE_MS);
        };

        ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(ev => {
            document.addEventListener(ev, resetIdle, { passive: true });
        });

        // Start initial idle countdown
        _idleTimer = setTimeout(_onIdle, IDLE_MS);
    }

    function _onIdle() {
        _isIdle = true;
        _listeners.pause.forEach(fn => fn('idle'));
    }

    /** @returns {boolean} */
    function isIdle() { return _isIdle; }

    /* ───────────────────────────────────────────────────────
       SHOULD ANIMATE?
       Centralised check — call this before every RAF frame.
    ─────────────────────────────────────────────────────── */
    function shouldAnimate() {
        return !_isHidden && !_isIdle;
    }

    /* ───────────────────────────────────────────────────────
       LISTENER REGISTRATION
    ─────────────────────────────────────────────────────── */

    /**
     * Register a callback for engine events.
     * @param {'tierChange'|'fpsUpdate'|'pause'|'resume'} event
     * @param {Function} fn
     */
    function on(event, fn) {
        if (_listeners[event]) _listeners[event].push(fn);
    }

    function off(event, fn) {
        if (_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== fn);
    }

    /* ───────────────────────────────────────────────────────
       PUBLIC API
    ─────────────────────────────────────────────────────── */
    return {
        init,
        setMode,
        getProfile,
        getTier,
        getFPS,
        isHidden,
        isIdle,
        shouldAnimate,
        on,
        off,
        PROFILES
    };
})();

window.PerformanceManager = PerformanceManager;
