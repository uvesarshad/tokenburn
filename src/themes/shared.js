import { logo } from '../logos.js';
import { measure } from '../font.js';
import { fmtPct } from '../format.js';

export const W = 144;
export const H = 76;

/** Top bar: brand/handle on the left, period on the right. Drops the left text if they'd collide. */
export function header(cv, stats, { y = 4, left, leftColor, rightColor, shadow = null }) {
  const right = stats.period.label;
  const rw = measure(right);
  cv.text(right, W - 6, y, { color: rightColor, align: 'right', shadow });
  if (left && measure(left) + rw + 10 < W - 12) cv.text(left, 6, y, { color: leftColor, shadow });
}

/**
 * Row of brand logos with their share of the burn, e.g. [logo] 72%.
 * Returns the x where it ended so callers can place things after it.
 */
export function brandStrip(cv, stats, x, y, { size = 12, max = 3, gap = 6, color = '#ffffff', minShare = 0.005, outline = null, maxX = W } = {}) {
  let cx = x;
  const items = stats.brands.filter((b) => b.share >= minShare).slice(0, max);
  for (const [i, b] of items.entries()) {
    const sp = logo(b.brand, size);
    if (outline) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) cv.blitTint(sp, cx + dx, y + dy, outline);
    }
    cv.blit(sp, cx, y);
    // A lone brand gets its name; several brands get their share of the burn.
    const label = items.length === 1 ? b.name : fmtPct(b.share);
    if (i > 0 && cx + size + 2 + measure(label) > maxX) break; // never run into what's on the right
    const ty = y + Math.floor((size - 7) / 2);
    cv.text(label, cx + size + 2, ty, { color: color === 'brand' ? b.color : color });
    cx += size + 2 + measure(label) + gap;
  }
  return cx - gap;
}

/** Mini bar chart of activity over time. */
export function sparkbars(cv, values, x, y, w, h, color, { gap = 0, base = null, tint = null } = {}) {
  const max = Math.max(...values, 1);
  const bw = Math.max(1, Math.floor((w + gap) / values.length) - gap);
  values.forEach((v, i) => {
    const bh = v > 0 ? Math.max(1, Math.round((v / max) * h)) : 0;
    const bx = x + i * (bw + gap);
    const c = typeof color === 'function' ? color(v / max, i) : color;
    if (bh) cv.rect(bx, y + h - bh, bw, bh, c);
    else if (base) cv.rect(bx, y + h - 1, bw, 1, base);
  });
  void tint;
}

/** Heat of a value on 0..1, log-ish so small and huge burns both look alive. */
export const levelFrac = (stats) => Math.min(1, Math.max(0, stats.tier.level / stats.tier.max));

/** "36H ACTIVE" for short windows, "12D ACTIVE" otherwise. Used when the dollar amount is hidden. */
export function activeLabel(stats) {
  const span = (stats.period.end - (stats.period.start ?? 0)) / 3600000;
  return stats.period.start && span <= 48 ? `${stats.activeHours}H ACTIVE` : `${stats.activeDays}D ACTIVE`;
}
