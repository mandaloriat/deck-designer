import fs from 'node:fs/promises';
import path from 'node:path';
import { expandCopies, parseLength, type Diagnostic, type Project } from '@deck-designer/core';
import { DeckRenderer, type RenderFlags } from '@deck-designer/render';
import type { CommandResult, Reporter } from '../output.js';
import { applyOrientation, resolvePage } from '../geometry.js';
import { compose, facesFrom, prepare, type SelectionOptions } from '../select.js';

export type ExportFormat = 'png' | 'pdf' | 'sheet';

export interface ExportOptions extends SelectionOptions {
  out?: string;
  dpi?: number;
  bleed?: boolean;
  rounded?: boolean;
  guides?: boolean;
  copies?: boolean;
  profile?: string;
  page?: string;
  orientation?: 'portrait' | 'landscape';
  margin?: string;
  gutter?: string;
  columns?: number;
  rows?: number;
  duplex?: 'none' | 'long-edge' | 'short-edge';
  marks?: boolean;
  allowNetwork?: boolean;
  concurrency?: number;
}

export async function exportCommand(
  format: ExportFormat,
  options: ExportOptions,
  reporter: Reporter,
): Promise<CommandResult> {
  const { project, cards, diagnostics } = await prepare(options);
  if (cards.length === 0) {
    return { data: { files: [] }, diagnostics: [...diagnostics, missingSelection()] };
  }

  const faces = facesFrom(options);
  const selected = options.copies ? expandCopies(cards) : cards;
  const composed = await compose(project, selected, faces);
  reporter.step(`Composed ${composed.length} face(s) from ${cards.length} card(s)`);

  const flags = resolveFlags(format, options);
  const renderer = await DeckRenderer.create(project, {
    ...(options.dpi !== undefined ? { dpi: options.dpi } : {}),
    ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  });

  try {
    if (format === 'png') {
      const outDir = path.resolve(options.out ?? path.join(project.outputDir, 'cards'));
      const result = await renderer.renderImages(composed, flags);
      const files = await writeImages(outDir, result.images);
      reporter.step(`Wrote ${files.length} PNG(s) to ${outDir}`);
      return { data: { format, dpi: renderer.dpi, files }, diagnostics: [...diagnostics, ...result.diagnostics] };
    }

    const outFile = path.resolve(
      options.out ?? path.join(project.outputDir, format === 'pdf' ? 'cards.pdf' : 'sheets.pdf'),
    );
    await fs.mkdir(path.dirname(outFile), { recursive: true });

    if (format === 'pdf') {
      const { pdf, diagnostics: renderDiagnostics } = await renderer.renderSinglePdf(composed, flags);
      await fs.writeFile(outFile, pdf);
      reporter.step(`Wrote ${outFile}`);
      return {
        data: { format, file: outFile, pages: composed.length },
        diagnostics: [...diagnostics, ...renderDiagnostics],
      };
    }

    const layout = resolveSheetLayout(project, options);
    const { pdf, imposition, diagnostics: renderDiagnostics } = await renderer.renderSheetPdf(
      composed,
      layout,
      flags,
    );
    await fs.writeFile(outFile, pdf);
    reporter.step(
      `Wrote ${outFile} (${imposition.pages.length} page(s), ${imposition.grid.columns}x${imposition.grid.rows} per sheet)`,
    );
    return {
      data: {
        format,
        file: outFile,
        pages: imposition.pages.length,
        grid: imposition.grid,
        perPage: imposition.perPage,
        page: imposition.page,
      },
      diagnostics: [...diagnostics, ...renderDiagnostics],
    };
  } finally {
    await renderer.close();
  }
}

function missingSelection(): Diagnostic {
  return {
    severity: 'error',
    code: 'select/empty',
    message: 'No cards matched the selection.',
    hint: 'Check --type / --id / --where, or run `deck cards` to see what is available.',
  };
}

function resolveFlags(format: ExportFormat, options: ExportOptions): RenderFlags {
  return {
    // Print output defaults to including bleed; screen output does not.
    bleed: options.bleed ?? format === 'sheet',
    rounded: options.rounded ?? false,
    guides: options.guides ?? false,
  };
}

function resolveSheetLayout(project: Project, options: ExportOptions): {
  page: { width: number; height: number };
  margin: number;
  gutter: number;
  columns?: number;
  rows?: number;
  duplex: 'none' | 'long-edge' | 'short-edge';
  marks: boolean;
} {
  const page = applyOrientation(
    resolvePage(options.page ?? 'A4', project),
    options.orientation ?? 'portrait',
  );
  return {
    page,
    margin: parseLength(options.margin ?? 8, project.units),
    gutter: parseLength(options.gutter ?? 0, project.units),
    ...(options.columns !== undefined ? { columns: options.columns } : {}),
    ...(options.rows !== undefined ? { rows: options.rows } : {}),
    duplex: options.duplex ?? 'long-edge',
    marks: options.marks ?? true,
  };
}

export function imageFileName(cardId: string, face: string): string {
  return `${cardId}.${face}.png`;
}

export async function writeImages(
  outDir: string,
  images: readonly { cardId: string; typeId: string; face: string; buffer: Buffer; width: number; height: number }[],
): Promise<{ card: string; face: string; file: string; width: number; height: number }[]> {
  const written: { card: string; face: string; file: string; width: number; height: number }[] = [];
  for (const image of images) {
    const dir = path.join(outDir, image.typeId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, imageFileName(image.cardId, image.face));
    await fs.writeFile(file, image.buffer);
    written.push({ card: image.cardId, face: image.face, file, width: image.width, height: image.height });
  }
  return written;
}
