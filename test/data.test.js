import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecords, summarize, demoRecords, tierOf, UserError } from '../src/data.js';
import { resolvePeriod } from '../src/period.js';
import { brandOf } from '../src/logos.js';

const hourly = {
  entries: [
    // Mixed-model hour: split should follow that day's per-model totals (3:1).
    { hour: '2026-09-19 10:00', clients: ['claude'], models: ['claude-opus-5', 'claude-sonnet-5'], input: 100, output: 100, cacheRead: 800, cacheWrite: 0, messageCount: 4, cost: 8 },
    // Single-model hour: exact.
    { hour: '2026-09-20 21:00', clients: ['codex'], models: ['gpt-5'], input: 10, output: 10, cacheRead: 80, cacheWrite: 0, messageCount: 2, cost: 1 },
    { hour: '2026-09-20 22:00', clients: ['codex'], models: ['gpt-5'], input: 10, output: 10, cacheRead: 80, cacheWrite: 0, messageCount: 2, cost: 1 },
  ],
};
const graph = {
  contributions: [
    {
      date: '2026-09-19',
      clients: [
        { client: 'claude', modelId: 'claude-opus-5', tokens: { input: 300, output: 300, cacheRead: 2400, cacheWrite: 0 }, cost: 24 },
        { client: 'claude', modelId: 'claude-sonnet-5', tokens: { input: 100, output: 100, cacheRead: 800, cacheWrite: 0 }, cost: 8 },
      ],
    },
  ],
};

test('mixed-model hours are split by the day breakdown and totals are preserved', () => {
  const recs = buildRecords({ hourly, graph });
  const mixed = recs.filter((r) => r.t.getDate() === 19);
  assert.equal(mixed.length, 2);
  const opus = mixed.find((r) => r.model === 'claude-opus-5');
  const sonnet = mixed.find((r) => r.model === 'claude-sonnet-5');
  assert.ok(Math.abs(opus.tokens - 750) < 1e-6, `opus ${opus.tokens}`);
  assert.ok(Math.abs(sonnet.tokens - 250) < 1e-6);
  const total = recs.reduce((s, r) => s + r.tokens, 0);
  assert.equal(Math.round(total), 1000 + 100 + 100);
  const cost = recs.reduce((s, r) => s + r.cost, 0);
  assert.ok(Math.abs(cost - 10) < 1e-9);
});

test('without the daily breakdown, mixed hours split evenly instead of failing', () => {
  const recs = buildRecords({ hourly, graph: null });
  const mixed = recs.filter((r) => r.t.getDate() === 19);
  assert.equal(mixed.length, 2);
  assert.ok(Math.abs(mixed[0].tokens - mixed[1].tokens) < 1e-6);
});

test('summarize only counts the requested window', () => {
  const recs = buildRecords({ hourly, graph });
  const now = new Date(2026, 8, 20, 22, 35);
  const all = summarize(recs, resolvePeriod({ last: 'all' }, now));
  assert.equal(Math.round(all.tokens), 1200);
  assert.equal(all.brands[0].brand, 'claude');
  assert.equal(all.models[0].model, 'claude-opus-5');

  const hour = summarize(recs, resolvePeriod({ last: '1h' }, now));
  assert.equal(Math.round(hour.tokens), 100);
  assert.equal(hour.brands[0].brand, 'openai');

  const day = summarize(recs, resolvePeriod({ last: '1d' }, now));
  assert.equal(Math.round(day.tokens), 200);

  assert.equal(all.timeline(12).length, 12);
  assert.equal(Math.round(all.timeline(12).reduce((a, b) => a + b, 0)), 1200);
});

test('an empty window is a friendly error, not a crash', () => {
  const recs = buildRecords({ hourly, graph });
  const now = new Date(2026, 8, 20, 22, 35);
  assert.throws(() => summarize(recs, resolvePeriod({ since: '2025-01-01', until: '2025-01-02' }, now)), UserError);
});

test('brand detection prefers the model over the tool', () => {
  assert.equal(brandOf('claude-opus-5', 'opencode'), 'claude');
  assert.equal(brandOf('gpt-5.5', 'codex'), 'openai');
  assert.equal(brandOf('gemini-3.8-flash', 'antigravity-cli'), 'gemini');
  assert.equal(brandOf('grok-4.6', 'grok'), 'grok');
  assert.equal(brandOf('mystery', 'cursor'), 'cursor');
  assert.equal(brandOf('mystery', 'nope'), 'other');
});

test('tiers climb with the burn', () => {
  assert.equal(tierOf(10).name, 'SPARK');
  assert.equal(tierOf(5e6).name, 'CAMPFIRE');
  assert.equal(tierOf(4.1e10).name, 'STAR FORGE');
  assert.equal(tierOf(1e13).level, tierOf(1e13).max);
});

test('demo data is deterministic', () => {
  const now = new Date(2026, 8, 20, 12);
  const a = summarize(demoRecords(now), resolvePeriod({ last: '30d' }, now));
  const b = summarize(demoRecords(now), resolvePeriod({ last: '30d' }, now));
  assert.equal(a.tokens, b.tokens);
});
