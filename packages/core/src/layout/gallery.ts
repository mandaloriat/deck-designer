import { cardElement, rasterFrame } from '../template/document.js';
import type { ComposedCard } from '../template/compose.js';

export interface GalleryOptions {
  includeBleed: boolean;
  rounded: boolean;
  guides: boolean;
  dpi: number;
}

/**
 * Contact-sheet body used for raster capture: one exact-pixel capture box per
 * component face, so a whole batch is screenshotted from a single page load.
 * Components of different sizes can share a page — each box carries its own.
 */
export function galleryBody(cards: readonly ComposedCard[], options: GalleryOptions): string {
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
