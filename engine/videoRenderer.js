/* ═══════════════════════════════════════════════════════════════
   engine/videoRenderer.js
   Renders video or GIF wallpapers inside #wallpaper-layer.
   Responsibilities:
     • Lazily create <video> or <img> element
     • Apply performance-based rate and resolution caps
     • Pause/resume on tab visibility + idle events
     • Release Object URL and remove DOM on destroy()
═══════════════════════════════════════════════════════════════ */

const VideoRenderer = (() => {

    /* ───────────────────────────────────────────────────────
       INTERNAL STATE
    ─────────────────────────────────────────────────────── */
    let _el            = null;  // <video> or <img> element
    let _objectURL     = null;  // URL to revoke on destroy
    let _type          = null;  // 'video' | 'gif' | 'image'
    let _playOnGesture = null;  // gesture handler for autoplay fallback

    /* ───────────────────────────────────────────────────────
       LIFECYCLE
    ─────────────────────────────────────────────────────── */

    /**
     * Start a video, GIF, or static image wallpaper.
     * Dynamically injects the appropriate element.
     *
     * @param {Object} options
     * @param {'video'|'gif'|'image'} options.type
     * @param {string}  options.objectURL  — revocable Object URL from IndexedDB
     * @param {string}  [options.src]      — fallback static src (built-in assets)
     */
    async function start(options) {
        _type      = options.type;
        _objectURL = options.objectURL || null;

        const src     = _objectURL || options.src || '';
        const profile = PerformanceManager.getProfile();
        const container = document.getElementById('wallpaper-content') || document.getElementById('wallpaper-layer');

        if (!container) {
            return;
        }

        // ── GIF / static image ──
        if (_type === 'gif' || _type === 'image') {
            _el          = document.createElement('img');
            _el.id       = 'wp-media';
            _el.alt      = 'Wallpaper';
            _el.draggable = false;
            _el.src = src;
            container.appendChild(_el);
            return;
        }

        // ── VIDEO ──
        _el               = document.createElement('video');
        _el.id            = 'wallpaper-video';
        
        _el.onerror = async () => {
            console.warn("Video failed to load source:", _el.src);
            _el.onerror = null;
            if (typeof UIController !== 'undefined') {
                UIController.toast('Wallpaper source unavailable. Reverting to last valid wallpaper.', 'warning', 4000);
            }
            if (typeof WallpaperEngine !== 'undefined' && typeof WallpaperRecoveryManager !== 'undefined') {
                const recoveryWp = await WallpaperRecoveryManager.recover();
                WallpaperEngine.setWallpaper(recoveryWp);
            }
        };

        // NOTE: muted is intentionally NOT set here.
        // AudioEngine manages volume and mute state.
        // We must start muted for autoplay policy, then AudioEngine unmutes after user gesture.
        _el.muted         = true; // temporary until AudioEngine.resume() is called
        _el.loop          = true;
        _el.playsInline   = true;
        _el.preload       = 'metadata';

        _el.style.position = "absolute";
        _el.style.top = "0";
        _el.style.left = "0";
        _el.style.width = "100%";
        _el.style.height = "100%";

        // Performance adaptations
        if (profile.tier === 'low') {
            _el.playbackRate = profile.videoPlaybackRate;
        }
        
        _el.onloadeddata = () => {
            StorageManager.get('wallpaperFit').then(mode => {
                const fitMode = mode || "cover";
                _el.style.setProperty('object-fit', fitMode, 'important');
            });
        };

        // Assign src AFTER setting listeners to prevent caching race conditions
        _el.src           = src;

        container.appendChild(_el);

        // Attempt autoplay (must be muted initially for Chrome autoplay policy)
        _el.play().catch(() => {
            _cleanupGesturePlay();
            _playOnGesture = () => {
                if (_el) _el.play().catch(() => {});
                _cleanupGesturePlay();
            };
            document.addEventListener("click", _playOnGesture, { once: true });
            document.addEventListener("keydown", _playOnGesture, { once: true });
            document.addEventListener("touchstart", _playOnGesture, { once: true });
        });

        // Notify AudioEngine that a video is now active (restores volume state)
        if (typeof AudioEngine !== 'undefined') {
            AudioEngine.resume();
        }

        // Wire pause/resume to PerformanceManager signals
        PerformanceManager.on('pause',  _onPause);
        PerformanceManager.on('resume', _onResume);
    }

    function _cleanupGesturePlay() {
        if (_playOnGesture) {
            document.removeEventListener("click", _playOnGesture);
            document.removeEventListener("keydown", _playOnGesture);
            document.removeEventListener("touchstart", _playOnGesture);
            _playOnGesture = null;
        }
    }

    /** Release all resources: stop video, revoke URL, remove DOM node. */
    function destroy() {
        // Unregister PM callbacks
        PerformanceManager.off('pause',  _onPause);
        PerformanceManager.off('resume', _onResume);
        _cleanupGesturePlay();

        // Pause AudioEngine when video renderer is destroyed
        if (typeof AudioEngine !== 'undefined') {
            AudioEngine.pause();
        }

        if (_el) {
            if (_el.tagName === 'VIDEO') {
                _el.pause();
                _el.removeAttribute('src');
                _el.load();   // abort any pending network fetch
            } else {
                _el.removeAttribute('src');
            }

            if (_el.parentNode) _el.parentNode.removeChild(_el);
            _el = null;
        }

        // Revoke Object URL to free memory
        if (_objectURL) {
            URL.revokeObjectURL(_objectURL);
            _objectURL = null;
        }

    }

    /* ───────────────────────────────────────────────────────
       PAUSE / RESUME
    ─────────────────────────────────────────────────────── */

    function _onPause() {
        if (_el && _el.tagName === 'VIDEO' && !_el.paused) {
            _el.pause();
        }
    }

    function _onResume() {
        if (_el && _el.tagName === 'VIDEO' && _el.paused) {
            _el.play().catch(() => {});
        }
    }

    /* ───────────────────────────────────────────────────────
       PUBLIC API
    ─────────────────────────────────────────────────────── */
    return {
        start,
        destroy
    };
})();

window.VideoRenderer = VideoRenderer;
