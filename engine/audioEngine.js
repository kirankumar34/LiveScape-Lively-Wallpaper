/* ═══════════════════════════════════════════════════════════════
   engine/audioEngine.js  v2.0.0
   Audio control layer for video wallpapers.
   Uses Web Audio API (GainNode) on top of direct video.volume.
   Complies with Chrome's autoplay policy: AudioContext is only
   created on first user gesture.
═══════════════════════════════════════════════════════════════ */

const AudioEngine = (() => {

    /* ───────────────────────────────────────────────────────
       INTERNAL STATE
    ─────────────────────────────────────────────────────── */
    let _video          = null;  // <video> element reference
    let _audioCtx       = null;  // Web Audio API context
    let _gainNode       = null;  // GainNode for volume control
    let _sourceNode     = null;  // MediaElementSourceNode
    let _audioCtxReady  = false; // true after first user gesture
    let _volume         = 0.5;   // 0.0 – 1.0
    let _muted          = false; // mute state
    let _preMuteVolume  = 0.5;   // last non-zero volume
    let _hudVisible     = false; // whether HUD is currently shown
    let _hudTimer       = null;  // auto-hide timer
    let _saveTimer      = null;  // debounce timer for persistence
    let _batteryAutoMute = true; // auto-mute in battery saver
    let _hasUserGesture = false; // tracks if user interacted with the page

    const HUD_HIDE_DELAY = 2000; // ms

    /* ───────────────────────────────────────────────────────
       INIT
    ─────────────────────────────────────────────────────── */

    function _getActiveVideo() {
        const video = document.getElementById('wallpaper-video') || document.getElementById('video-wallpaper');
        if (!video) {
            _video = null;
            return null;
        }
        if (video !== _video) {
            _video = video;
            
            if (_audioCtxReady && _audioCtx && typeof _audioCtx.createMediaElementSource === 'function') {
                try {
                    _sourceNode = _audioCtx.createMediaElementSource(_video);
                    _gainNode = _audioCtx.createGain();
                    _gainNode.gain.value = _muted ? 0 : _volume;
                    _sourceNode.connect(_gainNode);
                    _gainNode.connect(_audioCtx.destination);
                } catch (e) {
                    console.warn("Web Audio API re-routing failed:", e);
                    _sourceNode = null;
                    _gainNode = null;
                    _audioCtxReady = false;
                }
            }
        }
        return _video;
    }

    /**
     * Initialise AudioEngine. Connects to the video wallpaper element,
     * loads persisted state, and sets up HUD + user gesture listeners.
     */
    async function init() {
        // Load persisted state
        await loadState();

        _getActiveVideo();

        // Setup HUD auto-hide on mouse move
        _setupHudAutoHide();

        // Create AudioContext on first user gesture
        ['click', 'keydown', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, _onFirstGesture, { once: true });
        });

        // Wire HUD controls
        _setupHudControls();

        // Watch performance tier changes (Battery Saver → force mute)
        if (typeof PerformanceManager !== 'undefined') {
            PerformanceManager.on('pause', (reason) => {
                if (reason === 'hidden' || reason === 'idle' || reason === 'blur') {
                    _getActiveVideo();
                    if (_video) {
                        _video.volume = 0;
                        _video.muted = true;
                        if (_audioCtxReady && _gainNode) {
                            _gainNode.gain.value = 0;
                        }
                    }
                }
            });
            PerformanceManager.on('resume', () => {
                _getActiveVideo();
                _applyToVideo();
            });
            PerformanceManager.on('tierChange', (profile) => {
                const isBattery = profile && (profile.tier === 'low' || profile.mode === 'battery');
                if (isBattery && _batteryAutoMute) {
                    mute();
                }
            });

            // Initial check for battery auto-mute on boot
            if (_batteryAutoMute) {
                const profile = PerformanceManager.getProfile();
                const isBattery = profile && (profile.tier === 'low' || profile.mode === 'battery');
                if (isBattery) {
                    mute();
                }
            }
        }
    }

    /* ───────────────────────────────────────────────────────
       WEB AUDIO API SETUP (deferred until user gesture)
    ─────────────────────────────────────────────────────── */

    /**
     * Called once after the first user gesture to create AudioContext
     * and wire the GainNode → video element.
     */
    function _onFirstGesture() {
        if (_hasUserGesture) return;
        _hasUserGesture = true;

        // Clean up gesture listeners
        ['click', 'keydown', 'touchstart'].forEach(evt => {
            document.removeEventListener(evt, _onFirstGesture);
        });

        _getActiveVideo();
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') {
                _audioCtx.resume().catch(() => {});
            }

            // Try captureStream / createMediaElementSource path
            if (typeof _audioCtx.createMediaElementSource === 'function' && _video) {
                try {
                    _sourceNode = _audioCtx.createMediaElementSource(_video);
                    _gainNode   = _audioCtx.createGain();
                    _gainNode.gain.value = _muted ? 0 : _volume;
                    _sourceNode.connect(_gainNode);
                    _gainNode.connect(_audioCtx.destination);
                    _audioCtxReady = true;
                } catch (e) {
                    console.warn("Web Audio API source creation failed:", e);
                    _sourceNode = null;
                    _gainNode = null;
                    _audioCtxReady = false;
                }
            }
        } catch (e) {
            console.warn("AudioContext initialization failed:", e);
            _sourceNode = null;
            _gainNode = null;
            _audioCtxReady = false;
        }

        // Apply current state to video directly as fallback
        _applyToVideo();
    }

    /* ───────────────────────────────────────────────────────
       VOLUME & MUTE
    ─────────────────────────────────────────────────────── */

    /**
     * Set the master volume.
     * @param {number} v – value between 0.0 and 1.0
     */
    function setVolume(v) {
        if (typeof v !== 'number' || isNaN(v)) return;
        const val = Math.max(0, Math.min(1, v));
        if (val > 0) {
            _preMuteVolume = val;
            _volume = val;
        } else {
            _volume = 0;
        }
        _getActiveVideo();
        _applyToVideo();
        _updateHudLabel();
        _syncSettingsPanel();
        _saveState();
    }

    /** Mute audio without changing stored volume. */
    function mute() {
        if (_volume > 0) {
            _preMuteVolume = _volume;
        }
        _muted = true;
        _getActiveVideo();
        _applyToVideo();
        _updateMuteIcon();
        _syncSettingsPanel();
        _saveState();
    }

    /** Restore audio from muted state. */
    function unmute() {
        _muted = false;
        if (_volume === 0) {
            _volume = _preMuteVolume || 0.5;
        }
        _getActiveVideo();
        _applyToVideo();
        _updateMuteIcon();
        _syncSettingsPanel();
        _saveState();
    }

    /** Toggle mute on/off. */
    function toggleMute() {
        if (_muted) unmute(); else mute();
    }

    /** Returns current audio state object. */
    function getState() {
        return { volume: _volume, muted: _muted };
    }

    /** Apply current volume + mute state to the video element and gain node. */
    function _applyToVideo() {
        if (!_video) return;
        if (_hasUserGesture) {
            _video.muted = _muted;
            _video.volume = _muted ? 0 : _volume;
            if (_audioCtxReady && _gainNode) {
                _gainNode.gain.value = _muted ? 0 : _volume;
            }
            if (_audioCtx && _audioCtx.state === 'suspended') {
                _audioCtx.resume().catch(() => {});
            }
        } else {
            // Force mute before user gesture to satisfy autoplay policy
            _video.volume = 0;
            _video.muted  = true;
        }
    }

    /* ───────────────────────────────────────────────────────
       PAUSE / RESUME (called when wallpaper type changes)
    ─────────────────────────────────────────────────────── */

    /** Silence and hide HUD when wallpaper is not video. */
    function pause() {
        if (_video) _video.volume = 0;
        const hud = document.getElementById('audio-hud');
        if (hud) {
            hud.classList.add('hidden');
            _hudVisible = false;
        }
    }

    /** Restore audio state when a video wallpaper resumes. */
    function resume() {
        _getActiveVideo();
        _applyToVideo();
        const hud = document.getElementById('audio-hud');
        if (hud) hud.classList.remove('hidden');
        _hudVisible = true;
    }

    /* ───────────────────────────────────────────────────────
       PERSISTENCE
    ─────────────────────────────────────────────────────── */

    /**
     * Load persisted audio state from StorageManager.
     */
    async function loadState() {
        try {
            const data = await StorageManager.get(['audioVolume', 'audioMuted', 'audioBatterySaverMute']);
            if (typeof data.audioVolume === 'number') _volume = data.audioVolume;
            if (typeof data.audioMuted  === 'boolean') _muted = data.audioMuted;
            if (typeof data.audioBatterySaverMute === 'boolean') _batteryAutoMute = data.audioBatterySaverMute;
            _applyToVideo();
            _updateHudLabel();
            _updateMuteIcon();
            _syncSettingsPanel();
        } catch (e) {
            if (typeof UIController !== 'undefined') UIController.toast('Could not load audio settings', 'error');
        }
    }

    /**
     * Debounced write of audio state to StorageManager.
     */
    function _saveState() {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(async () => {
            try {
                await StorageManager.set({
                    audioVolume: _volume,
                    audioMuted:  _muted,
                    audioBatterySaverMute: _batteryAutoMute
                });
            } catch (e) {
                if (typeof UIController !== 'undefined') UIController.toast('Could not save audio setting', 'error');
            }
        }, 300);
    }

    /* ───────────────────────────────────────────────────────
       HUD AUTO-HIDE
    ─────────────────────────────────────────────────────── */

    /** Setup mouse-move listener to show/hide the audio HUD. */
    function _setupHudAutoHide() {
        document.addEventListener('mousemove', () => {
            const hud = document.getElementById('audio-hud');
            if (!hud) return;

            // Only show HUD if we have a video wallpaper active
            if (!_isVideoActive()) return;

            hud.classList.remove('hidden', 'fading');
            _hudVisible = true;

            clearTimeout(_hudTimer);
            _hudTimer = setTimeout(() => {
                hud.classList.add('fading');
                setTimeout(() => {
                    if (hud.classList.contains('fading')) {
                        hud.classList.add('hidden');
                        hud.classList.remove('fading');
                        _hudVisible = false;
                    }
                }, 400);
            }, HUD_HIDE_DELAY);
        });
    }

    /** Check if the current wallpaper is a video type. */
    function _isVideoActive() {
        if (typeof WallpaperEngine === 'undefined') return false;
        const cur = WallpaperEngine.getCurrent();
        return cur && cur.type === 'video';
    }

    /* ───────────────────────────────────────────────────────
       HUD CONTROLS WIRING
    ─────────────────────────────────────────────────────── */

    function _updateSliderProgress(slider) {
        if (!slider) return;
        const val = slider.value;
        const min = slider.min || 0;
        const max = slider.max || 100;
        const percent = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right, var(--clr-accent, #6c63ff) 0%, var(--clr-accent, #6c63ff) ${percent}%, rgba(255, 255, 255, 0.15) ${percent}%, rgba(255, 255, 255, 0.15) 100%)`;
    }

    /** Wire up the audio HUD mute button and volume slider. */
    function _setupHudControls() {
        const muteBtn     = document.getElementById('audio-mute-btn');
        const volSlider   = document.getElementById('audio-volume-slider');
        const volLabel    = document.getElementById('audio-volume-label');

        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                // Create AudioContext on first click (user gesture)
                _onFirstGesture();
                toggleMute();
            });
        }

        if (volSlider) {
            volSlider.value = Math.round(_volume * 100);
            _updateSliderProgress(volSlider);
            volSlider.addEventListener('input', () => {
                _onFirstGesture();
                const v = parseInt(volSlider.value) / 100;
                setVolume(v);
                if (volLabel) volLabel.textContent = `${Math.round(v * 100)}%`;
                _updateSliderProgress(volSlider);
            });
        }
    }

    /* ───────────────────────────────────────────────────────
       HUD UI UPDATES
     ─────────────────────────────────────────────────────── */

    /** Update the HUD volume label and slider to reflect current state. */
    function _updateHudLabel() {
        const slider = document.getElementById('audio-volume-slider');
        const label  = document.getElementById('audio-volume-label');
        if (slider) {
            slider.value = Math.round(_volume * 100);
            _updateSliderProgress(slider);
        }
        if (label)  label.textContent = `${Math.round(_volume * 100)}%`;
    }

    /** Update the mute button icon based on current mute state. */
    function _updateMuteIcon() {
        const btn = document.getElementById('audio-mute-btn');
        if (!btn) return;
        if (_muted || _volume === 0) {
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
            </svg>`;
            btn.title = 'Unmute';
        } else if (_volume < 0.5) {
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>`;
            btn.title = 'Mute';
        } else {
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>`;
            btn.title = 'Mute';
        }
    }

    /* ───────────────────────────────────────────────────────
       SETTINGS PANEL SYNC
     ─────────────────────────────────────────────────────── */

    /** Sync settings panel controls to match current audio state. */
    function _syncSettingsPanel() {
        const muteToggle = document.getElementById('settings-mute-toggle');
        const volSlider  = document.getElementById('settings-volume-slider');
        if (muteToggle) muteToggle.checked = _muted;
        if (volSlider) {
            volSlider.value = Math.round(_volume * 100);
            _updateSliderProgress(volSlider);
        }
    }

    /**
     * Called by settingsPanel to wire up settings-panel audio controls.
     * @param {Object} settings – loaded settings object
     */
    function setupSettingsControls(settings) {
        const volumeSlider     = document.getElementById('settings-volume-slider');
        const muteToggle       = document.getElementById('settings-mute-toggle');
        const batteryMuteCheck = document.getElementById('audio-battery-saver-toggle');

        if (volumeSlider) {
            volumeSlider.value = Math.round(_volume * 100);
            _updateSliderProgress(volumeSlider);
            volumeSlider.addEventListener('input', () => {
                _onFirstGesture();
                setVolume(parseInt(volumeSlider.value) / 100);
                _updateSliderProgress(volumeSlider);
                // mirror to HUD
                _updateHudLabel();
            });
        }

        if (muteToggle) {
            muteToggle.checked = _muted;
            muteToggle.addEventListener('change', () => {
                if (muteToggle.checked) mute(); else unmute();
                _updateMuteIcon();
            });
        }

        if (batteryMuteCheck) {
            batteryMuteCheck.checked = _batteryAutoMute;
            batteryMuteCheck.addEventListener('change', () => {
                _batteryAutoMute = batteryMuteCheck.checked;
                _saveState();
            });
        }
    }

    /* ───────────────────────────────────────────────────────
       PUBLIC API
    ─────────────────────────────────────────────────────── */
    return {
        init,
        setVolume,
        mute,
        unmute,
        toggleMute,
        getState,
        loadState,
        pause,
        resume,
        setupSettingsControls
    };
})();

window.AudioEngine = AudioEngine;
