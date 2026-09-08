import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandResult, Reporter } from '../output.js';
import { renderToDisk } from '../images.js';
import { DEFAULT_NAME_PATTERN } from '../naming.js';
import { facesFrom, prepare, type SelectionOptions } from '../select.js';

export interface BuildOptions extends SelectionOptions {
  out?: string;
  dpi?: number;
  name?: string;
  bleed?: boolean;
  rounded?: boolean;
  clean?: boolean;
  allowNetwork?: boolean;
  concurrency?: number;
}

/**
 * Renders every selected component and writes a manifest describing what was
 * produced. Designed to be the one command a CI job or an agent has to call.
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

  const cardsDir = path.join(outDir, 'cards');
  const result = await renderToDisk(
    {
      project,
      cards,
      faces: facesFrom(options),
      outDir: cardsDir,
      pattern: options.name ?? DEFAULT_NAME_PATTERN,
      flags: {
        bleed: options.bleed ?? false,
        rounded: options.rounded ?? false,
        guides: false,
      },
      ...(options.dpi !== undefined ? { dpi: options.dpi } : {}),
      ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    },
    reporter,
  );

  const byCard = new Map<string, Record<string, { file: string; width: number; height: number }>>();
  for (const file of result.files) {
    const entry = byCard.get(file.card) ?? {};
    entry[file.face] = {
      file: path.relative(outDir, file.file).split(path.sep).join('/'),
      width: file.width,
      height: file.height,
    };
    byCard.set(file.card, entry);
  }

  const manifest = {
    schema: 'deck-designer/manifest@1',
    project: project.name,
    generatedAt: new Date().toISOString(),
    dpi: result.dpi,
    componentTypes: project.cardTypes.map((type) => ({
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
      images: byCard.get(card.id) ?? {},
      source: card.source,
    })),
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  reporter.info(
    `Built ${cards.length} component(s) into ${outDir} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  return {
    data: {
      out: outDir,
      manifest: manifestPath,
      cards: cards.length,
      images: result.files.length,
      dpi: result.dpi,
    },
    diagnostics: [...diagnostics, ...result.diagnostics],
  };
}
