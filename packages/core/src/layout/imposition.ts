import type { Face } from '../template/engine.js';
import type { ComposedCard } from '../template/compose.js';
import { DeckError } from '../util/errors.js';

export interface Size {
  width: number;
  height: number;
}

/** A front plus, optionally, its back. Backs stay paired so duplex stays correct. */
export interface CardUnit {
  front: ComposedCard;
  back?: ComposedCard;
}

export interface Slot {
  column: number;
  row: number;
  /** Top-left of the card's bleed box, in millimetres from the page corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  card: ComposedCard | null;
}

export interface SheetPage {
  index: number;
  face: Face;
  slots: Slot[];
}

export interface Imposition {
  page: Size;
  cell: Size;
  grid: { columns: number; rows: number };
  margin: number;
  gutter: number;
  pages: SheetPage[];
  perPage: number;
}

export interface ImposeOptions {
  page: Size;
  /** Bleed box of a single card. */
  cell: Size;
  margin: number;
  gutter: number;
  columns?: number;
  rows?: number;
  duplex: 'none' | 'long-edge' | 'short-edge';
}

export function gridFor(options: ImposeOptions): { columns: number; rows: number } {
  const usableW = options.page.width - options.margin * 2;
  const usableH = options.page.height - options.margin * 2;
  const fit = (usable: number, size: number): number =>
    Math.floor((usable + options.gutter + 1e-6) / (size + options.gutter));
  const columns = options.columns ?? fit(usableW, options.cell.width);
  const rows = options.rows ?? fit(usableH, options.cell.height);
  if (columns < 1 || rows < 1) {
    throw new DeckError(
      `A ${options.cell.width}x${options.cell.height}mm card does not fit on a ` +
        `${options.page.width}x${options.page.height}mm page with a ${options.margin}mm margin.`,
      { code: 'layout/does-not-fit' },
    );
  }
  return { columns, rows };
}

/**
 * Lays cards out on sheets. Backs are emitted as their own page right after the
 * matching front, mirrored on the flip axis so a duplex printer lands them on
 * the correct side.
 */
export function impose(units: readonly CardUnit[], options: ImposeOptions): Imposition {
  const { columns, rows } = gridFor(options);
  const perPage = columns * rows;
  const usableW = options.page.width - options.margin * 2;
  const usableH = options.page.height - options.margin * 2;
  const gridW = columns * options.cell.width + (columns - 1) * options.gutter;
  const gridH = rows * options.cell.height + (rows - 1) * options.gutter;
  const originX = options.margin + Math.max(0, (usableW - gridW) / 2);
  const originY = options.margin + Math.max(0, (usableH - gridH) / 2);

  const position = (column: number, row: number): { x: number; y: number } => ({
    x: originX + column * (options.cell.width + options.gutter),
    y: originY + row * (options.cell.height + options.gutter),
  });

  const hasBacks = options.duplex !== 'none' && units.some((u) => u.back);
  const pages: SheetPage[] = [];
  let pageIndex = 0;

  for (let start = 0; start < units.length; start += perPage) {
    const chunk = units.slice(start, start + perPage);

    const frontSlots: Slot[] = chunk.map((unit, i) => {
      const column = i % columns;
      const row = Math.floor(i / columns);
      return { column, row, ...position(column, row), ...options.cell, card: unit.front };
    });
    pages.push({ index: pageIndex++, face: 'front', slots: frontSlots });

    if (!hasBacks) continue;

    const backSlots: Slot[] = chunk.map((unit, i) => {
      const column = i % columns;
      const row = Math.floor(i / columns);
      const mirroredColumn = options.duplex === 'long-edge' ? columns - 1 - column : column;
      const mirroredRow = options.duplex === 'short-edge' ? rows - 1 - row : row;
      return {
        column: mirroredColumn,
        row: mirroredRow,
        ...position(mirroredColumn, mirroredRow),
        ...options.cell,
        card: unit.back ?? null,
      };
    });
    pages.push({ index: pageIndex++, face: 'back', slots: backSlots });
  }

  return {
    page: options.page,
    cell: options.cell,
    grid: { columns, rows },
    margin: options.margin,
    gutter: options.gutter,
    perPage,
    pages,
  };
}

/** Pairs fronts with backs from a flat composed list. */
export function toUnits(composed: readonly ComposedCard[]): CardUnit[] {
  const byKey = new Map<string, CardUnit>();
  const order: string[] = [];
  for (const item of composed) {
    const key = `${item.typeId}::${item.card.id}`;
    let unit = byKey.get(key) as Partial<CardUnit> | undefined;
    if (!unit) {
      unit = {};
      byKey.set(key, unit as CardUnit);
      order.push(key);
    }
    if (item.face === 'front') unit.front = item;
    else unit.back = item;
  }
  return order
    .map((key) => byKey.get(key) as Partial<CardUnit>)
    .filter((unit): unit is CardUnit => unit.front !== undefined);
}
