/* ═══════════════════════════════════════════════════════════════
   engine/wallpaperEngine.js
   THE ORCHESTRATOR
   ─────────────────────────────────────────────────────────────
   Single source of truth for the active wallpaper.
   Coordinates: StorageManager, PerformanceManager,
                CanvasRenderer, VideoRenderer.

   Rules:
     • Only ONE active renderer at any time
     • switchWallpaper() → destroys old → starts new
     • destroyWallpaper() cleans ALL resources

   Built-in library is defined here.
   Custom (user-uploaded) wallpapers are loaded from IndexedDB.
═══════════════════════════════════════════════════════════════ */

const WallpaperEngine = (() => {

    /* ═══════════════════════════════════════════════════════
       BUILT-IN WALLPAPER LIBRARY
       These are rendered via CanvasRenderer (no file needed).
    ═══════════════════════════════════════════════════════ */
    const LIBRARY = [
        // ── Default Video Fallback ──
        { id: 'builtin-default-vid', name: 'Default Video', category: 'video', type: 'video', config: { src: 'assets/default.mp4' } },
        // ── Particle / Canvas ──
        { id: 'builtin-stars',   name: 'Stellar Field',   category: 'space',     type: 'canvas',    config: { preset: 'stars'   } },
        { id: 'builtin-aurora',  name: 'Aurora Borealis', category: 'nature',    type: 'canvas',    config: { preset: 'aurora'  } },
        { id: 'builtin-galaxy',  name: 'Galaxy Spiral',   category: 'space',     type: 'canvas',    config: { preset: 'galaxy'  } },
        { id: 'builtin-neon',    name: 'Neon Grid',       category: 'cyberpunk', type: 'canvas',    config: { preset: 'neon'    } },
        { id: 'builtin-fire',    name: 'Digital Fire',    category: 'abstract',  type: 'canvas',    config: { preset: 'fire'    } },
        { id: 'builtin-snow',    name: 'Winter Snow',     category: 'nature',    type: 'canvas',    config: { preset: 'snow'    } },
        { id: 'builtin-matrix',  name: 'Matrix Rain',     category: 'cyberpunk', type: 'canvas',    config: { preset: 'matrix'  } },
        { id: 'builtin-ocean',   name: 'Deep Ocean',      category: 'nature',    type: 'canvas',    config: { preset: 'ocean'   } },
        { id: 'builtin-sakura',  name: 'Sakura Petals',   category: 'nature',    type: 'canvas',    config: { preset: 'sakura'  } },
        { id: 'builtin-crystal', name: 'Crystal Shards',  category: 'abstract',  type: 'canvas',    config: { preset: 'crystal' } },
        // ── Gradients (static, ultra-low CPU) ──
        { id: 'builtin-grad-midnight', name: 'Midnight Blue', category: 'minimal', type: 'gradient', config: { css: 'linear-gradient(135deg,#0a0a1a 0%,#1a1a4a 100%)' } },
        { id: 'builtin-grad-purple',   name: 'Purple Dusk',   category: 'minimal', type: 'gradient', config: { css: 'linear-gradient(135deg,#12001f 0%,#3d0066 100%)' } },
        { id: 'builtin-grad-space',    name: 'Deep Space',    category: 'minimal', type: 'gradient', config: { css: 'linear-gradient(135deg,#020817 0%,#0a1a2e 100%)' } },
        { id: 'builtin-grad-forest',   name: 'Forest Dark',   category: 'minimal', type: 'gradient', config: { css: 'linear-gradient(135deg,#040d08 0%,#0a1f12 100%)' } },
    ];

    /* ───────────────────────────────────────────────────────
       STATE
    ─────────────────────────────────────────────────────── */
    let _currentId      = null;
    let _currentType    = null;   // 'canvas' | 'video' | 'gif' | 'image' | 'gradient'
    let _activeRenderer = null;   // { type: 'canvas'|'video', instance }
    let _parallaxActive = false;
    let _parallaxRafId  = null;
    let _mouseX = 0, _mouseY = 0;
    let _tgtX   = 0, _tgtY   = 0;

    const _listeners = { change: [], destroy: [] };

    /* ═══════════════════════════════════════════════════════
       INIT
    ═══════════════════════════════════════════════════════ */

    /**
     * Initialise the engine. Call once at boot.
     * Sets up parallax and subscribes to tier changes.
     */
    function init() {
        _initParallax();

        // Re-render current canvas wallpaper if tier changes (adapts particle count)
        PerformanceManager.on('tierChange', (newProfile) => {
            if (_currentType === 'canvas') {
                const current = findBuiltIn(_currentId);
                if (current) setWallpaper(current);
            }
            // Enable/disable parallax
            setParallax(newProfile.enableParallax);
        });
    }

    /* ═══════════════════════════════════════════════════════
       SET WALLPAPER — single entry point
    ═══════════════════════════════════════════════════════ */

    /**
     * Switch to a wallpaper. Destroys any existing renderer first.
     * Call this for both built-in and user-uploaded wallpapers.
     *
     * @param {Object} wallpaper
     * @param {string}  wallpaper.id
     * @param {string}  wallpaper.type  — 'canvas'|'video'|'gif'|'image'|'gradient'
     * @param {Object}  wallpaper.config
     * @param {string}  [wallpaper.objectURL]  — only for user uploads
     * @param {string}  [wallpaper.name]
     */
    async function setWallpaper(wallpaper) {
        // Step 1: Destroy existing renderer
        destroyWallpaper();

        _currentId   = wallpaper.id;
        _currentType = wallpaper.type;

        const profile = PerformanceManager.getProfile();

        // Step 2: Set background colour immediately to avoid flash
        const container = document.getElementById('wallpaper-layer');
        if (container) {
            container.innerHTML = ""; // Clean previous wallpaper
            container.style.background = '#020817';
        }

        // Step 3: Start correct renderer
        switch (wallpaper.type) {

            case 'canvas':
                // Low-end: disable animation, show gradient fallback
                if (!profile.enableCanvas) {
                    const preset = CanvasRenderer.PRESETS[wallpaper.config.preset] || CanvasRenderer.PRESETS.stars;
                    CanvasRenderer.start({ ...wallpaper.config, preset: wallpaper.config.preset });
                } else {
                    CanvasRenderer.start(wallpaper.config);
                }
                _activeRenderer = { type: 'canvas', instance: CanvasRenderer };
                break;

            case 'gradient':
                _renderGradient(wallpaper.config.css);
                _activeRenderer = { type: 'gradient', instance: null };
                break;

            case 'video':
            case 'gif':
            case 'image':
                await VideoRenderer.start({
                    type:      wallpaper.type,
                    objectURL: wallpaper.objectURL || null,
                    src:       wallpaper.config?.src || null
                });
                _activeRenderer = { type: 'video', instance: VideoRenderer };
                break;

            default:
                _renderGradient('linear-gradient(135deg,#020817,#0a1a2e)');
                _activeRenderer = { type: 'gradient', instance: null };
        }

        // Fade-in animation
        _fadeIn(container);

        // Persist selection
        await StorageManager.setActiveWallpaper(wallpaper.id);

        // Notify listeners
        _listeners.change.forEach(fn => fn({ ...wallpaper }));
    }

    /* ═══════════════════════════════════════════════════════
       DESTROY — full memory cleanup
    ═══════════════════════════════════════════════════════ */

    /**
     * Destroy the currently active wallpaper renderer.
     * Cancels RAF, pauses video, removes DOM nodes, releases GPU.
     */
    function destroyWallpaper() {
        if (!_activeRenderer) return;

        try {
            if (_activeRenderer.type === 'canvas') {
                CanvasRenderer.destroy();
            } else if (_activeRenderer.type === 'video') {
                VideoRenderer.destroy();
            } else if (_activeRenderer.type === 'gradient') {
                _destroyGradient();
            }
        } catch (e) {
        }

        _activeRenderer = null;
        _listeners.destroy.forEach(fn => fn());
    }

    /* ═══════════════════════════════════════════════════════
       RESTORE FROM STORAGE (called at boot)
    ═══════════════════════════════════════════════════════ */

    /**
     * Load the persisted wallpaper from storage and apply it.
     * Falls back to the first built-in if nothing is found.
     */
    async function restoreFromStorage() {
        try {
            const activeId = await StorageManager.getActiveWallpaperId();

            if (!activeId) {
                // First run → default built-in
                setWallpaper(LIBRARY[0]);
                return;
            }

            // Check built-in library first (no I/O needed)
            const builtIn = findBuiltIn(activeId);
            if (builtIn) {
                setWallpaper(builtIn);
                return;
            }

            // User-uploaded wallpaper → load blob from IndexedDB
            if (activeId.startsWith('user_')) {
                const objectURL = await StorageManager.idbLoadURL(activeId);
                if (!objectURL) {
                    setWallpaper(LIBRARY[0]);
                    return;
                }

                const list  = await StorageManager.getWallpaperList();
                const meta  = list.find(m => m.id === activeId) || { id: activeId, type: 'image', name: 'Custom' };

                setWallpaper({
                    id:        activeId,
                    name:      meta.name,
                    type:      meta.type,
                    config:    {},
                    objectURL
                });
                return;
            }

            // Unknown id → default
            setWallpaper(LIBRARY[0]);

        } catch (err) {
            try { setWallpaper(LIBRARY[0]); } catch (_) {}
        }
    }

    /* ═══════════════════════════════════════════════════════
       UPLOAD & SET  (one-call convenience)
    ═══════════════════════════════════════════════════════ */

    /**
     * Save an uploaded file to IndexedDB, then immediately
     * apply it as the active wallpaper.
     *
     * @param {File} file
     * @returns {Promise<Object>} metadata
     */
    async function uploadAndSet(file) {
        const meta = await StorageManager.saveWallpaper(file);

        // Use the in-memory file directly (avoids round-trip through IDB)
        const objectURL = URL.createObjectURL(file);

        await setWallpaper({
            id:        meta.id,
            name:      meta.name,
            type:      meta.type,
            config:    {},
            objectURL
        });

        return meta;
    }

    /* ═══════════════════════════════════════════════════════
       GRADIENT RENDERER (static, zero CPU)
    ═══════════════════════════════════════════════════════ */

    function _renderGradient(css) {
        const el = document.createElement('div');
        el.id    = 'wp-gradient';
        el.style.cssText = `position:absolute;inset:0;background:${css};`;
        document.getElementById('wallpaper-layer').appendChild(el);
    }

    function _destroyGradient() {
        const el = document.getElementById('wp-gradient');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /* ═══════════════════════════════════════════════════════
       FADE-IN TRANSITION
    ═══════════════════════════════════════════════════════ */

    function _fadeIn(container) {
        if (!container) return;
        container.classList.remove('wp-fade-in');
        void container.offsetWidth; // reflow
        container.classList.add('wp-fade-in');
    }

    /* ═══════════════════════════════════════════════════════
       PARALLAX EFFECT (high-end only)
    ═══════════════════════════════════════════════════════ */

    function _initParallax() {
        document.addEventListener('mousemove', e => {
            if (!_parallaxActive) return;
            _tgtX = (e.clientX / window.innerWidth  - 0.5) * 18;
            _tgtY = (e.clientY / window.innerHeight - 0.5) * 18;
        });

        function _parallaxLoop() {
            _parallaxRafId = requestAnimationFrame(_parallaxLoop);
            if (!_parallaxActive) return;

            _mouseX += (_tgtX - _mouseX) * 0.06;
            _mouseY += (_tgtY - _mouseY) * 0.06;

            const c = document.getElementById('wallpaper-layer');
            if (c) c.style.transform = `translate(${_mouseX * 0.5}px,${_mouseY * 0.5}px) scale(1.04)`;
        }
        _parallaxRafId = requestAnimationFrame(_parallaxLoop);

        // Apply initial setting from performance profile
        setParallax(PerformanceManager.getProfile().enableParallax);
    }

    function setParallax(enabled) {
        _parallaxActive = enabled;
        if (!enabled) {
            const c = document.getElementById('wallpaper-layer');
            if (c) c.style.transform = '';
        }
    }

    /* ═══════════════════════════════════════════════════════
       NAVIGATION HELPERS
    ═══════════════════════════════════════════════════════ */

    function nextWallpaper() {
        const idx = LIBRARY.findIndex(w => w.id === _currentId);
        setWallpaper(LIBRARY[(idx + 1) % LIBRARY.length]);
    }

    function shuffleWallpaper() {
        const pool = LIBRARY.filter(w => w.id !== _currentId);
        setWallpaper(pool[Math.floor(Math.random() * pool.length)]);
    }

    /* ═══════════════════════════════════════════════════════
       OVERLAY CONTROLS
    ═══════════════════════════════════════════════════════ */

    function setBlur(px = 0) {
        const el = document.getElementById('overlay-blur');
        if (el) {
            el.style.backdropFilter        = `blur(${px}px)`;
            el.style.webkitBackdropFilter  = `blur(${px}px)`;
        }
    }

    function setDim(pct = 20) {
        const el = document.getElementById('overlay-dim');
        if (el) el.style.background = `rgba(0,0,0,${pct / 100})`;
    }

    /* ═══════════════════════════════════════════════════════
       CUSTOM WALLPAPER MANAGEMENT
    ═══════════════════════════════════════════════════════ */

    /** Returns array of user-uploaded wallpaper metadata */
    async function getCustomWallpapers() {
        return StorageManager.getWallpaperList();
    }

    /**
     * Delete a user wallpaper.
     * Falls back to first built-in if it was the active one.
     */
    async function deleteCustomWallpaper(id) {
        await StorageManager.deleteWallpaper(id);
        if (_currentId === id) setWallpaper(LIBRARY[0]);
    }

    /* ═══════════════════════════════════════════════════════
       OVERLAY AND STYLE CONTROLS
    ═══════════════════════════════════════════════════════ */

    function applyFitMode(mode) {
        const wallpapers = document.querySelectorAll('#wallpaper-layer video, #wallpaper-layer img, #wallpaper-layer canvas, #wallpaper-layer div:not(#overlay-blur):not(#overlay-dim)');
        
        if (!wallpapers.length) return;
        
        wallpapers.forEach(el => {
            el.style.setProperty('object-fit', mode, 'important');
        });

        StorageManager.set({ wallpaperFit: mode });
    }

    /* ═══════════════════════════════════════════════════════
       QUERY
    ═══════════════════════════════════════════════════════ */

    function getLibrary()    { return LIBRARY; }
    function findBuiltIn(id) { return LIBRARY.find(w => w.id === id) || null; }
    function getCurrent()    { return { id: _currentId, type: _currentType }; }

    /* ═══════════════════════════════════════════════════════
       EVENTS
    ═══════════════════════════════════════════════════════ */

    function on(event, fn) {
        if (_listeners[event]) _listeners[event].push(fn);
    }
    function off(event, fn) {
        if (_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== fn);
    }

    /* ═══════════════════════════════════════════════════════
       PUBLIC API
    ═══════════════════════════════════════════════════════ */
    return {
        init,
        setWallpaper,
        destroyWallpaper,
        restoreFromStorage,
        uploadAndSet,
        deleteCustomWallpaper,
        getCustomWallpapers,
        nextWallpaper,
        shuffleWallpaper,
        setParallax,
        setBlur,
        setDim,
        applyFitMode,
        getLibrary,
        findBuiltIn,
        getCurrent,
        on,
        off
    };
})();

window.WallpaperEngine = WallpaperEngine;
