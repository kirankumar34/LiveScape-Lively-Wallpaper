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

const WallpaperRecoveryManager = (() => {
    const FALLBACK_WALLPAPER_ID = 'builtin-stars';

    async function getLastValidId() {
        try {
            const id = await StorageManager.get('last_valid_wallpaper_id');
            return id || FALLBACK_WALLPAPER_ID;
        } catch (e) {
            return FALLBACK_WALLPAPER_ID;
        }
    }

    async function setLastValidId(id) {
        if (id && !id.startsWith('blob:')) {
            await StorageManager.set({ last_valid_wallpaper_id: id }).catch(() => {});
        }
    }

    async function validateWallpaper(wallpaper) {
        if (!wallpaper || !wallpaper.id) return false;

        // Built-ins are always valid
        if (wallpaper.id.startsWith('builtin-')) {
            return true;
        }

        // Custom wallpapers must be in user list and exist in IndexedDB
        if (wallpaper.id.startsWith('user_')) {
            try {
                const list = await StorageManager.getWallpaperList();
                const meta = list.find(w => w && w.id === wallpaper.id);
                if (!meta) return false;

                const exists = await StorageManager.idbExists(wallpaper.id);
                if (!exists) return false;

                // Test-load URL to verify blob reconstruction
                const url = await StorageManager.idbLoadURL(wallpaper.id);
                if (!url) return false;

                URL.revokeObjectURL(url);
                return true;
            } catch (e) {
                return false;
            }
        }

        return false;
    }

    async function recover() {
        const lastValidId = await getLastValidId();
        let wallpaperToLoad = null;

        if (lastValidId.startsWith('builtin-')) {
            wallpaperToLoad = WallpaperEngine.findBuiltIn(lastValidId);
        } else if (lastValidId.startsWith('user_')) {
            const list = await StorageManager.getWallpaperList();
            const meta = list.find(w => w && w.id === lastValidId);
            if (meta) {
                const isValid = await validateWallpaper(meta);
                if (isValid) {
                    wallpaperToLoad = {
                        id:     meta.id,
                        name:   meta.name,
                        type:   meta.type,
                        config: {}
                    };
                }
            }
        }

        if (!wallpaperToLoad) {
            wallpaperToLoad = WallpaperEngine.findBuiltIn(FALLBACK_WALLPAPER_ID) || WallpaperEngine.getLibrary()[0];
        }

        return wallpaperToLoad;
    }

    return {
        getLastValidId,
        setLastValidId,
        validateWallpaper,
        recover,
        FALLBACK_WALLPAPER_ID
    };
})();

window.WallpaperRecoveryManager = WallpaperRecoveryManager;

const WallpaperEngine = (() => {

    /* ═══════════════════════════════════════════════════════
       BUILT-IN WALLPAPER LIBRARY
       These are rendered via CanvasRenderer (no file needed).
    ═══════════════════════════════════════════════════════ */
    const LIBRARY = [
        // ── Default Video Fallback ──
        { id: 'builtin-default-vid', name: 'Default Video', category: 'video', type: 'video', config: { src: 'https://player.vimeo.com/external/371433846.sd.mp4?s=236da2f3c022f73b441f710e206abfb58d20aa65&profile_id=139&oauth2_token_id=57447761' } },
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
    let _setWallpaperSequence = 0;

    const _listeners = { change: [], destroy: [] };

    /* ═══════════════════════════════════════════════════════
       WALLPAPER CACHE MANAGER & PRELOAD MANAGER
    ═══════════════════════════════════════════════════════ */

    const WallpaperCacheManager = (() => {
        const _cache = new Map(); // id -> objectURL

        async function getURL(id) {
            if (_cache.has(id)) {
                return _cache.get(id);
            }
            if (id && id.startsWith('user_')) {
                const objectURL = await StorageManager.idbLoadURL(id).catch(() => null);
                if (objectURL) {
                    _cache.set(id, objectURL);
                    return objectURL;
                }
            }
            return null;
        }

        function release(id) {
            const url = _cache.get(id);
            if (url) {
                URL.revokeObjectURL(url);
                _cache.delete(id);
            }
        }

        function releaseAll() {
            for (const url of _cache.values()) {
                URL.revokeObjectURL(url);
            }
            _cache.clear();
        }

        return { getURL, release, releaseAll };
    })();

    const PreloadManager = (() => {
        function preloadVideo(src) {
            return new Promise((resolve) => {
                const video = document.createElement('video');
                video.muted = true;
                video.preload = 'auto';
                video.src = src;
                video.oncanplaythrough = () => resolve(video);
                video.onerror = () => resolve(null);
                setTimeout(() => resolve(null), 3000);
            });
        }

        function preloadImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = src;
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                setTimeout(() => resolve(null), 3000);
            });
        }

        return { preloadVideo, preloadImage };
    })();

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
        // Validate wallpaper before rendering
        const isValid = await WallpaperRecoveryManager.validateWallpaper(wallpaper);
        if (!isValid) {
            console.warn(`Wallpaper validation failed for ID: ${wallpaper?.id}. Recovering last valid...`);
            const recoveryWp = await WallpaperRecoveryManager.recover();
            return setWallpaper(recoveryWp);
        }

        const seq = ++_setWallpaperSequence;

        _currentId   = wallpaper.id;
        _currentType = wallpaper.type;

        const profile = PerformanceManager.getProfile();

        // Determine background color based on preset or config to avoid flashes
        let bgColor = '#020817';
        if (wallpaper.type === 'canvas' && wallpaper.config?.preset) {
            const presetName = wallpaper.config.preset;
            if (CanvasRenderer.PRESETS[presetName]) {
                bgColor = CanvasRenderer.PRESETS[presetName].bg;
            }
        } else if (wallpaper.type === 'gradient' && wallpaper.config?.css) {
            bgColor = '#020817';
        }

        const layer = document.getElementById('wallpaper-layer');
        if (layer) {
            layer.style.background = bgColor;
        }

        const container = document.getElementById('wallpaper-content') || document.getElementById('wallpaper-layer');

        // Resolve IndexedDB objectURL if needed
        let resolvedURL = wallpaper.objectURL || null;
        if (!resolvedURL && wallpaper.id.startsWith('user_')) {
            resolvedURL = await WallpaperCacheManager.getURL(wallpaper.id);
        }

        if (seq !== _setWallpaperSequence) return;

        // Preload resources if applicable
        const src = resolvedURL || wallpaper.config?.src;
        if (src) {
            if (wallpaper.type === 'video') {
                await PreloadManager.preloadVideo(src);
            } else if (wallpaper.type === 'image' || wallpaper.type === 'gif') {
                await PreloadManager.preloadImage(src);
            }
        }

        if (seq !== _setWallpaperSequence) {
            if (resolvedURL && !wallpaper.objectURL) {
                WallpaperCacheManager.release(wallpaper.id);
            }
            return;
        }

        // Clean up previous wallpaper renderer
        destroyWallpaper();

        if (container) {
            container.innerHTML = ""; // Clean previous wallpaper contents only (preserving overlays)
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
                    objectURL: resolvedURL,
                    src:       wallpaper.config?.src || null
                });
                _activeRenderer = { type: 'video', instance: VideoRenderer };
                break;

            default:
                _renderGradient('linear-gradient(135deg,#020817,#0a1a2e)');
                _activeRenderer = { type: 'gradient', instance: null };
        }

        if (seq !== _setWallpaperSequence) {
            destroyWallpaper();
            return;
        }

        // Fade-in animation
        _fadeIn(layer || container);

        // Persist selection
        await StorageManager.setActiveWallpaper(wallpaper.id);
        await WallpaperRecoveryManager.setLastValidId(wallpaper.id);

        // Notify listeners
        _listeners.change.forEach(fn => fn({ ...wallpaper, objectURL: resolvedURL }));
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

            // User-uploaded wallpaper → load blob from IndexedDB via Cache
            if (activeId.startsWith('user_')) {
                const objectURL = await WallpaperCacheManager.getURL(activeId);
                if (!objectURL) {
                    setWallpaper(LIBRARY[0]);
                    return;
                }

                const list  = await StorageManager.getWallpaperList();
                const meta  = list.find(m => m && m.id === activeId) || { id: activeId, type: 'image', name: 'Custom' };

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
        const container = document.getElementById('wallpaper-content') || document.getElementById('wallpaper-layer');
        if (container) container.appendChild(el);
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
        container.classList.remove('wallpaper-fade-in');
        void container.offsetWidth; // reflow
        container.classList.add('wallpaper-fade-in');
    }

    /* ═══════════════════════════════════════════════════════
       PARALLAX EFFECT (high-end only)
    ═══════════════════════════════════════════════════════ */

    function _initParallax() {
        document.addEventListener('mousemove', e => {
            if (!_parallaxActive || !PerformanceManager.shouldAnimate()) return;
            _tgtX = (e.clientX / window.innerWidth  - 0.5) * 18;
            _tgtY = (e.clientY / window.innerHeight - 0.5) * 18;
        });

        function _parallaxLoop() {
            if (!_parallaxActive || !PerformanceManager.shouldAnimate()) {
                _parallaxRafId = null;
                return;
            }
            _parallaxRafId = requestAnimationFrame(_parallaxLoop);

            _mouseX += (_tgtX - _mouseX) * 0.06;
            _mouseY += (_tgtY - _mouseY) * 0.06;

            const c = document.getElementById('wallpaper-content') || document.getElementById('wallpaper-layer');
            if (c) c.style.transform = `translate3d(${_mouseX * 0.5}px, ${_mouseY * 0.5}px, 0) scale(1.04)`;
        }

        // Apply initial setting from performance profile
        setParallax(PerformanceManager.getProfile().enableParallax);

        // Listen for pause/resume signals to start/stop the parallax loop dynamically
        PerformanceManager.on('pause', () => {
            if (_parallaxRafId) {
                cancelAnimationFrame(_parallaxRafId);
                _parallaxRafId = null;
            }
        });
        PerformanceManager.on('resume', () => {
            if (_parallaxActive && !_parallaxRafId && PerformanceManager.shouldAnimate()) {
                _parallaxRafId = requestAnimationFrame(_parallaxLoop);
            }
        });
    }

    function setParallax(enabled) {
        _parallaxActive = enabled;
        const c = document.getElementById('wallpaper-content') || document.getElementById('wallpaper-layer');
        if (!enabled) {
            if (c) c.style.transform = '';
            if (_parallaxRafId) {
                cancelAnimationFrame(_parallaxRafId);
                _parallaxRafId = null;
            }
        } else {
            if (c) {
                c.style.transform = `translate3d(${_mouseX * 0.5}px, ${_mouseY * 0.5}px, 0) scale(1.04)`;
            }
            if (!_parallaxRafId && PerformanceManager.shouldAnimate()) {
                _parallaxRafId = requestAnimationFrame(_parallaxLoop);
            }
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
        if (typeof PerformanceManager !== 'undefined' && PerformanceManager.getTier() === 'low') {
            px = 0;
        }
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
        const wallpapers = document.querySelectorAll('#wallpaper-content video, #wallpaper-content img, #wallpaper-content canvas, #wallpaper-content div');
        
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
