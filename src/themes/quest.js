import { rng, mix } from '../canvas.js';
import { logo } from '../logos.js';
import { fmtTokens, fmtMoney, shortModel } from '../format.js';
import { measure } from '../font.js';
import { W, H } from './shared.js';

const CLASSES = {
  claude: 'SORCERER',
  openai: 'ALCHEMIST',
  gemini: 'ASTROMANCER',
  grok: 'ROGUE',
  cursor: 'ARCHER',
  copilot: 'PALADIN',
  deepseek: 'DIVER',
  qwen: 'MONK',
  kimi: 'BARD',
  glm: 'DRUID',
  mistral: 'WIND MAGE',
  meta: 'BEASTMASTER',
  minimax: 'ENGINEER',
  other: 'WANDERER',
};

export default {
  id: 'quest',
  name: 'Quest',
  description: 'An RPG character sheet: level, class, HP bars and your top moves.',
  draw(cv, stats, ctx) {
    const rand = rng((stats.tokens % 1e9) | 0 || 3);
    const top = stats.brands[0];
    const gold = '#f4c542';
    const goldDark = '#a9761c';

    // Parchment-dark card with a gold double border.
    cv.clear('#120d24');
    cv.dither(0, 0, W, H, ['#120d24', '#1d1440', '#2a1a5c'], (x, y) => 0.15 + ((x + y) % 2 === 0 ? 0.05 : 0) + (1 - y / H) * 0.25);
    cv.frame(0, 0, W, H, goldDark);
    cv.frame(2, 2, W - 4, H - 4, gold);
    cv.rect(0, 0, 3, 3, gold);
    cv.rect(W - 3, 0, 3, 3, gold);
    cv.rect(0, H - 3, 3, 3, gold);
    cv.rect(W - 3, H - 3, 3, 3, gold);

    // Title bar.
    const level = Math.min(99, Math.floor(Math.log2(stats.tokens + 1) * 1.5));
    const cls = CLASSES[top.brand] || 'WANDERER';
    cv.rect(5, 5, W - 10, 11, '#2b1d5e');
    cv.rect(5, 15, W - 10, 1, goldDark);
    cv.text(`LV ${level} ${cls}`, 8, 8, { color: gold });
    const titleRoom = W - 16 - measure(`LV ${level} ${cls}`) - 8;
    const when = [stats.period.label, stats.period.short].find((c) => measure(c) <= titleRoom);
    if (when) cv.text(when, W - 8, 8, { color: '#b7a8ff', align: 'right' });

    // Portrait.
    const px = 8;
    const py = 19;
    cv.rect(px - 1, py - 1, 36, 36, goldDark);
    cv.dither(px, py, 34, 34, ['#0d0820', '#1d1440', mix(top.color, '#0d0820', 0.55)], (x, y) => (y / 34) ** 1.3);
    for (let i = 0; i < 12; i++) cv.px(px + 1 + Math.floor(rand() * 32), py + 1 + Math.floor(rand() * 20), '#ffffff');
    const big = logo(top.brand, 24);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) cv.blitTint(big, px + 5 + dx, py + 5 + dy, '#0d0820');
    cv.blit(big, px + 5, py + 5);
    cv.text(ctx.name || top.name, px + 17, py + 38, { color: '#ffffff', align: 'center' });
    const sub = ctx.showCost ? fmtMoney(stats.cost) : shortModel(stats.models[0]?.model ?? '', 9);
    cv.text(sub, px + 17, py + 46, { color: gold, align: 'center' });

    // Big number + period.
    const bx = 50;
    cv.text(fmtTokens(stats.tokens), bx, 18, { scale: 3, shadow: '#0d0820', rowColors: ['#ffffff', '#ffffff', '#ffe27a', '#ffe27a', '#ffcf5a', '#ffcf5a', '#ffb43a'] });
    cv.text('TOKENS BURNED', bx, 41, { color: '#b7a8ff' });

    // Stat bars (log-scaled so a tiny share still shows).
    const scaleFrac = (v) => Math.max(0.04, Math.min(1, Math.log10(v + 1) / Math.log10(stats.tokens + 1)));
    const bars = [
      ['IN', stats.input, '#5ee08a'],
      ['OUT', stats.output, '#ff6a72'],
      ['CACHE', stats.cacheRead + stats.cacheWrite, '#6ea3ff'],
    ];
    bars.forEach(([label, v, col], i) => {
      const y = 50 + i * 8;
      const bw = 26;
      const fill = Math.max(1, Math.round(bw * scaleFrac(v)));
      cv.text(label, bx, y, { color: '#d9d2ff' });
      cv.rect(bx + 32, y + 1, bw, 5, '#0d0820');
      cv.rect(bx + 32, y + 1, fill, 5, col);
      cv.rect(bx + 32, y + 1, fill, 1, '#ffffff66');
      cv.text(fmtTokens(v), bx + 32 + bw + 4, y, { color: col });
    });
  },
};
