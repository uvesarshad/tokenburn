import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bucketInWindow, HOUR } from './period.js';
import { brandOf, BRANDS } from './logos.js';
import { rng } from './canvas.js';

const run = promisify(execFile);
const MAX_BUFFER = 512 * 1024 * 1024;

export class UserError extends Error {}

// ---------- talking to tokscale ----------

let runnerPromise;

/** Finds a way to call tokscale: env override, a global install, or npx as a last resort. */
function resolveRunner() {
  runnerPromise ??= (async () => {
    const override = process.env.TOKENBURN_TOKSCALE;
    if (override) return override.split(/\s+/).filter(Boolean);
    try {
      await run('tokscale', ['--version'], { timeout: 15000 });
      return ['tokscale'];
    } catch {
      /* fall through */
    }
    try {
      await run('npx', ['--version'], { timeout: 15000 });
      return ['npx', '--yes', 'tokscale@latest'];
    } catch {
      throw new UserError(
        'tokscale was not found. Install it with `npm i -g tokscale` (or use Bun: `bun add -g tokscale`) and try again.',
      );
    }
  })();
  return runnerPromise;
}

async function tokscale(args) {
  const [cmd, ...pre] = await resolveRunner();
  try {
    const { stdout } = await run(cmd, [...pre, ...args], { maxBuffer: MAX_BUFFER, timeout: 5 * 60 * 1000 });
    return stdout;
  } catch (err) {
    throw new UserError(`tokscale failed: ${(err.stderr || err.message || '').toString().trim().split('\n')[0]}`);
  }
}

/** Reads all local usage (hour-by-hour plus per-day model detail) via tokscale. */
export async function fetchRaw({ clients } = {}) {
  const filter = clients?.length ? ['--client', clients.join(',')] : [];
  const dir = await mkdtemp(join(tmpdir(), 'tokenburn-'));
  try {
    const graphFile = join(dir, 'graph.json');
    const [hourlyOut] = await Promise.all([
      tokscale(['hourly', '--json', '--no-spinner', ...filter]),
      tokscale(['graph', '--no-spinner', '--output', graphFile, ...filter]),
    ]);
    const hourly = JSON.parse(hourlyOut);
    let graph = null;
    try {
      graph = JSON.parse(await readFile(graphFile, 'utf8'));
    } catch {
      /* the per-day detail only sharpens the model split; carry on without it */
    }
    return { hourly, graph };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- shaping the data ----------

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** "2026-09-20 22:00" -> local Date */
function parseHour(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4]);
}

/**
 * tokscale's hourly view says which clients/models were active in an hour but not how
 * the tokens split between them. We split each hour using that day's exact per-model
 * totals, so single-model hours (the common case) are exact and mixed hours are close.
 */
export function buildRecords({ hourly, graph }) {
  const byDay = new Map();
  for (const day of graph?.contributions ?? []) {
    byDay.set(
      day.date,
      (day.clients ?? []).map((c) => {
        const t = c.tokens ?? {};
        return {
          client: c.client,
          model: c.modelId,
          w: num(t.input) + num(t.output) + num(t.cacheRead) + num(t.cacheWrite) + num(t.reasoning),
        };
      }),
    );
  }

  const records = [];
  for (const e of hourly?.entries ?? []) {
    const t = parseHour(e.hour);
    if (!t) continue;
    const clients = e.clients?.length ? e.clients : ['unknown'];
    const models = e.models?.length ? e.models : ['unknown'];

    let parts = (byDay.get(e.hour.slice(0, 10)) ?? []).filter(
      (p) => clients.includes(p.client) && models.includes(p.model),
    );
    if (!parts.length) parts = clients.flatMap((client) => models.map((model) => ({ client, model, w: 1 })));
    const total = parts.reduce((s, p) => s + p.w, 0);
    if (total <= 0) parts = parts.map((p) => ({ ...p, w: 1 }));
    const wsum = parts.reduce((s, p) => s + p.w, 0);

    for (const p of parts) {
      const f = p.w / wsum;
      const input = num(e.input) * f;
      const output = num(e.output) * f;
      const cacheRead = num(e.cacheRead) * f;
      const cacheWrite = num(e.cacheWrite) * f;
      records.push({
        t,
        client: p.client,
        model: p.model,
        input,
        output,
        cacheRead,
        cacheWrite,
        tokens: input + output + cacheRead + cacheWrite,
        cost: num(e.cost) * f,
        messages: num(e.messageCount) * f,
      });
    }
  }
  return records;
}

// ---------- ranks ----------

const TIERS = [
  { min: 0, name: 'SPARK' },
  { min: 1e5, name: 'EMBER' },
  { min: 1e6, name: 'CAMPFIRE' },
  { min: 1e7, name: 'BONFIRE' },
  { min: 1e8, name: 'INFERNO' },
  { min: 1e9, name: 'SUPERNOVA' },
  { min: 1e10, name: 'STAR FORGE' },
  { min: 1e11, name: 'DYSON SWARM' },
];

export function tierOf(tokens) {
  let level = 0;
  for (let i = 0; i < TIERS.length; i++) if (tokens >= TIERS[i].min) level = i;
  return { level, name: TIERS[level].name, max: TIERS.length - 1 };
}

// ---------- summarising a window ----------

export function summarize(records, period, { name = '' } = {}) {
  const rows = records.filter((r) => bucketInWindow(r.t, period));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const tokens = sum('tokens');
  if (!rows.length || tokens <= 0) {
    throw new UserError(`No token usage found for ${period.label.toLowerCase()}. Try a longer window, e.g. \`tokenburn 30d\`.`);
  }

  const cost = sum('cost');
  const hours = new Set(rows.map((r) => r.t.getTime()));
  const days = new Set(rows.map((r) => r.t.toDateString()));

  const group = (keyFn, seed) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      const g = m.get(k) ?? { key: k, tokens: 0, cost: 0, ...seed(r) };
      g.tokens += r.tokens;
      g.cost += r.cost;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.tokens - a.tokens).map((g) => ({ ...g, share: g.tokens / tokens }));
  };

  const brands = group(
    (r) => brandOf(r.model, r.client),
    (r) => ({ brand: brandOf(r.model, r.client) }),
  ).map((g) => ({ ...g, name: BRANDS[g.brand].name, color: BRANDS[g.brand].color }));

  const models = group(
    (r) => r.model,
    (r) => ({ model: r.model, client: r.client, brand: brandOf(r.model, r.client) }),
  ).filter((m) => m.tokens > 0 && !/^<.*>$/.test(m.model) && m.model !== 'unknown');

  const clients = group(
    (r) => r.client,
    (r) => ({ client: r.client }),
  );

  let peak = { t: null, tokens: 0 };
  const perHour = new Map();
  for (const r of rows) perHour.set(r.t.getTime(), (perHour.get(r.t.getTime()) ?? 0) + r.tokens);
  for (const [t, v] of perHour) if (v > peak.tokens) peak = { t: new Date(t), tokens: v };

  const firstT = Math.min(...rows.map((r) => r.t.getTime()));
  const winStart = period.start ? Math.max(period.start.getTime(), 0) : firstT;
  const winEnd = period.end.getTime();

  /** Token totals in n equal time slices across the window, for sparklines. */
  const timeline = (n) => {
    const out = new Array(n).fill(0);
    const span = Math.max(HOUR, winEnd - winStart);
    for (const r of rows) {
      const mid = r.t.getTime() + HOUR / 2;
      const i = Math.min(n - 1, Math.max(0, Math.floor(((mid - winStart) / span) * n)));
      out[i] += r.tokens;
    }
    return out;
  };

  const input = sum('input');
  const output = sum('output');
  const cacheRead = sum('cacheRead');
  const cacheWrite = sum('cacheWrite');

  return {
    name,
    period,
    tokens,
    cost,
    input,
    output,
    cacheRead,
    cacheWrite,
    cacheShare: (cacheRead + cacheWrite) / tokens,
    messages: sum('messages'),
    activeHours: hours.size,
    activeDays: days.size,
    brands,
    models,
    clients,
    peak,
    tier: tierOf(tokens),
    timeline,
  };
}

/** Plain-JSON view of a summary (for --json). */
export function toJSON(stats) {
  const { timeline, period, ...rest } = stats;
  return {
    ...rest,
    period: { label: period.label, start: period.start?.toISOString() ?? null, end: period.end.toISOString() },
    timeline: timeline(24),
  };
}

// ---------- demo data ----------

/** Deterministic fake usage so people can preview cards without any tokscale history. */
export function demoRecords(now = new Date()) {
  const rand = rng(20260920);
  const recs = [];
  const mixes = [
    { client: 'claude', model: 'claude-opus-4-5', p: 0.5, scale: 9e6 },
    { client: 'claude', model: 'claude-sonnet-4-5', p: 0.45, scale: 6e6 },
    { client: 'codex', model: 'gpt-5', p: 0.3, scale: 4e6 },
    { client: 'antigravity-cli', model: 'gemini-2.5-pro', p: 0.15, scale: 2.5e6 },
    { client: 'grok', model: 'grok-4', p: 0.05, scale: 1.5e6 },
  ];
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  for (let h = 0; h < 24 * 200; h++) {
    const t = new Date(end.getTime() - h * HOUR);
    const hod = t.getHours();
    const active = hod >= 9 && hod <= 23 ? 1 : hod < 2 ? 0.6 : 0.08;
    const trend = 0.55 + 0.45 * (1 - h / (24 * 200));
    for (const m of mixes) {
      if (rand() > m.p * active) continue;
      const burst = Math.pow(rand(), 2.2) * 3 * trend;
      const total = m.scale * burst;
      const cacheRead = total * 0.9;
      const output = total * 0.02;
      const input = total * 0.01;
      const cacheWrite = total * 0.07;
      recs.push({
        t,
        client: m.client,
        model: m.model,
        input,
        output,
        cacheRead,
        cacheWrite,
        tokens: input + output + cacheRead + cacheWrite,
        cost: (input * 5 + output * 25 + cacheRead * 0.5 + cacheWrite * 6) / 1e6,
        messages: Math.round(total / 2e5) + 1,
      });
    }
  }
  return recs;
}
