import zlib from 'node:zlib';
import { glyphs, advance, inkRange, measure as measureText, GLYPH_H } from './font.js';

/** "#rrggbb" | [r,g,b(,a)] -> [r,g,b,a] */
const colorCache = new Map();
export function rgb(c) {
  if (Array.isArray(c)) return c.length === 3 ? [c[0], c[1], c[2], 255] : c;
  let v = colorCache.get(c);
  if (!v) {
    let h = c.slice(1);
    if (h.length === 3) h = [...h].map((d) => d + d).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    colorCache.set(c, v);
  }
  return v;
}

export function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
    255,
  ];
}

/** Deterministic PRNG so the same stats always give the same card. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

export class Sprite {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  /** Build a sprite from fn(x, y, u, v) -> color|null. u,v are pixel-centre coords in [-1, 1]. */
  static from(size, fn) {
    const s = new Sprite(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1;
        const v = ((y + 0.5) / size) * 2 - 1;
        const c = fn(x, y, u, v);
        if (c) s.data.set(rgb(c), (y * size + x) * 4);
      }
    }
    return s;
  }
}

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  px(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a] = rgb(c);
    const i = (y * this.w + x) * 4;
    const d = this.data;
    if (a === 255) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    } else {
      const t = a / 255;
      d[i] = d[i] + (r - d[i]) * t;
      d[i + 1] = d[i + 1] + (g - d[i + 1]) * t;
      d[i + 2] = d[i + 2] + (b - d[i + 2]) * t;
      d[i + 3] = 255;
    }
  }

  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  clear(c) {
    this.rect(0, 0, this.w, this.h, c);
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  frame(x, y, w, h, c, t = 1) {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  /** Pixel-art panel: 1px border with clipped corners. */
  panel(x, y, w, h, fill, border) {
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
    this.rect(x + 1, y, w - 2, 1, border);
    this.rect(x + 1, y + h - 1, w - 2, 1, border);
    this.rect(x, y + 1, 1, h - 2, border);
    this.rect(x + w - 1, y + 1, 1, h - 2, border);
  }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) this.px(x, y, c);
      }
    }
  }

  ring(cx, cy, r0, r1, c) {
    for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
      for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= r0 && d <= r1) this.px(x, y, c);
      }
    }
  }

  /**
   * Ordered-dither fill. `palette` is an ordered array of colors; `fn(x, y)` returns
   * a 0..1 value picking a position along the palette. Gives that crunchy retro banding.
   */
  dither(x, y, w, h, palette, fn) {
    const n = palette.length - 1;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = fn(i, j);
        if (v == null) continue; // null = leave this pixel alone
        const t = Math.max(0, Math.min(1, v));
        const f = t * n;
        let k = Math.floor(f);
        const frac = f - k;
        if (frac > BAYER4[(y + j) & 3][(x + i) & 3]) k++;
        this.px(x + i, y + j, palette[Math.min(n, k)]);
      }
    }
  }

  text(str, x, y, { color = '#ffffff', scale = 1, shadow = null, align = 'left', rowColors = null } = {}) {
    str = String(str).toUpperCase();
    const w = measureText(str, scale);
    if (align === 'right') x -= w;
    else if (align === 'center') x -= Math.floor(w / 2);
    const draw = (ox, oy, col, rows) => {
      let cx = x + ox;
      for (const ch of str) {
        const g = glyphs.get(ch) || glyphs.get('?');
        const [from, to] = inkRange(ch);
        for (let r = 0; r < GLYPH_H; r++) {
          const c = rows ? rows[Math.min(rows.length - 1, Math.floor((r / GLYPH_H) * rows.length))] : col;
          for (let k = from; k < to; k++) {
            if (g[r][k] === '#') {
              this.rect(cx + (k - from) * scale, y + oy + r * scale, scale, scale, c);
            }
          }
        }
        cx += advance(ch) * scale;
      }
    };
    if (shadow) draw(scale, scale, shadow, null);
    draw(0, 0, color, rowColors);
    return w;
  }

  blit(sprite, x, y, scale = 1) {
    for (let j = 0; j < sprite.h; j++) {
      for (let i = 0; i < sprite.w; i++) {
        const o = (j * sprite.w + i) * 4;
        if (sprite.data[o + 3] === 0) continue;
        const c = [sprite.data[o], sprite.data[o + 1], sprite.data[o + 2], sprite.data[o + 3]];
        if (scale === 1) this.px(x + i, y + j, c);
        else this.rect(x + i * scale, y + j * scale, scale, scale, c);
      }
    }
  }

  /** Recolour a sprite's silhouette (used for drop shadows/outlines). */
  blitTint(sprite, x, y, color) {
    for (let j = 0; j < sprite.h; j++) {
      for (let i = 0; i < sprite.w; i++) {
        if (sprite.data[(j * sprite.w + i) * 4 + 3] > 0) this.px(x + i, y + j, color);
      }
    }
  }

  /** Segmented pixel progress bar. */
  bar(x, y, w, h, frac, fg, bg = '#00000066') {
    this.rect(x, y, w, h, bg);
    const fill = Math.max(0, Math.min(w, Math.round(w * frac)));
    if (fill > 0) this.rect(x, y, fill, h, fg);
  }

  // ---------- output ----------

  toPNG(scale = 8) {
    const W = this.w * scale;
    const H = this.h * scale;
    const stride = W * 4 + 1;
    const raw = Buffer.alloc(stride * H);
    const row = Buffer.alloc(W * 4);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const si = (y * this.w + x) * 4;
        for (let k = 0; k < scale; k++) {
          const di = (x * scale + k) * 4;
          row[di] = this.data[si];
          row[di + 1] = this.data[si + 1];
          row[di + 2] = this.data[si + 2];
          row[di + 3] = this.data[si + 3];
        }
      }
      for (let k = 0; k < scale; k++) {
        const o = (y * scale + k) * stride;
        raw[o] = 0; // filter: none
        row.copy(raw, o + 1);
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const text = Buffer.from('Software\0tokenburn', 'latin1');
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('tEXt', text),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }

  /** Truecolor half-block rendering: two pixel rows per terminal row. */
  toAnsi() {
    const lines = [];
    for (let y = 0; y < this.h; y += 2) {
      let s = '';
      let last = '';
      for (let x = 0; x < this.w; x++) {
        const t = this.get(x, y);
        const b = y + 1 < this.h ? this.get(x, y + 1) : t;
        const code = `\x1b[38;2;${t[0]};${t[1]};${t[2]};48;2;${b[0]};${b[1]};${b[2]}m`;
        if (code !== last) {
          s += code;
          last = code;
        }
        s += '▀';
      }
      lines.push(s + '\x1b[0m');
    }
    return lines.join('\n');
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
