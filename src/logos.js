import { Sprite, mix } from './canvas.js';
import { glyphs } from './font.js';

// Pixel-art homages to the AI brand marks, generated procedurally so they stay
// crisp at any size. They are stylised approximations, not official artwork.

export const BRANDS = {
  claude: { name: 'Claude', color: '#E8825F' },
  openai: { name: 'OpenAI', color: '#38D6A4' },
  gemini: { name: 'Gemini', color: '#6EA3FF' },
  grok: { name: 'Grok', color: '#E8E8E8' },
  cursor: { name: 'Cursor', color: '#C9C9D1' },
  copilot: { name: 'Copilot', color: '#A78BFA' },
  deepseek: { name: 'DeepSeek', color: '#5B7CFF' },
  qwen: { name: 'Qwen', color: '#8F6BFF' },
  kimi: { name: 'Kimi', color: '#4FA3FF' },
  glm: { name: 'GLM', color: '#5DE0C2' },
  mistral: { name: 'Mistral', color: '#FF8A3D' },
  meta: { name: 'Llama', color: '#4C8DFF' },
  minimax: { name: 'MiniMax', color: '#FF5C7A' },
  other: { name: 'Other', color: '#9AA0B4' },
};

const MODEL_RULES = [
  [/claude|opus|sonnet|haiku|fable/i, 'claude'],
  [/gpt|^o\d|codex|openai|davinci|chatgpt/i, 'openai'],
  [/gemini|gemma/i, 'gemini'],
  [/grok/i, 'grok'],
  [/deepseek/i, 'deepseek'],
  [/qwen/i, 'qwen'],
  [/kimi|moonshot/i, 'kimi'],
  [/glm|zhipu/i, 'glm'],
  [/mistral|codestral|devstral|magistral/i, 'mistral'],
  [/llama/i, 'meta'],
  [/minimax/i, 'minimax'],
];

const CLIENT_RULES = [
  [/^claude/i, 'claude'],
  [/^codex/i, 'openai'],
  [/^cursor/i, 'cursor'],
  [/^copilot/i, 'copilot'],
  [/^(gemini|antigravity)/i, 'gemini'],
  [/^grok/i, 'grok'],
  [/^(kimi)/i, 'kimi'],
  [/^(qwen)/i, 'qwen'],
];

/** Which AI brand a (model, client) pair belongs to. Model name wins over client. */
export function brandOf(model = '', client = '') {
  for (const [re, b] of MODEL_RULES) if (re.test(model)) return b;
  for (const [re, b] of CLIENT_RULES) if (re.test(client)) return b;
  return 'other';
}

// ---------- shape helpers ----------

function inPoly(u, v, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const deg = (d) => (d * Math.PI) / 180;

// ---------- brand marks ----------

function claude(size) {
  // Sunburst of tapered rays with a slightly ragged length, like the real mark.
  const lens = [1.0, 0.78, 0.94, 0.7, 1.0, 0.8, 0.96, 0.72, 1.0, 0.76, 0.92, 0.7];
  const rays = lens.map((L, k) => ({ a: deg(k * 30 + 8), L }));
  const c = '#E8825F';
  const hi = '#F4A582';
  return Sprite.from(size, (x, y, u, v) => {
    const r = Math.hypot(u, v);
    if (r < 0.14) return hi;
    for (const { a, L } of rays) {
      const along = u * Math.cos(a) + v * Math.sin(a);
      const perp = Math.abs(-u * Math.sin(a) + v * Math.cos(a));
      if (along > 0 && along <= L && perp <= 0.16 * (1 - along / L) + 0.045) {
        return along > 0.55 ? c : hi;
      }
    }
    return null;
  });
}

function openai(size) {
  // Hexagonal ring cut into six twisted petals: the OpenAI blossom, pixel-style.
  const cuts = Array.from({ length: 6 }, (_, k) => deg(k * 60 + 90));
  return Sprite.from(size, (x, y, u, v) => {
    const hd = Math.max(Math.abs(v), Math.abs(v) * 0.5 + Math.abs(u) * 0.866);
    if (hd > 0.96 || hd < 0.5) return null;
    for (const a of cuts) {
      const along = u * Math.cos(a) + v * Math.sin(a);
      const perp = -u * Math.sin(a) + v * Math.cos(a);
      if (along > 0.3 && Math.abs(perp - 0.22) <= 0.075) return null;
    }
    return '#F2FFFA';
  });
}

function gemini(size) {
  // Four-point star with concave sides and the blue -> purple -> rose gradient.
  const stops = ['#4285F4', '#7B7BF2', '#A06FD8', '#D96570'];
  return Sprite.from(size, (x, y, u, v) => {
    const p = 0.72;
    if (Math.pow(Math.abs(u), p) + Math.pow(Math.abs(v), p) > 0.98) return null;
    const t = Math.max(0, Math.min(1, (u - v + 2) / 4)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    return mix(stops[k], stops[k + 1], t - k);
  });
}

function grok(size) {
  // Circle with the off-centre slash.
  return Sprite.from(size, (x, y, u, v) => {
    const r = Math.hypot(u, v);
    const ring = r <= 0.95 && r >= 0.72;
    const along = (u - v) / Math.SQRT2; // along the diagonal
    const perp = (u + v) / Math.SQRT2;
    const slash = Math.abs(perp + 0.05) <= 0.17 && Math.abs(along) <= 1.05 && r <= 1.0;
    const gap = r > 0.72 && r < 0.95 && Math.abs(perp + 0.05) <= 0.34 && Math.abs(perp + 0.05) > 0.17 && along < -0.2;
    if (gap) return null;
    return ring || slash ? '#F2F2F2' : null;
  });
}

function cursor(size) {
  // Isometric cube: three shaded faces.
  const P = (a) => [Math.cos(deg(a)) * 0.95, -Math.sin(deg(a)) * 0.95];
  const top = [[0, 0], P(90), P(30), P(150)].map((p, i, arr) => p);
  const faces = [
    { pts: [[0, 0], P(30), P(90), P(150)], c: '#F4F4F6' },
    { pts: [[0, 0], P(150), P(210), P(270)], c: '#B4B4BC' },
    { pts: [[0, 0], P(270), P(330), P(30)], c: '#6F6F7A' },
  ];
  void top;
  return Sprite.from(size, (x, y, u, v) => {
    for (const f of faces) if (inPoly(u, v, f.pts)) return f.c;
    return null;
  });
}

function copilot(size) {
  // Goggle-eyed helmet face.
  return Sprite.from(size, (x, y, u, v) => {
    const head = Math.abs(u) <= 0.82 && v >= -0.55 && v <= 0.78 && Math.hypot(Math.max(0, Math.abs(u) - 0.5), Math.max(0, Math.abs(v + 0.05) - 0.4)) <= 0.36;
    if (!head) return null;
    const eyeL = Math.abs(u + 0.36) <= 0.18 && Math.abs(v - 0.05) <= 0.24;
    const eyeR = Math.abs(u - 0.36) <= 0.18 && Math.abs(v - 0.05) <= 0.24;
    if (eyeL || eyeR) return '#2A1B54';
    return v < -0.3 ? '#C4B5FD' : '#A78BFA';
  });
}

function generic(brand) {
  const { name, color } = BRANDS[brand] || BRANDS.other;
  const letter = glyphs.get((name[0] || '?').toUpperCase()) || glyphs.get('?');
  return (size) => {
    const k = Math.max(1, Math.floor(size / 10));
    const ox = Math.floor((size - 5 * k) / 2);
    const oy = Math.floor((size - 7 * k) / 2);
    return Sprite.from(size, (x, y, u, v) => {
      const corner = Math.abs(u) > 0.7 && Math.abs(v) > 0.7;
      if (Math.abs(u) > 0.88 || Math.abs(v) > 0.88 || corner) return null;
      const gx = Math.floor((x - ox) / k);
      const gy = Math.floor((y - oy) / k);
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && letter[gy][gx] === '#') return '#14101F';
      return color;
    });
  };
}

const MAKERS = { claude, openai, gemini, grok, cursor, copilot };
const cache = new Map();

/** Returns a (cached) sprite for a brand at a given pixel size. */
export function logo(brand, size = 16) {
  const key = `${brand}:${size}`;
  let s = cache.get(key);
  if (!s) {
    s = (MAKERS[brand] || generic(brand))(size);
    cache.set(key, s);
  }
  return s;
}
