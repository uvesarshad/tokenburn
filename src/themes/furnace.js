import { rng, mix } from '../canvas.js';
import { fmtTokens, fmtMoney } from '../format.js';
import { measure } from '../font.js';
import { W, H, header, brandStrip, levelFrac, activeLabel } from './shared.js';

const BG = ['#0d0710', '#1d0a18', '#3a0f1c', '#66161c'];
const FLAME = ['#4a0f14', '#8c1f14', '#c93a12', '#f06a17', '#ffa42a', '#ffd84a', '#fff4b0'];

export default {
  id: 'furnace',
  name: 'Furnace',
  description: 'A pixel bonfire that grows with every token you burn.',
  draw(cv, stats, ctx) {
    const rand = rng((stats.tokens % 1e9) | 0 || 7);
    const lv = levelFrac(stats);
    const cx = 118;
    const base = 59;
    const fh = 24 + Math.round(lv * 20); // flame height
    const fw = 14 + Math.round(lv * 8); // half width

    // Background: dark vignette with an ember glow around the fire.
    cv.dither(0, 0, W, H, BG, (x, y) => {
      const d = Math.hypot((x - cx) / 70, (y - base) / 55);
      const glow = Math.max(0, 1 - d) ** 1.6;
      return 0.04 + glow * (0.5 + lv * 0.5) + (y / H) * 0.12;
    });

    // Flame: heat field with a few flickering tongues.
    const ph = [rand() * 6, rand() * 6, rand() * 6];
    for (let y = base - fh - 4; y <= base; y++) {
      for (let x = cx - fw - 3; x <= cx + fw + 3; x++) {
        const nx = (x - cx) / fw;
        const ny = (base - y) / fh;
        const tongue =
          0.16 * Math.abs(Math.sin((x - cx) * 0.55 + ph[0])) +
          0.1 * Math.sin((x - cx) * 1.3 + ph[1]) +
          0.06 * Math.sin((x - cx) * 2.7 + ph[2]);
        const heat = (1 - Math.abs(nx) ** 1.6) * 1.05 - ny * 0.95 + tongue * 0.7 + 0.08;
        if (heat < 0.1) continue;
        const v = Math.min(1, (heat - 0.1) / 0.85);
        const idx = v * (FLAME.length - 1);
        const k = Math.floor(idx);
        const bayer = ((x & 3) * 4 + (y & 3)) / 16 + 1 / 32;
        cv.px(x, y, FLAME[Math.min(FLAME.length - 1, idx - k > bayer ? k + 1 : k)]);
      }
    }

    // Logs.
    const log = ['#4b2a17', '#6b3f22', '#8b5a2f'];
    cv.line(cx - fw - 1, base + 5, cx + fw - 5, base - 1, log[1]);
    cv.line(cx - fw - 1, base + 4, cx + fw - 5, base - 2, log[2]);
    cv.line(cx + fw + 1, base + 5, cx - fw + 5, base - 1, log[1]);
    cv.line(cx + fw + 1, base + 4, cx - fw + 5, base - 2, log[2]);
    cv.rect(cx - fw + 1, base + 2, fw * 2 - 1, 3, log[0]);
    cv.rect(cx - fw + 1, base + 2, fw * 2 - 1, 1, log[1]);

    // Sparks drifting upward.
    const sparks = 8 + Math.round(lv * 26);
    for (let i = 0; i < sparks; i++) {
      const sy = base - fh * (0.4 + rand() * 1.25);
      const sx = cx + (rand() - 0.5) * (fw * 2.4) * (1 + (base - sy) / 60);
      if (sy < 4 || sx > W - 2) continue;
      const t = (base - sy) / (fh * 1.7);
      cv.px(sx, sy, mix('#ffd84a', '#c93a12', Math.min(1, t)));
      if (rand() > 0.85) cv.px(sx, sy - 1, '#ff8a1f');
    }

    // Ground strip.
    cv.rect(0, 61, W, H - 61, '#0a050c');
    cv.rect(0, 61, W, 1, '#3a0f1c');

    // Text.
    header(cv, stats, { left: 'TOKENBURN', leftColor: '#ff8a1f', rightColor: '#d9a98c' });
    cv.text(fmtTokens(stats.tokens), 6, 14, {
      scale: 4,
      shadow: '#5a1414',
      rowColors: ['#fff4b0', '#ffe26a', '#ffcf3a', '#ffb02a', '#ff8f22', '#f77a1c', '#ee6618'],
    });
    cv.text('TOKENS BURNED', 6, 45, { color: '#e0a582' });
    const spend = ctx.showCost ? `${fmtMoney(stats.cost)} SPENT` : activeLabel(stats);
    cv.text(spend, 6, 53, { color: '#ffc23a' });

    const tag = ctx.name ? ctx.name : `★ ${stats.tier.name}`;
    cv.text(tag, W - 6, 66, { color: '#ff8a1f', align: 'right' });
    brandStrip(cv, stats, 6, 63, { size: 11, max: 3, gap: 5, color: '#f3d9c4', maxX: W - 12 - measure(tag) });
  },
};
