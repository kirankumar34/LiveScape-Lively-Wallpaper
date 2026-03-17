# LiveScape – Live Wallpaper New Tab 🌌

> Transform your Chrome new tab into a stunning, high-performance live wallpaper engine and productivity dashboard.

LiveScape is a premium Chrome extension that replaces the default New Tab page with an adaptive, hardware-accelerated wallpaper environment. Designed with a strict focus on zero-CPU overhead, it leverages native HTML5 WebGL and Video compositor layers to handle high-resolution visual experiences smoothly across any hardware tier.

## ✨ Features

- **Live Wallpapers:** Native, hardware-accelerated playback for videos, GIFs, and dynamic interactive WebGL canvas effects (particles, auroras).
- **Pro Fit Modes:** Easily toggle wallpaper scale between `Contain` (Fit Screen), `Cover` (Fill Screen), or `Stretch` to adapt completely to any screen aspect ratio natively.
- **Glassmorphism UI Layer:** Beautiful, modern glass-like dashboard with adjustable blur, darkening, and auto-dimming settings.
- **Drag-and-Drop Widgets:** Fully customizable, percentage-based positional widget system avoiding CSS layout thrashing. Features Weather, Clock, Search, To-Do list, and Quotes.
- **Persistent Local Engine:** Employs dual-layer storage leveraging `IndexedDB` for high-capacity media retention and `chrome.storage.local` for instant state-synchronization.
- **Performance Manager:** Actively detects your hardware tier dynamically scaling rendering limits (capping framerates or downgrading playback rates) to keep your laptop battery safe and system snappy.

## 🚀 Installation (Developer Mode / Unpacked)

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/livescape-extension.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"** and select the `/livescape-extension` repository directory.
5. Open a new tab and enjoy your new dashboard!

## ⚙️ Tech Stack & Architecture

- **Core:** ES6+ Vanilla JavaScript, HTML5, CSS3 Grid/Flexbox
- **APIs:** Chrome Extensions API V3 (`chrome.storage`, `chrome.alarms`), IndexedDB (`idb`), Native Canvas/WebGL, HTML5 Video hardware decoder.
- **Architecture:** Strictly modular architecture separating concerns across `/engine` routines:
  - `wallpaperEngine.js` – Central Orchestrator
  - `widgetEngine.js` – Responsive Layout Manager
  - `performanceManager.js` – Hardware detection and frame throttling
  - `storageManager.js` – IndexedDB / API caching interface

## 🔮 Future Roadmap

- Additional WebGL shader routines (fluid simulation, real-time lighting).
- Pomodoro tracker and timeline focus features.
- System CPU/RAM overlay widget.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
