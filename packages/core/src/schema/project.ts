import { z } from 'zod';
import { fieldDefSchema } from './fields.js';

/** `12`, `"12mm"`, `"0.5in"` — a bare number uses the project `units`. */
export const lengthSchema = z.union([z.number(), z.string()]);

export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'must start with a letter or digit and contain only [A-Za-z0-9._-]');

export const geometrySchema = z.object({
  width: lengthSchema,
  height: lengthSchema,
  /** Print bleed added on every side. */
  bleed: lengthSchema.optional(),
  /** Safe-area inset used by the safe-zone overlay and by linting. */
  safe: lengthSchema.optional(),
  cornerRadius: lengthSchema.optional(),
});

export const fontSchema = z.object({
  family: z.string(),
  /** Project-relative font file. Remote URLs are rejected: builds stay offline. */
  src: z.string(),
  weight: z.union([z.number(), z.string()]).optional(),
  style: z.enum(['normal', 'italic', 'oblique']).optional(),
  display: z.enum(['auto', 'block', 'swap', 'fallback', 'optional']).optional(),
});

/**
 * A CSS custom property the deck offers as a knob. Declared by name; the
 * control to show is inferred from the value the stylesheet currently holds,
 * so the stylesheet stays the source of truth and the config stays a list.
 */
export const themeEntrySchema = z
  .union([
    z.string(),
    z.object({
      name: z.string(),
      label: z.string().optional(),
      /** Turns a length or number into a slider. Both are required for one. */
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  ])
  .transform((entry) => (typeof entry === 'string' ? { name: entry } : entry))
  .refine((entry) => /^--[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.name), {
    message: 'must be a CSS custom property, e.g. --card-ink',
  });

export const cardTypeSchema = z.object({
  id: idSchema,
  name: z.string().optional(),
  /** Front template. Liquid by default; `.html` files are treated as Liquid too. */
  template: z.string(),
  /** Optional back template. Omit for a single-sided deck. */
  back: z.string().optional(),
  styles: z.array(z.string()).default([]),
  /** Data files or directories. A directory means every data file inside it. */
  data: z.union([z.string(), z.array(z.string())]).optional(),
  /** Inline rows, useful for tiny decks and tests. */
  cards: z.array(z.record(z.unknown())).optional(),
  card: geometrySchema.partial().optional(),
  fields: z.record(fieldDefSchema).default({}),
  /** Values merged into every row of this type before field defaults apply. */
  defaults: z.record(z.unknown()).default({}),
  /** Field an id is derived from when a row has no explicit `id`. */
  idFrom: z.string().default('name'),
  /** Field that a Markdown file's body text fills. Defaults to the sole richtext field. */
  body: z.string().optional(),
});

export const renderSchema = z.object({
  dpi: z.number().positive().max(2400).default(300),
  background: z.string().default('transparent'),
  /** Max parallel render pages. */
  concurrency: z.number().int().positive().max(32).default(4),
  timeoutMs: z.number().int().positive().default(30_000),
  /** Fail the build when a template or the page logs an error. */
  strict: z.boolean().default(true),
});

export const projectSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().default('Untitled deck'),
  description: z.string().optional(),
  units: z.enum(['mm', 'cm', 'in', 'pt', 'px']).default('mm'),
  card: geometrySchema,
  render: renderSchema.default({}),
  fonts: z.array(fontSchema).default([]),
  /** CSS applied to every card type, before the card type's own styles. */
  styles: z.array(z.string()).default([]),
  /** Custom properties the preview exposes as editable controls. */
  theme: z.array(themeEntrySchema).default([]),
  /** `[[token]]` in rich text resolves to `<dir>/<token>.<ext>` when the file exists. */
  icons: z
    .object({
      dir: z.string().default('assets/icons'),
      extensions: z.array(z.string()).default(['svg', 'png', 'webp']),
    })
    .default({}),
  output: z.object({ dir: z.string().default('dist') }).default({}),
  cardTypes: z.array(cardTypeSchema).min(1),
});

export type ProjectConfig = z.infer<typeof projectSchema>;
export type CardTypeConfig = z.infer<typeof cardTypeSchema>;
export type FontConfig = z.infer<typeof fontSchema>;
export type ThemeEntry = z.infer<typeof themeEntrySchema>;
