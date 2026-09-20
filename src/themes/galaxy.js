import { rng } from '../canvas.js';
import { logo } from '../logos.js';
import { fmtTokens, fmtMoney, fmtPct } from '../format.js';
import { W, H, header, levelFrac, activeLabel } from './shared.js';

const SPACE = ['#03051a', '#070c2e', '#101a4a', '#1a1f66'];
const SUN = ['#fffbe0', '#ffe884', '#ffb43a', '#ff7a1a', '#d94a12'];

export default {
  id: 'galaxy',
  name: 'Galaxy',
  description: 'Your burn as a star system: every AI you use is a planet. Kardashev-approved.',
  draw(cv, stats, ctx) {
    const rand = rng((stats.tokens % 1e9) | 0 || 5);
    const lv = levelFrac(stats);
    const cx = 106;
    const cy = 36;
    const r = 6 + Math.round(lv * 8);

    // Deep space with a soft nebula glow behind the star.
    cv.dither(0, 0, W, H, SPACE, (x, y) => {
      const d = Math.hypot((x - cx) / 62, (y - cy) / 44);
      const n = Math.hypot((x - 20) / 50, (y - 70) / 26);
      return 0.05 + Math.max(0, 1 - d) * 0.65 + Math.max(0, 1 - n) * 0.25;
    });
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * H);
      const b = rand();
      cv.px(x, y, b > 0.9 ? '#ffffff' : b > 0.55 ? '#9aa6e8' : '#4a5498');
      if (b > 0.97) {
        cv.px(x - 1, y, '#9aa6e8');
        cv.px(x + 1, y, '#9aa6e8');
        cv.px(x, y - 1, '#9aa6e8');
        cv.px(x, y + 1, '#9aa6e8');
      }
    }

    // Orbits (dotted ellipses) + planets, one per top brand.
    const planets = stats.brands.filter((b) => b.share >= 0.005).slice(0, 3);
    const angles = [-35, 35, 112];
    const labelBelow = [false, true, true];
    const rxs = [r + 13, r + 23, r + 32];
    const orbitCol = '#3a4694';
    rxs.slice(0, Math.max(planets.length, 1)).forEach((rx) => {
      const ry = rx * 0.4;
      for (let a = 0; a < 360; a += 3) {
        const x = cx + Math.cos((a * Math.PI) / 180) * rx;
        const y = cy + Math.sin((a * Math.PI) / 180) * ry;
        if (x > 66 && x < W - 1) cv.px(x, y, orbitCol);
      }
    });

    // The star, with a dithered corona.
    cv.dither(cx - r - 7, cy - r - 7, (r + 7) * 2 + 1, (r + 7) * 2 + 1, ['#12183e', '#5a2a3a', '#a4451a', '#ff7a1a'], (x, y) => {
      const d = Math.hypot(x - (r + 7), y - (r + 7));
      if (d <= r || d > r + 7) return null;
      return (1 - (d - r) / 7) ** 1.5 * 0.9;
    });
    cv.dither(cx - r, cy - r, r * 2 + 1, r * 2 + 1, SUN, (x, y) => {
      const d = Math.hypot(x - r, y - r);
      if (d > r) return null;
      return (d / r) ** 1.3;
    });

    planets.forEach((p, i) => {
      const rx = rxs[i];
      const a = (angles[i] * Math.PI) / 180;
      const px = Math.min(W - 16, Math.round(cx + Math.cos(a) * rx - 6));
      const py = Math.round(cy + Math.sin(a) * rx * 0.4 - 6);
      const sp = logo(p.brand, 12);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) cv.blitTint(sp, px + dx, py + dy, '#03051a');
      cv.blit(sp, px, py);
      cv.text(fmtPct(p.share), px + 6, labelBelow[i] ? py + 14 : py - 9, { color: '#c9d2ff', align: 'center', shadow: '#03051a' });
    });

    // Left column.
    header(cv, stats, { left: ctx.name || 'TOKENBURN', leftColor: '#ffb43a', rightColor: '#9aa6e8' });
    cv.text(fmtTokens(stats.tokens), 6, 15, {
      scale: 3,
      shadow: '#0d1440',
      rowColors: ['#ffffff', '#fff2b8', '#ffe27a', '#ffcf5a', '#ffb43a', '#ff9a2a', '#ff8a1f'],
    });
    cv.text('TOKENS BURNED', 6, 39, { color: '#9aa6e8' });
    const K = Math.log10(Math.max(10, stats.tokens)) / 10;
    cv.text('KARDASHEV', 6, 50, { color: '#6c7ac8' });
    cv.text(`TYPE ${K.toFixed(2)}`, 6, 58, { color: '#ffe27a' });
    cv.text(ctx.showCost ? fmtMoney(stats.cost) : activeLabel(stats), 6, 67, { color: '#7fe0c0' });
  },
};
