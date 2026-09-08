import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeCards, loadProject, resolveCards, type Project } from '@deck-designer/core';
import { DeckRenderer, resolveChromiumPath } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/starter-deck');

let chromiumAvailable = true;
try {
  resolveChromiumPath();
} catch {
  chromiumAvailable = false;
}

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe.skipIf(!chromiumAvailable)('DeckRenderer', () => {
  let project: Project;
  let renderer: DeckRenderer;

  beforeAll(async () => {
    project = await loadProject({ cwd: EXAMPLE });
    renderer = await DeckRenderer.create(project, { concurrency: 2 });
  });

  afterAll(async () => {
    await renderer?.close();
  });

  it('rasterises at exactly the requested resolution', async () => {
    const { cards } = await resolveCards(project);
    const composed = await composeCards(
      project,
      cards.filter((c) => c.type === 'creature').slice(0, 2),
      { faces: ['front'] },
    );
    const { images, diagnostics } = await renderer.renderImages(composed);

    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(images).toHaveLength(2);
    for (const image of images) {
      // 63x88mm at 300dpi, with no outward rounding from the screenshot clip.
      expect(pngSize(image.buffer)).toEqual({ width: 744, height: 1039 });
      expect(image.width).toBe(744);
      expect(image.height).toBe(1039);
    }
  });

  it('renders components of different sizes in one pass', async () => {
    const { cards } = await resolveCards(project);
    const mixed = [
      cards.find((c) => c.type === 'creature'),
      cards.find((c) => c.type === 'token'),
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);
    expect(mixed).toHaveLength(2);

    const composed = await composeCards(project, mixed, { faces: ['front'] });
    const { images } = await renderer.renderImages(composed);
    const sizes = images.map((image) => pngSize(image.buffer));

    expect(sizes).toContainEqual({ width: 744, height: 1039 });
    // 25mm at 300dpi.
    expect(sizes).toContainEqual({ width: 295, height: 295 });
  });

  it('honours the bleed flag in the output size', async () => {
    const { cards } = await resolveCards(project);
    const composed = await composeCards(project, cards.slice(0, 1), { faces: ['front'] });
    const { images } = await renderer.renderImages(composed, {
      bleed: true,
      rounded: false,
      guides: false,
    });
    // 63x88mm plus 3mm of bleed on every side, at 300dpi.
    expect(pngSize(images[0]?.buffer as Buffer)).toEqual({ width: 815, height: 1110 });
  });

  it('blocks outbound requests so a build cannot depend on the network', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-net-'));
    try {
      await fs.mkdir(path.join(dir, 'templates'), { recursive: true });
      await fs.writeFile(
        path.join(dir, 'deck.yaml'),
        `version: 1
name: Net
card: { width: 63, height: 88 }
cardTypes:
  - id: unit
    template: templates/unit.liquid
    cards:
      - name: Alpha
    fields:
      name: { type: text }
`,
      );
      await fs.writeFile(
        path.join(dir, 'templates/unit.liquid'),
        '<img src="https://example.invalid/art.png" />{{ card.name }}',
      );

      const remote = await loadProject({ cwd: dir });
      const renderer2 = await DeckRenderer.create(remote);
      try {
        const { cards } = await resolveCards(remote);
        const composed = await composeCards(remote, cards);
        const { diagnostics } = await renderer2.renderImages(composed);
        expect(diagnostics.some((d) => d.code === 'render/asset-unreachable')).toBe(true);
      } finally {
        await renderer2.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
