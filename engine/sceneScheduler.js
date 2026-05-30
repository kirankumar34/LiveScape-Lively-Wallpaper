/* ═══════════════════════════════════════════════════════════════
   engine/sceneScheduler.js  v2.0.0
   Time-of-Day Adaptive Wallpaper Scheduler.
   Divides the day into 5 scenes and transitions wallpapers
   automatically at scene boundaries.
═══════════════════════════════════════════════════════════════ */

const SceneScheduler = (() => {

    /* ───────────────────────────────────────────────────────
       SCENE DEFINITIONS
    ─────────────────────────────────────────────────────── */

    /** The five time-of-day scenes. startHour is inclusive, endHour is exclusive. */
    const SCENES = [
        { id: 'dawn',      label: 'Dawn',      emoji: '🌅', startHour:  5, endHour:  8, defaultWallpaper: 'builtin-aurora'  },
        { id: 'morning',   label: 'Morning',   emoji: '☀️', startHour:  8, endHour: 12, defaultWallpaper: 'builtin-sakura'  },
        { id: 'afternoon', label: 'Afternoon', emoji: '🌤️', startHour: 12, endHour: 17, defaultWallpaper: 'builtin-ocean'   },
        { id: 'dusk',      label: 'Dusk',      emoji: '🌆', startHour: 17, endHour: 20, defaultWallpaper: 'builtin-fire'    },
        { id: 'night',     label: 'Night',     emoji: '🌙', startHour: 20, endHour:  5, defaultWallpaper: 'builtin-stars'   },
    ];

    /* ───────────────────────────────────────────────────────
       STATE
    ─────────────────────────────────────────────────────── */
    let _enabled       = false;
    let _config        = { enabled: false, scenes: [] };  // persisted config
    let _tickInterval  = null;
    let _lastSceneId   = null;  // prevent re-applying same scene
    let _previewTimer  = null;  // for Preview button timeout
    let _previewBefore = null;  // wallpaper state before preview
    let _applyingSceneTransition = false; // flag to prevent override loops

    /* ───────────────────────────────────────────────────────
       INIT
    ─────────────────────────────────────────────────────── */

    /**
     * Initialise the scheduler. Loads config from storage, starts tick if enabled.
     */
    async function init() {
        try {
            await _loadConfig();

            // Set both toggle checkboxes based on loaded config
            const toggle = document.getElementById('scheduler-toggle');
            if (toggle) toggle.checked = _enabled;
            const settingsToggle = document.getElementById('settings-scheduler-toggle');
            if (settingsToggle) settingsToggle.checked = _enabled;

            if (_enabled) {
                _startTick();
                await _applyScene(getActiveScene(), true); // apply immediately
            }

            if (typeof WallpaperEngine !== 'undefined') {
                WallpaperEngine.on('change', (wp) => {
                    if (_applyingSceneTransition || _previewTimer) return;
                    
                    const activeScene = getActiveScene();
                    StorageManager.set({
                        scene_scheduler_override: {
                            sceneId: activeScene.id,
                            wallpaperId: wp.id
                        }
                    }).then(() => {
                        const statusEl = document.getElementById('scheduler-status');
                        if (statusEl && _enabled) {
                            statusEl.textContent = `${activeScene.emoji} ${activeScene.label} scene active (manual override)`;
                        }
                    });
                });
            }

            _updatePillVisibility();
            _buildSchedulerPanel();
        } catch (e) {
            if (typeof UIController !== 'undefined') UIController.toast('Scheduler init failed', 'error');
        }
    }

    /* ───────────────────────────────────────────────────────
       TICK — checks every 60s if scene changed
    ─────────────────────────────────────────────────────── */

    /** Start the 60-second scene-check interval. */
    function _startTick() {
        if (_tickInterval) clearInterval(_tickInterval);
        _tickInterval = setInterval(() => tick(), 60000);
    }

    /**
     * Checks whether the active scene has changed and applies it if so.
     * Called every 60 seconds.
     */
    function tick() {
        if (!_enabled) return;
        const scene = getActiveScene();
        if (scene.id !== _lastSceneId) {
            StorageManager.remove('scene_scheduler_override').then(() => {
                _applyScene(scene);
            });
        }
    }

    /* ───────────────────────────────────────────────────────
       SCENE DETECTION
    ─────────────────────────────────────────────────────── */

    /**
     * Returns the scene whose time window contains the current hour.
     * @returns {Object} scene definition
     */
    function getActiveScene() {
        const hour = new Date().getHours();
        for (const scene of SCENES) {
            if (scene.startHour < scene.endHour) {
                // e.g. 05–08
                if (hour >= scene.startHour && hour < scene.endHour) return scene;
            } else {
                // wraps midnight: e.g. 20–05
                if (hour >= scene.startHour || hour < scene.endHour) return scene;
            }
        }
        return SCENES[SCENES.length - 1]; // fallback: night
    }

    /* ───────────────────────────────────────────────────────
       APPLY SCENE (with crossfade)
    ─────────────────────────────────────────────────────── */

    /**
     * Apply a scene's configured wallpaper with a crossfade transition.
     * @param {Object} scene – scene definition from SCENES[]
     * @param {boolean} [immediate=false] – skip fade on first load
     */
    async function _applyScene(scene, immediate = false) {
        _lastSceneId = scene.id;

        // Check if there is an override for this scene
        const override = await StorageManager.get('scene_scheduler_override');
        let wallpaperId = null;

        if (override && override.sceneId === scene.id) {
            wallpaperId = override.wallpaperId;
        } else {
            await StorageManager.remove('scene_scheduler_override');
            const sceneConfig = _config.scenes.find(s => s.id === scene.id);
            wallpaperId = sceneConfig?.wallpaperId || scene.defaultWallpaper;
        }

        if (!wallpaperId || wallpaperId === 'manual') return;

        const wallpaper = typeof WallpaperEngine !== 'undefined'
            ? WallpaperEngine.findBuiltIn(wallpaperId)
            : null;

        _applyingSceneTransition = true;
        try {
            if (!wallpaper) {
                // Try user-uploaded wallpaper
                if (wallpaperId.startsWith('user_')) {
                    const objectURL = await StorageManager.idbLoadURL(wallpaperId);
                    const list = await StorageManager.getWallpaperList();
                    const meta = list.find(m => m.id === wallpaperId);
                    if (objectURL && meta) {
                        await _crossfadeWallpaper({ ...meta, objectURL }, immediate);
                    }
                }
            } else {
                await _crossfadeWallpaper(wallpaper, immediate);
            }
        } catch (e) {}
        _applyingSceneTransition = false;

        // Update active badge in panel
        _updateActiveCardBadge(scene.id);

        // Update status pill
        const statusEl = document.getElementById('scheduler-status');
        if (statusEl) {
            const isOverrideText = (override && override.sceneId === scene.id) ? ' (manual override)' : '';
            statusEl.textContent = `${scene.emoji} ${scene.label} scene active${isOverrideText}`;
            statusEl.className = 'scheduler-status active';
        }
    }

    /**
     * Crossfade: fade out → switch → fade in.
     * @param {Object} wallpaper – wallpaper object to apply
     * @param {boolean} immediate – skip animation
     */
    async function _crossfadeWallpaper(wallpaper, immediate = false) {
        if (typeof WallpaperEngine === 'undefined') return;

        const layer = document.getElementById('wallpaper-layer');
        if (!layer) return;

        if (immediate) {
            WallpaperEngine.setWallpaper(wallpaper);
            return;
        }

        // Fade out
        layer.classList.add('scene-crossfade');
        layer.style.opacity = '0';

        await _sleep(100); // let opacity transition start

        WallpaperEngine.setWallpaper(wallpaper);

        await _sleep(200); // brief wait for renderer to start

        // Fade back in
        layer.style.opacity = '1';

        setTimeout(() => {
            layer.classList.remove('scene-crossfade');
        }, 900);
    }

    /** Simple sleep utility. */
    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /* ───────────────────────────────────────────────────────
       CONFIG & PERSISTENCE
    ─────────────────────────────────────────────────────── */

    /**
     * Returns the current scheduler config.
     * @returns {{ enabled: boolean, scenes: Array }}
     */
    function getConfig() {
        return { ..._config };
    }

    /**
     * Assign a wallpaper to a scene.
     * @param {string} sceneId – e.g. 'dawn'
     * @param {string} wallpaperId – built-in ID or user ID or 'manual'
     */
    async function setSceneWallpaper(sceneId, wallpaperId) {
        const existing = _config.scenes.find(s => s.id === sceneId);
        if (existing) {
            existing.wallpaperId = wallpaperId;
        } else {
            _config.scenes.push({ id: sceneId, wallpaperId });
        }
        await _saveConfig();
    }

    /**
     * Enable the scheduler.
     */
    async function enable() {
        _enabled = true;
        _config.enabled = true;
        await _saveConfig();
        _startTick();
        _applyScene(getActiveScene());
        _updatePillVisibility();

        const toggle = document.getElementById('scheduler-toggle');
        if (toggle) toggle.checked = true;
        const settingsToggle = document.getElementById('settings-scheduler-toggle');
        if (settingsToggle) settingsToggle.checked = true;
    }

    /**
     * Disable the scheduler.
     */
    async function disable() {
        _enabled = false;
        _config.enabled = false;
        await _saveConfig();
        if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
        _lastSceneId = null;
        _updatePillVisibility();

        const toggle = document.getElementById('scheduler-toggle');
        if (toggle) toggle.checked = false;
        const settingsToggle = document.getElementById('settings-scheduler-toggle');
        if (settingsToggle) settingsToggle.checked = false;

        const statusEl = document.getElementById('scheduler-status');
        if (statusEl) {
            statusEl.textContent = 'Scheduler off';
            statusEl.className = 'scheduler-status';
        }
    }

    /**
     * Load persisted scheduler config from StorageManager.
     */
    async function _loadConfig() {
        try {
            const saved = await StorageManager.get('scene_scheduler');
            if (saved && typeof saved === 'object') {
                _config = saved;
                _enabled = !!_config.enabled;
            } else {
                // Default config: all scenes use their defaults
                _config = {
                    enabled: false,
                    scenes: SCENES.map(s => ({ id: s.id, wallpaperId: s.defaultWallpaper }))
                };
            }
        } catch (e) {
            _config = { enabled: false, scenes: [] };
        }
    }

    /**
     * Persist current config to StorageManager.
     */
    async function _saveConfig() {
        try {
            await StorageManager.set({ scene_scheduler: _config });
        } catch (e) {
            if (typeof UIController !== 'undefined') UIController.toast('Could not save scheduler config', 'error');
        }
    }

    /* ───────────────────────────────────────────────────────
       PANEL BUILDER
    ─────────────────────────────────────────────────────── */

    /**
     * Build/rebuild the scene-list in #panel-scheduler.
     * Called on init and whenever the wallpaper library changes.
     */
    function _buildSchedulerPanel() {
        const list = document.getElementById('scene-list');
        if (!list) return;
        list.innerHTML = '';

        const activeScene = getActiveScene();

        SCENES.forEach(scene => {
            const sceneConfig = _config.scenes.find(s => s.id === scene.id);
            const selectedWpId = sceneConfig?.wallpaperId || scene.defaultWallpaper;
            const isActive = scene.id === activeScene.id;

            const card = document.createElement('div');
            card.className = `scene-card${isActive ? ' active-scene' : ''}`;
            card.dataset.sceneId = scene.id;

            // Time label
            const timeLabel = scene.startHour < scene.endHour
                ? `${_pad(scene.startHour)}:00 – ${_pad(scene.endHour)}:00`
                : `${_pad(scene.startHour)}:00 – ${_pad(scene.endHour)}:00 (+1)`;

            card.innerHTML = `
                <div class="scene-card-header">
                    <span class="scene-card-title">${scene.emoji} ${scene.label}</span>
                    <div class="scene-card-header-right">
                        <span class="scene-card-time">${timeLabel}</span>
                        ${isActive ? '<span class="scene-active-badge">Active</span>' : ''}
                    </div>
                </div>
                <div class="scene-card-body">
                    <div class="scene-wallpaper-row">
                        <label class="scene-wallpaper-label" for="scene-select-${scene.id}">Wallpaper</label>
                        <select class="scene-wallpaper-select" id="scene-select-${scene.id}">
                            <option value="manual">— Manual (scheduler off for this slot)</option>
                            ${_buildWallpaperOptions(selectedWpId)}
                        </select>
                    </div>
                    <div class="scene-card-actions">
                        <button class="scene-btn scene-preview-btn" id="scene-preview-${scene.id}" title="Preview for 5 seconds">
                            Preview
                        </button>
                        <button class="scene-btn scene-apply-btn" id="scene-apply-${scene.id}" title="Apply scene wallpaper now">
                            Apply
                        </button>
                    </div>
                </div>
            `;

            list.appendChild(card);

            // Select change → persist and re-apply if active
            const select = card.querySelector(`#scene-select-${scene.id}`);
            if (select) {
                select.addEventListener('change', async () => {
                    await setSceneWallpaper(scene.id, select.value);
                    const activeScene = getActiveScene();
                    if (scene.id === activeScene.id && _enabled) {
                        await StorageManager.remove('scene_scheduler_override');
                        _applyScene(activeScene);
                    }
                });
            }

            // Preview button
            const previewBtn = card.querySelector(`#scene-preview-${scene.id}`);
            if (previewBtn) {
                previewBtn.addEventListener('click', () => _previewScene(scene));
            }

            // Apply button
            const applyBtn = card.querySelector(`#scene-apply-${scene.id}`);
            if (applyBtn) {
                applyBtn.addEventListener('click', async () => {
                    const sel = card.querySelector(`#scene-select-${scene.id}`);
                    if (sel) {
                        const val = sel.value;
                        if (val !== 'manual') {
                            await StorageManager.set({
                                scene_scheduler_override: {
                                    sceneId: scene.id,
                                    wallpaperId: val
                                }
                            });
                            await _applyScene(scene);
                            if (typeof UIController !== 'undefined') UIController.toast(`Applied ${scene.label} scene wallpaper`, 'success');
                        } else {
                            if (typeof UIController !== 'undefined') UIController.toast(`Cannot apply manual mode`, 'warning');
                        }
                    }
                });
            }
        });

        // Also append user wallpapers async
        _appendUserWallpaperOptions();
    }

    /**
     * Build <option> HTML string from the built-in library.
     * @param {string} selectedId
     * @returns {string}
     */
    function _buildWallpaperOptions(selectedId) {
        if (typeof WallpaperEngine === 'undefined') return '';
        return WallpaperEngine.getLibrary().map(wp => {
            const sel = wp.id === selectedId ? 'selected' : '';
            return `<option value="${wp.id}" ${sel}>${wp.name}</option>`;
        }).join('');
    }

    /**
     * Asynchronously add user-uploaded wallpapers to each scene select.
     */
    async function _appendUserWallpaperOptions() {
        if (typeof StorageManager === 'undefined') return;
        try {
            const list = await StorageManager.getWallpaperList();
            if (!list || !list.length) return;

            SCENES.forEach(scene => {
                const select = document.getElementById(`scene-select-${scene.id}`);
                if (!select) return;
                const sceneConfig = _config.scenes.find(s => s.id === scene.id);
                const selectedId = sceneConfig?.wallpaperId || scene.defaultWallpaper;

                list.forEach(meta => {
                    const opt = document.createElement('option');
                    opt.value = meta.id;
                    opt.textContent = `📁 ${meta.name}`;
                    if (meta.id === selectedId) opt.selected = true;
                    select.appendChild(opt);
                });
            });
        } catch (e) {}
    }

    /**
     * Update which scene card shows the "Active" badge.
     * @param {string} activeSceneId
     */
    function _updateActiveCardBadge(activeSceneId) {
        document.querySelectorAll('.scene-card').forEach(card => {
            const isActive = card.dataset.sceneId === activeSceneId;
            card.classList.toggle('active-scene', isActive);
            const badge = card.querySelector('.scene-active-badge');
            if (isActive && !badge) {
                const header = card.querySelector('.scene-card-header > div');
                if (header) {
                    const b = document.createElement('span');
                    b.className = 'scene-active-badge';
                    b.textContent = 'Active';
                    header.appendChild(b);
                }
            } else if (!isActive && badge) {
                badge.remove();
            }
        });
    }

    /* ───────────────────────────────────────────────────────
       PREVIEW
    ─────────────────────────────────────────────────────── */

    /**
     * Temporarily apply a scene's wallpaper for 5 seconds, then revert.
     * @param {Object} scene
     */
    async function _previewScene(scene) {
        if (_previewTimer) { clearTimeout(_previewTimer); _previewTimer = null; }

        // Save current wallpaper
        if (typeof WallpaperEngine !== 'undefined') {
            _previewBefore = WallpaperEngine.getCurrent();
        }

        await _applyScene(scene);
        if (typeof UIController !== 'undefined') UIController.toast(`Previewing ${scene.label} scene…`, 'info', 5000);

        _previewTimer = setTimeout(async () => {
            // Revert to saved wallpaper
            if (_previewBefore && typeof WallpaperEngine !== 'undefined') {
                let wp = WallpaperEngine.findBuiltIn(_previewBefore.id);
                if (!wp && _previewBefore.id.startsWith('user_')) {
                    // Custom wallpaper: reconstruct metadata
                    try {
                        const list = await StorageManager.getWallpaperList();
                        const meta = list.find(m => m.id === _previewBefore.id);
                        if (meta) {
                            wp = {
                                id: _previewBefore.id,
                                type: _previewBefore.type || meta.type,
                                name: meta.name || 'Custom',
                                config: {}
                            };
                        }
                    } catch (e) {}
                }
                if (wp) await _crossfadeWallpaper(wp);
            }
            _previewTimer = null;
        }, 5000);
    }

    /* ───────────────────────────────────────────────────────
       PILL STATUS INDICATOR
    ─────────────────────────────────────────────────────── */

    /** Show or hide the bottom-left 🕐 Auto scheduler pill. */
    function _updatePillVisibility() {
        const pill = document.getElementById('scheduler-pill');
        if (!pill) return;
        pill.classList.toggle('hidden', !_enabled);
    }

    /* ───────────────────────────────────────────────────────
       UTILITY
    ─────────────────────────────────────────────────────── */

    /** Zero-pad a number to 2 digits. */
    function _pad(n) { return String(n).padStart(2, '0'); }

    /* ───────────────────────────────────────────────────────
       PUBLIC API
    ─────────────────────────────────────────────────────── */
    return {
        SCENES,
        init,
        tick,
        getActiveScene,
        getConfig,
        setSceneWallpaper,
        enable,
        disable,
        buildSchedulerPanel: _buildSchedulerPanel
    };
})();

window.SceneScheduler = SceneScheduler;
