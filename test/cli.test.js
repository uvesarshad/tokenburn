import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';

test('cards go in a self-ignoring folder, not the current directory', async () => {
  const cwd = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), 'tokenburn-cli-'));
  process.chdir(dir);
  const log = console.log;
  console.log = () => {};
  try {
    await main(['--demo', '--no-preview']); // no duration given: the 30-day default
    assert.deepEqual((await readdir(dir)).sort(), ['tokenburn-cards']);
    const files = (await readdir(join(dir, 'tokenburn-cards'))).sort();
    assert.deepEqual(files, ['.gitignore', 'tokenburn-30d-furnace.png']);
    assert.equal(await readFile(join(dir, 'tokenburn-cards', '.gitignore'), 'utf8'), '*\n');
  } finally {
    console.log = log;
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});
