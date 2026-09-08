import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadProject, resolveCards, type Card, type Project } from '@deck-designer/core';
import { resolveChromiumPath } from '@deck-designer/render';
import { renderToDisk } from '../src/images.js';
import { Reporter } from '../src/output.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/briscola');
const reporter = new Reporter({ json: false, quiet: true, color: false });

let chromiumAvailable = true;
try {
  resolveChromiumPath();
} catch {
  chromiumAvailable = false;
}

describe.skipIf(!chromiumAvailable)('writing rendered images', () => {
  let project: Project;
  let cards: Card[];
  let out: string;

  beforeAll(async () => {
    project = await loadProject({ cwd: EXAMPLE });
    cards = (await resolveCards(project)).cards;
    out = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-images-'));
  }, 120_000);

  afterAll(async () => {
    await fs.rm(out, { recursive: true, force: true });
  });

  const flags = { bleed: false, rounded: false, guides: false };

  it('accepts a constant name when only one face is written', async () => {
    // A deck has one shared back, and "back.png" is what a tabletop expects it
    // to be called.
    const dir = path.join(out, 'single');
    const result = await renderToDisk(
      {
        project,
        cards: cards.slice(0, 1),
        faces: ['back'],
        outDir: dir,
        pattern: 'back.png',
        flags,
        dpi: 96,
      },
      reporter,
    );
    expect(result.files.map((f) => f.relative)).toEqual(['back.png']);
    expect(await fs.readdir(dir)).toEqual(['back.png']);
  });

  it('refuses a name two faces would share, before writing anything', async () => {
    const dir = path.join(out, 'clash');
    await expect(
      renderToDisk(
        { project, cards: cards.slice(0, 3), faces: ['front'], outDir: dir, pattern: 'front.png', flags, dpi: 96 },
        reporter,
      ),
    ).rejects.toThrow(/would be written to "front.png"/);
    // Nothing half-written: the clash is found before the first file.
    await expect(fs.readdir(dir)).rejects.toThrow();
  });

  it('writes the folder layout a tabletop reads', async () => {
    const dir = path.join(out, 'deck');
    await renderToDisk(
      {
        project,
        cards,
        faces: ['front'],
        outDir: dir,
        pattern: 'front-{id}.png',
        flags,
        dpi: 96,
      },
      reporter,
    );
    await renderToDisk(
      { project, cards: cards.slice(0, 1), faces: ['back'], outDir: dir, pattern: 'back.png', flags, dpi: 96 },
      reporter,
    );

    const entries = (await fs.readdir(dir)).sort();
    expect(entries.filter((f) => f.startsWith('front-'))).toHaveLength(40);
    expect(entries).toContain('back.png');
  });
});
