import { PAGE_SIZES, parseLength, type Project } from '@deck-designer/core';

export interface PageSpec {
  width: number;
  height: number;
}

/** Accepts `A4`, `letter`, `210x297`, `8.5inx11in`. */
export function resolvePage(spec: string | { width: number | string; height: number | string }, project: Project): PageSpec {
  const unit = project.units;
  if (typeof spec !== 'string') {
    return { width: parseLength(spec.width, unit), height: parseLength(spec.height, unit) };
  }
  const named = PAGE_SIZES[spec.trim().toUpperCase()];
  if (named) return { ...named };

  const parts = spec.toLowerCase().split('x');
  if (parts.length === 2) {
    return { width: parseLength(parts[0] as string, unit), height: parseLength(parts[1] as string, unit) };
  }
  throw new Error(`Unknown page size "${spec}". Use a name (${Object.keys(PAGE_SIZES).join(', ')}) or WxH.`);
}

export function applyOrientation(page: PageSpec, orientation: 'portrait' | 'landscape'): PageSpec {
  const portrait = page.width <= page.height;
  if (orientation === 'portrait') return portrait ? page : { width: page.height, height: page.width };
  return portrait ? { width: page.height, height: page.width } : page;
}
