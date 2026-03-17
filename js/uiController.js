/* ═════════════════════════════════════════════════════════
   uiController.js  v3.0
   Global UI: panels, toolbar, keyboard shortcuts, focus mode,
   gallery, toast system, performance mode, upload handling.
   AI / ThreeJS features removed.
═════════════════════════════════════════════════════════ */

const UIController = (() => {
    let focusMode  = false;
    let activePanel= null;

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
        } else if (wp.type === 'particles' || wp.type === 'webgl') {
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
                    <span class="item-name">${wp.name}</span>
                    <span class="item-category">${wp.category || 'custom'}</span>
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
        PerformanceManager.on('tierChange', (newProfile) => syncButtons(newProfile.tier));
    }

    /* ─────────────────────────────────────────────────
       FPS DISPLAY
    ───────────────────────────────────────────────── */
    function _startFPSDisplay() {
        const fpsEl = document.getElementById('fps-display');
        if (!fpsEl) return;

        PerformanceManager.on('fpsUpdate', (fps) => {
            fpsEl.textContent = fps + ' FPS';
        });
    }

    /* ─────────────────────────────────────────────────
       KEYBOARD SHORTCUTS
    ───────────────────────────────────────────────── */
    function setupKeyboard() {
        document.addEventListener('keydown', e => {
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
                <img class="bookmark-favicon" src="${faviconUrl}" alt="${b.name}"
                     onerror="this.style.display='none'" />
                <span class="bookmark-name">${b.name}</span>
                <div class="bookmark-delete" title="Remove">×</div>
            `;

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
       WIDGET PANEL LIST
    ───────────────────────────────────────────────── */
    function buildWidgetPanel() {
        const list = document.getElementById('widget-list-panel');
        if (!list) return;

        const widgetMeta = [
            { id: 'clock',     icon: '🕐', label: 'Clock' },
            { id: 'search',    icon: '🔎', label: 'Search' },
            { id: 'weather',   icon: '🌤️', label: 'Weather' },
            { id: 'todo',      icon: '✅', label: 'Tasks' },
            { id: 'notes',     icon: '📝', label: 'Notes' },
            { id: 'bookmarks', icon: '🔖', label: 'Bookmarks' },
        ];

        widgetMeta.forEach(meta => {
            const item = document.createElement('div');
            item.className = 'widget-list-item';
            item.innerHTML = `
                <div class="widget-list-item-info">
                    <span class="widget-icon">${meta.icon}</span>
                    <span>${meta.label}</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" class="widget-toggle" data-widget="${meta.id}" checked />
                    <span class="toggle-slider"></span>
                </label>
            `;
            list.appendChild(item);

            item.querySelector('.widget-toggle').addEventListener('change', function () {
                WidgetEngine.setVisible(meta.id, this.checked);
            });
        });
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
        document.getElementById('btn-widgets')?.addEventListener('click', () => togglePanel('widgets-panel'));
        document.getElementById('btn-next-wallpaper')?.addEventListener('click', () => WallpaperEngine.nextWallpaper());
        document.getElementById('btn-shuffle')?.addEventListener('click', () => WallpaperEngine.shuffleWallpaper());
        document.getElementById('btn-focus-mode')?.addEventListener('click', toggleFocusMode);

        // Close buttons
        document.getElementById('settings-close')?.addEventListener('click', () => closePanel('settings-panel'));
        document.getElementById('gallery-close')?.addEventListener('click', () => closePanel('gallery-panel'));
        document.getElementById('widgets-close')?.addEventListener('click', () => closePanel('widgets-panel'));

        // Gallery tab filtering
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterGallery(btn.dataset.tab);
            });
        });

        buildWidgetPanel();
        setupKeyboard();
        setupUpload();
        setupBookmarkModal();
        setupPerformanceModeButtons();
        _startFPSDisplay();
        _initWallpaperIndicator();

        // Load bookmarks
        StorageManager.get('bookmarks').then(list => renderBookmarks(list || []));

    }

    return {
        init,
        toast,
        openPanel,
        closePanel,
        togglePanel,
        buildGallery,
        renderBookmarks,
        toggleFocusMode
    };
})();

window.UIController = UIController;
