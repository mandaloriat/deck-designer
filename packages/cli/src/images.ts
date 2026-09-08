import fs from 'node:fs/promises';
import path from 'node:path';
import { findCardType, type Card, type Diagnostic, type Face, type Project } from '@deck-designer/core';
import { DeckRenderer, type RenderFlags } from '@deck-designer/render';
import { compose } from './select.js';
import { formatName, type NameContext } from './naming.js';
import type { Reporter } from './output.js';

export interface WrittenImage {
  card: string;
  type: string;
  face: string;
  /** Path relative to the output directory, POSIX separators. */
  relative: string;
  file: string;
  width: number;
  height: number;
}

export interface RenderToDiskOptions {
  project: Project;
  cards: readonly Card[];
  faces: readonly Face[];
  outDir: string;
  pattern: string;
  flags: RenderFlags;
  dpi?: number;
  allowNetwork?: boolean;
  concurrency?: number;
}

/**
 * Composes, rasterises and writes every requested face. Kept in one place so
 * `build` and `export png` cannot drift apart in naming or defaults.
 */
export async function renderToDisk(
  options: RenderToDiskOptions,
  reporter: Reporter,
): Promise<{ files: WrittenImage[]; diagnostics: Diagnostic[]; dpi: number }> {
  const composed = await compose(options.project, options.cards, options.faces);
  reporter.step(`Composed ${composed.length} face(s) from ${options.cards.length} component(s)`);

  const renderer = await DeckRenderer.create(options.project, {
    ...(options.dpi !== undefined ? { dpi: options.dpi } : {}),
    ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  });

  try {
    const { images, diagnostics } = await renderer.renderImages(composed, options.flags);
    const context = nameContexts(options.project, options.cards);
    // Judge the outcome, not the pattern: a constant name is exactly right when
    // one face is being written (a deck's single shared back), and wrong only
    // when two would land on the same path. Resolved before anything is written,
    // so a clash does not leave half a directory behind.
    const planned = images.flatMap((image) => {
      const base = context.get(image.cardId);
      return base ? [{ image, relative: formatName(options.pattern, { ...base, face: image.face }) }] : [];
    });

    const claimed = new Map<string, string>();
    for (const { image, relative } of planned) {
      const owner = `${image.cardId} (${image.face})`;
      const previous = claimed.get(relative);
      if (previous !== undefined) {
        throw new Error(
          `Both ${previous} and ${owner} would be written to "${relative}". ` +
            'Add {id}, {name}, {index} or {face} to --name, or narrow the selection.',
        );
      }
      claimed.set(relative, owner);
    }

    const files: WrittenImage[] = [];
    for (const { image, relative } of planned) {
      const file = path.join(options.outDir, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, image.buffer);
      files.push({
        card: image.cardId,
        type: image.typeId,
        face: image.face,
        relative,
        file,
        width: image.width,
        height: image.height,
      });
    }

    reporter.step(`Wrote ${files.length} PNG(s) at ${renderer.dpi} dpi to ${options.outDir}`);
    return { files, diagnostics, dpi: renderer.dpi };
  } finally {
    await renderer.close();
  }
}

export function nameContexts(
  project: Project,
  cards: readonly Card[],
): Map<string, Omit<NameContext, 'face'>> {
  const perType = new Map<string, number>();
  const counted = cards.map((card) => {
    const next = (perType.get(card.type) ?? 0) + 1;
    perType.set(card.type, next);
    return { card, index: next };
  });
  const indexWidth = String(Math.max(1, ...perType.values())).length;

  return new Map(
    counted.map(({ card, index }) => {
      const idFrom = findCardType(project, card.type)?.idFrom ?? 'name';
      const label = card.values[idFrom];
      return [
        card.id,
        {
          card,
          index,
          indexWidth,
          ...(typeof label === 'string' ? { label } : {}),
        },
      ];
    }),
  );
}
