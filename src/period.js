// Turns "30d", "6h", "all", or --since/--until into a concrete time window.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const UNITS = { h: HOUR, d: DAY, w: 7 * DAY, mo: 30 * DAY, y: 365 * DAY };
const UNIT_NAMES = { h: 'HOUR', d: 'DAY', w: 'WEEK', mo: 'MONTH', y: 'YEAR' };
const ALIASES = { week: '7d', month: '30d', year: '365d', day: '1d', hour: '1h', quarter: '90d' };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "2026-09-01" or "2026-09-01T09:30" / "2026-09-01 09:30" -> { date, hasTime } in local time. */
export function parseMoment(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(String(s).trim());
  if (!m) throw new Error(`Can't read "${s}" as a date. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM.`);
  const [, y, mo, d, h, mi] = m;
  const date = new Date(+y, +mo - 1, +d, h ? +h : 0, mi ? +mi : 0);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== +mo - 1) {
    throw new Error(`"${s}" is not a real calendar date.`);
  }
  return { date, hasTime: h !== undefined };
}

function shortDate(d, withYear) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

function rangeLabel(start, end, now) {
  const sameYear = start.getFullYear() === now.getFullYear() && end.getFullYear() === now.getFullYear();
  const s = shortDate(start, !sameYear);
  const e = shortDate(end, !sameYear);
  return s === e ? s : `${s} - ${e}`;
}

/**
 * @param {{ last?: string, since?: string, until?: string }} opts
 * @param {Date} [now]
 * @returns {{ start: Date|null, end: Date, label: string, short: string, slug: string, rolling: boolean }}
 */
export function resolvePeriod(opts = {}, now = new Date()) {
  const { since, until } = opts;
  let last = opts.last;

  if (since || until) {
    const s = since ? parseMoment(since) : null;
    const u = until ? parseMoment(until) : null;
    const start = s ? s.date : null;
    // A bare date on --until means "through the end of that day".
    const end = u ? (u.hasTime ? u.date : new Date(u.date.getTime() + DAY - 1)) : now;
    if (start && start > end) throw new Error('--since is after --until.');
    return {
      start,
      end,
      label: start ? rangeLabel(start, end, now) : `UNTIL ${shortDate(end, end.getFullYear() !== now.getFullYear())}`,
      short: start ? rangeLabel(start, end, now) : `UNTIL ${shortDate(end, false)}`,
      slug: `${start ? ymd(start) : 'start'}_${ymd(end)}`,
      rolling: false,
    };
  }

  last = String(last ?? '30d').trim().toLowerCase();
  if (ALIASES[last]) last = ALIASES[last];

  if (last === 'all' || last === 'all-time' || last === 'alltime') {
    return { start: null, end: now, label: 'ALL TIME', short: 'ALL', slug: 'all', rolling: true };
  }
  if (last === 'today') {
    return { start: startOfDay(now), end: now, label: 'TODAY', short: 'TODAY', slug: 'today', rolling: true };
  }
  if (last === 'yesterday') {
    const start = new Date(startOfDay(now).getTime() - DAY);
    return { start, end: new Date(startOfDay(now).getTime() - 1), label: 'YESTERDAY', short: 'YESTERDAY', slug: 'yesterday', rolling: false };
  }

  const m = /^(\d+(?:\.\d+)?)\s*(h|d|w|mo|y)$/.exec(last);
  if (!m) {
    throw new Error(
      `Can't read the duration "${last}". Try 1h, 6h, 24h, 7d, 30d, 90d, 2w, 3mo, 1y, all, or today.`,
    );
  }
  const n = parseFloat(m[1]);
  const unit = m[2];
  if (!(n > 0)) throw new Error('Duration must be greater than zero.');
  const start = new Date(now.getTime() - n * UNITS[unit]);
  const plural = n === 1 ? '' : 'S';
  return {
    start,
    end: now,
    label: `LAST ${Number.isInteger(n) ? n : n.toFixed(1)} ${UNIT_NAMES[unit]}${plural}`,
    short: `${Number.isInteger(n) ? n : n.toFixed(1)}${unit.toUpperCase()}`,
    slug: `${m[1]}${unit}`,
    rolling: true,
  };
}

/**
 * tokscale reports usage in whole-hour buckets. A bucket is counted when its
 * midpoint falls inside the window, so "1h" gives ~1 bucket and "24h" ~24.
 */
export function bucketInWindow(hourStart, period) {
  const mid = hourStart.getTime() + HOUR / 2;
  if (period.start && mid < period.start.getTime()) return false;
  return mid <= period.end.getTime();
}

export { HOUR, DAY };
