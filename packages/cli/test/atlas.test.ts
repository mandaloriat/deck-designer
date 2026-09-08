import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveChromiumPath } from '@deck-designer/render';
import { atlasCommand } from '../src/commands/atlas.js';
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

function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

interface Atlas {
  faces: string;
  back: string | null;
  uniqueBacks: boolean;
  columns: number;
  rows: number;
  count: number;
  widthPx: number;
  heightPx: number;
  cardWidthPx: number;
  cardHeightPx: number;
  cards: { index: number; id: string; row: number; column: number }[];
}

describe.skipIf(!chromiumAvailable)('atlas', () => {
  let out: string;
  let atlas: Atlas;

  beforeAll(async () => {
    out = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-atlas-'));
    const result = await atlasCommand({ project: EXAMPLE, out }, reporter);
    atlas = (result.data as { atlases: Atlas[] }).atlases[0] as Atlas;
  }, 180_000);

  afterAll(async () => {
    await fs.rm(out, { recursive: true, force: true });
  });

  it('lays the whole deck into one grid', () => {
    expect(atlas).toMatchObject({ columns: 10, rows: 4, count: 40 });
    expect(atlas.cards).toHaveLength(40);
  });

  it('writes an image whose real size is the one it reports, under the cap', async () => {
    const buffer = await fs.readFile(path.join(out, atlas.faces));
    expect(pngSize(buffer)).toEqual({ width: atlas.widthPx, height: atlas.heightPx });
    expect(Math.max(atlas.widthPx, atlas.heightPx)).toBeLessThanOrEqual(4096);
  });

  it('renders one shared back at exactly the cell size', async () => {
    // A tabletop slices the grid by dividing it, so a back a pixel off would
    // not line up with the faces it belongs to.
    expect(atlas.uniqueBacks).toBe(false);
    expect(atlas.back).toBe('card-back.png');
    const buffer = await fs.readFile(path.join(out, atlas.back as string));
    expect(pngSize(buffer)).toEqual({ width: atlas.cardWidthPx, height: atlas.cardHeightPx });
  });

  it('says which component is in which cell', () => {
    expect(atlas.cards[0]).toMatchObject({ index: 0, id: 'denari-01', row: 1, column: 1 });
    expect(atlas.cards[10]).toMatchObject({ index: 10, id: 'coppe-01', row: 2, column: 1 });
    expect(atlas.cards[39]).toMatchObject({ index: 39, row: 4, column: 10 });
  });

  it('writes a manifest next to the images', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(out, 'atlas.json'), 'utf8')) as {
      schema: string;
      atlases: unknown[];
    };
    expect(manifest.schema).toBe('deck-designer/atlas@1');
    expect(manifest.atlases).toHaveLength(1);
  });
});
