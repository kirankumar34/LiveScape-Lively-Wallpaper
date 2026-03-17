/**
 * generate-icons.js
 * Run this once with Node.js to generate icons:
 * node generate-icons.js
 * 
 * Uses only native Node.js Canvas API (canvas npm package)
 * Install: npm install canvas
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outputDir = path.join(__dirname, 'assets', 'icons');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

sizes.forEach(size => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, '#302b63');
    grd.addColorStop(0.5, '#1a1660');
    grd.addColorStop(1, '#0f0c29');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.22);
    ctx.fill();

    // Stars
    const starPositions = [
        [0.25, 0.25], [0.75, 0.25], [0.5, 0.15],
        [0.2, 0.6], [0.8, 0.7], [0.5, 0.5],
        [0.35, 0.8], [0.65, 0.4],
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    starPositions.forEach(([rx, ry]) => {
        const r = Math.max(0.8, size * 0.025);
        ctx.beginPath();
        ctx.arc(rx * size, ry * size, r, 0, Math.PI * 2);
        ctx.fill();
    });

    // Central glow
    const glowGrd = ctx.createRadialGradient(
        size / 2, size / 2, 0, size / 2, size / 2, size * 0.35
    );
    glowGrd.addColorStop(0, 'rgba(108,99,255,0.5)');
    glowGrd.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrd;
    ctx.fillRect(0, 0, size, size);

    // Save
    const buffer = canvas.toBuffer('image/png');
    const outPath = path.join(outputDir, `icon${size}.png`);
    fs.writeFileSync(outPath, buffer);
});

