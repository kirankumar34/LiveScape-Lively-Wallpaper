/* ═══════════════════════════════════════════════════════════════
   engine/performanceManager.js
   Responsibilities:
     1. Detect device capability (low / medium / high / ultra)
     2. Monitor live FPS
     3. Adaptive quality: auto-downgrade if FPS drops
     4. Tab visibility & focus pausing
     5. Idle detection (pause after 60s inactivity)
     6. Event loop lag (CPU) monitoring
     7. Page Lifecycle API support (freeze/resume)
   Emits events via a simple listener system.
 ═══════════════════════════════════════════════════════════════ */

const PerformanceManager = (() => {

    /* ───────────────────────────────────────────────────────
       DEVICE TIER PROFILES
    ─────────────────────────────────────────────────────── */
    const PROFILES = {
        low: {
            tier:              'low',
            label:             'Low Power',
            targetFPS:         12,
            frameInterval:     1000 / 12,   // ms between frames
            particleCount:     0,
            enableCanvas:      false,
            enableParallax:    false,
            enableWebGL:       false,
            videoPlaybackRate: 0.8,
            renderScale:       0.75          // canvas resolution multiplier
        },
        medium: {
            tier:              'medium',
            label:             'Balanced',
            targetFPS:         24,
            frameInterval:     1000 / 24,
            particleCount:     15,
            enableCanvas:      true,
            enableParallax:    false,
            enableWebGL:       false,
            videoPlaybackRate: 1.0,
            renderScale:       1.0
        },
        high: {
            tier:              'high',
            label:             'High Performance',
            targetFPS:         30,
            frameInterval:     1000 / 30,
            particleCount:     30,
            enableCanvas:      true,
            enableParallax:    true,
            enableWebGL:       true,
            videoPlaybackRate: 1.0,
            renderScale:       Math.min(window.devicePixelRatio || 1, 1.5)
        },
        ultra: {
            tier:              'ultra',
            label:             'Ultra',
            targetFPS:         30,
            frameInterval:     1000 / 30,
            particleCount:     50,
            enableCanvas:      true,
            enableParallax:    true,
            enableWebGL:       true,
            videoPlaybackRate: 1.0,
            renderScale:       Math.min(window.devicePixelRatio || 1, 2.0)
        }
    };

    /* ───────────────────────────────────────────────────────
       STATE
    ─────────────────────────────────────────────────────── */
    let _detectedTier  = 'medium';  // from hardware
    let _activeTier    = 'medium';  // actual in use (may be overridden)
    let _userOverride  = null;      // 'low' | 'medium' | 'high' | 'ultra' | null

    // FPS monitoring
    let _fpsFrameCount = 0;
    let _fpsLastTime   = 0;
    let _currentFPS    = 0;
    let _fpsRafId      = null;

    // Adaptive degradation
    let _lowFPSStrikes  = 0;
    const LOW_FPS_LIMIT  = 10;   // below this → consider downgrade (adjusted for 12fps base)
    const STRIKE_LIMIT   = 5;    // consecutive checks before downgrade

    // Tab visibility & focus
    let _isHidden = false;
    let _isWindowFocused = true;
    let _onBatterySaver = false;
    let _isCanvasVisible = true;
    let _canvasObserver = null;
    let _highCPUDdetected = false;

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
       Probe hardware core count, device memory, and WebGL GPU details
       to automatically pick the best performance mode.
     */
    function detectTier() {
        const cores  = navigator.hardwareConcurrency || 4;
        const memGB  = navigator.deviceMemory        || 4;  // Chrome only

        // WebGL / GPU probe
        let hasWebGL2 = false;
        let gpuRenderer = '';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
                hasWebGL2 = true;
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
                }
            }
        } catch (_) {}

        const gpuLower = gpuRenderer.toLowerCase();
        const isLowEndGPU = gpuLower.includes('uhd') || 
                           gpuLower.includes('hd graphics') || 
                           gpuLower.includes('intel') && !gpuLower.includes('iris') && !gpuLower.includes('arc') ||
                           gpuLower.includes('mali') || 
                           gpuLower.includes('qualcomm') ||
                           gpuLower.includes('swiftshader') ||
                           gpuLower.includes('software rasterizer');

        const isHighEndGPU = gpuLower.includes('nvidia') || 
                            gpuLower.includes('geforce') || 
                            gpuLower.includes('radeon') || 
                            gpuLower.includes('amd') || 
                            gpuLower.includes('rtx') || 
                            gpuLower.includes('gtx') || 
                            gpuLower.includes('apple');

        // Low Power: dual/quad core with 4GB RAM or less, OR a low-end integrated GPU
        if ((cores <= 4 && memGB <= 4) || isLowEndGPU) {
            return 'low';
        }
        
        // High Performance: 8+ logical cores, 8GB+ RAM, and dedicated/high-end GPU
        if (cores >= 8 && memGB >= 8 && hasWebGL2 && isHighEndGPU) {
            return 'high';
        }

        // Balanced: Default mid-range fallback
        return 'medium';
    }

    /* ───────────────────────────────────────────────────────
       FOCUS, BATTERY, CPU & LIFECYCLE TRACKING
    ─────────────────────────────────────────────────────── */

    function _initFocusTracking() {
        window.addEventListener('blur', () => {
            _isWindowFocused = false;
            _listeners.pause.forEach(fn => fn('blur'));
        });
        window.addEventListener('focus', () => {
            _isWindowFocused = true;
            if (shouldAnimate() && _isCanvasVisible) {
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
                            _listeners.pause.forEach(fn => fn('battery'));
                            if (typeof AudioEngine !== 'undefined') AudioEngine.mute();
                        } else {
                            applyTier(_userOverride || _detectedTier);
                            if (shouldAnimate()) {
                                _listeners.resume.forEach(fn => fn('battery'));
                            }
                        }
                    }
                };
                checkBattery();
                battery.addEventListener('levelchange', checkBattery);
                battery.addEventListener('chargingchange', checkBattery);
            });
        }
    }

    /**
       CPU / Jank Monitor:
       Measures event loop latency. If frame rendering ticks or timeouts are delayed
       consistently (blocked > 200ms), we detect jank and temporarily pause wallpapers.
     */
    function _initCPUMonitor() {
        let lastTime = performance.now();
        const checkCpu = () => {
            const now = performance.now();
            const delta = now - lastTime;
            lastTime = now;

            if (delta > 200) {
                if (!_highCPUDdetected) {
                    _highCPUDdetected = true;
                    _listeners.pause.forEach(fn => fn('cpu'));
                }
            } else {
                if (_highCPUDdetected) {
                    _highCPUDdetected = false;
                    if (shouldAnimate() && _isCanvasVisible) {
                        _listeners.resume.forEach(fn => fn('cpu'));
                    }
                }
            }
            setTimeout(checkCpu, 1000);
        };
        setTimeout(checkCpu, 1000);
    }

    /**
       Page Lifecycle API:
       Chrome suspends or freezes tabs in background to conserve resources.
       Listen to freeze/resume events to halt execution immediately.
     */
    function _initLifecycleTracking() {
        document.addEventListener('freeze', () => {
            _listeners.pause.forEach(fn => fn('lifecycle-freeze'));
        });
        document.addEventListener('resume', () => {
            if (shouldAnimate() && _isCanvasVisible) {
                _listeners.resume.forEach(fn => fn('lifecycle-resume'));
            }
        });
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
                        if (shouldAnimate()) {
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
     * @param {string|null} savedOverride  — from storage, e.g. 'low' | 'auto'
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
        _initCPUMonitor();
        _initLifecycleTracking();
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
     * User override mode.
     * @param {'auto'|'low'|'medium'|'high'|'ultra'} mode
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
            if (!shouldAnimate()) {
                _fpsRafId = null;
                return;
            }
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

        if (shouldAnimate()) {
            _fpsRafId = requestAnimationFrame(tick);
        }

        on('pause', () => {
            if (_fpsRafId) {
                cancelAnimationFrame(_fpsRafId);
                _fpsRafId = null;
            }
            _currentFPS = 0;
            _listeners.fpsUpdate.forEach(fn => fn(0));
        });

        on('resume', () => {
            if (!_fpsRafId && shouldAnimate()) {
                lastSec = performance.now();
                frames = 0;
                _fpsRafId = requestAnimationFrame(tick);
            }
        });
    }

    /**
     * Auto-downgrade tier if FPS is consistently low.
     * Never auto-upgrades (prevents oscillation).
     */
    function _checkAdaptive(fps) {
        if (_userOverride) return;

        if (fps < LOW_FPS_LIMIT) {
            _lowFPSStrikes++;
            if (_lowFPSStrikes >= STRIKE_LIMIT) {
                _lowFPSStrikes = 0;
                const downgrade = _activeTier === 'ultra' ? 'high'
                                : _activeTier === 'high' ? 'medium'
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
                if (shouldAnimate()) {
                    _listeners.resume.forEach(fn => fn('visible'));
                }
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
                if (shouldAnimate()) {
                    _listeners.resume.forEach(fn => fn('activity'));
                }
            }
            _idleTimer = setTimeout(_onIdle, IDLE_MS);
        };

        ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(ev => {
            document.addEventListener(ev, resetIdle, { passive: true });
        });

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
        return !_isHidden && !_isIdle && !_onBatterySaver && !_highCPUDdetected && _isWindowFocused;
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
