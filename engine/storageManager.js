/* ═══════════════════════════════════════════════════════════════
   engine/storageManager.js
   Dual-layer storage:
     • chrome.storage.local  → settings & wallpaper metadata only
     • IndexedDB             → actual wallpaper Blob files
   No large data ever touches chrome.storage.
═══════════════════════════════════════════════════════════════ */

const StorageManager = (() => {

    /* ───────────────────────────────────────────────────────
       IndexedDB Constants
    ─────────────────────────────────────────────────────── */
    const IDB_NAME    = 'LiveScapeDB';
    const IDB_VERSION = 1;
    const IDB_STORE   = 'wallpaper_blobs';
    let _idb = null;

    /* ───────────────────────────────────────────────────────
       chrome.storage.local prefix
    ─────────────────────────────────────────────────────── */
    const PREFIX = 'ls_';
    const _cache   = {};
    const _listeners = {};

    /* ═══════════════════════════════════════════════════════
       SECTION A: IndexedDB (blob storage)
    ═══════════════════════════════════════════════════════ */

    /**
     * Open (or create) the IndexedDB database.
     * Must be called before any IDB operation.
     * @returns {Promise<IDBDatabase>}
     */
    function openDB() {
        if (_idb) return Promise.resolve(_idb);

        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };

            req.onsuccess = (e) => {
                _idb = e.target.result;
                _idb.onerror = (ev) =>                _idb.onclose = ()  => { _idb = null; };
                resolve(_idb);
            };

            req.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    /**
     * Save a Blob into IndexedDB.
     * @param {string} id
     * @param {Blob}   blob
     * @param {string} mimeType
     * @param {string} name
     * @returns {Promise<void>}
     */
    async function idbSave(id, blob, mimeType, name) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(IDB_STORE, 'readwrite');
            const req = tx.objectStore(IDB_STORE).put({ id, blob, mimeType, name, savedAt: Date.now() });
            req.onsuccess = () => resolve();
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    /**
     * Load a Blob from IndexedDB and return a revocable Object URL.
     * The caller is responsible for revoking the URL when done.
     * @param {string} id
     * @returns {Promise<string|null>}
     */
    async function idbLoadURL(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id);
            req.onsuccess = (e) => {
                const record = e.target.result;
                if (!record?.blob) { resolve(null); return; }
                try { resolve(URL.createObjectURL(record.blob)); }
                catch (err) { reject(err); }
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Delete a Blob record from IndexedDB.
     * @param {string} id
     */
    async function idbDelete(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(id);
            req.onsuccess = () => resolve();
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    /**
     * Check if a blob record exists in IndexedDB.
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async function idbExists(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).count(id);
            req.onsuccess = (e) => resolve(e.target.result > 0);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    /* ═══════════════════════════════════════════════════════
       SECTION B: chrome.storage.local (settings & metadata)
    ═══════════════════════════════════════════════════════ */

    /**
     * Get one or many keys from chrome.storage.local.
     * Results are cached in-memory for the session.
     * @param {string|string[]} keys
     * @returns {Promise<any>}
     */
    function get(keys) {
        const isArr    = Array.isArray(keys);
        const keyArr   = isArr ? keys : [keys];
        const prefixed = keyArr.map(k => PREFIX + k);

        return new Promise((resolve) => {
            chrome.storage.local.get(prefixed, (result) => {
                const out = {};
                keyArr.forEach(k => {
                    const val = result[PREFIX + k];
                    if (val !== undefined) _cache[k] = val;
                    out[k] = val !== undefined ? val : _cache[k];
                });
                resolve(isArr ? out : out[keys]);
            });
        });
    }

    /**
     * Write key/value pairs to chrome.storage.local.
     * Fires any registered listeners for changed keys.
     * @param {Object} data  — plain (un-prefixed) keys
     */
    function set(data) {
        const prefixed = {};
        Object.keys(data).forEach(k => {
            prefixed[PREFIX + k] = data[k];
            _cache[k] = data[k];
        });
        return new Promise((resolve) => {
            chrome.storage.local.set(prefixed, () => {
                if (chrome.runtime.lastError) {
                }
                Object.keys(data).forEach(k => {
                    (_listeners[k] || []).forEach(fn => fn(data[k]));
                });
                resolve();
            });
        });
    }

    /** Remove keys from chrome.storage.local */
    function remove(keys) {
        const keyArr   = Array.isArray(keys) ? keys : [keys];
        const prefixed = keyArr.map(k => PREFIX + k);
        keyArr.forEach(k => delete _cache[k]);
        return new Promise(resolve => chrome.storage.local.remove(prefixed, resolve));
    }

    /** Get a cached value synchronously (no I/O) */
    function getCached(key) { return _cache[key]; }

    /** Subscribe to storage key changes */
    function on(key, fn) {
        if (!_listeners[key]) _listeners[key] = [];
        _listeners[key].push(fn);
    }

    /** Unsubscribe */
    function off(key, fn) {
        if (_listeners[key]) _listeners[key] = _listeners[key].filter(f => f !== fn);
    }

    // Sync cache when storage changes externally (e.g. from popup)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        Object.keys(changes).forEach(k => {
            if (!k.startsWith(PREFIX)) return;
            const shortKey = k.slice(PREFIX.length);
            _cache[shortKey] = changes[k].newValue;
            (_listeners[shortKey] || []).forEach(fn => fn(changes[k].newValue));
        });
    });

    /* ═══════════════════════════════════════════════════════
       SECTION C: High-level wallpaper helpers
    ═══════════════════════════════════════════════════════ */

    /**
     * Save an uploaded File to IndexedDB and persist its metadata
     * to chrome.storage.local.
     *
     * Metadata shape:
     * {
     *   id:        string,    // e.g. "user_1710000000000"
     *   type:      string,    // "video" | "gif" | "image"
     *   mimeType:  string,    // file.type
     *   name:      string,    // display name
     *   storage:   "indexeddb",
     *   active:    boolean,
     *   addedAt:   number
     * }
     *
     * @param {File} file
     * @returns {Promise<Object>}  metadata object
     */
    async function saveWallpaper(file) {
        const id       = 'user_' + Date.now();
        const mimeType = file.type;

        let type = 'image';
        if (mimeType.startsWith('video/')) type = 'video';
        if (mimeType === 'image/gif')       type = 'gif';

        // 1. Store raw blob in IndexedDB
        await idbSave(id, file, mimeType, file.name);

        // 2. Persist metadata in chrome.storage.local
        const meta = {
            id,
            type,
            mimeType,
            name:    file.name.replace(/\.[^.]+$/, '') || 'My Wallpaper',
            storage: 'indexeddb',
            active:  false,
            addedAt: Date.now()
        };

        const list = await getWallpaperList();
        list.push(meta);
        // Hard cap at 30 custom wallpapers
        while (list.length > 30) {
            const removed = list.shift();
            await idbDelete(removed.id).catch(() => {});
        }
        await set({ wallpaper_list: list });

        return meta;
    }

    /**
     * Get the full list of user-uploaded wallpaper metadata.
     * @returns {Promise<Object[]>}
     */
    async function getWallpaperList() {
        return (await get('wallpaper_list')) || [];
    }

    /**
     * Delete a user wallpaper: removes blob from IDB and metadata from storage.
     * @param {string} id
     */
    async function deleteWallpaper(id) {
        await idbDelete(id).catch(() => {});
        const list = await getWallpaperList();
        await set({ wallpaper_list: list.filter(m => m.id !== id) });

        const activeId = await get('active_wallpaper_id');
        if (activeId === id) await set({ active_wallpaper_id: null });
    }

    /**
     * Mark a wallpaper as active (persists across sessions).
     * @param {string} id  — built-in ID or user-uploaded ID
     */
    async function setActiveWallpaper(id) {
        await set({ active_wallpaper_id: id });
    }

    /** @returns {Promise<string|null>} */
    async function getActiveWallpaperId() {
        return get('active_wallpaper_id');
    }

    /**
     * Load the active user wallpaper's Object URL.
     * Returns null if no user wallpaper is active.
     * @returns {Promise<{meta: Object, objectURL: string}|null>}
     */
    async function loadActiveUserWallpaper() {
        const id = await getActiveWallpaperId();
        if (!id || !id.startsWith('user_')) return null;

        const objectURL = await idbLoadURL(id).catch(() => null);
        if (!objectURL) return null;

        const list = await getWallpaperList();
        const meta = list.find(m => m.id === id) || { id, type: 'image', storage: 'indexeddb' };

        return { meta, objectURL };
    }

    /**
     * Bulk load all settings keys at startup.
     */
    async function loadSettings() {
        return get([
            'theme', 'blur', 'dim', 'parallax', 'particles_enabled',
            'pause_on_hidden', 'clock_24h', 'clock_style', 'temp_unit',
            'performance_mode', 'auto_rotation', 'rotation_interval',
            'active_wallpaper_id', 'wallpaper_list',
            'widgets', 'bookmarks', 'todos', 'notes',
            'weather_api_key', 'initialized'
        ]);
    }

    /* ═══════════════════════════════════════════════════════
       PUBLIC API
    ═══════════════════════════════════════════════════════ */
    return {
        // IndexedDB
        openDB,
        idbSave,
        idbLoadURL,
        idbDelete,
        idbExists,
        // chrome.storage.local
        get,
        set,
        remove,
        getCached,
        on,
        off,
        // Wallpaper helpers
        saveWallpaper,
        getWallpaperList,
        deleteWallpaper,
        setActiveWallpaper,
        getActiveWallpaperId,
        loadActiveUserWallpaper,
        // Settings
        loadSettings
    };
})();

window.StorageManager = StorageManager;
