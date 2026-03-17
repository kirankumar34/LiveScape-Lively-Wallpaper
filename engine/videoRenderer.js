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
    let _el          = null;  // <video> or <img> element
    let _objectURL   = null;  // URL to revoke on destroy
    let _type        = null;  // 'video' | 'gif' | 'image'

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
        const container = document.getElementById('wallpaper-layer');

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
        _el.src           = src;
        _el.autoplay      = true;
        _el.muted         = true;
        _el.loop          = true;
        _el.playsInline   = true;
        _el.preload       = 'metadata';

        _el.style.position = "absolute";
        _el.style.top = "0";
        _el.style.left = "0";
        _el.style.width = "100%";
        _el.style.height = "100%";
        _el.style.zIndex = "-1";

        // Performance adaptations
        if (profile.tier === 'low') {
            _el.playbackRate = profile.videoPlaybackRate;
        }
        
        _el.onloadeddata = () => {
            chrome.storage.local.get(["wallpaperFit"], (data) => {
                const mode = data.wallpaperFit || "cover";
                _el.style.setProperty('object-fit', mode, 'important');
            });
        };

        container.appendChild(_el);

        // Force Autoplay with interaction catch
        _el.muted = true;
        _el.play().catch(() => {
            document.addEventListener("click", () => _el.play(), { once: true });
        });

        // Wire pause/resume to PerformanceManager signals
        PerformanceManager.on('pause',  _onPause);
        PerformanceManager.on('resume', _onResume);
    }

    /** Release all resources: stop video, revoke URL, remove DOM node. */
    function destroy() {
        // Unregister PM callbacks
        PerformanceManager.off('pause',  _onPause);
        PerformanceManager.off('resume', _onResume);

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
