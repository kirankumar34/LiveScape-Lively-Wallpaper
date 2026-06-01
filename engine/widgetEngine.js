/* ═══════════════════════════════════════════════════════════════
   engine/widgetEngine.js  v2.0.0
   Responsive Widget layout manager & drag-and-drop system.
   v2 additions: per-widget config (scale, opacity, radius, font, locked)
═══════════════════════════════════════════════════════════════ */

const WidgetEngine = (() => {
    const widgets = {};
    let _dragData = null;
    let _resizeData = null; // tracking resize state
    let _globallyHidden = false;
    let _allLocked = false;
    let _layoutCache = {};
    let _saveLayoutTimer = null;

    /* ───────────────────────────────────────────────────────
       DEFAULT CONFIG
    ─────────────────────────────────────────────────────── */

    /** Default widget config values. */
    const DEFAULT_CONFIG = {
        visible:      true,
        scale:        1.0,
        opacity:      1.0,
        borderRadius: 16,
        fontSize:     1.0,
        locked:       false
    };

    /* ───────────────────────────────────────────────────────
       INIT
    ─────────────────────────────────────────────────────── */

    /* ───────────────────────────────────────────────────────
       RESPONSIVE ENGINE & BOUNDARY/COLLISION MANAGERS
    ─────────────────────────────────────────────────────── */

    const WidgetCollisionManager = (() => {
        function resolveCollisions(activeId) {
            const activeEl = widgets[activeId];
            if (!activeEl) return;

            const activeRect = activeEl.getBoundingClientRect();
            
            Object.keys(widgets).forEach(id => {
                if (id === activeId) return;
                const el = widgets[id];
                if (!el || el.style.display === 'none') return;
                
                const rect = el.getBoundingClientRect();
                
                // Check overlap
                const overlap = !(activeRect.right < rect.left || 
                                  activeRect.left > rect.right || 
                                  activeRect.bottom < rect.top || 
                                  activeRect.top > rect.bottom);
                
                if (overlap) {
                    const activeCenterX = activeRect.left + activeRect.width / 2;
                    const activeCenterY = activeRect.top + activeRect.height / 2;
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    let dx = centerX - activeCenterX;
                    let dy = centerY - activeCenterY;

                    if (dx === 0 && dy === 0) {
                        dx = Math.random() - 0.5;
                        dy = Math.random() - 0.5;
                    }

                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const pushX = (dx / distance) * 40;
                    const pushY = (dy / distance) * 40;

                    let currentX = rect.left;
                    let currentY = rect.top;

                    const transform = el.style.transform;
                    const match = transform && transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
                    if (match) {
                        currentX = parseFloat(match[1]);
                        currentY = parseFloat(match[2]);
                    }

                    let newX = currentX + pushX;
                    let newY = currentY + pushY;

                    const maxW = window.innerWidth - rect.width;
                    const maxH = window.innerHeight - rect.height;
                    newX = Math.max(10, Math.min(newX, maxW - 10));
                    newY = Math.max(10, Math.min(newY, maxH - 10));

                    const config = el._widgetConfig || DEFAULT_CONFIG;
                    el.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(${config.scale})`;

                    const pctX = (newX / window.innerWidth) * 100;
                    const pctY = (newY / window.innerHeight) * 100;
                    _savePosition(id, pctX, pctY);
                }
            });
        }
        return { resolveCollisions };
    })();

    const WidgetRecoveryManager = (() => {
        function checkAndRecover() {
            Object.keys(widgets).forEach(id => {
                const el = widgets[id];
                if (!el) return;
                const rect = el.getBoundingClientRect();
                
                const isOffscreen = rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight;
                if (isOffscreen && el.style.display !== 'none') {
                    const defaultPositions = {
                        clock:     { x: 10, y: 10 },
                        search:    { x: 30, y: 15 },
                        weather:   { x: 70, y: 10 },
                        todo:      { x: 10, y: 55 },
                        notes:     { x: 40, y: 55 },
                        bookmarks: { x: 70, y: 55 },
                        quote:     { x: 30, y: 80 }
                    };
                    const pos = defaultPositions[id] || { x: 40, y: 40 };
                    _savePosition(id, pos.x, pos.y);
                    
                    const config = el._widgetConfig || DEFAULT_CONFIG;
                    const x_px = (pos.x / 100) * window.innerWidth;
                    const y_px = (pos.y / 100) * window.innerHeight;
                    el.style.transform = `translate3d(${x_px}px, ${y_px}px, 0) scale(${config.scale})`;
                }
            });
        }
        return { checkAndRecover };
    })();

    function _getPercentagePosition(pos) {
        if (!pos) return { x: 50, y: 50 };
        let x = pos.x;
        let y = pos.y;
        if (typeof x === 'string' && x.endsWith('px')) {
            x = parseFloat(x);
            x = (x / window.innerWidth) * 100;
        } else if (typeof x === 'number' && x > 100) {
            x = (x / window.innerWidth) * 100;
        }
        if (typeof y === 'string' && y.endsWith('px')) {
            y = parseFloat(y);
            y = (y / window.innerHeight) * 100;
        } else if (typeof y === 'number' && y > 100) {
            y = (y / window.innerHeight) * 100;
        }
        return { x, y };
    }

    function refitWidgets() {
        StorageManager.get('widgetLayout').then(data => {
            const layout = data || {};
            Object.keys(widgets).forEach(id => {
                const el = widgets[id];
                if (!el) return;
                
                const config = el._widgetConfig || DEFAULT_CONFIG;
                
                let pctX = 10;
                let pctY = 10;
                
                if (layout[id]) {
                    const parsed = _getPercentagePosition(layout[id]);
                    pctX = parsed.x;
                    pctY = parsed.y;
                } else {
                    const rect = el.getBoundingClientRect();
                    pctX = (rect.left / window.innerWidth) * 100;
                    pctY = (rect.top / window.innerHeight) * 100;
                }

                let x = (pctX / 100) * window.innerWidth;
                let y = (pctY / 100) * window.innerHeight;

                const rect = el.getBoundingClientRect();
                const w = rect.width || el.offsetWidth || 200;
                const h = rect.height || el.offsetHeight || 150;

                const maxW = window.innerWidth - w;
                const maxH = window.innerHeight - h;

                x = Math.max(10, Math.min(x, maxW - 10));
                y = Math.max(10, Math.min(y, maxH - 10));

                const settingsPanel = document.getElementById('settings-panel');
                if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
                    const settingsRect = settingsPanel.getBoundingClientRect();
                    if (x + w > settingsRect.left && x < settingsRect.right && y + h > settingsRect.top && y < settingsRect.bottom) {
                        x = settingsRect.left - w - 20;
                    }
                }

                el.style.position = 'absolute';
                el.style.left = '0';
                el.style.top = '0';
                el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${config.scale})`;
            });
            WidgetRecoveryManager.checkAndRecover();
        });
    }

    function _throttle(fn, wait) {
        let time = Date.now();
        return function() {
            if ((time + wait - Date.now()) < 0) {
                fn();
                time = Date.now();
            }
        }
    }

    /* ───────────────────────────────────────────────────────
       INIT
    ─────────────────────────────────────────────────────── */

    async function init() {
        const widgetLayer = document.getElementById("widget-layer");

        document.querySelectorAll('.widget').forEach(el => {
            const id = el.dataset.widget;
            if (!id) return;
            widgets[id] = el;
            
            if (widgetLayer) {
                widgetLayer.appendChild(el);
            }

            el.style.willChange = 'transform';
            el.style.transformOrigin = 'top left';

            // Clear animation property on animationend to release CSS overrides
            el.addEventListener('animationend', () => {
                el.style.animation = 'none';
            }, { once: true });

            _setupDrag(id, el);
            _setupResize(id, el);
        });

        await loadAllConfigs();
        await loadLayout();
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(_throttle(refitWidgets, 100));
            resizeObserver.observe(document.body);
        } else {
            window.addEventListener('resize', _throttle(refitWidgets, 100));
        }
    }

    /* ───────────────────────────────────────────────────────
       DRAG & DROP (using GPU translate3d)
    ─────────────────────────────────────────────────────── */

    function _setupDrag(id, el) {
        const handle = el.querySelector('.widget-drag-handle');
        if (!handle) return;
        
        handle.addEventListener('pointerdown', (e) => {
            const config = widgets[id]?._widgetConfig;
            if (config?.locked || _allLocked) return;

            if (e.pointerType === 'mouse' && e.button !== 0) return;

            e.preventDefault();
            e.stopPropagation();
            
            try {
                handle.setPointerCapture(e.pointerId);
            } catch (err) {}

            const rect = el.getBoundingClientRect();
            let currentX = rect.left;
            let currentY = rect.top;

            const transform = el.style.transform;
            const match = transform && transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
            if (match) {
                currentX = parseFloat(match[1]);
                currentY = parseFloat(match[2]);
            }

            _dragData = {
                id,
                el,
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startLeft: currentX,
                startTop: currentY,
                startWidth: rect.width,
                startHeight: rect.height,
                currentX: currentX,
                currentY: currentY
            };
            
            el.classList.add('dragging');
            el.style.zIndex = 50;
        });

        handle.addEventListener('pointermove', (e) => {
            if (!_dragData || _dragData.id !== id || _dragData.pointerId !== e.pointerId) return;
            e.preventDefault();
            e.stopPropagation();

            requestAnimationFrame(() => {
                if (!_dragData || _dragData.id !== id) return;
                const { el, startX, startY, startLeft, startTop, startWidth, startHeight } = _dragData;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                let newX = startLeft + dx;
                let newY = startTop + dy;
                
                const maxW = Math.max(10, window.innerWidth - startWidth);
                const maxH = Math.max(10, window.innerHeight - startHeight);
                
                newX = Math.max(10, Math.min(newX, maxW - 10));
                newY = Math.max(10, Math.min(newY, maxH - 10));

                _dragData.currentX = newX;
                _dragData.currentY = newY;
                
                const config = el._widgetConfig || DEFAULT_CONFIG;
                el.style.transform = `translate3d(${newX}px, ${newY}px, 0) scale(${config.scale})`;
                WidgetCollisionManager.resolveCollisions(_dragData.id);
            });
        });

        const endDrag = (e) => {
            if (!_dragData || _dragData.id !== id || _dragData.pointerId !== e.pointerId) return;
            e.preventDefault();
            e.stopPropagation();

            try {
                handle.releasePointerCapture(e.pointerId);
            } catch (err) {}

            const { el } = _dragData;
            el.classList.remove('dragging');
            el.style.zIndex = '';
            
            const x = _dragData.currentX ?? _dragData.startLeft;
            const y = _dragData.currentY ?? _dragData.startTop;
            
            const pctX = (x / window.innerWidth) * 100;
            const pctY = (y / window.innerHeight) * 100;
            
            _savePosition(id, pctX, pctY);
            _dragData = null;
        };

        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);
    }

    function _savePosition(id, px, py) {
        _layoutCache[id] = { x: px, y: py };
        clearTimeout(_saveLayoutTimer);
        _saveLayoutTimer = setTimeout(() => {
            StorageManager.set({ widgetLayout: _layoutCache }).catch(() => {});
        }, 500);
    }

    function _setupResize(id, el) {
        const handle = el.querySelector('.widget-resize-handle');
        if (!handle) return;

        handle.addEventListener('pointerdown', (e) => {
            const config = widgets[id]?._widgetConfig;
            if (config?.locked || _allLocked) return;

            if (e.pointerType === 'mouse' && e.button !== 0) return;

            e.preventDefault();
            e.stopPropagation();

            try {
                handle.setPointerCapture(e.pointerId);
            } catch (err) {}

            const rect = el.getBoundingClientRect();
            const scale = config?.scale || 1.0;
            const startWidth = rect.width / scale;
            const startHeight = rect.height / scale;

            _resizeData = {
                id,
                el,
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                startWidth,
                startHeight,
                scale
            };

            el.classList.add('resizing');
        });

        handle.addEventListener('pointermove', (e) => {
            if (!_resizeData || _resizeData.id !== id || _resizeData.pointerId !== e.pointerId) return;
            e.preventDefault();
            e.stopPropagation();

            requestAnimationFrame(() => {
                if (!_resizeData || _resizeData.id !== id) return;
                const { el, startX, startY, startWidth, startHeight, scale } = _resizeData;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                const unscaledDx = dx / scale;
                const unscaledDy = dy / scale;

                let newW = startWidth + unscaledDx;
                let newH = startHeight + unscaledDy;

                newW = Math.max(180, Math.min(newW, window.innerWidth));
                newH = Math.max(100, Math.min(newH, window.innerHeight));

                el.style.width  = `${newW}px`;
                el.style.height = `${newH}px`;

                _resizeData.currentW = newW;
                _resizeData.currentH = newH;
            });
        });

        const endResize = (e) => {
            if (!_resizeData || _resizeData.id !== id || _resizeData.pointerId !== e.pointerId) return;
            e.preventDefault();
            e.stopPropagation();

            try {
                handle.releasePointerCapture(e.pointerId);
            } catch (err) {}

            const { el } = _resizeData;
            el.classList.remove('resizing');

            const w = _resizeData.currentW ?? _resizeData.startWidth;
            const h = _resizeData.currentH ?? _resizeData.startHeight;

            const config = el._widgetConfig || { ...DEFAULT_CONFIG };
            config.width = w;
            config.height = h;
            el._widgetConfig = config;

            saveConfig(id, config);
            _resizeData = null;
        };

        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
    }

    /* ───────────────────────────────────────────────────────
       LAYOUT
    ─────────────────────────────────────────────────────── */

    async function loadLayout() {
        try {
            const data = await StorageManager.get('widgetLayout');
            _layoutCache = data || {};
            const layout = _layoutCache;
            Object.keys(widgets).forEach(id => {
                const el = widgets[id];
                if (!el) return;
                
                const pos = layout[id];
                const config = el._widgetConfig || { ...DEFAULT_CONFIG };
                
                let pctX = 10;
                let pctY = 10;
                
                if (pos) {
                    const parsed = _getPercentagePosition(pos);
                    pctX = parsed.x;
                    pctY = parsed.y;
                } else {
                    const rect = el.getBoundingClientRect();
                    pctX = (rect.left / window.innerWidth) * 100;
                    pctY = (rect.top / window.innerHeight) * 100;
                }

                const x = (pctX / 100) * window.innerWidth;
                const y = (pctY / 100) * window.innerHeight;

                el.style.position = 'absolute';
                el.style.left = '0';
                el.style.top = '0';
                el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${config.scale})`;
            });
            WidgetRecoveryManager.checkAndRecover();
        } catch (e) {}
        
        try {
            const data = await StorageManager.get('widgets');
            if (data) {
                Object.keys(data).forEach(id => {
                    const el = widgets[id];
                    if (!el) return;
                    if (data[id].visible === false) {
                        el.style.display = 'none';
                      }
                });
            }
        } catch (e) {}
    }

    async function resetLayout() {
        await StorageManager.remove('widgetLayout');
        _layoutCache = {};
        Object.keys(widgets).forEach(id => {
            const el = widgets[id];
            if (!el) return;
            el.style.left = '';
            el.style.top = '';
            el.style.transform = '';
        });
        refitWidgets();
    }

    /* ───────────────────────────────────────────────────────
       VISIBILITY
    ─────────────────────────────────────────────────────── */

    function setVisible(id, visible) {
        const el = widgets[id];
        if (!el) return;
        el.style.display = visible ? '' : 'none';

        // Update config
        const config = el._widgetConfig || { ...DEFAULT_CONFIG };
        config.visible = visible;
        el._widgetConfig = config;
    }

    function getVisible(id) {
        const el = widgets[id];
        if (!el) return false;
        return el.style.display !== 'none';
    }

    /* ───────────────────────────────────────────────────────
       v2: PER-WIDGET CONFIG METHODS
    ─────────────────────────────────────────────────────── */

    /**
     * Apply a config object to a widget's DOM element.
     * Uses CSS custom properties for live preview without reflow.
     * @param {string} id – widget id
     * @param {Object} config – config object (scale, opacity, borderRadius, fontSize, locked, visible)
     */
    function applyConfig(id, config) {
        const el = widgets[id];
        if (!el) return;

        // Read all current values first (batch read)
        let scale   = config.scale   ?? DEFAULT_CONFIG.scale;
        let opacity = config.opacity ?? DEFAULT_CONFIG.opacity;
        let radius  = config.borderRadius ?? DEFAULT_CONFIG.borderRadius;
        let font    = config.fontSize ?? DEFAULT_CONFIG.fontSize;
        const visible = config.visible  ?? DEFAULT_CONFIG.visible;
        const locked  = config.locked   ?? DEFAULT_CONFIG.locked;
        const bgColor = config.bgColor  ?? DEFAULT_CONFIG.bgColor;
        const textColor = config.textColor ?? DEFAULT_CONFIG.textColor;
        const width   = config.width   ?? DEFAULT_CONFIG.width;
        const height  = config.height  ?? DEFAULT_CONFIG.height;

        // Validate and clamp NaN/Infinity values to default config
        if (typeof scale !== 'number' || isNaN(scale) || !isFinite(scale)) scale = DEFAULT_CONFIG.scale;
        if (typeof opacity !== 'number' || isNaN(opacity) || !isFinite(opacity)) opacity = DEFAULT_CONFIG.opacity;
        if (typeof radius !== 'number' || isNaN(radius) || !isFinite(radius)) radius = DEFAULT_CONFIG.borderRadius;
        if (typeof font !== 'number' || isNaN(font) || !isFinite(font)) font = DEFAULT_CONFIG.fontSize;

        // Convert hex to RGBA
        const hexToRgba = (hex, alpha) => {
            if (!hex || !hex.startsWith('#')) return '';
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // Batch write CSS
        el.style.setProperty('--w-scale',   scale);
        el.style.setProperty('--w-opacity', opacity);
        el.style.setProperty('--w-radius',  radius + 'px');
        
        let translateStr = '';
        const transform = el.style.transform;
        const match = transform && transform.match(/translate3d\(([^)]+)\)/);
        if (match) {
            translateStr = `translate3d(${match[1]}) `;
        }
        el.style.transform    = `${translateStr}scale(${scale})`;
        el.style.opacity      = opacity;
        el.style.borderRadius = radius + 'px';
        el.style.fontSize     = font + 'em';
        el.style.display      = visible ? '' : 'none';

        // Custom colors
        if (bgColor) {
            el.style.setProperty('background', hexToRgba(bgColor, 0.45), 'important');
            el.style.setProperty('border-color', hexToRgba(bgColor, 0.6), 'important');
        } else {
            el.style.removeProperty('background');
            el.style.removeProperty('border-color');
        }

        if (textColor) {
            el.style.setProperty('color', textColor, 'important');
        } else {
            el.style.removeProperty('color');
        }

        // Custom dimensions
        if (width > 0) {
            el.style.width = width + 'px';
        } else {
            el.style.removeProperty('width');
        }
        if (height > 0) {
            el.style.height = height + 'px';
        } else {
            el.style.removeProperty('height');
        }

        // Lock badge
        el.classList.toggle('is-locked', locked);
        const existingBadge = el.querySelector('.widget-lock-badge');
        if (locked && !existingBadge) {
            const badge = document.createElement('div');
            badge.className = 'widget-lock-badge';
            badge.textContent = '🔒';
            el.appendChild(badge);
        } else if (!locked && existingBadge) {
            existingBadge.remove();
        }

        // Store config reference on element for drag guard
        el._widgetConfig = { ...config };
    }

    function savePosition(id) {
        const el = widgets[id];
        if (!el) return;
        
        let x = el.style.left;
        let y = el.style.top;
        
        let pctX = 50;
        let pctY = 50;
        
        if (typeof x === 'string' && x.endsWith('px')) {
            const px = parseFloat(x);
            pctX = (px / window.innerWidth) * 100;
        } else if (typeof x === 'string' && x.endsWith('%')) {
            pctX = parseFloat(x);
        } else {
            const rect = el.getBoundingClientRect();
            pctX = (rect.left / window.innerWidth) * 100;
        }
        
        if (typeof y === 'string' && y.endsWith('px')) {
            const py = parseFloat(y);
            pctY = (py / window.innerHeight) * 100;
        } else if (typeof y === 'string' && y.endsWith('%')) {
            pctY = parseFloat(y);
        } else {
            const rect = el.getBoundingClientRect();
            pctY = (rect.top / window.innerHeight) * 100;
        }
        
        // Clamp between 0 and 100
        pctX = Math.max(0, Math.min(100, isNaN(pctX) ? 10 : pctX));
        pctY = Math.max(0, Math.min(100, isNaN(pctY) ? 10 : pctY));
        
        el.style.left = pctX + '%';
        el.style.top = pctY + '%';
        
        // Keep in px translation for active display
        const x_px = (pctX / 100) * window.innerWidth;
        const y_px = (pctY / 100) * window.innerHeight;
        const config = el._widgetConfig || DEFAULT_CONFIG;
        el.style.transform = `translate3d(${x_px}px, ${y_px}px, 0) scale(${config.scale})`;
        
        _savePosition(id, pctX, pctY);
    }

    /**
     * Save a widget's config to StorageManager.
     * @param {string} id – widget id
     * @param {Object} config – config object
     */
    async function saveConfig(id, config) {
        try {
            await StorageManager.set({ [`widget_config_${id}`]: config });
        } catch (e) {
            if (typeof UIController !== 'undefined') UIController.toast('Could not save widget setting', 'error');
        }
    }

    /**
     * Load all widget configs from storage and apply them.
     */
    async function loadAllConfigs() {
        const ids = Object.keys(widgets);
        const keys = ids.map(id => `widget_config_${id}`);
        try {
            const data = await StorageManager.get(keys);
            ids.forEach(id => {
                const config = (data && data[`widget_config_${id}`]) || { ...DEFAULT_CONFIG };
                applyConfig(id, config);
            });
        } catch (e) {}
    }

    /**
     * Reset a single widget to its default config.
     * @param {string} id – widget id
     */
    async function resetConfig(id) {
        const config = { ...DEFAULT_CONFIG };
        applyConfig(id, config);
        await saveConfig(id, config);
    }

    /**
     * Reset ALL widgets to their default configs.
     */
    async function resetAllConfigs() {
        for (const id of Object.keys(widgets)) {
            await resetConfig(id);
        }
    }

    /**
     * Lock or unlock a widget's drag handle.
     * @param {string} id – widget id
     * @param {boolean} locked
     */
    async function lockWidget(id, locked) {
        const el = widgets[id];
        if (!el) return;
        const config = el._widgetConfig || { ...DEFAULT_CONFIG };
        config.locked = locked;
        applyConfig(id, config);
        await saveConfig(id, config);
    }

    /* ───────────────────────────────────────────────────────
       GLOBAL VISIBILITY TOGGLE (H key)
    ─────────────────────────────────────────────────────── */

    /**
     * Toggle all widgets visible/hidden globally (H shortcut).
     */
    function toggleGlobalVisibility() {
        _globallyHidden = !_globallyHidden;
        document.getElementById('widget-layer')?.classList.toggle('widgets-globally-hidden', _globallyHidden);
        if (typeof UIController !== 'undefined') {
            UIController.toast(_globallyHidden ? 'All widgets hidden (H to show)' : 'Widgets visible', 'info', 1500);
        }
    }

    /**
     * Toggle lock on all widgets simultaneously (L shortcut).
     */
    function toggleGlobalLock() {
        _allLocked = !_allLocked;
        Object.keys(widgets).forEach(id => {
            const el = widgets[id];
            if (!el) return;
            el.classList.toggle('is-locked', _allLocked);
        });
        if (typeof UIController !== 'undefined') {
            UIController.toast(_allLocked ? '🔒 All widgets locked' : '🔓 All widgets unlocked', 'info', 1500);
        }
    }

    /* ───────────────────────────────────────────────────────
       LAYOUT EXPORT / IMPORT
    ─────────────────────────────────────────────────────── */

    /**
     * Export all widget positions and configs as a JSON string to clipboard.
     */
    async function exportLayout() {
        const ids = Object.keys(widgets);
        const layout = await StorageManager.get('widgetLayout') || {};
        const configs = {};
        for (const id of ids) {
            const c = await StorageManager.get(`widget_config_${id}`);
            configs[id] = c || { ...DEFAULT_CONFIG };
        }
        const exportData = { layout, configs, version: '2.0.0', exportedAt: new Date().toISOString() };
        try {
            await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
            if (typeof UIController !== 'undefined') UIController.toast('Layout copied to clipboard!', 'success');
        } catch (e) {
            if (typeof UIController !== 'undefined') UIController.toast('Could not copy to clipboard', 'error');
        }
    }

    /**
     * Import widget layout from a JSON string.
     * @param {string} jsonString
     */
    async function importLayout(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.layout) {
                _layoutCache = data.layout;
                await StorageManager.set({ widgetLayout: data.layout });
            }
            if (data.configs) {
                for (const id of Object.keys(data.configs)) {
                    const config = data.configs[id];
                    applyConfig(id, config);
                    await saveConfig(id, config);
                }
            }
            // Now load the imported layout correctly
            await loadLayout();
            
            if (typeof UIController !== 'undefined') UIController.toast('Layout imported!', 'success');
        } catch (e) {
            if (typeof UIController !== 'undefined') UIController.toast('Invalid layout JSON', 'error');
        }
    }

    /* ───────────────────────────────────────────────────────
       PUBLIC API
    ─────────────────────────────────────────────────────── */
    return {
        init,
        setVisible,
        getVisible,
        loadLayout,
        // v2 config methods
        applyConfig,
        saveConfig,
        loadAllConfigs,
        resetConfig,
        resetAllConfigs,
        lockWidget,
        savePosition,
        toggleGlobalVisibility,
        toggleGlobalLock,
        exportLayout,
        importLayout,
        getWidgets: () => widgets
    };
})();

window.WidgetEngine = WidgetEngine;
