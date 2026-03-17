/* ═════════════════════════════════════════════════════════
   clockWidget.js
   Digital + analog clock, greeting, date display
═════════════════════════════════════════════════════════ */

const ClockWidget = (() => {
    let use24h = false;
    let style = 'digital';
    let tickRAF = null;
    let lastSecond = -1;

    function init(config = {}) {
        use24h = config.use24h || false;
        style = config.style || 'digital';

        applyStyle(style);
        tick();

        // 11. TAB VISIBILITY OPTIMIZATION
        PerformanceManager.on('pause', () => {
            if (tickRAF) clearTimeout(tickRAF);
        });
        PerformanceManager.on('resume', () => {
            tick();
        });

    }

    function applyStyle(s) {
        const digitalEl = document.querySelector('.clock-display');
        const analogEl = document.querySelector('.analog-clock');

        if (!digitalEl || !analogEl) return;

        switch (s) {
            case 'digital':
                digitalEl.style.display = 'flex';
                analogEl.style.display = 'none';
                break;
            case 'analog':
                digitalEl.style.display = 'none';
                analogEl.style.display = 'block';
                break;
            case 'both':
                digitalEl.style.display = 'flex';
                analogEl.style.display = 'block';
                break;
        }
    }

    function tick() {
        const now = new Date();
        const seconds = now.getSeconds();

        if (seconds !== lastSecond) {
            lastSecond = seconds;
            updateDigital(now);
            drawAnalog(now);
        }

        // Calculate ms until next perfect second boundary
        const msUntilNext = 1000 - now.getMilliseconds();
        tickRAF = setTimeout(tick, msUntilNext);
    }

    function updateDigital(now) {
        const timeEl = document.getElementById('clock-time');
        const dateEl = document.getElementById('clock-date');
        const greetEl = document.getElementById('clock-greeting');

        if (!timeEl) return;

        // Time
        const h = now.getHours();
        const m = now.getMinutes();
        const s = now.getSeconds();
        const hDisplay = use24h
            ? String(h).padStart(2, '0')
            : String(h % 12 || 12).padStart(2, '0');
        const ampm = use24h ? '' : (h < 12 ? ' AM' : ' PM');
        timeEl.textContent = `${hDisplay}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${ampm}`;

        // Date
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (dateEl) {
            dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
        }

        // Greeting
        if (greetEl) {
            const hour = now.getHours();
            let greeting = 'Good Night ✨';
            if (hour >= 5 && hour < 12) greeting = 'Good Morning ☀️';
            else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon 🌤️';
            else if (hour >= 17 && hour < 21) greeting = 'Good Evening 🌆';
            greetEl.textContent = greeting;
        }
    }

    function drawAnalog(now) {
        const canvas = document.getElementById('analog-clock');
        if (!canvas || canvas.style.display === 'none') return;

        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const r = cx - 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Clock face
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,10,30,0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Hour markers
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const innerR = i % 3 === 0 ? r - 14 : r - 8;
            const outerR = r - 3;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
            ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
            ctx.lineWidth = i % 3 === 0 ? 2.5 : 1;
            ctx.stroke();
            ctx.restore();
        }

        const h = now.getHours() % 12;
        const m = now.getMinutes();
        const s = now.getSeconds();

        // Hour hand
        drawHand(ctx, cx, cy,
            ((h + m / 60) / 12) * Math.PI * 2 - Math.PI / 2,
            r * 0.52, 4, 'rgba(255,255,255,0.95)');

        // Minute hand
        drawHand(ctx, cx, cy,
            ((m + s / 60) / 60) * Math.PI * 2 - Math.PI / 2,
            r * 0.72, 2.5, 'rgba(255,255,255,0.9)');

        // Second hand
        drawHand(ctx, cx, cy,
            (s / 60) * Math.PI * 2 - Math.PI / 2,
            r * 0.82, 1.5, '#6c63ff');

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#6c63ff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }

    function drawHand(ctx, cx, cy, angle, length, width, color) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(
            cx - Math.cos(angle) * length * 0.2,
            cy - Math.sin(angle) * length * 0.2
        );
        ctx.lineTo(
            cx + Math.cos(angle) * length,
            cy + Math.sin(angle) * length
        );
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.shadowBlur = color === '#6c63ff' ? 8 : 0;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.restore();
    }

    function setStyle(s) {
        style = s;
        applyStyle(s);
        StorageManager.set({ clock_style: s });
    }

    function set24h(enabled) {
        use24h = enabled;
        StorageManager.set({ clock_24h: enabled });
    }

    function destroy() {
        if (tickRAF) clearTimeout(tickRAF);
    }

    return { init, setStyle, set24h, destroy };
})();

window.ClockWidget = ClockWidget;
