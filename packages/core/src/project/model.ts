import type { FieldDef } from '../schema/fields.js';
import type { ProfileConfig, ProjectConfig } from '../schema/project.js';
import type { Unit } from '../util/units.js';

/** All lengths in millimetres. */
export interface Geometry {
  width: number;
  height: number;
  bleed: number;
  safe: number;
  cornerRadius: number;
}

/** Card geometry with the bleed area included. */
export function bleedBox(g: Geometry): { width: number; height: number } {
  return { width: g.width + g.bleed * 2, height: g.height + g.bleed * 2 };
}

export interface ResolvedFont {
  family: string;
  /** Absolute path on disk. */
  path: string;
  /** Root-relative URL served to the renderer. */
  url: string;
  weight: string;
  style: string;
  display: string;
}

export interface ResolvedCardType {
  id: string;
  name: string;
  geometry: Geometry;
  fields: Record<string, FieldDef>;
  defaults: Record<string, unknown>;
  templatePath: string;
  templateSource: string;
  backPath?: string;
  backSource?: string;
  /** Absolute paths of the CSS files that apply to this card type, in order. */
  stylePaths: string[];
  css: string;
  dataPaths: string[];
  inlineRows: Record<string, unknown>[];
}

export interface Project {
  root: string;
  configPath: string;
  name: string;
  description?: string;
  units: Unit;
  geometry: Geometry;
  render: ProjectConfig['render'];
  fonts: ResolvedFont[];
  outputDir: string;
  profiles: Record<string, ProfileConfig>;
  /** Icon token -> root-relative URL, discovered from `icons.dir`. */
  icons: Record<string, string>;
  /** Absolute stylesheet path -> its contents, shared across card types. */
  styleSources: Record<string, string>;
  cardTypes: ResolvedCardType[];
  raw: ProjectConfig;
}

export type CardValue = string | number | boolean | null | Array<string | number>;

export interface Card {
  /** Unique across the whole deck. */
  id: string;
  type: string;
  /** Zero-based position within its card type, in data order. */
  index: number;
  /** Print run multiplier; the card is listed once regardless. */
  copies: number;
  /** Canonical, unescaped values — what `deck cards` and manifests report. */
  values: Record<string, CardValue>;
  /** Render-ready values: text escaped, rich text sanitised, images turned into URLs. */
  view: Record<string, CardValue>;
  source: { file: string | null; row: number | null };
}

export function findCardType(project: Project, id: string): ResolvedCardType | undefined {
  return project.cardTypes.find((t) => t.id === id);
}

/** Repeats each card `copies` times, for print runs. */
export function expandCopies(cards: readonly Card[]): Card[] {
  const out: Card[] = [];
  for (const card of cards) {
    for (let i = 0; i < Math.max(0, card.copies); i += 1) out.push(card);
  }
  return out;
}
