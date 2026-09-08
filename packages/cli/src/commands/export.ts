import path from 'node:path';
import type { Diagnostic } from '@deck-designer/core';
import type { RenderFlags } from '@deck-designer/render';
import type { CommandResult, Reporter } from '../output.js';
import { renderToDisk } from '../images.js';
import { DEFAULT_NAME_PATTERN } from '../naming.js';
import { facesFrom, prepare, type SelectionOptions } from '../select.js';

export interface ExportOptions extends SelectionOptions {
  out?: string;
  dpi?: number;
  bleed?: boolean;
  rounded?: boolean;
  guides?: boolean;
  name?: string;
  allowNetwork?: boolean;
  concurrency?: number;
}

export async function exportCommand(options: ExportOptions, reporter: Reporter): Promise<CommandResult> {
  const { project, cards, diagnostics } = await prepare(options);
  if (cards.length === 0) {
    return { data: { files: [] }, diagnostics: [...diagnostics, missingSelection()] };
  }

  const flags: RenderFlags = {
    bleed: options.bleed ?? false,
    rounded: options.rounded ?? false,
    guides: options.guides ?? false,
  };

  const outDir = path.resolve(options.out ?? path.join(project.outputDir, 'cards'));
  const result = await renderToDisk(
    {
      project,
      cards,
      faces: facesFrom(options),
      outDir,
      pattern: options.name ?? DEFAULT_NAME_PATTERN,
      flags,
      ...(options.dpi !== undefined ? { dpi: options.dpi } : {}),
      ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    },
    reporter,
  );

  return {
    data: { out: outDir, dpi: result.dpi, files: result.files },
    diagnostics: [...diagnostics, ...result.diagnostics],
  };
}

function missingSelection(): Diagnostic {
  return {
    severity: 'error',
    code: 'select/empty',
    message: 'No components matched the selection.',
    hint: 'Check --type / --id / --where, or run `deck cards` to see what is available.',
  };
}
