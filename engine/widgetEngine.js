/* ═══════════════════════════════════════════════════════════════
   engine/widgetEngine.js
   Responsive Widget layout manager & drag-and-drop system.
═══════════════════════════════════════════════════════════════ */

const WidgetEngine = (() => {
    const widgets = {};
    let _dragData = null;

    function init() {
        const widgetLayer = document.getElementById("widget-layer");

        document.querySelectorAll('.widget').forEach(el => {
            const id = el.dataset.widget;
            if (!id) return;
            widgets[id] = el;
            
            if (widgetLayer) {
                widgetLayer.appendChild(el);
            }

            // Allow GPU optimization
            el.style.willChange = 'transform, left, top';
            _setupDrag(id, el);
        });

        loadLayout();
    }

    function _setupDrag(id, el) {
        const handle = el.querySelector('.widget-drag-handle');
        if (!handle) return;
        
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const rect = el.getBoundingClientRect();
            
            // Set initial inline position if not set
            if (!el.style.left) {
               el.style.left = `${rect.left}px`;
               el.style.top = `${rect.top}px`;
               el.style.transform = 'none';
            }

            _dragData = {
                id,
                el,
                startX: e.clientX,
                startY: e.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                startWidth: rect.width,
                startHeight: rect.height
            };
            
            el.classList.add('dragging');
            el.style.zIndex = 50;
            document.addEventListener('mousemove', _onDrag);
            document.addEventListener('mouseup', _onDragEnd);
        });
    }

    function _onDrag(e) {
        if (!_dragData) return;
        requestAnimationFrame(() => {
            if (!_dragData) return;
            const { el, startX, startY, startLeft, startTop, startWidth, startHeight } = _dragData;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            let newX = startLeft + dx;
            let newY = startTop + dy;
            
            // Clamp to viewport
            const maxW = window.innerWidth - startWidth;
            const maxH = window.innerHeight - startHeight;
            
            newX = Math.max(0, Math.min(newX, maxW));
            newY = Math.max(0, Math.min(newY, maxH));
            
            // Set as percentage
            const pctX = (newX / window.innerWidth) * 100;
            const pctY = (newY / window.innerHeight) * 100;
            
            el.style.left = `${pctX}vw`;
            el.style.top = `${pctY}vh`;
            el.style.transform = 'none';
        });
    }

    function _onDragEnd() {
        if (!_dragData) return;
        const { id, el } = _dragData;
        el.classList.remove('dragging');
        el.style.zIndex = '';
        
        const rect = el.getBoundingClientRect();
        const px = (rect.left / window.innerWidth) * 100;
        const py = (rect.top / window.innerHeight) * 100;
        
        _savePosition(id, px, py);
        
        document.removeEventListener('mousemove', _onDrag);
        document.removeEventListener('mouseup', _onDragEnd);
        _dragData = null;
    }

    function _savePosition(id, px, py) {
        StorageManager.get('widgetLayout').then(data => {
            const layout = data || {};
            layout[id] = { x: px, y: py };
            StorageManager.set({ widgetLayout: layout });
        });
    }

    function loadLayout() {
        StorageManager.get('widgetLayout').then(data => {
            if (!data) return;
            Object.keys(data).forEach(id => {
                const el = widgets[id];
                if (!el) return;
                
                const pos = data[id];
                if (pos && typeof pos.x === 'number') {
                    el.style.left = `${pos.x}vw`;
                    el.style.top = `${pos.y}vh`;
                    el.style.transform = 'none';
                }
            });
        });
        
        // Load visibility
        StorageManager.get('widgets').then(data => {
            if (!data) return;
            Object.keys(data).forEach(id => {
                const el = widgets[id];
                if (!el) return;
                if (data[id].visible === false) {
                    el.style.display = 'none';
                }
            });
        });
    }

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

    return { init, setVisible, getVisible };
})();

window.WidgetEngine = WidgetEngine;
