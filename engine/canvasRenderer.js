/* ═══════════════════════════════════════════════════════════════
   engine/canvasRenderer.js
   Renders animated particle wallpapers on an HTML5 Canvas.
   Responsibilities:
     • Create & size canvas element inside #wallpaper-layer
     • Run FPS-capped RAF loop
     • Pause/resume when PerformanceManager signals
     • Support multiple preset animations
     • Full memory cleanup via destroy()
═══════════════════════════════════════════════════════════════ */

const CanvasRenderer = (() => {

    /* ───────────────────────────────────────────────────────
       PRESET DEFINITIONS
    ─────────────────────────────────────────────────────── */
    const PRESETS = {
        stars:   { bg: '#020817', color: '#ffffff', style: 'dots'    },
        aurora:  { bg: '#041220', color: '#00ffaa', style: 'aurora'  },
        galaxy:  { bg: '#05010a', color: '#b975f5', style: 'dots'    },
        neon:    { bg: '#000510', color: '#00ff88', style: 'neon'    },
        fire:    { bg: '#100505', color: '#ff6b00', style: 'fire'    },
        snow:    { bg: '#0d1520', color: '#cce8ff', style: 'snow'    },
        matrix:  { bg: '#000800', color: '#00ff00', style: 'matrix'  },
        ocean:   { bg: '#030a14', color: '#0090ff', style: 'dots'    },
        sakura:  { bg: '#1a0a10', color: '#ffb5c8', style: 'sakura'  },
        crystal: { bg: '#040d1a', color: '#88ccff', style: 'dots'    },
    };

    /* ───────────────────────────────────────────────────────
       INTERNAL STATE (per render session)
    ─────────────────────────────────────────────────────── */
    let _canvas     = null;
    let _ctx        = null;
    let _rafId      = null;
    let _particles  = [];
    let _lastFrame  = 0;
    let _preset     = 'stars';
    let _config     = {};
    let _w          = 0;
    let _h          = 0;

    /* ───────────────────────────────────────────────────────
       LIFECYCLE
    ─────────────────────────────────────────────────────── */

    /**
     * Start a canvas particle wallpaper.
     * Creates and injects a <canvas> into #wallpaper-layer.
     *
     * @param {Object} options
     * @param {string} options.preset   — key from PRESETS
     * @param {string} [options.bg]     — background override
     * @param {string} [options.color]  — particle colour override
     */
    function start(options = {}) {
        const preset = PRESETS[options.preset] || PRESETS.stars;
        _preset = options.preset || 'stars';
        _config = {
            bg:    options.bg    || preset.bg,
            color: options.color || preset.color,
            style: preset.style
        };

        const profile = PerformanceManager.getProfile();

        // Low-end: no canvas animation → render plain gradient
        if (!profile.enableCanvas) {
            _renderGradientOnly(_config.bg);
            return;
        }

        // Create canvas
        _canvas = document.createElement('canvas');
        _canvas.id = 'wp-canvas';
        _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
        document.getElementById('wallpaper-layer').appendChild(_canvas);

        _ctx = _canvas.getContext('2d', { alpha: false });

        _resize(profile.renderScale);
        window.addEventListener('resize', () => _resize(profile.renderScale));

        const count = profile.particleCount;
        _particles  = _buildParticles(_config.style, count, _w, _h, _config.color);

        // Listen for pause/resume signals
        PerformanceManager.on('pause',  _onPause);
        PerformanceManager.on('resume', _onResume);

        _lastFrame = 0;
        _rafId = requestAnimationFrame(_loop);
    }

    /** Stop everything and free all resources. */
    function destroy() {
        // Cancel RAF
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

        // Remove listener hooks
        PerformanceManager.off('pause',  _onPause);
        PerformanceManager.off('resume', _onResume);

        // Clear the canvas
        if (_ctx && _canvas) {
            _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
            _ctx = null;
        }

        // Remove DOM node
        if (_canvas && _canvas.parentNode) {
            _canvas.parentNode.removeChild(_canvas);
        }
        _canvas    = null;
        _particles = [];

        // Remove plain background element too (low-tier case)
        const plain = document.getElementById('wp-plain-bg');
        if (plain && plain.parentNode) plain.parentNode.removeChild(plain);

        window.removeEventListener('resize', _resize);
    }

    /* ───────────────────────────────────────────────────────
       CANVAS SIZING
    ─────────────────────────────────────────────────────── */

    function _resize(scale = 1) {
        if (!_canvas) return;
        _w = Math.floor(window.innerWidth  * scale);
        _h = Math.floor(window.innerHeight * scale);
        _canvas.width  = _w;
        _canvas.height = _h;
    }

    /* ───────────────────────────────────────────────────────
       RAF LOOP (FPS-capped)
    ─────────────────────────────────────────────────────── */

    function _loop(ts) {
        _rafId = requestAnimationFrame(_loop);

        if (!PerformanceManager.shouldAnimate()) return;

        const interval = PerformanceManager.getProfile().frameInterval;
        const delta    = ts - _lastFrame;
        if (delta < interval) return;
        _lastFrame = ts - (delta % interval);

        _render(ts);
    }

    /* ───────────────────────────────────────────────────────
       PAUSE / RESUME
    ─────────────────────────────────────────────────────── */

    function _onPause() {
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    }

    function _onResume() {
        if (!_rafId && _canvas) {
            _lastFrame = 0;
            _rafId = requestAnimationFrame(_loop);
        }
    }

    /* ───────────────────────────────────────────────────────
       RENDER DISPATCH
    ─────────────────────────────────────────────────────── */

    function _render(ts) {
        if (!_ctx || !_canvas) return;
        switch (_config.style) {
            case 'matrix':  _drawMatrix(ts); break;
            case 'fire':    _drawFire(ts);   break;
            case 'aurora':  _drawAurora(ts); break;
            case 'snow':    _drawSnow(ts);   break;
            case 'neon':    _drawNeon(ts);   break;
            case 'sakura':  _drawSakura(ts); break;
            default:        _drawDots(ts);   break;
        }
    }

    /* ───────────────────────────────────────────────────────
       PARTICLE FACTORIES
    ─────────────────────────────────────────────────────── */

    function _buildParticles(style, count, w, h, color) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            let p = {
                x:     Math.random() * w,
                y:     Math.random() * h,
                size:  Math.random() * 2 + 0.5,
                vx:    (Math.random() - 0.5) * 0.4,
                vy:    (Math.random() - 0.5) * 0.4,
                alpha: Math.random() * 0.6 + 0.3,
                phase: Math.random() * Math.PI * 2,
            };
            switch (style) {
                case 'snow':
                    p.vy   = Math.random() * 0.7 + 0.2;
                    p.size = Math.random() * 3 + 1;
                    break;
                case 'fire':
                    p.vy   = -(Math.random() * 1.5 + 0.5);
                    p.y    = h;
                    break;
                case 'matrix':
                    p.x    = Math.floor(Math.random() * (w / 14)) * 14;
                    p.vy   = Math.random() * 2 + 0.5;
                    p.size = 14;
                    p.char = _randKatakana();
                    break;
                case 'sakura':
                    p.vy     = Math.random() * 0.5 + 0.2;
                    p.rot    = 0;
                    p.rotSpd = (Math.random() - 0.5) * 0.04;
                    p.size   = Math.random() * 4 + 2;
                    break;
            }
            particles.push(p);
        }
        return particles;
    }

    function _randKatakana() {
        return String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96));
    }

    /* ───────────────────────────────────────────────────────
       INDIVIDUAL DRAW FUNCTIONS
    ─────────────────────────────────────────────────────── */

    function _drawDots(ts) {
        const { bg, color } = _config;
        _ctx.fillStyle = bg;
        _ctx.fillRect(0, 0, _w, _h);

        _particles.forEach(p => {
            const pulse = Math.sin(ts / 2000 + p.phase) * 0.2 + 0.8;
            _ctx.globalAlpha = p.alpha * pulse;
            _ctx.fillStyle   = color;
            _ctx.beginPath();
            _ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            _ctx.fill();
            p.x = (p.x + p.vx + _w) % _w;
            p.y = (p.y + p.vy + _h) % _h;
        });
        _ctx.globalAlpha = 1;
    }

    function _drawNeon(ts) {
        const { bg, color } = _config;
        _ctx.fillStyle = bg;
        _ctx.fillRect(0, 0, _w, _h);

        _particles.forEach(p => {
            const pulse = Math.sin(ts / 1500 + p.phase) * 0.3 + 0.7;
            _ctx.globalAlpha  = p.alpha * pulse;
            _ctx.fillStyle    = color;
            _ctx.shadowBlur   = 10;
            _ctx.shadowColor  = color;
            _ctx.beginPath();
            _ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            _ctx.fill();
            p.x = (p.x + p.vx + _w) % _w;
            p.y = (p.y + p.vy + _h) % _h;
        });
        _ctx.globalAlpha = 1;
        _ctx.shadowBlur  = 0;
    }

    function _drawAurora(ts) {
        _ctx.fillStyle = _config.bg;
        _ctx.fillRect(0, 0, _w, _h);

        _particles.forEach(p => {
            const wave = Math.sin(ts / 3000 + p.x / (_w / 6)) * 60;
            _ctx.globalAlpha = p.alpha * 0.35;
            _ctx.fillStyle   = `hsl(${160 + wave * 0.5}, 100%, 60%)`;
            _ctx.beginPath();
            _ctx.ellipse(p.x, p.y + wave, p.size * 5, p.size * 1.2, 0, 0, Math.PI * 2);
            _ctx.fill();
            p.x = (p.x + p.vx + _w) % _w;
        });
        _ctx.globalAlpha = 1;
    }

    function _drawMatrix(ts) {
        // Fade effect
        _ctx.fillStyle = 'rgba(0,8,0,0.07)';
        _ctx.fillRect(0, 0, _w, _h);

        _ctx.fillStyle = '#00ff00';
        _ctx.font = '14px monospace';

        _particles.forEach(p => {
            _ctx.globalAlpha = p.alpha;
            _ctx.fillText(p.char, p.x, p.y);
            p.y += p.vy;
            if (p.y > _h + 14) {
                p.y    = -14;
                p.x    = Math.floor(Math.random() * (_w / 14)) * 14;
                p.char = _randKatakana();
                p.alpha = Math.random() * 0.5 + 0.4;
            }
        });
        _ctx.globalAlpha = 1;
    }

    function _drawFire(ts) {
        _ctx.fillStyle = _config.bg;
        _ctx.fillRect(0, 0, _w, _h);

        _particles.forEach(p => {
            const heat = 1 - Math.min(1, p.y / _h);
            _ctx.globalAlpha = p.alpha;
            _ctx.fillStyle   = `hsl(${heat * 40}, 100%, ${40 + heat * 40}%)`;
            _ctx.beginPath();
            _ctx.arc(p.x, p.y, p.size * (0.6 + heat * 0.8), 0, Math.PI * 2);
            _ctx.fill();
            p.y     += p.vy;
            p.x     += Math.sin(ts / 800 + p.phase) * 0.5;
            p.alpha -= 0.004;
            if (p.y < 0 || p.alpha <= 0) {
                p.y     = _h + 5;
                p.x     = Math.random() * _w;
                p.alpha = Math.random() * 0.6 + 0.3;
            }
        });
        _ctx.globalAlpha = 1;
    }

    function _drawSnow(ts) {
        _ctx.fillStyle = _config.bg;
        _ctx.fillRect(0, 0, _w, _h);

        _particles.forEach(p => {
            _ctx.globalAlpha = p.alpha;
            _ctx.fillStyle   = _config.color;
            _ctx.beginPath();
            _ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            _ctx.fill();
            p.y += p.vy;
            p.x += Math.sin(ts / 2000 + p.phase) * 0.4;
            if (p.y > _h + 5) { p.y = -5; p.x = Math.random() * _w; }
        });
        _ctx.globalAlpha = 1;
    }

    function _drawSakura(ts) {
        _ctx.fillStyle = _config.bg;
        _ctx.fillRect(0, 0, _w, _h);

        _particles.forEach(p => {
            _ctx.save();
            _ctx.globalAlpha = p.alpha;
            _ctx.translate(p.x, p.y);
            _ctx.rotate(p.rot);
            _ctx.fillStyle = _config.color;
            _ctx.beginPath();
            _ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
            _ctx.fill();
            _ctx.restore();
            p.y    += p.vy;
            p.x    += Math.sin(ts / 1800 + p.phase) * 0.5;
            p.rot  += p.rotSpd;
            if (p.y > _h + 10) { p.y = -10; p.x = Math.random() * _w; }
        });
        _ctx.globalAlpha = 1;
    }

    /* ───────────────────────────────────────────────────────
       LOW-END FALLBACK (plain gradient background)
    ─────────────────────────────────────────────────────── */

    function _renderGradientOnly(bg) {
        const el = document.createElement('div');
        el.id    = 'wp-plain-bg';
        el.style.cssText = `position:absolute;inset:0;background:${bg};`;
        document.getElementById('wallpaper-layer').appendChild(el);
    }

    /* ───────────────────────────────────────────────────────
       PUBLIC API
    ─────────────────────────────────────────────────────── */
    return {
        start,
        destroy,
        PRESETS
    };
})();

window.CanvasRenderer = CanvasRenderer;
