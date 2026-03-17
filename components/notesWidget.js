/* ═════════════════════════════════════════════════════════
   notesWidget.js
   Auto-save notes with debouncing + character count
═════════════════════════════════════════════════════════ */

const NotesWidget = (() => {
    let saveTimer = null;
    let unsavedChanges = false;

    function init() {
        const textarea = document.getElementById('notes-textarea');
        const indicator = document.getElementById('notes-save-indicator');
        if (!textarea) return;

        // Load saved notes
        StorageManager.get('notes').then(saved => {
            if (saved) textarea.value = saved;
        });

        // Auto-save
        textarea.addEventListener('input', () => {
            unsavedChanges = true;
            if (indicator) {
                indicator.textContent = 'Unsaved…';
                indicator.style.color = 'var(--clr-warning)';
            }

            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveNotes(textarea.value, indicator);
            }, 1200); // Debounce 1.2s
        });

        // Save on blur
        textarea.addEventListener('blur', () => {
            if (unsavedChanges) {
                if (saveTimer) clearTimeout(saveTimer);
                saveNotes(textarea.value, indicator);
            }
        });

        // Auto-resize textarea
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 400) + 'px';
        });

    }

    function saveNotes(value, indicator) {
        StorageManager.set({ notes: value }).then(() => {
            unsavedChanges = false;
            if (indicator) {
                indicator.textContent = 'Saved ✓';
                indicator.style.color = 'var(--clr-success)';
                setTimeout(() => {
                    indicator.style.opacity = '0.5';
                }, 2000);
            }
        });
    }

    return { init };
})();

window.NotesWidget = NotesWidget;
