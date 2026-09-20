import { rng } from '../canvas.js';
import { fmtTokens, fmtMoney } from '../format.js';
import { measure } from '../font.js';
import { W, H, brandStrip, activeLabel, fit } from './shared.js';

const SKY = ['#06021a', '#100636', '#241058', '#4a1670', '#8a1f86'];
const HORIZON = 60;

export default {
  id: 'arcade',
  name: 'Arcade',
  description: 'A synthwave high-score screen. Insert coin, burn tokens.',
  draw(cv, stats, ctx) {
    const rand = rng((stats.tokens % 1e9) | 0 || 11);

    // Sky gradient + stars.
    cv.dither(0, 0, W, HORIZON, SKY, (x, y) => (y / HORIZON) ** 1.8);
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * (HORIZON - 14));
      cv.px(x, y, rand() > 0.8 ? '#ffffff' : '#7d6cc0');
    }

    // Striped sun sitting on the horizon.
    const sx = 72;
    const r = 27;
    for (let y = HORIZON - r; y < HORIZON; y++) {
      const t = (y - (HORIZON - r)) / r;
      const rowFromBottom = HORIZON - 1 - y;
      if (t > 0.5 && rowFromBottom % Math.max(3, Math.round(7 - t * 6)) === 0) continue; // sunset slats
      for (let x = sx - r; x <= sx + r; x++) {
        if (Math.hypot(x - sx, y - HORIZON) > r) continue;
        const bayer = ((x & 3) * 4 + (y & 3)) / 16;
        const pal = ['#ff5f9e', '#e63a9e', '#a92aa4', '#6b1f8c'];
        const f = t * (pal.length - 1);
        const k = Math.floor(f);
        cv.px(x, y, pal[Math.min(pal.length - 1, f - k > bayer ? k + 1 : k)]);
      }
    }

    // Perspective floor.
    cv.dither(0, HORIZON, W, H - HORIZON, ['#1c0a44', '#2a0e5e', '#170838'], (x, y) => 1 - (y / (H - HORIZON)) * 0.6);
    cv.rect(0, HORIZON, W, 1, '#ff4fc0');
    for (let k = 1; k <= 7; k++) {
      const y = HORIZON + Math.round((k * k) / 2.3);
      if (y < H) cv.rect(0, y, W, 1, '#b02aa0');
    }
    for (let i = -9; i <= 9; i++) {
      cv.line(sx, HORIZON, sx + i * 22, H + 6, '#8a2a9c');
    }

    // Big score with a chunky outline so it pops over the sun.
    const num = fmtTokens(stats.tokens);
    const opts = { scale: 4, align: 'center' };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      cv.text(num, sx + dx, 15 + dy, { ...opts, color: '#160a3a' });
    }
    cv.text(num, sx + 1, 15 + 1, { ...opts, color: '#ff2a8a' });
    cv.text(num, sx, 15, { ...opts, color: '#fdf6c8', rowColors: ['#ffffff', '#fffbe0', '#fff2a8', '#ffe45e', '#ffe45e', '#ffd23f', '#ffd23f'] });

    // Header: 1UP + handle on the left, period on the right (handle yields if they'd collide).
    const label = stats.period.label;
    cv.text('1UP', 6, 4, { color: '#ff4f6a' });
    cv.text(label, W - 6, 4, { color: '#8be9ff', align: 'right' });
    if (ctx.name && 6 + 24 + measure(ctx.name) + measure(label) + 8 < W) cv.text(ctx.name, 6 + 24, 4, { color: '#ffffff' });

    // Caption under the score.
    cv.text('TOKENS BURNED', sx, 46, { color: '#e8fbff', align: 'center', shadow: '#160a3a' });

    // Bottom panel: brands + spend.
    cv.rect(0, 62, W, H - 62, '#06021ab8');
    cv.rect(0, 62, W, 1, '#ff4fc0');
    const end = brandStrip(cv, stats, 6, 64, { size: 11, max: 3, gap: 6, color: '#ffffff', maxX: W - 40 });
    const right = ctx.showCost ? [`COST ${fmtMoney(stats.cost)}`, fmtMoney(stats.cost)] : [activeLabel(stats)];
    const costText = fit(right, W - 12 - end - 6);
    cv.text(costText, W - 6, 66, { color: '#ffd23f', align: 'right' });
  },
};
