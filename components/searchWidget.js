/* ═════════════════════════════════════════════════════════
   searchWidget.js
   Multi-engine search with keyboard shortcuts and suggestions
═════════════════════════════════════════════════════════ */

const SearchWidget = (() => {
    let selectedEngine = 'google';

    const ENGINES = {
        google: { url: 'https://www.google.com/search?q=', name: 'Google' },
        bing: { url: 'https://www.bing.com/search?q=', name: 'Bing' },
        duckduckgo: { url: 'https://duckduckgo.com/?q=', name: 'DuckDuckGo' },
    };

    const QUICK_SUGGESTIONS = [
        { icon: '🌐', text: 'Open YouTube', url: 'https://youtube.com' },
        { icon: '📰', text: 'Open Reddit', url: 'https://reddit.com' },
        { icon: '🐙', text: 'Open GitHub', url: 'https://github.com' },
        { icon: '🗺️', text: 'Open Google Maps', url: 'https://maps.google.com' },
    ];

    function init() {
        const input = document.getElementById('search-input');
        const submitBtn = document.getElementById('search-btn');
        const suggests = document.getElementById('search-suggestions');

        if (!input || !submitBtn) return;

        // Engine switcher
        document.querySelectorAll('.engine-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedEngine = btn.dataset.engine;
                input.placeholder = `Search with ${ENGINES[selectedEngine].name}...`;
            });
        });

        // Submit
        submitBtn.addEventListener('click', () => doSearch(input.value.trim()));

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = input.value.trim();
                if (val) doSearch(val);
            }
            if (e.key === 'Escape') {
                suggests.classList.add('hidden');
                input.blur();
            }
        });

        // Show quick suggestions on focus (empty input)
        input.addEventListener('focus', () => {
            if (!input.value.trim()) showQuickSuggestions();
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.widget-search')) {
                suggests.classList.add('hidden');
            }
        });

        // Input handler
        input.addEventListener('input', () => {
            const val = input.value.trim();
            if (!val) {
                showQuickSuggestions();
            } else {
                suggests.classList.add('hidden');
            }
        });

    }

    function doSearch(query) {
        if (!query) return;

        // Check if it's a URL
        if (isURL(query)) {
            const url = query.startsWith('http') ? query : 'https://' + query;
            window.location.href = url;
            return;
        }

        const engine = ENGINES[selectedEngine] || ENGINES.google;
        window.location.href = engine.url + encodeURIComponent(query);
    }

    function isURL(str) {
        return /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/.test(str)
            && !str.includes(' ');
    }

    function showQuickSuggestions() {
        const suggests = document.getElementById('search-suggestions');
        if (!suggests) return;

        suggests.innerHTML = '';
        QUICK_SUGGESTIONS.forEach(s => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        <span>${s.icon} ${s.text}</span>
      `;
            item.addEventListener('click', () => {
                window.location.href = s.url;
            });
            suggests.appendChild(item);
        });

        suggests.classList.remove('hidden');
    }

    return { init };
})();

window.SearchWidget = SearchWidget;
