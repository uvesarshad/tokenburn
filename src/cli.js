import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Canvas } from './canvas.js';
import { fetchRaw, buildRecords, summarize, demoRecords, toJSON, UserError } from './data.js';
import { resolvePeriod } from './period.js';
import { fmtTokens, fmtMoney } from './format.js';
import { THEMES, THEME_IDS } from './themes/index.js';
import { askQuestions } from './wizard.js';
import { W, H } from './themes/shared.js';

const DEFAULT_DIR = 'tokenburn-cards';
const PNG_SCALE = 8; // each card pixel becomes 8x8 screen pixels -> 1152x608

const HELP = `
  tokenburn - shareable pixel-art cards of your AI token burn

  USAGE
    tokenburn [duration] [options]

  Run plain tokenburn in a terminal and it asks what you want (window, design,
  handle, cost). Give a duration or use -y to skip the questions.

  DURATION  (default with -y or in scripts: 30d)
    all | today | 1h | 6h | 24h | 7d | 30d | 90d | 2w | 3mo | 1y
    or pick exact bounds with --since / --until (YYYY-MM-DD or YYYY-MM-DDTHH:MM)

  OPTIONS
    -t, --theme <name>    ${THEME_IDS.join(' | ')} | all | random   (default: furnace)
    -n, --name <text>     handle to show on the card, e.g. @you
    -o, --out <file>      save the PNG to this exact file
        --out-dir <dir>   save into this folder (default: ./${DEFAULT_DIR}/, which git ignores)
    -c, --client <list>   only count some tools, e.g. claude,codex
        --since <date>    start of the window
        --until <date>    end of the window
        --no-cost         leave the dollar amount off the card
    -y, --yes             skip the questions and use the defaults (30 days, furnace)
        --no-preview      don't draw the card in the terminal
        --preview         always draw the card in the terminal
        --json            print the numbers as JSON instead of making a card
        --demo            use made-up data (try it without any usage history)
    -l, --list-themes     list the card designs
    -h, --help            show this help
    -v, --version         show the version

  EXAMPLES
    tokenburn                       # asks what you want
    tokenburn -y                    # no questions: last 30 days, furnace
    tokenburn 7d -t arcade
    tokenburn all -t galaxy -n @you
    tokenburn 1h                    # what did the last hour cost me?
    tokenburn --since 2026-09-01 --until 2026-09-15 -t quest

  Usage data comes from tokscale (https://github.com/junhoyeo/tokscale).
  Hour-level precision: usage is counted in whole-hour buckets.
`;

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        theme: { type: 'string', short: 't' },
        name: { type: 'string', short: 'n' },
        out: { type: 'string', short: 'o' },
        'out-dir': { type: 'string' },
        client: { type: 'string', short: 'c' },
        last: { type: 'string' },
        since: { type: 'string' },
        until: { type: 'string' },
        'no-cost': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        'no-preview': { type: 'boolean' },
        preview: { type: 'boolean' },
        json: { type: 'boolean' },
        demo: { type: 'boolean' },
        'list-themes': { type: 'boolean', short: 'l' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    throw new UserError(`${err.message}\n  Run \`tokenburn --help\` for usage.`);
  }
  const { values: v, positionals } = parsed;

  if (v.help) return void console.log(HELP);
  if (v.version) return void console.log(VERSION);
  if (v['list-themes']) {
    for (const t of Object.values(THEMES)) console.log(`  ${t.id.padEnd(8)} ${t.description}`);
    return;
  }
  if (positionals.length > 1) throw new UserError(`Unexpected extra argument "${positionals[1]}".`);

  // Plain `tokenburn` in a terminal asks what you want. Anything typed on the command line
  // (a duration, --theme, ...) skips the matching question; scripts and pipes never get asked.
  const noDuration = !positionals[0] && !v.last && !v.since && !v.until;
  const canAsk = !v.yes && !v.json && process.stdin.isTTY && process.stdout.isTTY;
  const answers = canAsk && noDuration
    ? await askQuestions({
        have: {
          theme: v.theme,
          name: v.name,
          showCost: v['no-cost'] ? false : undefined,
        },
      })
    : null;

  const period = resolvePeriod(answers ?? { last: v.last ?? positionals[0], since: v.since, until: v.until });
  const themeIds = pickThemes(answers?.theme ?? v.theme);
  if (v.out && themeIds.length > 1) throw new UserError('--out takes one file. Use --out-dir when making several cards.');
  const name = normalizeName(answers?.name ?? v.name);
  const clients = v.client ? v.client.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const showCost = answers ? answers.showCost : !v['no-cost'];

  // Data
  const quiet = v.json || !process.stderr.isTTY;
  if (!quiet) process.stderr.write(v.demo ? '  using demo data...\n' : '  reading your usage via tokscale (a few seconds)...\n');
  const records = v.demo ? demoRecords() : buildRecords(await fetchRaw({ clients }));
  const stats = summarize(records, period, { name });

  if (v.json) return void console.log(JSON.stringify(toJSON(stats), null, 2));

  // Cards
  const ctx = { name, showCost };
  const outputs = [];
  for (const id of themeIds) {
    const cv = new Canvas(W, H);
    THEMES[id].draw(cv, stats, ctx);
    const file = outPath({ out: v.out, outDir: v['out-dir'], slug: period.slug, id });
    await mkdir(dirname(file), { recursive: true });
    if (!v.out && !v['out-dir']) await ignoreFolder(dirname(file));
    await writeFile(file, cv.toPNG(PNG_SCALE));
    outputs.push({ id, file, cv });
  }

  // Terminal preview (only when it fits, unless forced)
  const cols = process.stdout.columns ?? 0;
  const wantPreview = v.preview || (!v['no-preview'] && process.stdout.isTTY && cols >= W);
  if (wantPreview && outputs.length === 1) {
    console.log('\n' + outputs[0].cv.toAnsi() + '\n');
  } else if (!v['no-preview'] && process.stdout.isTTY && outputs.length === 1 && cols < W) {
    console.log(`\n  (Terminal is ${cols} columns wide; widen it to ${W}+ to preview the card here.)`);
  }

  console.log(summaryLine(stats, ctx));
  for (const o of outputs) console.log(`  saved ${prettyPath(o.file)}  (${o.id})`);
  if (outputs.length) console.log('');
}

function pickThemes(arg) {
  const t = (arg ?? 'furnace').toLowerCase();
  if (t === 'all') return THEME_IDS;
  if (t === 'random') return [THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)]];
  if (!THEMES[t]) {
    throw new UserError(`Unknown theme "${arg}". Choose from: ${THEME_IDS.join(', ')}, all, random.`);
  }
  return [t];
}

function normalizeName(n) {
  if (n == null) return '';
  const s = String(n).trim();
  return s.length > 14 ? s.slice(0, 14) : s;
}

function outPath({ out, outDir, slug, id }) {
  if (out) return resolve(out);
  return resolve(outDir ?? DEFAULT_DIR, `tokenburn-${slug}-${id}.png`);
}

/** Cards are personal, so the default folder ignores itself in git ("*" ignores this file too). */
async function ignoreFolder(dir) {
  await writeFile(join(dir, '.gitignore'), '*\n', { flag: 'wx' }).catch(() => {});
}

function prettyPath(p) {
  const home = homedir();
  const rel = p.startsWith(process.cwd() + '/') ? `./${p.slice(process.cwd().length + 1)}` : p;
  return rel.startsWith(home) ? `~${rel.slice(home.length)}` : rel;
}

function summaryLine(stats, ctx) {
  const parts = [`${fmtTokens(stats.tokens)} tokens`];
  if (ctx.showCost) parts.push(`~${fmtMoney(stats.cost)}`);
  parts.push(stats.period.label.toLowerCase());
  const top = stats.brands[0];
  if (top) parts.push(`mostly ${top.name}`);
  return `  ${parts.join(' · ')}`;
}

