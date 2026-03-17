/* ═════════════════════════════════════════════════════════
   todoWidget.js
   Full-featured to-do list with persistence, drag-to-reorder
═════════════════════════════════════════════════════════ */

const TodoWidget = (() => {
    let todos = [];

    function init() {
        const input = document.getElementById('todo-input');
        const addBtn = document.getElementById('todo-add-btn');
        const clearBtn = document.getElementById('todo-clear-btn');

        if (!input) return;

        // Load saved todos
        StorageManager.get('todos').then(saved => {
            todos = saved || getDefaultTodos();
            render();
        });

        // Add on Enter
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addTodo();
        });

        addBtn?.addEventListener('click', addTodo);
        clearBtn?.addEventListener('click', clearDone);

        // Quote of the day – also init here
        initQuote();

    }

    function getDefaultTodos() {
        return [
            { id: 1, text: 'Welcome to LiveScape Pro! 🎉', done: false },
            { id: 2, text: 'Set your wallpaper in Gallery', done: false },
            { id: 3, text: 'Configure weather API key', done: false },
        ];
    }

    function addTodo() {
        const input = document.getElementById('todo-input');
        const text = input.value.trim();
        if (!text) return;

        todos.unshift({
            id: Date.now(),
            text,
            done: false
        });
        input.value = '';
        save();
        render();
    }

    function toggleDone(id) {
        const todo = todos.find(t => t.id === id);
        if (todo) { todo.done = !todo.done; save(); render(); }
    }

    function deleteTodo(id) {
        todos = todos.filter(t => t.id !== id);
        save();
        render();
    }

    function clearDone() {
        todos = todos.filter(t => !t.done);
        save();
        render();
    }

    function save() {
        StorageManager.set({ todos });
    }

    function render() {
        const list = document.getElementById('todo-list');
        const count = document.getElementById('todo-count');
        if (!list) return;

        list.innerHTML = '';
        const pending = todos.filter(t => !t.done).length;
        if (count) count.textContent = pending;

        todos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.done ? 'done' : ''}`;

            li.innerHTML = `
        <button class="todo-check" title="${todo.done ? 'Uncheck' : 'Complete'}">
          ${todo.done ? `
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>` : ''}
        </button>
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        <button class="todo-delete" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      `;

            li.querySelector('.todo-check').addEventListener('click', () => toggleDone(todo.id));
            li.querySelector('.todo-delete').addEventListener('click', () => deleteTodo(todo.id));

            list.appendChild(li);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ─── Quote of the Day ─── */
    function initQuote() {
        const quoteText = document.getElementById('quote-text');
        const quoteAuthor = document.getElementById('quote-author');
        const refreshBtn = document.getElementById('quote-refresh');

        if (!quoteText) return;

        // Check cache
        StorageManager.get('quote_cache').then(cache => {
            const today = new Date().toDateString();
            if (cache && cache.date === today) {
                setQuote(cache.text, cache.author);
            } else {
                fetchQuote();
            }
        });

        refreshBtn?.addEventListener('click', () => fetchQuote(true));
    }

    async function fetchQuote(forceRefresh = false) {
        const FALLBACK_QUOTES = [
            { text: "The best way to predict the future is to create it.", author: "Abraham Lincoln" },
            { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
            { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
            { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
            { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
            { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
            { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
            { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
        ];

        try {
            const res = await fetch('https://api.quotable.io/random?maxLength=120');
            const data = await res.json();
            if (data && data.content) {
                const quote = { text: data.content, author: data.author };
                setQuoteWithAnimation(quote.text, quote.author);
                if (!forceRefresh) {
                    StorageManager.set({
                        quote_cache: { text: quote.text, author: quote.author, date: new Date().toDateString() }
                    });
                }
                return;
            }
        } catch (err) {
            // Fallback
        }

        // Fallback random quote
        const q = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
        setQuoteWithAnimation(q.text, q.author);
    }

    function setQuote(text, author) {
        const textEl = document.getElementById('quote-text');
        const authorEl = document.getElementById('quote-author');
        if (textEl) textEl.textContent = text;
        if (authorEl) authorEl.textContent = `— ${author}`;
    }

    function setQuoteWithAnimation(text, author) {
        const textEl = document.getElementById('quote-text');
        const authorEl = document.getElementById('quote-author');
        if (!textEl) return;

        textEl.classList.add('quote-fade-out');
        setTimeout(() => {
            textEl.textContent = text;
            if (authorEl) authorEl.textContent = `— ${author}`;
            textEl.classList.remove('quote-fade-out');
            textEl.classList.add('quote-fade-in');
            setTimeout(() => textEl.classList.remove('quote-fade-in'), 400);
        }, 300);
    }

    return { init };
})();

window.TodoWidget = TodoWidget;
