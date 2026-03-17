/* ═════════════════════════════════════════════════════════
   widgetManager.js
   Minimal responsive visibility toggle & layout manager
   (Rebuilt for strict Grid / GPU composited environment)
═════════════════════════════════════════════════════════ */

const WidgetManager = (() => {
    const widgets = {};

    function init() {
        document.querySelectorAll('.widget').forEach(el => {
            const id = el.dataset.widget;
            if (!id) return;
            widgets[id] = el;
            
            // Apply GPU compositing specifically
            el.style.transform = 'translateZ(0)';
        });

        loadVisibility();
        
        // Minimal CSS Resize Handler
        window.addEventListener("resize", () => {
            document.body.style.height = window.innerHeight + "px";
        });
        
        // Initialize body height once
        document.body.style.height = window.innerHeight + "px";
    }

    function loadVisibility() {
        StorageManager.get('widgets').then(widgetData => {
            if (!widgetData) return;
            Object.keys(widgetData).forEach(id => {
                const el = widgets[id];
                if (!el) return;
                
                // Read visibility states strictly
                if (widgetData[id].visible === false) {
                    el.style.display = 'none';
                }
            });
        });
    }

    /** Toggle widget visibility only */
    function setVisible(id, visible) {
        const el = widgets[id];
        if (!el) return;
        el.style.display = visible ? '' : 'none';

        StorageManager.get('widgets').then(data => {
            const wd = data || {};
            if (!wd[id]) wd[id] = {};
            wd[id].visible = visible;
            StorageManager.set({ widgets: wd });
        });
    }

    function getVisible(id) {
        const el = widgets[id];
        if (!el) return false;
        return el.style.display !== 'none';
    }

    function resetLayout() {
        Object.keys(widgets).forEach(id => {
            const el = widgets[id];
            if (!el) return;
            el.style.display = '';
        });
        StorageManager.set({ widgets: {} });
    }

    function getAllWidgets() { return widgets; }

    return { init, setVisible, getVisible, resetLayout, getAllWidgets };
})();

window.WidgetManager = WidgetManager;
