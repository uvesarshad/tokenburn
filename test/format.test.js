import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtTokens, fmtMoney, fmtPct, fmtInt, shortModel } from '../src/format.js';

test('fmtTokens keeps three significant digits', () => {
  assert.equal(fmtTokens(0), '0');
  assert.equal(fmtTokens(999), '999');
  assert.equal(fmtTokens(1234), '1.23K');
  assert.equal(fmtTokens(41298657020), '41.3B');
  assert.equal(fmtTokens(159000000), '159M');
  assert.equal(fmtTokens(2e12), '2T');
  assert.equal(fmtTokens(1000000), '1M');
});

test('fmtMoney / fmtPct / fmtInt', () => {
  assert.equal(fmtMoney(14629.4), '$14,629');
  assert.equal(fmtMoney(12.5), '$12.50');
  assert.equal(fmtMoney(2.5e6), '$2.5M');
  assert.equal(fmtPct(0.724), '72%');
  assert.equal(fmtPct(0.0004), '<1%');
  assert.equal(fmtInt(41298657020), '41,298,657,020');
});

test('shortModel trims vendor noise', () => {
  assert.equal(shortModel('claude-opus-4-5-20251101'), 'opus-4-5');
  assert.equal(shortModel('gpt-5'), 'gpt-5');
  assert.equal(shortModel('anthropic/claude-sonnet-5', 6), 'sonnet');
});
