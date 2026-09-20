import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePeriod, bucketInWindow, HOUR, DAY } from '../src/period.js';

const now = new Date(2026, 8, 20, 22, 35); // Sep 20 2026, 22:35 local

test('rolling durations resolve to the right window and label', () => {
  const p = resolvePeriod({ last: '30d' }, now);
  assert.equal(p.label, 'LAST 30 DAYS');
  assert.equal(p.short, '30D');
  assert.equal(now - p.start, 30 * DAY);

  assert.equal(resolvePeriod({ last: '1h' }, now).label, 'LAST 1 HOUR');
  assert.equal(resolvePeriod({ last: '2w' }, now).label, 'LAST 2 WEEKS');
  assert.equal(resolvePeriod({ last: '3mo' }, now).label, 'LAST 3 MONTHS');
  assert.equal(resolvePeriod({ last: '1.5h' }, now).label, 'LAST 1.5 HOURS');
});

test('aliases, all, today', () => {
  assert.equal(resolvePeriod({ last: 'week' }, now).label, 'LAST 7 DAYS');
  assert.equal(resolvePeriod({ last: 'all' }, now).start, null);
  const t = resolvePeriod({ last: 'today' }, now);
  assert.equal(t.start.getHours(), 0);
  assert.equal(t.label, 'TODAY');
  assert.equal(resolvePeriod({}, now).label, 'LAST 30 DAYS'); // default
});

test('since/until: bare dates are inclusive of the whole end day', () => {
  const p = resolvePeriod({ since: '2026-09-01', until: '2026-09-15' }, now);
  assert.equal(p.start.getDate(), 1);
  assert.equal(p.end.getDate(), 15);
  assert.equal(p.end.getHours(), 23);
  assert.equal(p.label, 'SEP 1 - SEP 15');
  assert.equal(p.slug, '2026-09-01_2026-09-15');
});

test('since/until: exact times are respected', () => {
  const p = resolvePeriod({ since: '2026-09-20T09:00', until: '2026-09-20 12:30' }, now);
  assert.equal(p.start.getHours(), 9);
  assert.equal(p.end.getHours(), 12);
  assert.equal(p.end.getMinutes(), 30);
});

test('bad input gives readable errors', () => {
  assert.throws(() => resolvePeriod({ last: 'soon' }, now), /Can't read the duration/);
  assert.throws(() => resolvePeriod({ last: '0h' }, now), /greater than zero/);
  assert.throws(() => resolvePeriod({ since: '09/01/2026' }, now), /Can't read/);
  assert.throws(() => resolvePeriod({ since: '2026-02-31' }, now), /not a real calendar date/);
  assert.throws(() => resolvePeriod({ since: '2026-09-15', until: '2026-09-01' }, now), /after/);
});

test('hour buckets count when their midpoint is in the window', () => {
  const p = resolvePeriod({ last: '1h' }, now); // 21:35 -> 22:35
  const at = (h) => new Date(2026, 8, 20, h);
  assert.equal(bucketInWindow(at(21), p), false); // midpoint 21:30, before start
  assert.equal(bucketInWindow(at(22), p), true); // midpoint 22:30
  assert.equal(bucketInWindow(at(23), p), false); // in the future
  const all = resolvePeriod({ last: 'all' }, now);
  assert.equal(bucketInWindow(new Date(2020, 0, 1), all), true);
  assert.equal(HOUR, 3600000);
});
