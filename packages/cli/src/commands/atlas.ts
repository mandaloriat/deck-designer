import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_COLUMNS,
  MAX_ROWS,
  chunkForAtlases,
  findCardType,
  type ComposedCard,
  type Diagnostic,
} from '@deck-designer/core';
import { DeckRenderer } from '@deck-designer/render';
import type { CommandResult, Reporter } from '../output.js';
import { compose, prepare, type SelectionOptions } from '../select.js';

export interface AtlasCommandOptions extends SelectionOptions {
  out?: string;
  columns?: number;
  rows?: number;
  maxSize?: number;
  dpi?: number;
  allowNetwork?: boolean;
  concurrency?: number;
}

/**
 * Virtual tabletops import a deck as one image of all the faces plus a back,
 * not as a directory of cards. This writes that, and a description of what is
 * in each cell so the mapping back to component ids is not guesswork.
 */
export async function atlasCommand(
  options: AtlasCommandOptions,
  reporter: Reporter,
): Promise<CommandResult> {
  const { project, cards, diagnostics } = await prepare(options);
  if (cards.length === 0) {
    return {
      data: null,
      diagnostics: [...diagnostics, { severity: 'error', code: 'select/empty', message: 'No components matched.' }],
    };
  }

  const types = [...new Set(cards.map((card) => card.type))];
  const outDir = path.resolve(options.out ?? path.join(project.outputDir, 'atlas'));
  await fs.mkdir(outDir, { recursive: true });

  const grid = {
    ...(options.columns !== undefined ? { columns: options.columns } : {}),
    ...(options.rows !== undefined ? { rows: options.rows } : {}),
  };
  const maxSize = options.maxSize ?? 4096;

  const renderer = await DeckRenderer.create(project, {
    ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  });

  const written: Record<string, unknown>[] = [];
  const renderDiagnostics: Diagnostic[] = [];

  try {
    for (const typeId of types) {
      const type = findCardType(project, typeId);
      const selected = cards.filter((card) => card.type === typeId);
      const fronts = await compose(project, selected, ['front']);
      const backs = type?.backPath ? await compose(project, selected, ['back']) : [];

      // Identical markup means one image serves every card, which is what a
      // tabletop expects for an ordinary deck.
      const sharedBack = backs.length > 0 && new Set(backs.map((b) => b.html)).size === 1;

      const frontChunks = chunkForAtlases(fronts, grid);
      const backChunks = chunkForAtlases(backs, grid);

      for (const [index, chunk] of frontChunks.entries()) {
        const suffix = frontChunks.length > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
        const faces = await renderer.renderAtlas(chunk, { maxSize, maxDpi: options.dpi ?? project.render.dpi, ...grid });
        renderDiagnostics.push(...faces.diagnostics);
        const facesFile = `${typeId}-faces${suffix}.png`;
        await fs.writeFile(path.join(outDir, facesFile), faces.buffer);

        let backFile: string | null = null;
        if (sharedBack) {
          // The same resolution as the faces, so the back lands on exactly the
          // cell size a tabletop will slice the grid into.
          const single = await renderer.renderAtlas([backs[0] as ComposedCard], {
            maxSize: Number.MAX_SAFE_INTEGER,
            maxDpi: faces.plan.dpi,
            columns: 1,
            rows: 1,
          });
          renderDiagnostics.push(...single.diagnostics);
          backFile = `${typeId}-back.png`;
          await fs.writeFile(path.join(outDir, backFile), single.buffer);
        } else if (backs.length > 0) {
          const backChunk = backChunks[index];
          if (backChunk && backChunk.length > 0) {
            const grids = await renderer.renderAtlas(backChunk, {
              maxSize,
              maxDpi: options.dpi ?? project.render.dpi,
              ...grid,
            });
            renderDiagnostics.push(...grids.diagnostics);
            backFile = `${typeId}-backs${suffix}.png`;
            await fs.writeFile(path.join(outDir, backFile), grids.buffer);
          }
        }

        written.push({
          faces: facesFile,
          back: backFile,
          uniqueBacks: backs.length > 0 && !sharedBack,
          columns: faces.plan.columns,
          rows: faces.plan.rows,
          count: faces.plan.count,
          dpi: Math.round(faces.plan.dpi),
          cardWidthPx: faces.plan.cardWidthPx,
          cardHeightPx: faces.plan.cardHeightPx,
          widthPx: faces.plan.widthPx,
          heightPx: faces.plan.heightPx,
          cards: chunk.map((item, i) => ({
            index: i,
            id: item.card.id,
            row: Math.floor(i / faces.plan.columns) + 1,
            column: (i % faces.plan.columns) + 1,
          })),
        });

        reporter.step(
          `${facesFile}: ${faces.plan.count} face(s), ${faces.plan.columns}x${faces.plan.rows}, ` +
            `${faces.plan.widthPx}x${faces.plan.heightPx}px`,
        );
      }
    }
  } finally {
    await renderer.close();
  }

  const manifest = {
    schema: 'deck-designer/atlas@1',
    project: project.name,
    generatedAt: new Date().toISOString(),
    note:
      'Import into a virtual tabletop as a custom deck: the faces image, the back image, ' +
      'and the columns/rows/count below. Each atlas is capped at ' +
      `${MAX_COLUMNS}x${MAX_ROWS}, which is what Tabletop Simulator accepts.`,
    atlases: written,
  };
  const manifestPath = path.join(outDir, 'atlas.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  reporter.info(`Wrote ${written.length} atlas file set(s) to ${outDir}`);

  return {
    data: { out: outDir, manifest: manifestPath, atlases: written },
    diagnostics: [...diagnostics, ...renderDiagnostics],
  };
}
