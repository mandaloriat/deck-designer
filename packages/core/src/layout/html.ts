import { cardElement, rasterFrame } from '../template/document.js';
import { cssMm } from '../util/units.js';
import type { ComposedCard } from '../template/compose.js';
import type { Geometry } from '../project/model.js';
import type { Imposition, Size } from './imposition.js';

export interface MarkOptions {
  enabled: boolean;
  /** Millimetres of ink; clipped to whatever the margin can hold. */
  length?: number;
  color?: string;
  width?: number;
}

export function pageCss(page: Size): string {
  return `@page { size: ${cssMm(page.width)} ${cssMm(page.height)}; margin: 0; }
.dd-page {
  position: relative;
  width: ${cssMm(page.width)};
  height: ${cssMm(page.height)};
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.dd-page:last-child { break-after: auto; page-break-after: auto; }
.dd-slot { position: absolute; }
.dd-mark { position: absolute; background: var(--dd-mark-color, #000); }`;
}

/**
 * Crop marks live entirely inside the page margin, aligned with every trim
 * boundary. Keeping them out of the card area means they never print over
 * artwork, which is the usual failure mode of corner-mark implementations.
 */
function cropMarks(imposition: Imposition, bleed: number, options: MarkOptions): string {
  if (!options.enabled) return '';
  const available = imposition.margin - 1;
  if (available <= 0.5) return '';
  const length = Math.min(options.length ?? 4, available);
  const thickness = options.width ?? 0.15;
  const color = options.color ?? '#000';
  if (imposition.pages.length === 0) return '';

  const xs = new Set<number>();
  const ys = new Set<number>();
  for (let column = 0; column < imposition.grid.columns; column += 1) {
    const x = firstSlotX(imposition) + column * (imposition.cell.width + imposition.gutter);
    xs.add(x + bleed);
    xs.add(x + imposition.cell.width - bleed);
  }
  for (let row = 0; row < imposition.grid.rows; row += 1) {
    const y = firstSlotY(imposition) + row * (imposition.cell.height + imposition.gutter);
    ys.add(y + bleed);
    ys.add(y + imposition.cell.height - bleed);
  }

  const parts: string[] = [];
  const style = `background:${color}`;
  for (const x of xs) {
    parts.push(
      `<div class="dd-mark" style="${style};left:${cssMm(x - thickness / 2)};top:${cssMm(
        imposition.margin - 1 - length,
      )};width:${cssMm(thickness)};height:${cssMm(length)}"></div>`,
    );
    parts.push(
      `<div class="dd-mark" style="${style};left:${cssMm(x - thickness / 2)};top:${cssMm(
        imposition.page.height - imposition.margin + 1,
      )};width:${cssMm(thickness)};height:${cssMm(length)}"></div>`,
    );
  }
  for (const y of ys) {
    parts.push(
      `<div class="dd-mark" style="${style};top:${cssMm(y - thickness / 2)};left:${cssMm(
        imposition.margin - 1 - length,
      )};height:${cssMm(thickness)};width:${cssMm(length)}"></div>`,
    );
    parts.push(
      `<div class="dd-mark" style="${style};top:${cssMm(y - thickness / 2)};left:${cssMm(
        imposition.page.width - imposition.margin + 1,
      )};height:${cssMm(thickness)};width:${cssMm(length)}"></div>`,
    );
  }
  return parts.join('');
}

function firstSlotX(imposition: Imposition): number {
  const usableW = imposition.page.width - imposition.margin * 2;
  const gridW =
    imposition.grid.columns * imposition.cell.width + (imposition.grid.columns - 1) * imposition.gutter;
  return imposition.margin + Math.max(0, (usableW - gridW) / 2);
}

function firstSlotY(imposition: Imposition): number {
  const usableH = imposition.page.height - imposition.margin * 2;
  const gridH = imposition.grid.rows * imposition.cell.height + (imposition.grid.rows - 1) * imposition.gutter;
  return imposition.margin + Math.max(0, (usableH - gridH) / 2);
}

export interface SheetBodyOptions {
  includeBleed: boolean;
  rounded: boolean;
  guides: boolean;
  marks: MarkOptions;
  /** Bleed in millimetres actually present on the rendered cards. */
  bleed: number;
}

export function sheetBody(imposition: Imposition, options: SheetBodyOptions): string {
  const marks = cropMarks(imposition, options.bleed, options.marks);
  return imposition.pages
    .map((page) => {
      const slots = page.slots
        .filter((slot) => slot.card !== null)
        .map((slot) => {
          const card = slot.card as ComposedCard;
          return `<div class="dd-slot" style="left:${cssMm(slot.x)};top:${cssMm(slot.y)}">${cardElement({
            id: card.card.id,
            typeId: card.typeId,
            face: card.face,
            geometry: card.geometry,
            html: card.html,
            includeBleed: options.includeBleed,
            rounded: options.rounded,
            guides: options.guides,
          })}</div>`;
        })
        .join('');
      return `<section class="dd-page" data-page="${page.index}" data-face="${page.face}">${marks}${slots}</section>`;
    })
    .join('\n');
}

export function singlePageCss(geometry: Geometry, includeBleed: boolean): Size & { css: string } {
  const bleed = includeBleed ? geometry.bleed : 0;
  const size = { width: geometry.width + bleed * 2, height: geometry.height + bleed * 2 };
  return {
    ...size,
    css: `@page { size: ${cssMm(size.width)} ${cssMm(size.height)}; margin: 0; }
.dd-page { width: ${cssMm(size.width)}; height: ${cssMm(size.height)}; overflow: hidden; break-after: page; page-break-after: always; }
.dd-page:last-child { break-after: auto; page-break-after: auto; }`,
  };
}

export function singleBody(
  cards: readonly ComposedCard[],
  options: { includeBleed: boolean; rounded: boolean; guides: boolean },
): string {
  return cards
    .map(
      (card, i) =>
        `<section class="dd-page" data-page="${i}" data-face="${card.face}">${cardElement({
          id: card.card.id,
          typeId: card.typeId,
          face: card.face,
          geometry: card.geometry,
          html: card.html,
          includeBleed: options.includeBleed,
          rounded: options.rounded,
          guides: options.guides,
        })}</section>`,
    )
    .join('\n');
}

/**
 * Contact-sheet body used for raster capture: one exact-pixel capture box per
 * card face, so a whole batch is screenshotted from a single page load.
 */
export function galleryBody(
  cards: readonly ComposedCard[],
  options: { includeBleed: boolean; rounded: boolean; guides: boolean; dpi: number },
): string {
  return cards
    .map((card, i) => {
      const frame = rasterFrame(card.geometry, options.includeBleed, options.dpi);
      const inner = cardElement({
        id: card.card.id,
        typeId: card.typeId,
        face: card.face,
        geometry: card.geometry,
        html: card.html,
        includeBleed: options.includeBleed,
        rounded: options.rounded,
        guides: options.guides,
      });
      return `<div class="dd-shot" data-slot="${i}" style="width:${frame.widthPx}px;height:${frame.heightPx}px"><div class="dd-zoom" style="zoom:${frame.zoom}">${inner}</div></div>`;
    })
    .join('\n');
}
