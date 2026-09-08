import fs from 'node:fs/promises';
import path from 'node:path';
import {
  expandCopies,
  findCardType,
  parseLength,
  planSheets,
  type Card,
  type FacePair,
  type Geometry,
  type Project,
} from '@deck-designer/core';
import type { CommandResult, Reporter } from '../output.js';
import { pageFormatNames, resolvePage } from '../geometry.js';
import { DEFAULT_NAME_PATTERN, formatName } from '../naming.js';
import { nameContexts } from '../images.js';
import { prepare, type SelectionOptions } from '../select.js';

export interface PrintPlanOptions extends SelectionOptions {
  out?: string;
  images?: string;
  name?: string;
  page?: string;
  margin?: string;
  spacingH?: string;
  spacingV?: string;
  columns?: number;
  rows?: number;
  duplex?: 'none' | 'long-edge' | 'short-edge';
  copies?: boolean;
  bleedWidth?: string;
  bleedColor?: string;
  imageFit?: 'fit' | 'fill' | 'stretch' | 'crop';
  command?: string;
}

const BLANK_FILE = 'blank.png';
/** A 1x1 fully transparent PNG; ReportLab's `mask="auto"` draws nothing for it. */
const BLANK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

interface Invocation {
  face: 'front' | 'back';
  args: string[];
  output: string;
  filled: number;
}

/**
 * Turns rendered PNGs into ready-to-run print-cards invocations. Imposition
 * belongs to whatever puts ink on paper; what this tool knows and print-cards
 * does not is which component goes in which cell, and how backs have to be
 * mirrored so duplex printing lines up.
 */
export async function printPlanCommand(
  options: PrintPlanOptions,
  reporter: Reporter,
): Promise<CommandResult> {
  const { project, cards, diagnostics } = await prepare(options, false);
  if (cards.length === 0) {
    return {
      data: null,
      diagnostics: [
        ...diagnostics,
        {
          severity: 'error',
          code: 'select/empty',
          message: 'No components matched the selection.',
        },
      ],
    };
  }

  const outDir = path.resolve(options.out ?? path.join(project.outputDir, 'print'));
  const imagesDir = path.resolve(options.images ?? path.join(project.outputDir, 'cards'));
  const pattern = options.name ?? DEFAULT_NAME_PATTERN;
  const page = resolvePage(options.page ?? 'A4', project);
  const margin = parseLength(options.margin ?? 5, project.units);
  const spacing = {
    horizontal: parseLength(options.spacingH ?? 0, project.units),
    vertical: parseLength(options.spacingV ?? 0, project.units),
  };
  const duplex = options.duplex ?? 'long-edge';
  const command = options.command ?? 'print-cards';

  if (page.format === null) {
    diagnostics.push({
      severity: 'error',
      code: 'print/unsupported-page',
      message: `print-cards only accepts named page formats (${pageFormatNames().join(', ')}).`,
      hint: 'Pass one of those to --page instead of an explicit size.',
    });
    return { data: null, diagnostics };
  }

  const missing = new Set<string>();
  const paths = await imagePaths(project, cards, imagesDir, pattern, missing);
  for (const relative of missing) {
    diagnostics.push({
      severity: 'warning',
      code: 'print/missing-image',
      message: `No rendered image at ${relative}; its cell was left empty.`,
      hint: 'Run `deck build` first, or point --images at the directory you rendered into.',
    });
  }

  const invocations: Invocation[] = [];
  const groups = groupByGeometry(project, cards);
  let needsBlank = false;

  for (const [label, group] of groups) {
    const geometry = group.geometry;
    const units: FacePair<string>[] = [];
    for (const card of options.copies === false ? group.cards : expandCopies(group.cards)) {
      const faces = paths.get(card.id);
      if (!faces?.front) continue;
      units.push(faces.back ? { front: faces.front, back: faces.back } : { front: faces.front });
    }
    if (units.length === 0) continue;

    const plan = planSheets(units, {
      page: page.size,
      cell: { width: geometry.width, height: geometry.height },
      margin,
      spacing,
      ...(options.columns !== undefined ? { columns: options.columns } : {}),
      ...(options.rows !== undefined ? { rows: options.rows } : {}),
      duplex,
    });

    let frontNumber = 0;
    let backNumber = 0;
    for (const sheet of plan.sheets) {
      const number = sheet.face === 'front' ? ++frontNumber : ++backNumber;
      const output = `sheets/${label}-${sheet.face}-${String(number).padStart(2, '0')}.pdf`;
      const filled = sheet.cells.filter((cell) => cell.item !== null);

      const args = [
        '--format',
        page.format,
        '--rows',
        String(plan.grid.rows),
        '--cols',
        String(plan.grid.columns),
        '--element-width',
        String(round(geometry.width)),
        '--element-height',
        String(round(geometry.height)),
        '--spacing-h',
        String(round(spacing.horizontal)),
        '--spacing-v',
        String(round(spacing.vertical)),
      ];
      if (options.imageFit) args.push('--image-fit', options.imageFit);
      if (options.bleedWidth !== undefined) {
        args.push('--bleed-width', String(round(parseLength(options.bleedWidth, project.units))));
      }
      if (options.bleedColor !== undefined) args.push('--bleed-color', options.bleedColor);

      for (const cell of filled) {
        args.push('--image', `${cell.row + 1},${cell.column + 1},${relativeTo(outDir, cell.item as string)}`);
      }
      // print-cards drops to interactive prompts unless every grid position is
      // accounted for. A transparent filler covers the leftovers on the last
      // sheet, which also keeps every component on the same physical spot as on
      // a full sheet — the thing that matters when printing on pre-cut stock.
      if (filled.length < plan.perSheet) {
        args.push('--back', `./${BLANK_FILE}`);
        needsBlank = true;
      }
      args.push('--output', output);

      invocations.push({ face: sheet.face, args, output, filled: filled.length });
    }

    reporter.step(
      `${label}: ${units.length} component(s), ${plan.grid.columns}x${plan.grid.rows} per ${page.format} sheet`,
    );
  }

  if (invocations.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'print/nothing-to-print',
      message: 'No rendered images were found, so there is nothing to lay out.',
      hint: 'Run `deck build` first.',
    });
    return { data: null, diagnostics };
  }

  if (needsBlank && options.bleedWidth !== undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'print/partial-sheet-bleed',
      message: 'The last sheet of a group is not full, and --bleed-width paints a solid tile behind every cell.',
      hint: 'Those cells print as blank coloured rectangles. Drop --bleed-width, or adjust copies so sheets fill.',
    });
  }

  await fs.mkdir(outDir, { recursive: true });
  if (needsBlank) await fs.writeFile(path.join(outDir, BLANK_FILE), Buffer.from(BLANK_PNG_BASE64, 'base64'));

  const plan = {
    schema: 'deck-designer/print-plan@1',
    project: project.name,
    generatedAt: new Date().toISOString(),
    tool: command,
    page: { format: page.format, ...page.size },
    duplex,
    sheets: invocations.map((invocation) => ({
      output: invocation.output,
      face: invocation.face,
      components: invocation.filled,
      args: invocation.args,
    })),
  };
  await fs.writeFile(path.join(outDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

  const script = renderScript(command, invocations);
  const scriptPath = path.join(outDir, 'print-cards.sh');
  await fs.writeFile(scriptPath, script, { mode: 0o755 });

  reporter.info(`Wrote ${invocations.length} sheet(s) to ${scriptPath}`);
  reporter.info(`Run: sh ${path.relative(process.cwd(), scriptPath)}`);

  return {
    data: {
      out: outDir,
      script: scriptPath,
      plan: path.join(outDir, 'plan.json'),
      sheets: invocations.length,
    },
    diagnostics,
  };
}

interface GeometryGroup {
  geometry: Geometry;
  cards: Card[];
}

/** print-cards takes one element size per run, so components are grouped by size. */
function groupByGeometry(project: Project, cards: readonly Card[]): Map<string, GeometryGroup> {
  const groups = new Map<string, GeometryGroup>();
  const typesPerSize = new Map<string, Set<string>>();

  for (const card of cards) {
    const type = findCardType(project, card.type);
    if (!type) continue;
    const key = `${round(type.geometry.width)}x${round(type.geometry.height)}`;
    const group = groups.get(key) ?? { geometry: type.geometry, cards: [] };
    group.cards.push(card);
    groups.set(key, group);
    const types = typesPerSize.get(key) ?? new Set<string>();
    types.add(type.id);
    typesPerSize.set(key, types);
  }

  // Label by card type when a size is used by exactly one, otherwise by size.
  const labelled = new Map<string, GeometryGroup>();
  for (const [key, group] of groups) {
    const types = typesPerSize.get(key);
    const label = types && types.size === 1 ? ([...types][0] as string) : key;
    labelled.set(label, group);
  }
  return labelled;
}

async function imagePaths(
  project: Project,
  cards: readonly Card[],
  imagesDir: string,
  pattern: string,
  missing: Set<string>,
): Promise<Map<string, { front?: string; back?: string }>> {
  const contexts = nameContexts(project, cards);
  const out = new Map<string, { front?: string; back?: string }>();

  for (const card of cards) {
    const context = contexts.get(card.id);
    if (!context) continue;
    const type = findCardType(project, card.type);
    const faces: ('front' | 'back')[] = type?.backPath ? ['front', 'back'] : ['front'];
    const entry: { front?: string; back?: string } = {};
    for (const face of faces) {
      const relative = formatName(pattern, { ...context, face });
      const file = path.join(imagesDir, relative);
      if (await exists(file)) entry[face] = file;
      else missing.add(relative);
    }
    out.set(card.id, entry);
  }
  return out;
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

function relativeTo(outDir: string, file: string): string {
  const relative = path.relative(outDir, file).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./=,+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

function renderScript(command: string, invocations: readonly Invocation[]): string {
  const body = invocations
    .map((invocation) => {
      const args = invocation.args.map(shellQuote);
      const lines: string[] = [`${command} \\`];
      for (let i = 0; i < args.length; i += 2) {
        const pair = args.slice(i, i + 2).join(' ');
        lines.push(`  ${pair}${i + 2 < args.length ? ' \\' : ''}`);
      }
      return `# ${invocation.output} (${invocation.filled} component(s))\n${lines.join('\n')}`;
    })
    .join('\n\n');

  return `#!/usr/bin/env sh
# Generated by deck print-plan. Paths are relative to this file.
set -eu
cd "$(dirname "$0")"
mkdir -p sheets

${body}
`;
}
