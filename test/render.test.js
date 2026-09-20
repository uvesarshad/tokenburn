import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { Canvas } from '../src/canvas.js';
import { demoRecords, summarize } from '../src/data.js';
import { resolvePeriod } from '../src/period.js';
import { THEMES } from '../src/themes/index.js';
import { W, H } from '../src/themes/shared.js';
import { measure } from '../src/font.js';

const now = new Date(2026, 8, 20, 12);
const recs = demoRecords(now);

function png(cv, scale = 2) {
  const buf = cv.toPNG(scale);
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { buf, w, h };
}

test('PNG output is valid and the right size', () => {
  const cv = new Canvas(10, 6);
  cv.clear('#ff0000');
  cv.px(3, 2, '#00ff00');
  const { buf, w, h } = png(cv, 4);
  assert.equal(w, 40);
  assert.equal(h, 24);
  // pull IDAT back out and check the pixels survive the round trip
  let off = 8;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = 40 * 4 + 1;
  assert.equal(raw.length, stride * 24);
  const px = (x, y) => [...raw.subarray(y * stride + 1 + x * 4, y * stride + 1 + x * 4 + 4)];
  assert.deepEqual(px(0, 0), [255, 0, 0, 255]);
  assert.deepEqual(px(3 * 4 + 1, 2 * 4 + 1), [0, 255, 0, 255]); // the scaled green pixel
});

test('text measures and draws', () => {
  assert.equal(measure('AB'), 11);
  assert.equal(measure('AB', 2), 22);
  const cv = new Canvas(30, 10);
  cv.clear('#000000');
  cv.text('A', 0, 0, { color: '#ffffff' });
  assert.deepEqual(cv.get(1, 0).slice(0, 3), [255, 255, 255]); // top of the A
  assert.deepEqual(cv.get(0, 0).slice(0, 3), [0, 0, 0]);
});

// A single busy hour, so short-window cards are exercised with real data.
const busy = recs.reduce((a, b) => (b.tokens > a.tokens ? b : a));
const pad = (n) => String(n).padStart(2, '0');
const day = `${busy.t.getFullYear()}-${pad(busy.t.getMonth() + 1)}-${pad(busy.t.getDate())}`;

const VARIANTS = {
  'default': { name: '', showCost: true, period: { last: '30d' } },
  'with handle, no cost': { name: '@someone-long', showCost: false, period: { last: '7d' } },
  'one hour': { name: '', showCost: true, period: { since: `${day}T${pad(busy.t.getHours())}:00`, until: `${day}T${pad(busy.t.getHours())}:59` } },
  'all time': { name: '@you', showCost: true, period: { last: 'all' } },
};

for (const [id, theme] of Object.entries(THEMES)) {
  for (const [label, v] of Object.entries(VARIANTS)) {
    test(`${id} theme renders (${label})`, () => {
      const stats = summarize(recs, resolvePeriod(v.period, now), { name: v.name });
      const cv = new Canvas(W, H);
      theme.draw(cv, stats, { name: v.name, showCost: v.showCost });
      const colors = new Set();
      for (let i = 0; i < cv.data.length; i += 4) {
        assert.equal(cv.data[i + 3], 255, 'every pixel is opaque');
        colors.add((cv.data[i] << 16) | (cv.data[i + 1] << 8) | cv.data[i + 2]);
      }
      assert.ok(colors.size > 12, `expected a rich palette, got ${colors.size}`);
      png(cv, 1);
    });
  }
}

test('the terminal preview is one half-block row per two pixel rows', () => {
  const cv = new Canvas(W, H);
  cv.clear('#123456');
  const lines = cv.toAnsi().split('\n');
  assert.equal(lines.length, H / 2);
  assert.ok(lines[0].includes('▀'));
});
