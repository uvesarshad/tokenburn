import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { askQuestions } from '../src/wizard.js';

async function run(lines, have = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (d) => (text += d));
  const p = askQuestions({ have, input, output });
  for (const l of lines) input.write(`${l}\n`);
  input.end();
  return { answers: await p, text };
}

test('pressing Enter everywhere gives the defaults', async () => {
  const { answers } = await run(['', '', '', '']);
  assert.deepEqual(answers, { last: '30d', theme: 'furnace', name: '', showCost: true });
});

test('answers are honoured', async () => {
  const { answers } = await run(['3', '2', '@me', 'n']);
  assert.deepEqual(answers, { last: '7d', theme: 'arcade', name: '@me', showCost: false });
});

test('"all time" and "all four designs"', async () => {
  const { answers } = await run(['6', '5', '', 'y']);
  assert.equal(answers.last, 'all');
  assert.equal(answers.theme, 'all');
  assert.equal(answers.showCost, true);
});

test('custom duration, and custom date range', async () => {
  assert.equal((await run(['7', '36h', '', '', '', ''])).answers.last, '36h');
  const r = (await run(['7', '2026-09-01..2026-09-15', '', '', '', ''])).answers;
  assert.deepEqual([r.since, r.until, r.last], ['2026-09-01', '2026-09-15', undefined]);
});

test('bad input asks again instead of failing', async () => {
  const { answers, text } = await run(['banana', '4', '', '', '']);
  assert.equal(answers.last, '30d');
  assert.match(text, /Please type a number/);
  const custom = await run(['7', 'soon', '3d', '', '', '', '']);
  assert.equal(custom.answers.last, '3d');
  assert.match(custom.text, /Can't read the duration/);
});

test('questions already answered on the command line are skipped', async () => {
  const { answers, text } = await run(['3'], { theme: 'galaxy', name: '@cli', showCost: false });
  assert.deepEqual(answers, { last: '7d', theme: 'galaxy', name: '@cli', showCost: false });
  assert.doesNotMatch(text, /Which design/);
  assert.doesNotMatch(text, /Handle/);
});

test('input that ends early falls back to defaults', async () => {
  const { answers } = await run(['3']);
  assert.equal(answers.last, '7d');
  assert.equal(answers.theme, 'furnace');
  assert.equal(answers.showCost, true);
});
