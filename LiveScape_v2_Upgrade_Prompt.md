# LiveScape v2.0.0 — Comprehensive Upgrade Prompt

> **Repository:** `kirankumar34/LiveScape-Lively-Wallpaper`
> **Scope:** Full version 2 upgrade — zero feature regressions, three major additions, one flagship new feature.
> **Execution mode:** Implement every change described below in a single, complete pass. Do not ask clarifying questions. Where a decision must be made, choose the most robust, user-friendly option and document it inline.

---

## 0. PRIME DIRECTIVE

You are upgrading the Chrome Extension **LiveScape** from v1.0.0 to **v2.0.0**.

The extension replaces Chrome's New Tab page with a hardware-accelerated live-wallpaper dashboard.
Its engine stack is:

```
StorageManager (IndexedDB + chrome.storage.local)
  └─ PerformanceManager (hardware tier detection, RAF throttling)
       └─ WallpaperEngine (orchestrator: canvas / video / gif / image / gradient)
            ├─ CanvasRenderer   (WebGL particle presets)
            └─ VideoRenderer    (HTML5 <video> element)
WidgetEngine (drag-and-drop, percentage-based layout)
  ├─ clockWidget.js
  ├─ weatherWidget.js
  ├─ searchWidget.js
  ├─ notesWidget.js
  └─ todoWidget.js
SettingsPanel  →  UIController  →  app.js (boot)
```

**Manifest Version:** 3. Keep it at MV3.
**Bump version** in `manifest.json` to `"2.0.0"`.

---

## 1. ABSOLUTE PRESERVATION RULES

Every feature from v1 must ship unchanged in v2. Do **not** remove, refactor away, or silently downgrade any of the following:

| Feature | Key files |
|---|---|
| Canvas wallpapers (stars, aurora, galaxy, neon, fire, snow, matrix, ocean, sakura, crystal) | `engine/canvasRenderer.js` |
| Video / GIF / image / gradient wallpaper types | `engine/videoRenderer.js`, `engine/wallpaperEngine.js` |
| Built-in wallpaper library (14 presets) | `engine/wallpaperEngine.js → LIBRARY[]` |
| User upload & IndexedDB persistence | `engine/storageManager.js` |
| Pro Fit Modes (Contain / Cover / Stretch) | `engine/videoRenderer.js`, settings panel |
| Glassmorphism overlay (blur slider, dim slider) | `css/main.css`, `settings/settingsPanel.js` |
| Drag-and-drop widget system with vw/vh positioning | `engine/widgetEngine.js` |
| Five widgets: Clock, Weather, Search, Notes, Todo | `components/*.js` |
| Analog clock canvas | `components/clockWidget.js` |
| Search engine switcher (Google / Bing / DuckDuckGo) | `components/searchWidget.js` |
| AI wallpaper generation via Pollinations.ai | (relevant JS section in `newtab.html` or `js/`) |
| 3D WebGL panel with speed slider & mouse interaction | (3D panel section) |
| Widget Manager Panel (visibility toggles) | `settings/settingsPanel.js` |
| Focus Mode (F-key, full-screen clean view) | `js/uiController.js` |
| Auto-rotation with configurable interval | `settings/settingsPanel.js` |
| Parallax mouse effect on wallpapers | `engine/wallpaperEngine.js` |
| Bookmarks widget | `newtab.html`, widget layer |
| Performance tiers (Battery Saver / Balanced / Ultra) | `engine/performanceManager.js` |
| Dark / Light theme | `settings/settingsPanel.js`, CSS vars |
| Toast notification system | `js/uiController.js` |
| `chrome.storage.local` settings sync | `engine/storageManager.js` |

Treat the list above as a regression test checklist. Every item must be present and functional in the final output.

---

## 2. ADDITION #1 — VIDEO AUDIO ENGINE

### 2.1 Objective
The video element in v1 is hardcoded as `muted`. Remove the mute, expose full audio controls, and integrate audio state into the persistence layer and the Performance Manager.

### 2.2 HTML changes (`newtab.html`)
- Remove the `muted` attribute from `<video id="video-wallpaper">`.
- Add an **audio HUD** (id `audio-hud`) as a sibling div inside `#wallpaper-layer`:

```html
<div id="audio-hud" class="audio-hud hidden">
  <button id="audio-mute-btn" class="audio-btn" title="Toggle Mute">
    <!-- SVG speaker icon, toggled by JS -->
  </button>
  <input type="range" id="audio-volume-slider" class="audio-volume-slider"
         min="0" max="100" value="50" step="1" />
  <span id="audio-volume-label" class="audio-volume-label">50%</span>
</div>
```

The HUD must auto-hide after 2 seconds of cursor inactivity and re-appear on mouse movement (identical behaviour to fullscreen video player overlays).

### 2.3 New file: `engine/audioEngine.js`

Create this file from scratch. It must:

```
AudioEngine
  ├─ init()           — connect to <video id="video-wallpaper">
  ├─ setVolume(0-1)   — sets video.volume, updates HUD label
  ├─ mute()           — video.muted = true, updates icon
  ├─ unmute()         — video.muted = false
  ├─ toggleMute()     — flips state
  ├─ getState()       — returns { volume, muted }
  ├─ loadState()      — reads from StorageManager on boot
  └─ _saveState()     — debounced write to StorageManager on every change
```

Implementation rules:
- Use the **Web Audio API** to create an `AudioContext` and a `GainNode` wired to the video's `MediaElementSourceNode`, giving a second-layer volume control independent of `video.volume` (necessary to avoid the Chrome autoplay policy clash). Only create the `AudioContext` after the **first user gesture** (click or keypress) to comply with Chrome's autoplay policy.
- On wallpaper type change (canvas, gradient — non-video), `AudioEngine.pause()` must silence and hide the HUD. On video type, `AudioEngine.resume()` restores state.
- Persist `{ audioVolume: float, audioMuted: bool }` via `StorageManager.set()`.
- Battery Saver performance tier must force mute (`AudioEngine.mute()`) automatically.

### 2.4 CSS (`css/main.css` or new `css/audio.css`)

```css
.audio-hud {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 8px 14px;
  transition: opacity 0.4s ease;
  z-index: 30;
}
.audio-hud.fading { opacity: 0; pointer-events: none; }
.audio-btn { background: none; border: none; color: #fff; cursor: pointer; }
.audio-volume-slider { width: 100px; accent-color: #a78bfa; }
.audio-volume-label { color: #fff; font-size: 12px; min-width: 32px; }
```

### 2.5 Settings Panel integration

In the **Settings → Appearance** section add a collapsible **"Audio"** row containing:
- Master volume slider (mirrors audio HUD)
- Mute toggle
- Checkbox: "Auto-mute on Battery Saver" (default: checked)

### 2.6 `manifest.json`

No new permissions are required (Web Audio API is not a Chrome permission). No changes needed here for audio.

---

## 3. ADDITION #2 — DEEP WIDGET CUSTOMISATION SYSTEM

### 3.1 Objective
Upgrade every widget from being merely draggable to being **fully configurable** — users can independently control visibility, scale, opacity, and (for select widgets) font size and border radius, all persisted.

### 3.2 Widget Config Schema

Each widget now has a config object stored under the key `widget_config_<id>` in `chrome.storage.local`:

```js
{
  visible:      true,          // boolean — show / hide
  scale:        1.0,           // float 0.5–2.0 (50%–200%)
  opacity:      1.0,           // float 0.1–1.0
  borderRadius: 16,            // px, 0–32
  fontSize:     1.0,           // em multiplier 0.7–1.4 (not all widgets)
  locked:       false          // bool — prevents accidental drag
}
```

### 3.3 `engine/widgetEngine.js` — additions

Add these methods to the existing IIFE:

```
applyConfig(id, config)  — applies scale/opacity/borderRadius/fontSize to DOM element
saveConfig(id, config)   — writes to StorageManager
loadAllConfigs()         — reads all configs on boot, calls applyConfig for each
resetConfig(id)          — resets one widget to defaults
resetAllConfigs()        — resets all widgets
lockWidget(id, bool)     — disables drag handle pointer events
```

Apply config via CSS custom properties on the widget element:

```js
el.style.setProperty('--w-scale',   config.scale);
el.style.setProperty('--w-opacity', config.opacity);
el.style.setProperty('--w-radius',  config.borderRadius + 'px');
el.style.fontSize = config.fontSize + 'em';
el.style.transform = `scale(var(--w-scale))`;
el.style.opacity   = `var(--w-opacity)`;
el.style.borderRadius = `var(--w-radius)`;
```

The transform chain must chain correctly with the existing drag translation. Use `transform-origin: top left` for predictable scaling anchoring.

### 3.4 Widget Manager Panel — deep customisation UI

Replace the existing simple toggle list in `#widgets-panel` with a full per-widget card UI:

Each card renders:

```
┌──────────────────────────────────────────────────┐
│  🕐 Clock                          [Eye] [Lock]  │
│  Scale   [▬▬▬▬▬●────]  100%                     │
│  Opacity [▬▬▬▬▬▬▬▬●──]   90%                   │
│  Radius  [▬▬▬●───────]   16px                   │
│  Font    [▬▬▬▬●──────]  1.0×   [Reset]          │
└──────────────────────────────────────────────────┘
```

Controls:
- **Eye icon button** — toggles `visible`. When hidden, the widget `display: none` and the eye icon changes to a "closed eye" SVG.
- **Lock icon button** — toggles `locked`. Locked widgets show a small lock badge and cannot be dragged.
- **Scale slider** — range `[0.5, 2.0]`, step `0.05`, live-preview on input.
- **Opacity slider** — range `[0.1, 1.0]`, step `0.05`, live-preview.
- **Radius slider** — range `[0, 32]`, step `1`, unit `px`.
- **Font slider** — range `[0.7, 1.4]`, step `0.05`, unit `×` (only for Clock, Weather, Search).
- **Reset button** — calls `WidgetEngine.resetConfig(id)` and resets all sliders.

At the bottom of the panel add:
- `[Reset All Widgets]` — resets positions AND configs for all widgets, calls `WidgetEngine.resetAllConfigs()`.
- `[Export Layout]` — copies a JSON string of all widget positions + configs to clipboard.
- `[Import Layout]` — accepts a pasted JSON string and applies it.

### 3.5 Keyboard shortcut additions

| Shortcut | Action |
|---|---|
| `W` | Open / close Widget Manager panel |
| `H` | Toggle all widget visibility at once (global hide / show) |
| `L` | Toggle lock-all-widgets |

These join the existing `F` (Focus Mode) shortcut. Update the keyboard hint tooltip if one exists.

### 3.6 CSS additions

```css
.widget-card {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.widget-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.widget-card-title { font-weight: 600; font-size: 14px; }
.widget-card-actions { display: flex; gap: 6px; }
.widget-icon-btn {
  background: rgba(255,255,255,0.08);
  border: none; border-radius: 8px;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #fff;
  transition: background 0.2s;
}
.widget-icon-btn:hover { background: rgba(255,255,255,0.18); }
.widget-icon-btn.active { background: rgba(167,139,250,0.3); color: #a78bfa; }
.widget-slider-row {
  display: grid;
  grid-template-columns: 70px 1fr 44px;
  align-items: center;
  gap: 10px;
  margin: 6px 0;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
```

---

## 4. ADDITION #3 (FLAGSHIP NEW FEATURE) — TIME-OF-DAY ADAPTIVE WALLPAPER SCHEDULER

### 4.1 Concept

LiveScape v2 introduces **Wallpaper Scenes** — a time-aware, automatic wallpaper scheduling system that silently transitions the wallpaper based on the real-world time of day, creating a living dashboard that evolves throughout the user's day.

The day is divided into **five scenes**:

| Scene | Time window | Default wallpaper suggestion |
|---|---|---|
| 🌅 Dawn | 05:00 – 08:00 | `builtin-aurora` |
| ☀️ Morning | 08:00 – 12:00 | `builtin-sakura` |
| 🌤️ Afternoon | 12:00 – 17:00 | `builtin-ocean` |
| 🌆 Dusk | 17:00 – 20:00 | `builtin-fire` |
| 🌙 Night | 20:00 – 05:00 | `builtin-stars` |

Users can assign **any wallpaper** (built-in or user-uploaded) to each scene, or leave it as "Manual" (scheduler is off for that slot).

### 4.2 New file: `engine/sceneScheduler.js`

```
SceneScheduler
  ├─ SCENES[]              — array of {id, label, emoji, startHour, endHour}
  ├─ init()                — loads config, starts the tick loop
  ├─ tick()                — called every 60 s via setInterval; checks if scene changed
  ├─ getActiveScene()      — returns current scene based on Date().getHours()
  ├─ getConfig()           — returns {enabled, scenes[{id, wallpaperId}]}
  ├─ setSceneWallpaper(sceneId, wallpaperId)  — updates config
  ├─ enable()              — sets {enabled: true}, persists, starts tick
  ├─ disable()             — sets {enabled: false}, clears interval
  └─ _applyScene(scene)    — calls WallpaperEngine.setWallpaper() with crossfade
```

Crossfade implementation:
- Before switching, set `#wallpaper-layer` `opacity: 0` with `transition: opacity 0.8s ease`.
- Call `WallpaperEngine.setWallpaper(wallpaper)`, then after 100 ms restore `opacity: 1`.

Persistence key: `scene_scheduler` in `chrome.storage.local`.

Conflict resolution: If the user manually selects a wallpaper while the scheduler is enabled, the scheduler respects the manual choice **for the current scene only** (it overrides the scene assignment for this occurrence, but does not permanently overwrite the config).

### 4.3 New Panel: `#panel-scheduler` in `newtab.html`

Add a new glass panel alongside the existing panels (settings, widgets, 3D, AI):

```html
<div id="panel-scheduler" class="glass-panel panel-scheduler hidden">
  <div class="panel-header">
    <h2 class="panel-title">🕐 Wallpaper Scheduler</h2>
    <button class="panel-close-btn" id="panel-scheduler-close"><!-- X SVG --></button>
  </div>

  <div class="scheduler-enable-row">
    <span class="settings-label">Enable Time-of-Day Scheduling</span>
    <label class="toggle-switch">
      <input type="checkbox" id="scheduler-toggle" />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <p class="panel-desc">Assign a wallpaper to each time window. LiveScape will transition automatically.</p>

  <div id="scene-list" class="scene-list">
    <!-- Populated by JS: one scene-card per SCENE -->
  </div>

  <div class="scheduler-footer">
    <span id="scheduler-status" class="scheduler-status">Scheduler off</span>
    <button id="scheduler-preview-btn" class="settings-btn settings-btn-ghost">
      Preview Scene
    </button>
  </div>
</div>
```

Each scene card (generated by JS):

```
┌──────────────────────────────────────────────────────────┐
│  🌅 Dawn        05:00 – 08:00        [Active badge]      │
│  Wallpaper:  [Aurora Borealis ▾]                         │
│  ──────────────────────────────────────────────────────  │
│  [ Preview ]                                             │
└──────────────────────────────────────────────────────────┘
```

The wallpaper dropdown must list all built-in presets AND user-uploaded wallpapers loaded from IndexedDB.

**"Active badge"** appears on the currently active scene card (the one whose time window contains `Date().getHours()`).

**"Preview" button** temporarily activates that scene's wallpaper for 5 seconds, then reverts.

### 4.4 Toolbar button

Add a `⏰` (or clock-with-arrows icon) toolbar button in the top control bar to open `#panel-scheduler`. Position it between the existing widget button and the 3D button.

### 4.5 Status indicator

When the scheduler is enabled, show a small pill badge `🕐 Auto` in the bottom-left corner of the screen (below the bottom control bar) indicating the scheduler is active. Clicking it opens the scheduler panel.

---

## 5. MANIFEST & PERMISSIONS

Update `manifest.json`:

```json
{
  "version": "2.0.0",
  "description": "Transform your Chrome new tab into a live wallpaper engine. v2: Audio, Deep Widget Customisation, Time-of-Day Scheduler.",
  "permissions": ["storage", "alarms", "tabs", "bookmarks"]
}
```

No new permissions are needed. The `alarms` permission already present covers the scheduler tick (as a fallback); prefer `setInterval` in the page for minute-level ticks since the newtab page is always open.

Add to `web_accessible_resources → resources`:
- `"engine/audioEngine.js"`
- `"engine/sceneScheduler.js"`

Add both scripts to `newtab.html` in the `<!-- Engine layer -->` script block, **before** `wallpaperEngine.js`:

```html
<script src="engine/audioEngine.js"></script>
<script src="engine/sceneScheduler.js"></script>
```

---

## 6. BOOT SEQUENCE CHANGES (`js/app.js`)

Update the `init()` function to add three new lines in the correct dependency order:

```js
// After WallpaperEngine.init():
AudioEngine.init();          // connects to <video>, restores volume state

// After WidgetEngine.init():
WidgetEngine.loadAllConfigs();  // restores per-widget scale/opacity/radius/font

// After all engines are ready:
SceneScheduler.init();       // loads scene config, starts tick if enabled
```

---

## 7. SETTINGS PANEL ADDITIONS (`settings/settingsPanel.js`)

### 7.1 Audio section (new, in Appearance tab)

```js
function setupAudio(settings) {
  const volumeSlider = document.getElementById('settings-volume-slider');
  const muteToggle   = document.getElementById('settings-mute-toggle');
  const autoBatterySaver = document.getElementById('audio-battery-saver-toggle');
  // Wire each to AudioEngine.*
}
```

Add the corresponding HTML rows to `settings/popup.html` (or wherever the settings panel HTML lives) under the Appearance section.

### 7.2 Scheduler section (new, in a dedicated "Scheduler" tab)

Add a tab button `⏰ Scheduler` to the settings tab bar. The tab body should be a mini version of the scheduler panel (enable toggle + quick overview of scene assignments) with a "Open Full Scheduler" link that opens `#panel-scheduler`.

### 7.3 Widget section (enhanced)

Replace the existing widget toggle-only section with a link: `"Open Widget Manager →"` that opens `#widgets-panel`. Remove the duplicated toggle controls from the settings panel — the Widget Manager panel is now the single source of truth.

---

## 8. STORAGE SCHEMA (additions only)

All new keys are additive — no existing keys are removed or renamed:

| Key | Type | Purpose |
|---|---|---|
| `audioVolume` | float | Master volume 0–1 |
| `audioMuted` | bool | Mute state |
| `audioBatterySaverMute` | bool | Auto-mute in battery saver |
| `widget_config_clock` | object | `{visible,scale,opacity,borderRadius,fontSize,locked}` |
| `widget_config_search` | object | Same schema |
| `widget_config_weather` | object | Same schema |
| `widget_config_notes` | object | Same schema |
| `widget_config_todo` | object | Same schema |
| `widget_config_bookmarks` | object | Same schema |
| `scene_scheduler` | object | `{enabled, scenes:[{id,wallpaperId}]}` |

Use `StorageManager.get()` / `StorageManager.set()` for all reads and writes — do not call `chrome.storage.local` directly from the new engines.

---

## 9. FILE CREATION SUMMARY

Create these **new files** (do not modify paths of existing files):

```
engine/audioEngine.js        ← full implementation per Section 2.3
engine/sceneScheduler.js     ← full implementation per Section 4.2
css/audio.css                ← audio HUD styles per Section 2.4
css/scheduler.css            ← scene card and panel styles
css/widgets_v2.css           ← widget-card and slider-row styles per Section 3.6
```

Link the three new CSS files in `newtab.html` `<head>`:

```html
<link rel="stylesheet" href="css/audio.css" />
<link rel="stylesheet" href="css/scheduler.css" />
<link rel="stylesheet" href="css/widgets_v2.css" />
```

**Modify** (do not recreate):
- `manifest.json` — version bump, resource list
- `newtab.html` — audio HUD, scheduler panel, new script tags, new CSS links
- `engine/widgetEngine.js` — add config methods
- `engine/wallpaperEngine.js` — expose crossfade helper for scheduler
- `engine/videoRenderer.js` — remove `muted` attribute programmatically
- `settings/settingsPanel.js` — audio section, scheduler section, widget section update
- `js/app.js` — boot sequence additions
- `js/uiController.js` — new keyboard shortcuts W / H / L

---

## 10. CODE QUALITY STANDARDS

Apply these standards to every line you write:

1. **No global variable pollution.** All new engines use the same IIFE + returned public API pattern as the existing codebase (e.g., `const AudioEngine = (() => { ... return { init, setVolume, ... }; })();`).

2. **Chrome Autoplay Policy compliance.** The `AudioContext` must only be created inside a user-gesture handler. Store a `_audioCtxCreated` flag and gate all Web Audio API calls behind it.

3. **Graceful degradation.** If `video.captureStream` or `AudioContext` is unavailable (non-Chromium), AudioEngine must silently fall back to direct `video.volume` control without crashing.

4. **No layout thrashing.** All widget config reads/writes inside `applyConfig()` must batch DOM reads before writes (read all properties in one pass, write in one pass).

5. **Debounced persistence.** Any slider's `input` event must debounce storage writes by 300 ms to prevent I/O flooding.

6. **Consistent error handling.** Wrap all `async` storage calls in `try/catch`. On failure, call `UIController.toast('Could not save setting', 'error')`.

7. **Comments.** Every new function must have a single-line JSDoc comment describing its purpose and parameters.

8. **CSS variables.** New colours must use the existing CSS variable palette (`--glass-bg`, `--accent`, `--text-primary`, etc.). Do not hardcode hex values that conflict with the dark/light theme switcher.

---

## 11. ACCEPTANCE CRITERIA

The upgrade is complete when all of the following are true:

- [ ] Opening a new tab shows the v1 UI identically — all widgets, wallpapers, settings work.
- [ ] Playing a video wallpaper produces audio; the audio HUD appears on mouse move and fades after 2 s idle.
- [ ] Volume slider and mute button in the HUD and in the Settings panel both control the same audio state.
- [ ] Audio state (volume + muted) persists across tab closes and reopens.
- [ ] Battery Saver mode forces audio mute.
- [ ] The Widget Manager panel now shows one card per widget with Scale, Opacity, Radius, and Font sliders.
- [ ] Moving any slider live-updates the widget on screen without a page reload.
- [ ] Widget configs persist across sessions.
- [ ] Lock toggle prevents dragging the widget.
- [ ] Export Layout copies valid JSON; Import Layout restores it correctly.
- [ ] The Scheduler panel opens via the ⏰ toolbar button.
- [ ] Each of the five scenes shows a wallpaper dropdown with all available wallpapers.
- [ ] Enabling the scheduler and waiting for a scene boundary (or using Preview) triggers a crossfade transition.
- [ ] The `🕐 Auto` pill appears in the bottom-left when the scheduler is on.
- [ ] Keyboard shortcuts W, H, L, and F all work.
- [ ] The manifest version reads `2.0.0` in `chrome://extensions/`.
- [ ] No console errors on page load.
- [ ] No regressions in any v1 feature.

---

## 12. SUGGESTED IMPLEMENTATION ORDER

Follow this order to minimise merge conflicts and testing surface:

1. `manifest.json` version bump and resource additions.
2. `engine/audioEngine.js` (new file, no dependencies on other changes).
3. `engine/videoRenderer.js` — remove `muted` programmatically.
4. `newtab.html` — add `<div id="audio-hud">`, link `css/audio.css`, add `<script src="engine/audioEngine.js">`.
5. `css/audio.css` — audio HUD styles.
6. `js/app.js` — `AudioEngine.init()` in boot.
7. `settings/settingsPanel.js` — audio section.
8. Test audio end-to-end.
9. `engine/widgetEngine.js` — add `applyConfig`, `saveConfig`, `loadAllConfigs`, `resetConfig`, `lockWidget`.
10. `css/widgets_v2.css` — widget card styles.
11. `newtab.html` — update `#widgets-panel` inner HTML template.
12. `js/uiController.js` — W, H, L keyboard shortcuts.
13. `js/app.js` — `WidgetEngine.loadAllConfigs()` in boot.
14. Test widget customisation end-to-end.
15. `engine/sceneScheduler.js` (new file).
16. `newtab.html` — add `#panel-scheduler`, scheduler toolbar button, scheduler status pill, link `css/scheduler.css`, add `<script src="engine/sceneScheduler.js">`.
17. `css/scheduler.css` — scene card and panel styles.
18. `js/app.js` — `SceneScheduler.init()` in boot.
19. Test scheduler end-to-end.
20. Full regression pass against the v1 acceptance list in Section 1.

---

*End of LiveScape v2.0.0 Upgrade Prompt.*
*Generate every file completely — no placeholders, no TODO comments in production code.*
