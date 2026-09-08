import { DeckError } from '../util/errors.js';
import { mmToDevicePx } from '../util/units.js';
import type { Geometry } from '../project/model.js';

/**
 * Virtual tabletops take a deck as one image: every face in a grid, plus a
 * separate back. Tabletop Simulator caps the grid at 10 by 7, so a deck larger
 * than seventy faces has to be split into several atlases.
 */
export const MAX_COLUMNS = 10;
export const MAX_ROWS = 7;

export interface AtlasOptions {
  /** Longest side of the finished image, in pixels. */
  maxSize: number;
  /** Never render finer than the project would print at. */
  maxDpi: number;
  columns?: number;
  rows?: number;
}

export interface AtlasPlan {
  columns: number;
  rows: number;
  /** Faces this atlas holds; the grid may have empty cells after them. */
  count: number;
  /** Resolution each card is rendered at to fit the cap. */
  dpi: number;
  cardWidthPx: number;
  cardHeightPx: number;
  widthPx: number;
  heightPx: number;
}

/** Cards per atlas, before any splitting. */
export function atlasCapacity(options: Pick<AtlasOptions, 'columns' | 'rows'>): number {
  return (options.columns ?? MAX_COLUMNS) * (options.rows ?? MAX_ROWS);
}

/**
 * Lays `count` faces into the tightest grid that holds them, then picks the
 * resolution that fits the image under `maxSize`. Choosing the grid first and
 * the resolution second is what keeps a small deck sharp: nine cards get a
 * 3x3 grid at full resolution rather than a 10-wide strip at a third of it.
 */
export function planAtlas(geometry: Geometry, count: number, options: AtlasOptions): AtlasPlan {
  if (count < 1) throw new DeckError('An atlas needs at least one face.', { code: 'atlas/empty' });

  const maxColumns = options.columns ?? MAX_COLUMNS;
  const maxRows = options.rows ?? MAX_ROWS;
  if (count > maxColumns * maxRows) {
    throw new DeckError(
      `${count} faces do not fit a ${maxColumns}x${maxRows} atlas; split the selection or raise the grid.`,
      { code: 'atlas/too-many' },
    );
  }

  const columns = options.columns ?? Math.min(maxColumns, count);
  const rows = options.rows ?? Math.ceil(count / columns);

  // One resolution has to satisfy both axes, so take whichever binds first.
  const dpiForWidth = (options.maxSize * 25.4) / (columns * geometry.width);
  const dpiForHeight = (options.maxSize * 25.4) / (rows * geometry.height);
  const dpi = Math.min(dpiForWidth, dpiForHeight, options.maxDpi);

  // Floor, not round: the per-card width is multiplied by the column count, so
  // rounding up half a pixel per card puts the finished image over the cap.
  const cardWidthPx = Math.max(1, Math.floor(mmToDevicePx(geometry.width, dpi)));
  const cardHeightPx = Math.max(1, Math.floor(mmToDevicePx(geometry.height, dpi)));

  return {
    columns,
    rows,
    count,
    dpi,
    cardWidthPx,
    cardHeightPx,
    widthPx: cardWidthPx * columns,
    heightPx: cardHeightPx * rows,
  };
}

/** Splits a face list into chunks that each fit one atlas. */
export function chunkForAtlases<T>(items: readonly T[], options: Pick<AtlasOptions, 'columns' | 'rows'>): T[][] {
  const capacity = atlasCapacity(options);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += capacity) chunks.push(items.slice(i, i + capacity));
  return chunks.length > 0 ? chunks : [[]];
}
