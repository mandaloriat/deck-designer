import type { Geometry, ResolvedFont } from '../project/model.js';
import { cssMm, mmToCssPx, mmToDevicePx } from '../util/units.js';
import { escapeHtml } from '../util/html.js';

/**
 * The engine's own stylesheet. It defines the card box, exposes every geometry
 * value as a custom property, and stops there: visual design belongs to the
 * deck's CSS, not to the tool.
 */
export const ENGINE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
img, svg, canvas, video { display: block; max-width: 100%; }
img { image-rendering: auto; }

.dd-card {
  position: relative;
  overflow: hidden;
  width: var(--dd-bleed-w);
  height: var(--dd-bleed-h);
  background: var(--dd-card-background, transparent);
  break-inside: avoid;
}
.dd-trim {
  position: absolute;
  left: var(--dd-bleed);
  top: var(--dd-bleed);
  width: var(--dd-w);
  height: var(--dd-h);
}
.dd-card[data-round='1'] .dd-trim { border-radius: var(--dd-radius); overflow: hidden; }
.dd-card[data-round='1'] { border-radius: var(--dd-radius); }

/** Stretches a child across the trim area and into the bleed. */
.dd-fill { position: absolute; inset: calc(-1 * var(--dd-bleed)); }
.dd-fill > img, .dd-fill > svg { width: 100%; height: 100%; object-fit: cover; }

.dd-safe { position: absolute; inset: var(--dd-safe); }

.dd-guides { position: absolute; inset: 0; pointer-events: none; z-index: 9999; }
.dd-guides::before,
.dd-guides::after { content: ''; position: absolute; }
.dd-guides::before {
  inset: var(--dd-bleed);
  outline: 0.2mm dashed color-mix(in srgb, magenta 70%, transparent);
}
.dd-guides::after {
  inset: calc(var(--dd-bleed) + var(--dd-safe));
  outline: 0.2mm dashed color-mix(in srgb, cyan 70%, transparent);
}

.dd-icon { display: inline-block; height: 1em; width: auto; vertical-align: -0.125em; }

/** Raster capture box: an exact pixel rectangle the card is zoomed into. */
.dd-shot { position: relative; overflow: hidden; flex: none; }
.dd-shot > .dd-zoom { position: absolute; left: 0; top: 0; }
`.trim();

export function fontFaceCss(fonts: readonly ResolvedFont[]): string {
  return fonts
    .map(
      (font) => `@font-face {
  font-family: ${JSON.stringify(font.family)};
  src: url(${JSON.stringify(font.url)});
  font-weight: ${font.weight};
  font-style: ${font.style};
  font-display: ${font.display};
}`,
    )
    .join('\n');
}

export function geometryVars(geometry: Geometry, includeBleed: boolean): string {
  const bleed = includeBleed ? geometry.bleed : 0;
  return [
    `--dd-w:${cssMm(geometry.width)}`,
    `--dd-h:${cssMm(geometry.height)}`,
    `--dd-bleed:${cssMm(bleed)}`,
    `--dd-safe:${cssMm(geometry.safe)}`,
    `--dd-radius:${cssMm(geometry.cornerRadius)}`,
    `--dd-bleed-w:${cssMm(geometry.width + bleed * 2)}`,
    `--dd-bleed-h:${cssMm(geometry.height + bleed * 2)}`,
  ].join(';');
}

export interface RasterFrame {
  /** Exact output size in pixels. */
  widthPx: number;
  heightPx: number;
  /** CSS zoom applied to the card so millimetres land on the target grid. */
  zoom: number;
}

/**
 * Chromium clips screenshots on whole CSS pixels, so a card sized in
 * millimetres captures a few pixels larger than asked for. The fix is to give
 * the capture box an integer CSS pixel size and zoom the card into it: zoom
 * re-runs layout at the target scale, so glyphs stay on the pixel grid instead
 * of being resampled the way a transform would.
 */
export function rasterFrame(geometry: Geometry, includeBleed: boolean, dpi: number): RasterFrame {
  const bleed = includeBleed ? geometry.bleed : 0;
  const widthMm = geometry.width + bleed * 2;
  const heightMm = geometry.height + bleed * 2;
  const widthPx = Math.max(1, Math.round(mmToDevicePx(widthMm, dpi)));
  const zoom = widthPx / mmToCssPx(widthMm);
  // Floor rather than round: losing a sub-pixel sliver beats padding the edge
  // with a transparent line that shows up when cards are tiled.
  const heightPx = Math.max(1, Math.floor(mmToCssPx(heightMm) * zoom));
  return { widthPx, heightPx, zoom };
}

export interface CardElementOptions {
  id: string;
  typeId: string;
  face: 'front' | 'back';
  geometry: Geometry;
  html: string;
  includeBleed: boolean;
  rounded: boolean;
  guides: boolean;
}

export function cardElement(options: CardElementOptions): string {
  const attrs = [
    `class="dd-card"`,
    `style="${geometryVars(options.geometry, options.includeBleed)}"`,
    `data-card="${escapeHtml(options.id)}"`,
    `data-type="${escapeHtml(options.typeId)}"`,
    `data-face="${options.face}"`,
    `data-round="${options.rounded ? '1' : '0'}"`,
  ]
    .filter(Boolean)
    .join(' ');

  const guides = options.guides ? '<div class="dd-guides"></div>' : '';
  return `<article ${attrs}><div class="dd-trim">${options.html}</div>${guides}</article>`;
}

/**
 * Fits text by binary-searching font-size instead of scaling with a transform:
 * the glyphs stay on the pixel grid and line breaking is recomputed, which is
 * what makes long card names look intentional rather than squashed.
 */
export const AUTOFIT_SCRIPT = `
(() => {
  const fits = (el) =>
    el.scrollHeight <= el.clientHeight + 0.5 && el.scrollWidth <= el.clientWidth + 0.5;

  /** Accepts any CSS length ("3.2mm", "12px", "1.2em") by letting the browser resolve it. */
  function resolve(el, value, fallback) {
    if (!value) return fallback;
    const previous = el.style.fontSize;
    el.style.fontSize = value;
    const px = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = previous;
    return Number.isFinite(px) && px > 0 ? px : fallback;
  }

  function autofit(el) {
    const natural = parseFloat(getComputedStyle(el).fontSize);
    const max = resolve(el, el.dataset.autofitMax, natural);
    const min = resolve(el, el.dataset.autofitMin, max / 2);
    el.style.fontSize = max + 'px';
    if (fits(el)) return;
    let lo = min, hi = max;
    for (let i = 0; i < 24 && hi - lo > 0.05; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = mid + 'px';
      if (fits(el)) lo = mid; else hi = mid;
    }
    el.style.fontSize = lo + 'px';
    if (!fits(el)) el.dataset.autofitOverflow = '1';
  }

  async function run() {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const images = Array.from(document.images).filter((img) => !img.complete);
    await Promise.all(
      images.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }),
      ),
    );
    document.querySelectorAll('[data-autofit]').forEach(autofit);
    const overflowing = Array.from(document.querySelectorAll('[data-autofit-overflow]'))
      .map((el) => el.closest('.dd-card'))
      .map((card) => (card ? card.getAttribute('data-card') : null))
      .filter(Boolean);
    document.documentElement.dataset.ddOverflow = JSON.stringify(overflowing);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.documentElement.dataset.ddReady = '1';
  }

  run().catch((err) => {
    document.documentElement.dataset.ddReady = 'error';
    document.documentElement.dataset.ddError = String((err && err.message) || err);
  });
})();
`.trim();

export interface DocumentOptions {
  title: string;
  fonts: readonly ResolvedFont[];
  /** Deck-authored CSS, appended after the engine stylesheet. */
  css: string;
  body: string;
  /** Extra CSS injected last, used for page/imposition rules. */
  pageCss?: string;
  background?: string;
}

export function htmlDocument(options: DocumentOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>${ENGINE_CSS}</style>
<style>${fontFaceCss(options.fonts)}</style>
<style>${options.css}</style>
<style>html,body{background:${options.background ?? 'transparent'};}</style>
${options.pageCss ? `<style>${options.pageCss}</style>` : ''}
</head>
<body>
${options.body}
<script>${AUTOFIT_SCRIPT}</script>
</body>
</html>`;
}
