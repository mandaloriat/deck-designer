import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveChromiumPath } from '@deck-designer/render';
import { buildCommand } from '../src/commands/build.js';
import { printPlanCommand } from '../src/commands/print-plan.js';
import { Reporter } from '../src/output.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/starter-deck');
const reporter = new Reporter({ json: false, quiet: true, color: false });

let chromiumAvailable = true;
try {
  resolveChromiumPath();
} catch {
  chromiumAvailable = false;
}

describe.skipIf(!chromiumAvailable)('print-plan', () => {
  let out: string;
  let script: string;

  beforeAll(async () => {
    out = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-plan-'));
    await buildCommand({ project: EXAMPLE, out, face: ['front', 'back'] }, reporter);
    await printPlanCommand(
      { project: EXAMPLE, out: path.join(out, 'print'), images: path.join(out, 'cards'), page: 'A4' },
      reporter,
    );
    script = await fs.readFile(path.join(out, 'print', 'print-cards.sh'), 'utf8');
  }, 180_000);

  afterAll(async () => {
    await fs.rm(out, { recursive: true, force: true });
  });

  it('groups components by size, one grid per size', async () => {
    const plan = JSON.parse(await fs.readFile(path.join(out, 'print', 'plan.json'), 'utf8')) as {
      sheets: { output: string; args: string[] }[];
    };
    const creature = plan.sheets.find((s) => s.output.includes('creature'));
    const token = plan.sheets.find((s) => s.output.includes('token'));

    expect(creature?.args).toEqual(expect.arrayContaining(['--element-width', '63', '--cols', '3']));
    expect(token?.args).toEqual(expect.arrayContaining(['--element-width', '25', '--cols', '8']));
  });

  it('mirrors back sheets against their fronts', async () => {
    const cells = (block: string): string[] =>
      [...block.matchAll(/--image (\d+),(\d+),\S*?([\w.-]+)\.(front|back)\.png/g)].map(
        (m) => `${m[1]},${m[2]},${m[3]}`,
      );
    const [front, back] = script.split('# sheets/').filter((b) => b.startsWith('creature-'));

    const fronts = cells(front ?? '');
    const backs = cells(back ?? '');
    expect(fronts.length).toBeGreaterThan(0);
    expect(backs).toHaveLength(fronts.length);
    // Same component, mirrored column: 3 columns means 1 <-> 3.
    expect(fronts[0]?.startsWith('1,1,')).toBe(true);
    expect(backs[0]?.startsWith('1,3,')).toBe(true);
    expect(fronts[0]?.split(',')[2]).toBe(backs[0]?.split(',')[2]);
  });

  it('covers every cell of a partial sheet so print-cards stays non-interactive', async () => {
    // print-cards prompts unless --image and/or --back account for the whole grid.
    for (const block of script.split('# sheets/').slice(1)) {
      const images = [...block.matchAll(/--image /g)].length;
      const rows = Number(/--rows (\d+)/.exec(block)?.[1] ?? 0);
      const cols = Number(/--cols (\d+)/.exec(block)?.[1] ?? 0);
      if (images < rows * cols) expect(block).toContain('--back ./blank.png');
    }
    expect(await fs.stat(path.join(out, 'print', 'blank.png'))).toBeTruthy();
  });

  it('writes a runnable script with relative paths', () => {
    expect(script.startsWith('#!/usr/bin/env sh')).toBe(true);
    expect(script).toContain('cd "$(dirname "$0")"');
    expect(script).not.toMatch(/--image \d+,\d+,\//);
  });

  it('warns when the tool it tells you to run is not installed', async () => {
    const result = await printPlanCommand(
      {
        project: EXAMPLE,
        out: path.join(out, 'print-missing'),
        images: path.join(out, 'cards'),
        page: 'A4',
        command: 'definitely-not-installed-anywhere',
      },
      reporter,
    );
    expect(result.diagnostics?.some((d) => d.code === 'print/command-missing')).toBe(true);
  });

  it('stays quiet when the command resolves', async () => {
    const result = await printPlanCommand(
      // `sh` is on PATH wherever this suite can run at all.
      {
        project: EXAMPLE,
        out: path.join(out, 'print-sh'),
        images: path.join(out, 'cards'),
        page: 'A4',
        command: 'sh',
      },
      reporter,
    );
    expect(result.diagnostics?.some((d) => d.code === 'print/command-missing')).toBe(false);
  });
});
