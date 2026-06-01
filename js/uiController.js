/* ═════════════════════════════════════════════════════════
   uiController.js  v3.0
   Global UI: panels, toolbar, keyboard shortcuts, focus mode,
   gallery, toast system, performance mode, upload handling.
   AI / ThreeJS features removed.
═════════════════════════════════════════════════════════ */

const UIController = (() => {
    let focusMode  = false;
    let activePanel= null;

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ─────────────────────────────────────────────────
       TOAST NOTIFICATION SYSTEM
    ───────────────────────────────────────────────── */
    function toast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icon = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        container.appendChild(el);

        requestAnimationFrame(() => el.classList.add('show'));

        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 400);
        }, duration);
    }

    /* ─────────────────────────────────────────────────
       PANEL MANAGEMENT
    ───────────────────────────────────────────────── */
    function openPanel(id) {
        if (activePanel && activePanel !== id) closePanel(activePanel);
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('hidden');
        activePanel = id;
    }

    function closePanel(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hidden');
        if (activePanel === id) activePanel = null;
    }

    function togglePanel(id) {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.classList.contains('hidden')) openPanel(id);
        else closePanel(id);
    }

    /* ─────────────────────────────────────────────────
       GALLERY — built-in + IndexedDB custom wallpapers
    ───────────────────────────────────────────────── */
    function buildGallery() {
        const grid = document.getElementById('gallery-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const library    = WallpaperEngine.getLibrary();
        const currentWp  = WallpaperEngine.getCurrent();

        // Built-in wallpapers
        library.forEach(wp => _addGalleryItem(grid, wp, currentWp));

        // Custom (IndexedDB) wallpapers
        WallpaperEngine.getCustomWallpapers().then(customList => {
            if (!customList || !customList.length) return;
            customList.forEach(meta => {
                // Build a wallpaper object from metadata for display
                const wp = {
                    id:       meta.id,
                    name:     meta.name,
                    category: 'custom',
                    type:     meta.type,
                    config:   {},
                    meta
                };
                _addGalleryItem(grid, wp, currentWp, true);
            });
        });
    }

    function _addGalleryItem(grid, wp, currentWp, isCustom = false) {
        const isActive = currentWp && currentWp.id === wp.id;
        const item = document.createElement('div');
        item.className = `gallery-item ${isActive ? 'active' : ''}`;
        item.dataset.id = wp.id;
        item.dataset.category = wp.category || 'all';

        // Preview visuals
        const previewGradients = {
            stars:   'linear-gradient(135deg,#020817,#0d1b3e)',
            aurora:  'linear-gradient(135deg,#041220,#033a2c)',
            galaxy:  'linear-gradient(135deg,#05010a,#1a093a)',
            neon:    'linear-gradient(135deg,#000510,#001a0f)',
            fire:    'linear-gradient(135deg,#100505,#3d0f00)',
            snow:    'linear-gradient(135deg,#0d1520,#1e2e45)',
            matrix:  'linear-gradient(135deg,#000800,#001400)',
            ocean:   'linear-gradient(135deg,#030a14,#052540)',
            sakura:  'linear-gradient(135deg,#1a0a12,#3d1527)',
            crystal: 'linear-gradient(135deg,#040d1a,#0d2a4a)',
        };
        const iconMap = {
            stars:'⭐', aurora:'🌌', galaxy:'🌀', neon:'💚', fire:'🔥',
            snow:'❄️', matrix:'🖥️', ocean:'🌊', sakura:'🌸', crystal:'💎',
        };

        let previewHTML = '';
        if (wp.type === 'gradient') {
            previewHTML = `<div class="gallery-item-canvas" style="background:${wp.config.css}"></div>`;
        } else if (wp.type === 'particles' || wp.type === 'webgl' || wp.type === 'canvas') {
            const preset = wp.config?.preset || 'stars';
            const bg     = previewGradients[preset] || 'linear-gradient(135deg,#0a0a0f,#1a1a2e)';
            const icon   = iconMap[preset] || '✨';
            previewHTML  = `<div class="gallery-item-canvas" style="background:${bg};display:flex;align-items:center;justify-content:center;font-size:32px">${icon}</div>`;
        } else if (wp.type === 'video') {
            previewHTML = `<div class="gallery-item-canvas" style="background:#0a0a0f;display:flex;align-items:center;justify-content:center;font-size:32px">🎬</div>`;
        } else if (wp.type === 'gif') {
            previewHTML = `<div class="gallery-item-canvas" style="background:#0a0a0f;display:flex;align-items:center;justify-content:center;font-size:32px">🎞️</div>`;
        } else {
            previewHTML = `<div class="gallery-item-canvas" style="background:#0a0a0f;display:flex;align-items:center;justify-content:center;font-size:32px">🖼️</div>`;
        }

        item.innerHTML = `
            ${previewHTML}
            <div class="gallery-item-overlay">
                <div class="gallery-item-info">
                    <span class="item-name">${escapeHtml(wp.name)}</span>
                    <span class="item-category">${escapeHtml(wp.category || 'custom')}</span>
                </div>
            </div>
            ${isActive ? '<div class="gallery-item-active-badge">✓</div>' : ''}
            ${isCustom ? '<div class="gallery-item-delete" title="Delete">×</div>' : ''}
        `;

        // Click to set wallpaper
        item.addEventListener('click', async (e) => {
            if (e.target.classList.contains('gallery-item-delete')) return;

            document.querySelectorAll('.gallery-item').forEach(gi => {
                gi.classList.remove('active');
                gi.querySelector('.gallery-item-active-badge')?.remove();
            });
            item.classList.add('active');
            item.insertAdjacentHTML('beforeend', '<div class="gallery-item-active-badge">✓</div>');

            if (isCustom) {
                // Load from IndexedDB, then play
                try {
                    const objectURL = await StorageManager.idbLoadURL(wp.id);
                    if (objectURL) {
                        await WallpaperEngine.setWallpaper({ ...wp, objectURL });
                        toast(`Wallpaper set: ${wp.name}`, 'success');
                    } else {
                        toast('Wallpaper file not found', 'error');
                    }
                } catch (err) {
                    toast('Could not load wallpaper', 'error');
                }
            } else {
                WallpaperEngine.setWallpaper(wp);
                toast(`Wallpaper set: ${wp.name}`, 'success');
            }
        });

        // Delete custom wallpaper
        const deleteBtn = item.querySelector('.gallery-item-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await WallpaperEngine.deleteCustomWallpaper(wp.id);
                    item.remove();
                    toast('Wallpaper removed', 'info');
                } catch (err) {
                    toast('Could not remove wallpaper', 'error');
                }
            });
        }

        grid.appendChild(item);
    }

    function filterGallery(category) {
        document.querySelectorAll('.gallery-item').forEach(item => {
            const cat = item.dataset.category || '';
            if (category === 'all' || cat === category) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /* ─────────────────────────────────────────────────
       FOCUS MODE
    ───────────────────────────────────────────────── */
    function toggleFocusMode() {
        focusMode = !focusMode;
        document.body.classList.toggle('focus-mode', focusMode);
        const hint = document.getElementById('focus-mode-hint');
        if (hint) hint.classList.toggle('hidden', !focusMode);
        toast(focusMode ? 'Focus Mode – press F to exit' : 'Focus Mode disabled', 'info', 2000);
    }

    /* ─────────────────────────────────────────────────
       UPLOAD — drag & drop + file picker → IndexedDB
    ───────────────────────────────────────────────── */
    function setupUpload() {
        const zone  = document.getElementById('gallery-upload-zone');
        const input = document.getElementById('upload-file-input');
        if (!zone || !input) return;

        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) _handleUpload(file);
        });

        input.addEventListener('change', () => {
            if (input.files[0]) _handleUpload(input.files[0]);
        });
    }

    async function _handleUpload(file) {
        // Validate type
        const allowed = ['video/mp4', 'video/webm', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            toast('Unsupported file type. Use MP4, WebM, GIF, JPG, PNG, or WebP.', 'error');
            return;
        }

        // Warn about large files
        const sizeMB = file.size / 1048576;
        if (sizeMB > 200) {
            toast(`File is ${sizeMB.toFixed(0)}MB — very large files may slow down storage`, 'warning');
        }

        toast('Saving wallpaper…', 'info', 2000);

        try {
            // uploadAndSet saves to IndexedDB AND applies the wallpaper
            const meta = await WallpaperEngine.uploadAndSet(file);
            toast(`✓ Wallpaper saved: ${meta.name}`, 'success');
            // Refresh gallery to show the new upload
            if (!document.getElementById('gallery-panel').classList.contains('hidden')) {
                buildGallery();
            }
        } catch (err) {
            toast('Upload failed – check storage space', 'error');
        }
    }

    /* ─────────────────────────────────────────────────
       RENDER DEBUG OVERLAY (Ctrl+Shift+D)
       ───────────────────────────────────────────────── */
    let debugOverlayInterval = null;

    function toggleDebugOverlay() {
        let panel = document.getElementById('render-debug-overlay');
        if (panel) {
            panel.remove();
            if (debugOverlayInterval) {
                clearInterval(debugOverlayInterval);
                debugOverlayInterval = null;
            }
            toast('Debug overlay hidden', 'info');
            return;
        }

        panel = document.createElement('div');
        panel.id = 'render-debug-overlay';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 999999;
            background: rgba(15, 23, 42, 0.95);
            color: #f8fafc;
            padding: 16px;
            border-radius: 12px;
            font-family: monospace;
            font-size: 11px;
            line-height: 1.5;
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            pointer-events: none;
            width: 320px;
        `;
        document.body.appendChild(panel);

        const updateDebug = () => {
            const video = document.getElementById('wallpaper-video');
            const img = document.getElementById('wp-media');
            const canvas = document.getElementById('wp-canvas');
            const overlayBlur = document.getElementById('overlay-blur');
            const overlayDim = document.getElementById('overlay-dim');

            let type = 'none';
            let src = 'none';
            let paused = 'n/a';
            let readyState = 'n/a';
            let resolution = 'n/a';
            let opacity = 'n/a';
            let zIndex = 'n/a';
            let display = 'n/a';
            let visibility = 'n/a';

            let activeEl = null;
            if (video) { type = 'video'; activeEl = video; paused = video.paused; readyState = video.readyState; resolution = `${video.videoWidth}x${video.videoHeight}`; }
            else if (img) { type = 'img'; activeEl = img; src = img.src; resolution = `${img.naturalWidth}x${img.naturalHeight}`; }
            else if (canvas) { type = 'canvas'; activeEl = canvas; resolution = `${canvas.width}x${canvas.height}`; }

            if (activeEl) {
                const styles = window.getComputedStyle(activeEl);
                src = activeEl.src || activeEl.currentSrc || 'IndexedDB Blob / Stream';
                opacity = styles.opacity;
                zIndex = styles.zIndex;
                display = styles.display;
                visibility = styles.visibility;
            }

            const blurStyles = overlayBlur ? window.getComputedStyle(overlayBlur) : null;
            const dimStyles = overlayDim ? window.getComputedStyle(overlayDim) : null;

            panel.innerHTML = `
                <div style="font-weight:bold;font-size:12px;margin-bottom:8px;color:#a78bfa;display:flex;justify-content:space-between;">
                    <span>🔍 LIVESCAPE RENDER DEBUG</span>
                </div>
                <div><strong>Wallpaper Type:</strong> ${type}</div>
                <div><strong>Current Source:</strong> <span style="word-break:break-all;color:#38bdf8;">${src.slice(0, 100)}${src.length > 100 ? '...' : ''}</span></div>
                <div><strong>Resolution:</strong> ${resolution}</div>
                <div><strong>Ready State:</strong> ${readyState}</div>
                <div><strong>Paused State:</strong> ${paused}</div>
                <div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;"><strong>CSS Properties:</strong></div>
                <div>- Display: ${display}</div>
                <div>- Visibility: ${visibility}</div>
                <div>- Opacity: ${opacity}</div>
                <div>- Z-Index: ${zIndex}</div>
                <div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;"><strong>Overlay Layers:</strong></div>
                <div>- Blur bg-color: ${blurStyles ? blurStyles.backgroundColor : 'n/a'}</div>
                <div>- Blur z-index: ${blurStyles ? blurStyles.zIndex : 'n/a'}</div>
                <div>- Blur display: ${blurStyles ? blurStyles.display : 'n/a'}</div>
                <div>- Dim bg-color: ${dimStyles ? dimStyles.backgroundColor : 'n/a'}</div>
                <div>- Dim z-index: ${dimStyles ? dimStyles.zIndex : 'n/a'}</div>
            `;
        };

        updateDebug();
        debugOverlayInterval = setInterval(updateDebug, 500);
        toast('Debug overlay enabled (Ctrl+Shift+D to close)', 'success');
    }

    /* ─────────────────────────────────────────────────
       PERFORMANCE MODE BUTTONS (Settings panel)
    ───────────────────────────────────────────────── */
    function setupPerformanceModeButtons() {
        const btns = document.querySelectorAll('.perf-mode-btn');
        if (!btns.length) return;

        function syncButtons(mode) {
            btns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        }

        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                PerformanceManager.setMode(mode);
                syncButtons(mode);
                toast(`Performance: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`, 'info', 2000);
            });
        });

        // Sync initial state
        const saved = StorageManager.getCached('performance_mode') || 'auto';
        syncButtons(saved);

        // Keep synced when tier changes externally
        PerformanceManager.on('tierChange', (newProfile) => {
            syncButtons(newProfile.tier);
            const tierEl = document.getElementById('device-tier-label');
            if (tierEl) {
                const tierLabels = { low: '🔋 Low Power', medium: '⚖️ Balanced', high: '🚀 High Performance', ultra: '💎 Ultra' };
                tierEl.textContent = tierLabels[newProfile.tier] || newProfile.tier;
            }
        });
    }

    /* ─────────────────────────────────────────────────
       FPS DISPLAY
    ───────────────────────────────────────────────── */
    function _startFPSDisplay() {
        const fpsEl = document.getElementById('fps-display');
        if (!fpsEl) return;

        PerformanceManager.on('fpsUpdate', (fps) => {
            fpsEl.textContent = fps > 0 ? fps + ' FPS' : '-- FPS';
        });
    }

    /* ─────────────────────────────────────────────────
       KEYBOARD SHORTCUTS
    ───────────────────────────────────────────────── */
    function setupKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
                toggleDebugOverlay();
                return;
            }

            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.key) {
                case 'f': case 'F':
                    toggleFocusMode(); break;
                case 'g': case 'G':
                    togglePanel('gallery-panel');
                    if (!document.getElementById('gallery-panel').classList.contains('hidden')) buildGallery();
                    break;
                case 's': case 'S':
                    togglePanel('settings-panel'); break;
                case 'w': case 'W':
                    togglePanel('widgets-panel'); break;
                case 'h': case 'H':
                    if (typeof WidgetEngine !== 'undefined') WidgetEngine.toggleGlobalVisibility();
                    break;
                case 'l': case 'L':
                    if (typeof WidgetEngine !== 'undefined') WidgetEngine.toggleGlobalLock();
                    break;
                case 'ArrowRight':
                case 'n': case 'N':
                    WallpaperEngine.nextWallpaper(); break;
                case 'r': case 'R':
                    WallpaperEngine.shuffleWallpaper(); break;
                case 'Escape':
                    if (activePanel) closePanel(activePanel);
                    if (focusMode) toggleFocusMode();
                    break;
            }
        });
    }

    /* ─────────────────────────────────────────────────
       BOOKMARK MODAL
    ───────────────────────────────────────────────── */
    function setupBookmarkModal() {
        const modal     = document.getElementById('bookmark-modal');
        const addBtn    = document.getElementById('bookmark-add-btn');
        const saveBtn   = document.getElementById('bookmark-save-btn');
        const cancelBtn = document.getElementById('bookmark-cancel-btn');
        const nameInput = document.getElementById('bookmark-name-input');
        const urlInput  = document.getElementById('bookmark-url-input');
        const backdrop  = modal?.querySelector('.modal-backdrop');

        if (!modal) return;

        addBtn?.addEventListener('click', () => modal.classList.remove('hidden'));
        cancelBtn?.addEventListener('click', () => modal.classList.add('hidden'));
        backdrop?.addEventListener('click', () => modal.classList.add('hidden'));

        saveBtn?.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const url  = urlInput.value.trim();
            if (!name || !url) { toast('Please fill all fields', 'warning'); return; }
            if (!url.startsWith('http')) { toast('URL must start with http(s)://', 'warning'); return; }

            StorageManager.get('bookmarks').then(list => {
                const bookmarks = [...(list || []), { name, url, id: Date.now() }];
                StorageManager.set({ bookmarks });
                renderBookmarks(bookmarks);
                modal.classList.add('hidden');
                nameInput.value = '';
                urlInput.value  = '';
                toast(`Bookmark added: ${name}`, 'success');
            });
        });
    }

    function renderBookmarks(bookmarks) {
        const grid = document.getElementById('bookmarks-grid');
        if (!grid) return;
        grid.innerHTML = '';

        bookmarks.forEach(b => {
            const item = document.createElement('a');
            item.href  = b.url;
            item.className = 'bookmark-item';
            item.target = '_blank';
            item.rel    = 'noopener noreferrer';
            item.title  = b.name;

            let domain = '';
            try { domain = new URL(b.url).hostname; } catch (_) {}
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

            item.innerHTML = `
                <img class="bookmark-favicon" src="${faviconUrl}" alt="${escapeHtml(b.name)}" />
                <span class="bookmark-name">${escapeHtml(b.name)}</span>
                <div class="bookmark-delete" title="Remove">×</div>
            `;

            const img = item.querySelector('.bookmark-favicon');
            if (img) {
                img.addEventListener('error', () => {
                    img.style.display = 'none';
                });
            }

            item.querySelector('.bookmark-delete').addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                StorageManager.get('bookmarks').then(list => {
                    const updated = (list || []).filter(bm => bm.id !== b.id);
                    StorageManager.set({ bookmarks: updated });
                    renderBookmarks(updated);
                });
            });

            grid.appendChild(item);
        });
    }

    /* ─────────────────────────────────────────────────
       WIDGET MANAGER PANEL v2 — Deep Customisation Cards
    ───────────────────────────────────────────────── */
    function buildWidgetPanel() {
        const container = document.getElementById('widget-list-panel');
        if (!container) return;
        container.innerHTML = '';

        const widgetMeta = [
            { id: 'clock',     icon: '🕐', label: 'Clock',     hasFont: true  },
            { id: 'search',    icon: '🔎', label: 'Search',    hasFont: true  },
            { id: 'weather',   icon: '🌤️', label: 'Weather',   hasFont: true  },
            { id: 'todo',      icon: '✅', label: 'Tasks',     hasFont: false },
            { id: 'notes',     icon: '📝', label: 'Notes',     hasFont: false },
            { id: 'bookmarks', icon: '🔖', label: 'Bookmarks', hasFont: false },
            { id: 'quote',     icon: '💬', label: 'Quote',     hasFont: false },
        ];

        // Debounce helper for slider persistence
        const _debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

        widgetMeta.forEach(meta => {
            const el = typeof WidgetEngine !== 'undefined' ? WidgetEngine.getWidgets()[meta.id] : null;
            const cfg = (el && el._widgetConfig) || { visible: true, scale: 1.0, opacity: 1.0, borderRadius: 16, fontSize: 1.0, locked: false };

            const card = document.createElement('div');
            card.className = 'widget-card';
            card.dataset.widgetCard = meta.id;

            card.innerHTML = `
                <div class="widget-card-header">
                    <span class="widget-card-title">${meta.icon} ${meta.label}</span>
                    <div class="widget-card-actions">
                        <button class="widget-icon-btn ${cfg.visible ? '' : 'hidden-widget'}" id="wc-eye-${meta.id}" title="Toggle Visibility">
                            ${cfg.visible ? _svgEyeOpen() : _svgEyeClosed()}
                        </button>
                        <button class="widget-icon-btn ${cfg.locked ? 'locked' : ''}" id="wc-lock-${meta.id}" title="Toggle Lock">
                            ${cfg.locked ? _svgLocked() : _svgUnlocked()}
                        </button>
                    </div>
                </div>
                <div class="widget-slider-row">
                    <label>Scale</label>
                    <input type="range" id="wc-scale-${meta.id}" min="0.5" max="2.0" step="0.05" value="${cfg.scale}" />
                    <span class="widget-slider-val" id="wc-scale-val-${meta.id}">${Math.round(cfg.scale * 100)}%</span>
                </div>
                <div class="widget-slider-row">
                    <label>Opacity</label>
                    <input type="range" id="wc-opacity-${meta.id}" min="0.1" max="1.0" step="0.05" value="${cfg.opacity}" />
                    <span class="widget-slider-val" id="wc-opacity-val-${meta.id}">${Math.round(cfg.opacity * 100)}%</span>
                </div>
                <div class="widget-slider-row">
                    <label>Radius</label>
                    <input type="range" id="wc-radius-${meta.id}" min="0" max="32" step="1" value="${cfg.borderRadius}" />
                    <span class="widget-slider-val" id="wc-radius-val-${meta.id}">${cfg.borderRadius}px</span>
                </div>
                ${meta.hasFont ? `
                <div class="widget-slider-row">
                    <label>Font</label>
                    <input type="range" id="wc-font-${meta.id}" min="0.7" max="1.4" step="0.05" value="${cfg.fontSize}" />
                    <span class="widget-slider-val" id="wc-font-val-${meta.id}">${cfg.fontSize.toFixed(2)}×</span>
                </div>` : ''}
                <div class="widget-color-row">
                    <label>Colors</label>
                    <div class="widget-color-picker-wrap">
                        <span title="Background Color" style="cursor:help;">🎨 BG</span>
                        <input type="color" id="wc-bg-${meta.id}" class="widget-color-input" />
                        <button class="widget-color-reset" id="wc-bg-clear-${meta.id}">Clear</button>
                    </div>
                    <div class="widget-color-picker-wrap">
                        <span title="Text Color" style="cursor:help;">🔤 Text</span>
                        <input type="color" id="wc-text-${meta.id}" class="widget-color-input" />
                        <button class="widget-color-reset" id="wc-text-clear-${meta.id}">Clear</button>
                    </div>
                </div>
                <button class="widget-reset-btn" id="wc-reset-${meta.id}">↺ Reset</button>
            `;
 
            container.appendChild(card);
 
            const debouncedSave = _debounce(async (newCfg) => {
                if (typeof WidgetEngine !== 'undefined') await WidgetEngine.saveConfig(meta.id, newCfg);
            }, 300);
 
            const getCurrentCfg = () => (el && el._widgetConfig) || { ...cfg };
 
            // ── Eye Button ──
            const eyeBtn = card.querySelector(`#wc-eye-${meta.id}`);
            eyeBtn?.addEventListener('click', () => {
                const c = getCurrentCfg();
                const newVisible = !c.visible;
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.setVisible(meta.id, newVisible);
                const newCfg = { ...c, visible: newVisible };
                if (el) el._widgetConfig = newCfg;
                eyeBtn.innerHTML = newVisible ? _svgEyeOpen() : _svgEyeClosed();
                eyeBtn.classList.toggle('hidden-widget', !newVisible);
                debouncedSave(newCfg);

                if (meta.id === 'weather' && newVisible) {
                    if (typeof WeatherWidget !== 'undefined' && typeof WeatherWidget.onWidgetEnabled === 'function') {
                        WeatherWidget.onWidgetEnabled();
                    }
                }
            });
 
            // ── Lock Button ──
            const lockBtn = card.querySelector(`#wc-lock-${meta.id}`);
            lockBtn?.addEventListener('click', () => {
                const c = getCurrentCfg();
                const newLocked = !c.locked;
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.lockWidget(meta.id, newLocked);
                lockBtn.innerHTML = newLocked ? _svgLocked() : _svgUnlocked();
                lockBtn.classList.toggle('locked', newLocked);
            });
 
            // ── Scale Slider ──
            const scaleSlider = card.querySelector(`#wc-scale-${meta.id}`);
            const scaleVal    = card.querySelector(`#wc-scale-val-${meta.id}`);
            scaleSlider?.addEventListener('input', () => {
                const v = parseFloat(scaleSlider.value);
                if (scaleVal) scaleVal.textContent = `${Math.round(v * 100)}%`;
                const newCfg = { ...getCurrentCfg(), scale: v };
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, newCfg);
                debouncedSave(newCfg);
            });
 
            // ── Opacity Slider ──
            const opacitySlider = card.querySelector(`#wc-opacity-${meta.id}`);
            const opacityVal    = card.querySelector(`#wc-opacity-val-${meta.id}`);
            opacitySlider?.addEventListener('input', () => {
                const v = parseFloat(opacitySlider.value);
                if (opacityVal) opacityVal.textContent = `${Math.round(v * 100)}%`;
                const newCfg = { ...getCurrentCfg(), opacity: v };
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, newCfg);
                debouncedSave(newCfg);
            });
 
            // ── Radius Slider ──
            const radiusSlider = card.querySelector(`#wc-radius-${meta.id}`);
            const radiusVal    = card.querySelector(`#wc-radius-val-${meta.id}`);
            radiusSlider?.addEventListener('input', () => {
                const v = parseInt(radiusSlider.value);
                if (radiusVal) radiusVal.textContent = `${v}px`;
                const newCfg = { ...getCurrentCfg(), borderRadius: v };
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, newCfg);
                debouncedSave(newCfg);
            });
 
            // ── Font Slider (optional) ──
            if (meta.hasFont) {
                const fontSlider = card.querySelector(`#wc-font-${meta.id}`);
                const fontVal    = card.querySelector(`#wc-font-val-${meta.id}`);
                fontSlider?.addEventListener('input', () => {
                    const v = parseFloat(fontSlider.value);
                    if (fontVal) fontVal.textContent = `${v.toFixed(2)}×`;
                    const newCfg = { ...getCurrentCfg(), fontSize: v };
                    if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, newCfg);
                    debouncedSave(newCfg);
                });
            }

            // ── Color Pickers ──
            const bgPicker = card.querySelector(`#wc-bg-${meta.id}`);
            const bgClear  = card.querySelector(`#wc-bg-clear-${meta.id}`);
            const textPicker = card.querySelector(`#wc-text-${meta.id}`);
            const textClear  = card.querySelector(`#wc-text-clear-${meta.id}`);

            if (bgPicker) {
                bgPicker.value = cfg.bgColor || '#1a1a2e';
                bgPicker.addEventListener('input', () => {
                    const newCfg = { ...getCurrentCfg(), bgColor: bgPicker.value };
                    if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, newCfg);
                    debouncedSave(newCfg);
                });
            }
            bgClear?.addEventListener('click', () => {
                const current = getCurrentCfg();
                delete current.bgColor;
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, current);
                debouncedSave(current);
                if (bgPicker) bgPicker.value = '#1a1a2e';
            });

            if (textPicker) {
                textPicker.value = cfg.textColor || '#ffffff';
                textPicker.addEventListener('input', () => {
                    const newCfg = { ...getCurrentCfg(), textColor: textPicker.value };
                    if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, newCfg);
                    debouncedSave(newCfg);
                });
            }
            textClear?.addEventListener('click', () => {
                const current = getCurrentCfg();
                delete current.textColor;
                if (typeof WidgetEngine !== 'undefined') WidgetEngine.applyConfig(meta.id, current);
                debouncedSave(current);
                if (textPicker) textPicker.value = '#ffffff';
            });
 
            // ── Per-card Reset ──
            const resetBtn = card.querySelector(`#wc-reset-${meta.id}`);
            resetBtn?.addEventListener('click', async () => {
                if (typeof WidgetEngine !== 'undefined') await WidgetEngine.resetConfig(meta.id);
                if (scaleSlider) scaleSlider.value = '1';
                if (scaleVal) scaleVal.textContent = '100%';
                if (opacitySlider) opacitySlider.value = '1';
                if (opacityVal) opacityVal.textContent = '100%';
                if (radiusSlider) radiusSlider.value = '16';
                if (radiusVal) radiusVal.textContent = '16px';
                const fontSlider = card.querySelector(`#wc-font-${meta.id}`);
                const fontVal    = card.querySelector(`#wc-font-val-${meta.id}`);
                if (fontSlider) fontSlider.value = '1';
                if (fontVal) fontVal.textContent = '1.00×';
                if (bgPicker) bgPicker.value = '#1a1a2e';
                if (textPicker) textPicker.value = '#ffffff';
                toast(`${meta.label} reset to defaults`, 'info', 1500);
            });
        });

        // ── Footer: Reset All, Export, Import ──
        const footer = document.createElement('div');
        footer.className = 'widget-panel-footer';
        footer.innerHTML = `
            <div class="widget-panel-footer-row">
                <button class="settings-btn settings-btn-danger" id="wc-reset-all-btn">↺ Reset All Widgets</button>
            </div>
            <div class="widget-panel-footer-row">
                <button class="settings-btn" id="wc-export-btn">📋 Export Layout</button>
                <button class="settings-btn settings-btn-ghost" id="wc-import-btn">📥 Import Layout</button>
            </div>
        `;
        const panel = document.getElementById('widgets-panel');
        if (panel) {
            panel.querySelector('.widget-panel-footer')?.remove();
            panel.appendChild(footer);
        }

        document.getElementById('wc-reset-all-btn')?.addEventListener('click', async () => {
            if (confirm('Reset all widget positions and configurations?')) {
                if (typeof WidgetEngine !== 'undefined') {
                    await WidgetEngine.resetAllConfigs();
                    await StorageManager.set({ widgetLayout: {} });
                }
                toast('All widgets reset', 'success');
                buildWidgetPanel();
            }
        });

        document.getElementById('wc-export-btn')?.addEventListener('click', () => {
            if (typeof WidgetEngine !== 'undefined') WidgetEngine.exportLayout();
        });

        document.getElementById('wc-import-btn')?.addEventListener('click', async () => {
            const json = prompt('Paste exported layout JSON:');
            if (json && typeof WidgetEngine !== 'undefined') {
                await WidgetEngine.importLayout(json);
                buildWidgetPanel();
            }
        });
    }

    /* SVG helpers for widget card buttons */
    function _svgEyeOpen() {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
    function _svgEyeClosed() {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    }
    function _svgLocked() {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    }
    function _svgUnlocked() {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    }


    /* ─────────────────────────────────────────────────
       WALLPAPER NAME INDICATOR (toolbar center)
    ───────────────────────────────────────────────── */
    function _initWallpaperIndicator() {
        WallpaperEngine.on('change', wp => {
            const nameEl = document.getElementById('wallpaper-name');
            const catEl  = document.getElementById('wallpaper-category');
            if (nameEl) nameEl.textContent = wp.name || 'Unknown';
            if (catEl)  catEl.textContent  = wp.category || 'Wallpaper';
        });
    }

    /* ─────────────────────────────────────────────────
       INIT — called from app.js
    ───────────────────────────────────────────────── */
    function init() {
        // Toolbar buttons
        document.getElementById('btn-settings')?.addEventListener('click', () => togglePanel('settings-panel'));
        document.getElementById('btn-gallery')?.addEventListener('click', () => {
            togglePanel('gallery-panel');
            if (!document.getElementById('gallery-panel').classList.contains('hidden')) buildGallery();
        });
        document.getElementById('btn-widgets')?.addEventListener('click', () => {
            togglePanel('widgets-panel');
            if (!document.getElementById('widgets-panel').classList.contains('hidden')) buildWidgetPanel();
        });
        document.getElementById('btn-scheduler')?.addEventListener('click', () => {
            togglePanel('panel-scheduler');
            if (!document.getElementById('panel-scheduler').classList.contains('hidden') && typeof SceneScheduler !== 'undefined') {
                SceneScheduler.buildSchedulerPanel();
            }
        });
        document.getElementById('btn-next-wallpaper')?.addEventListener('click', () => WallpaperEngine.nextWallpaper());
        document.getElementById('btn-shuffle')?.addEventListener('click', () => WallpaperEngine.shuffleWallpaper());
        document.getElementById('btn-focus-mode')?.addEventListener('click', toggleFocusMode);

        // Close buttons
        document.getElementById('settings-close')?.addEventListener('click', () => closePanel('settings-panel'));
        document.getElementById('gallery-close')?.addEventListener('click', () => closePanel('gallery-panel'));
        document.getElementById('widgets-close')?.addEventListener('click', () => closePanel('widgets-panel'));
        document.getElementById('panel-scheduler-close')?.addEventListener('click', () => closePanel('panel-scheduler'));

        // Scheduler toggle & preview
        document.getElementById('scheduler-toggle')?.addEventListener('change', function () {
            if (this.checked) { SceneScheduler.enable(); } else { SceneScheduler.disable(); }
        });
        document.getElementById('scheduler-preview-btn')?.addEventListener('click', () => {
            if (typeof SceneScheduler !== 'undefined') {
                const scene = SceneScheduler.getActiveScene();
                SceneScheduler.buildSchedulerPanel(); // refresh
                toast(`Previewing ${scene.emoji} ${scene.label}`, 'info', 2000);
            }
        });

        // Scheduler pill click
        document.getElementById('scheduler-pill')?.addEventListener('click', () => {
            togglePanel('panel-scheduler');
            if (!document.getElementById('panel-scheduler').classList.contains('hidden') && typeof SceneScheduler !== 'undefined') {
                SceneScheduler.buildSchedulerPanel();
            }
        });

        // Gallery tab filtering
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterGallery(btn.dataset.tab);
            });
        });

        buildWidgetPanel();

        const secondaryInit = () => {
            setupKeyboard();
            setupUpload();
            setupBookmarkModal();
            setupPerformanceModeButtons();
            _startFPSDisplay();
            _initWallpaperIndicator();

            // Load bookmarks
            StorageManager.get('bookmarks').then(list => renderBookmarks(list || []));
        };

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(secondaryInit);
        } else {
            setTimeout(secondaryInit, 1);
        }

    }

    return {
        init,
        toast,
        openPanel,
        closePanel,
        togglePanel,
        buildGallery,
        renderBookmarks,
        toggleFocusMode,
        buildWidgetPanel
    };
})();

window.UIController = UIController;
