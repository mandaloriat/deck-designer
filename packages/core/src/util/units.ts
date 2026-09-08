/**
 * Every length in the model is normalised to millimetres. Rendering targets
 * (CSS, PDF, raster) derive from that single source of truth so a card is the
 * same physical size no matter which exporter produced it.
 */
export type Unit = 'mm' | 'cm' | 'in' | 'pt' | 'px';

const MM_PER: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  px: 25.4 / 96, // CSS reference pixel
};

export function toMm(value: number, unit: Unit): number {
  return value * MM_PER[unit];
}

export function fromMm(mm: number, unit: Unit): number {
  return mm / MM_PER[unit];
}

/** CSS pixels at the 96dpi reference resolution. */
export function mmToCssPx(mm: number): number {
  return (mm / 25.4) * 96;
}

/** Device pixels at a given output resolution. */
export function mmToDevicePx(mm: number, dpi: number): number {
  return (mm / 25.4) * dpi;
}

/** Device pixel ratio that turns CSS pixels into `dpi` output pixels. */
export function dpiToScale(dpi: number): number {
  return dpi / 96;
}

export function round(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Formats a millimetre length as a CSS length, avoiding float noise. */
export function cssMm(mm: number): string {
  return `${round(mm, 4)}mm`;
}

const LENGTH_RE = /^\s*(-?\d+(?:\.\d+)?)\s*(mm|cm|in|pt|px)?\s*$/i;

/**
 * Parses `12`, `12mm`, `0.5in`. A bare number is interpreted in `defaultUnit`,
 * which is the project-level `units` setting.
 */
export function parseLength(input: number | string, defaultUnit: Unit): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error(`Invalid length: ${input}`);
    return toMm(input, defaultUnit);
  }
  const m = LENGTH_RE.exec(input);
  if (!m) throw new Error(`Invalid length: ${JSON.stringify(input)}`);
  const unit = (m[2]?.toLowerCase() as Unit | undefined) ?? defaultUnit;
  return toMm(Number(m[1]), unit);
}

/** ISO/US page sizes in millimetres, portrait. */
export const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  LETTER: { width: 215.9, height: 279.4 },
  LEGAL: { width: 215.9, height: 355.6 },
  TABLOID: { width: 279.4, height: 431.8 },
};
