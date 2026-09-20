import { createInterface } from 'node:readline';
import { resolvePeriod } from './period.js';
import { THEMES, THEME_IDS } from './themes/index.js';

const WINDOWS = [
  ['Last hour', '1h'],
  ['Last 24 hours', '24h'],
  ['Last 7 days', '7d'],
  ['Last 30 days', '30d'],
  ['Last 90 days', '90d'],
  ['All time', 'all'],
  ['Custom (your own duration or dates)', null],
];
const DEFAULT_WINDOW = 4;

/** A tiny line-based asker. Lines are queued, so piped input can't be lost between questions. */
function makeAsker(input, output) {
  const rl = createInterface({ input, output });
  const queue = [];
  let waiter = null;
  let closed = false;
  rl.on('line', (l) => (waiter ? ((w) => ((waiter = null), w(l)))(waiter) : queue.push(l)));
  rl.on('close', () => {
    closed = true;
    waiter?.(null);
  });
  rl.on('SIGINT', () => {
    output.write('\n');
    process.exit(130);
  });
  return {
    say: (text = '') => output.write(`${text}\n`),
    /** Resolves to the typed line, or null if input ended. */
    ask(prompt) {
      if (closed) return Promise.resolve(queue.length ? queue.shift() : null); // input ended: use defaults
      rl.setPrompt(prompt);
      rl.prompt();
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve) => (waiter = resolve));
    },
    close: () => rl.close(),
  };
}

/** Numbered menu. Enter picks the default; bad input asks again. */
async function menu(io, title, options, def) {
  io.say(`\n  ${title}`);
  options.forEach((label, i) => io.say(`    ${i + 1}) ${label}`));
  for (let tries = 0; tries < 4; tries++) {
    const raw = await io.ask(`  Pick 1-${options.length} [${def}]: `);
    const text = (raw ?? '').trim();
    if (!text) return def - 1;
    const n = Number(text);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
    io.say(`  Please type a number from 1 to ${options.length}.`);
  }
  return def - 1;
}

async function customWindow(io) {
  io.say('\n  Type a duration (like 36h, 2w, 3mo) or dates (like 2026-09-01..2026-09-15).');
  for (let tries = 0; tries < 4; tries++) {
    const text = ((await io.ask('  Window: ')) ?? '').trim();
    if (!text) break;
    const range = text.includes('..') ? text.split('..').map((s) => s.trim()) : null;
    const spec = range ? { since: range[0] || undefined, until: range[1] || undefined } : { last: text };
    try {
      resolvePeriod(spec); // validate now so a typo is caught while we can still ask again
      return spec;
    } catch (err) {
      io.say(`  ${err.message}`);
    }
  }
  return { last: '30d' };
}

/**
 * Ask what kind of card to make. `have` says which answers were already given on the
 * command line (those questions are skipped). Returns the chosen options.
 */
export async function askQuestions({ have = {}, input = process.stdin, output = process.stdout } = {}) {
  const io = makeAsker(input, output);
  try {
    io.say('\n  Token Burn: let\'s make your card.');

    const w = await menu(io, 'How far back?', WINDOWS.map(([label]) => label), DEFAULT_WINDOW);
    const period = WINDOWS[w][1] ? { last: WINDOWS[w][1] } : await customWindow(io);

    let theme = have.theme;
    if (!theme) {
      const options = [...THEME_IDS.map((id) => `${THEMES[id].name}: ${THEMES[id].description}`), 'All four (one card each)'];
      const t = await menu(io, 'Which design?', options, 1);
      theme = t < THEME_IDS.length ? THEME_IDS[t] : 'all';
    }

    let name = have.name;
    if (name === undefined) {
      io.say('');
      name = ((await io.ask('  Handle to show on the card, like @you (Enter to skip): ')) ?? '').trim();
    }

    let showCost = have.showCost;
    if (showCost === undefined) {
      const a = ((await io.ask('  Show the estimated dollar cost? [Y/n]: ')) ?? '').trim().toLowerCase();
      showCost = !(a === 'n' || a === 'no');
    }
    io.say('');
    return { ...period, theme, name, showCost };
  } finally {
    io.close();
  }
}
