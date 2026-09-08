import { parseLength, type Project } from '@deck-designer/core';

export interface PageSpec {
  width: number;
  height: number;
}

/**
 * Page names match the ones print-cards accepts, so a plan can be handed
 * straight to it without a translation table on either side.
 */
export const PAGE_FORMATS: Record<string, PageSpec> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
  A3L: { width: 420, height: 297 },
  A4L: { width: 297, height: 210 },
  A5L: { width: 210, height: 148 },
  LetterL: { width: 279.4, height: 215.9 },
  LegalL: { width: 355.6, height: 215.9 },
};

export function pageFormatNames(): string[] {
  return Object.keys(PAGE_FORMATS);
}

function canonicalFormat(name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return Object.keys(PAGE_FORMATS).find((key) => key.toLowerCase() === wanted);
}

export interface ResolvedPage {
  /** The name print-cards should be given, when the size maps to one. */
  format: string | null;
  size: PageSpec;
}

/** Accepts a format name (`A4`, `LetterL`) or an explicit `WxH`. */
export function resolvePage(spec: string, project: Project): ResolvedPage {
  const format = canonicalFormat(spec);
  if (format) return { format, size: { ...(PAGE_FORMATS[format] as PageSpec) } };

  const parts = spec.toLowerCase().split('x');
  if (parts.length === 2) {
    return {
      format: null,
      size: {
        width: parseLength(parts[0] as string, project.units),
        height: parseLength(parts[1] as string, project.units),
      },
    };
  }
  throw new Error(`Unknown page size "${spec}". Use a format name (${pageFormatNames().join(', ')}) or WxH.`);
}
