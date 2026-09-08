import { DeckError } from '../util/errors.js';

export interface Size {
  width: number;
  height: number;
}

/** A front and, optionally, its back. Kept paired so duplex stays correct. */
export interface FacePair<T> {
  front: T;
  back?: T;
}

export interface Cell<T> {
  column: number;
  row: number;
  /** Top-left of the cell, in millimetres from the page corner. */
  x: number;
  y: number;
  item: T | null;
}

export interface Sheet<T> {
  index: number;
  face: 'front' | 'back';
  cells: Cell<T>[];
}

export interface Plan<T> {
  page: Size;
  cell: Size;
  grid: { columns: number; rows: number };
  margin: number;
  spacing: { horizontal: number; vertical: number };
  perSheet: number;
  sheets: Sheet<T>[];
}

export interface PlanOptions {
  page: Size;
  /** Trim size of one component. */
  cell: Size;
  /** Smallest acceptable margin; the grid is centred in what is left. */
  margin: number;
  spacing?: { horizontal: number; vertical: number };
  columns?: number;
  rows?: number;
  duplex?: 'none' | 'long-edge' | 'short-edge';
}

function spacingOf(options: PlanOptions): { horizontal: number; vertical: number } {
  return options.spacing ?? { horizontal: 0, vertical: 0 };
}

export function gridFor(options: PlanOptions): { columns: number; rows: number } {
  const spacing = spacingOf(options);
  const fit = (usable: number, size: number, gap: number): number =>
    Math.floor((usable + gap + 1e-6) / (size + gap));
  const columns = options.columns ?? fit(options.page.width - options.margin * 2, options.cell.width, spacing.horizontal);
  const rows = options.rows ?? fit(options.page.height - options.margin * 2, options.cell.height, spacing.vertical);
  if (columns < 1 || rows < 1) {
    throw new DeckError(
      `A ${options.cell.width}x${options.cell.height}mm component does not fit on a ` +
        `${options.page.width}x${options.page.height}mm page with a ${options.margin}mm margin.`,
      { code: 'layout/does-not-fit' },
    );
  }
  return { columns, rows };
}

/**
 * Arranges units into sheets. Backs get their own sheet right after the
 * matching front, mirrored on the flip axis so a duplex printer lands them on
 * the correct side of the paper.
 */
export function planSheets<T>(units: readonly FacePair<T>[], options: PlanOptions): Plan<T> {
  const { columns, rows } = gridFor(options);
  const spacing = spacingOf(options);
  const perSheet = columns * rows;

  const gridWidth = columns * options.cell.width + (columns - 1) * spacing.horizontal;
  const gridHeight = rows * options.cell.height + (rows - 1) * spacing.vertical;
  const originX = Math.max(options.margin, (options.page.width - gridWidth) / 2);
  const originY = Math.max(options.margin, (options.page.height - gridHeight) / 2);
  const position = (column: number, row: number): { x: number; y: number } => ({
    x: originX + column * (options.cell.width + spacing.horizontal),
    y: originY + row * (options.cell.height + spacing.vertical),
  });

  const duplex = options.duplex ?? 'long-edge';
  const hasBacks = duplex !== 'none' && units.some((unit) => unit.back !== undefined);
  const sheets: Sheet<T>[] = [];
  let index = 0;

  for (let start = 0; start < units.length; start += perSheet) {
    const chunk = units.slice(start, start + perSheet);

    sheets.push({
      index: index++,
      face: 'front',
      cells: chunk.map((unit, i) => {
        const column = i % columns;
        const row = Math.floor(i / columns);
        return { column, row, ...position(column, row), item: unit.front };
      }),
    });

    if (!hasBacks) continue;

    sheets.push({
      index: index++,
      face: 'back',
      cells: chunk.map((unit, i) => {
        const column = duplex === 'long-edge' ? columns - 1 - (i % columns) : i % columns;
        const row = duplex === 'short-edge' ? rows - 1 - Math.floor(i / columns) : Math.floor(i / columns);
        return { column, row, ...position(column, row), item: unit.back ?? null };
      }),
    });
  }

  return {
    page: options.page,
    cell: options.cell,
    grid: { columns, rows },
    margin: options.margin,
    spacing,
    perSheet,
    sheets,
  };
}
