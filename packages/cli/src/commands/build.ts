import fs from 'node:fs/promises';
import path from 'node:path';
import { expandCopies, parseLength, type Diagnostic } from '@deck-designer/core';
import { DeckRenderer } from '@deck-designer/render';
import type { CommandResult, Reporter } from '../output.js';
import { applyOrientation, resolvePage } from '../geometry.js';
import { compose, facesFrom, prepare, type SelectionOptions } from '../select.js';
import { imageFileName, writeImages } from './export.js';

export interface BuildOptions extends SelectionOptions {
  out?: string;
  dpi?: number;
  images?: boolean;
  profiles?: boolean;
  clean?: boolean;
  allowNetwork?: boolean;
  concurrency?: number;
}

/**
 * Runs everything the project declares: card images, every configured output
 * profile, and a manifest describing what was produced. Designed to be the one
 * command a CI job or an agent needs to call.
 */
export async function buildCommand(options: BuildOptions, reporter: Reporter): Promise<CommandResult> {
  const started = Date.now();
  const { project, cards, diagnostics } = await prepare(options);
  const outDir = path.resolve(options.out ?? project.outputDir);

  if (options.clean) {
    await fs.rm(outDir, { recursive: true, force: true });
    reporter.step(`Cleaned ${outDir}`);
  }
  await fs.mkdir(outDir, { recursive: true });

  const faces = facesFrom(options);
  const composed = await compose(project, cards, faces);
  reporter.step(`Composed ${composed.length} face(s)`);

  const renderer = await DeckRenderer.create(project, {
    ...(options.dpi !== undefined ? { dpi: options.dpi } : {}),
    ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
  });

  const outputs: { name: string; kind: string; file: string; pages?: number }[] = [];
  const renderDiagnostics: Diagnostic[] = [];
  const imagesByCard = new Map<string, Record<string, string>>();

  try {
    if (options.images !== false) {
      const cardsDir = path.join(outDir, 'cards');
      const result = await renderer.renderImages(composed, { bleed: false, rounded: false, guides: false });
      renderDiagnostics.push(...result.diagnostics);
      const files = await writeImages(cardsDir, result.images);
      for (const image of result.images) {
        const entry = imagesByCard.get(image.cardId) ?? {};
        entry[image.face] = path.relative(outDir, path.join(cardsDir, image.typeId, imageFileName(image.cardId, image.face)));
        imagesByCard.set(image.cardId, entry);
      }
      reporter.step(`Rendered ${files.length} card image(s) at ${renderer.dpi} dpi`);
    }

    if (options.profiles !== false) {
      for (const [name, profile] of Object.entries(project.profiles)) {
        const file = path.join(outDir, `${name}.pdf`);
        if (profile.kind === 'single') {
          const subset = profile.backs === 'none' ? composed.filter((c) => c.face === 'front') : composed;
          const ordered = profile.backs === 'append' ? orderAppend(subset) : subset;
          const { pdf, diagnostics: d } = await renderer.renderSinglePdf(ordered, {
            bleed: profile.bleed,
            rounded: false,
            guides: false,
          });
          renderDiagnostics.push(...d);
          await fs.writeFile(file, pdf);
          outputs.push({ name, kind: 'single', file, pages: ordered.length });
        } else {
          const page = applyOrientation(resolvePage(profile.page, project), profile.orientation);
          const printRun = await compose(project, expandCopies(cards), faces);
          const { pdf, imposition, diagnostics: d } = await renderer.renderSheetPdf(
            printRun,
            {
              page,
              margin: parseLength(profile.margin, project.units),
              gutter: parseLength(profile.gutter, project.units),
              ...(profile.columns !== undefined ? { columns: profile.columns } : {}),
              ...(profile.rows !== undefined ? { rows: profile.rows } : {}),
              duplex: profile.duplex,
              marks: profile.marks,
            },
            { bleed: profile.bleed, rounded: false, guides: false },
          );
          renderDiagnostics.push(...d);
          await fs.writeFile(file, pdf);
          outputs.push({ name, kind: 'sheet', file, pages: imposition.pages.length });
        }
        reporter.step(`Rendered profile "${name}" -> ${file}`);
      }
    }
  } finally {
    await renderer.close();
  }

  const manifest = {
    schema: 'deck-designer/manifest@1',
    project: project.name,
    generatedAt: new Date().toISOString(),
    dpi: renderer.dpi,
    cardTypes: project.cardTypes.map((type) => ({
      id: type.id,
      name: type.name,
      geometry: type.geometry,
      hasBack: type.backPath !== undefined,
    })),
    cards: cards.map((card) => ({
      id: card.id,
      type: card.type,
      copies: card.copies,
      values: card.values,
      images: imagesByCard.get(card.id) ?? {},
      source: card.source,
    })),
    outputs: outputs.map((o) => ({ ...o, file: path.relative(outDir, o.file) })),
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const all = [...diagnostics, ...renderDiagnostics];
  reporter.info(
    `Built ${cards.length} card(s) into ${outDir} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  return {
    data: {
      out: outDir,
      manifest: manifestPath,
      cards: cards.length,
      images: [...imagesByCard.values()].reduce((sum, faces) => sum + Object.keys(faces).length, 0),
      outputs,
    },
    diagnostics: all,
  };
}

/** Fronts first, then every back, for print shops that duplex a whole stack. */
function orderAppend<T extends { face: string }>(composed: readonly T[]): T[] {
  return [...composed.filter((c) => c.face === 'front'), ...composed.filter((c) => c.face === 'back')];
}
