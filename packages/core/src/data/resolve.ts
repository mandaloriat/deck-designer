import fs from 'node:fs/promises';
import path from 'node:path';
import type { FieldDef } from '../schema/fields.js';
import { RESERVED_FIELDS } from '../schema/fields.js';
import type { Card, CardValue, Project, ResolvedCardType } from '../project/model.js';
import { diag, type Diagnostic } from '../util/errors.js';
import { escapeHtml, renderRichText, slugify } from '../util/html.js';
import { isSubPath, projectRelative } from '../util/paths.js';
import { readDataFile, type RawRow } from './read.js';

export interface ResolveOptions {
  /** Check that image fields point at files that exist. */
  checkAssets?: boolean;
  /** Only resolve these card types. */
  types?: readonly string[];
}

export interface ResolveResult {
  cards: Card[];
  diagnostics: Diagnostic[];
}

const EMPTY = new Set(['', 'null', 'undefined']);

export async function resolveCards(project: Project, options: ResolveOptions = {}): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [];
  const cards: Card[] = [];
  const idOwners = new Map<string, string>();
  const checkAssets = options.checkAssets ?? true;
  const assetCache = new Map<string, boolean>();

  for (const type of project.cardTypes) {
    if (options.types && !options.types.includes(type.id)) continue;

    const rows: RawRow[] = [];
    for (const file of type.dataPaths) rows.push(...(await readDataFile(file)));
    rows.push(
      ...type.inlineRows.map((values, i) => ({ values, row: i + 1, file: project.configPath })),
    );

    if (rows.length === 0) {
      diagnostics.push(
        diag('warning', 'data/empty', `Card type "${type.id}" has no cards.`, { cardType: type.id }),
      );
    }

    const structural = inspectSources(project, type, rows, diagnostics);

    let index = 0;
    for (const row of rows) {
      const file = projectRelative(project.root, row.file);
      const merged: Record<string, unknown> = { ...type.defaults, ...normaliseKeys(row.values) };

      if (row.body !== undefined) {
        if (type.bodyField === undefined) {
          diagnostics.push(
            diag('warning', 'data/body-ignored', `Body text ignored: no field to put it in.`, {
              file,
              cardType: type.id,
              hint: `Add \`body: <field>\` to card type "${type.id}", or give it exactly one richtext field.`,
            }),
          );
        } else {
          if (!isEmpty(merged[type.bodyField])) {
            diagnostics.push(
              diag(
                'warning',
                'data/body-conflict',
                `"${type.bodyField}" is set in the front matter and in the body; the body wins.`,
                { file, cardType: type.id },
              ),
            );
          }
          merged[type.bodyField] = row.body;
        }
      }

      const values: Record<string, CardValue> = {};
      const view: Record<string, CardValue> = {};

      const absent = structural.get(row.file);

      for (const [name, def] of Object.entries(type.fields)) {
        const rawValue = merged[name];
        const context = { file, cardType: type.id, field: name, row: row.row };
        // A field with no column at all was already reported once against the
        // source; repeating it per row would bury everything else.
        const reportRequired = !absent?.has(name);
        const coerced = coerce(rawValue, def, name, context, diagnostics, reportRequired);
        values[name] = coerced;
        view[name] = await toView(coerced, def, project, { checkAssets, assetCache, context, diagnostics });
      }

      const id = deriveId(merged, type, values, index, row.id);
      const owner = idOwners.get(id);
      if (owner) {
        diagnostics.push(
          diag('error', 'data/duplicate-id', `Duplicate card id "${id}" (also used by ${owner}).`, {
            file,
            card: id,
            cardType: type.id,
            hint: 'Add an explicit `id` column to disambiguate.',
          }),
        );
      } else {
        idOwners.set(id, `${file}:${row.row}`);
      }

      const copies = coerceCopies(merged['copies'], { file, cardType: type.id, card: id }, diagnostics);

      cards.push({
        id,
        type: type.id,
        index,
        copies,
        values,
        view,
        source: { file, row: row.row },
      });
      index += 1;
    }
  }

  return { cards, diagnostics };
}

/**
 * Reports what is wrong with a source rather than with a row: a column nobody
 * declared, a column with no name, a declared field the source never supplies.
 * One header typo used to produce two diagnostics per row, which on a forty-card
 * deck meant eighty lines hiding the one fact that mattered.
 *
 * Returns, per source file, the required fields that have no column at all, so
 * the row pass can stay quiet about them.
 */
function inspectSources(
  project: Project,
  type: ResolvedCardType,
  rows: readonly RawRow[],
  diagnostics: Diagnostic[],
): Map<string, Set<string>> {
  const keysByFile = new Map<string, Set<string>>();
  for (const row of rows) {
    const keys = keysByFile.get(row.file) ?? new Set<string>();
    for (const key of Object.keys(normaliseKeys(row.values))) keys.add(key);
    if (row.body !== undefined && type.bodyField) keys.add(type.bodyField);
    keysByFile.set(row.file, keys);
  }

  const absentByFile = new Map<string, Set<string>>();

  for (const [absolute, keys] of keysByFile) {
    const file = projectRelative(project.root, absolute);

    for (const key of keys) {
      if ((RESERVED_FIELDS as readonly string[]).includes(key)) continue;
      if (key in type.fields) continue;
      if (key === '') {
        diagnostics.push(
          diag('warning', 'data/unnamed-column', 'A column has an empty name; its values are ignored.', {
            file,
            cardType: type.id,
            hint: 'Give the column a heading that matches a declared field, or remove it.',
          }),
        );
        continue;
      }
      diagnostics.push(
        diag('warning', 'data/unknown-field', `Unknown field "${key}" ignored.`, {
          file,
          cardType: type.id,
          hint: `Declare it under cardTypes[id=${type.id}].fields to use it in templates, or check the spelling.`,
        }),
      );
    }

    const absent = new Set<string>();
    for (const [name, def] of Object.entries(type.fields)) {
      if (!def.required) continue;
      if (name in type.defaults) continue;
      if (keys.has(name)) continue;
      absent.add(name);
      diagnostics.push(
        diag('error', 'data/missing-column', `No "${name}" column; every card here is missing a required field.`, {
          file,
          cardType: type.id,
          hint: nearest(name, keys) ?? `Add a "${name}" column, or drop \`required\` from the field.`,
        }),
      );
    }
    absentByFile.set(absolute, absent);
  }

  return absentByFile;
}

/** Names a likely typo, which is what a missing column usually is. */
function nearest(wanted: string, present: ReadonlySet<string>): string | undefined {
  for (const candidate of present) {
    if (candidate === '' || candidate === wanted) continue;
    if (distance(wanted.toLowerCase(), candidate.toLowerCase()) <= Math.max(1, Math.floor(wanted.length / 4))) {
      return `Did you mean the "${candidate}" column?`;
    }
  }
  return undefined;
}

/**
 * Optimal string alignment, not plain Levenshtein: swapping two adjacent
 * letters is the typo people actually make, and it has to cost one edit for
 * "suti" to suggest "suit".
 */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + substitution,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (beforePrevious[j - 2] as number) + 1);
      }
      current[j] = best;
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length] as number;
}

function normaliseKeys(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) out[key.trim()] = value;
  return out;
}

/**
 * Id precedence: an explicit `id`, then the source's own identity (a per-component
 * file's basename), then the `idFrom` field, then the row number. A filename is a
 * better id than a display name because renaming the card does not move it.
 */
function deriveId(
  merged: Record<string, unknown>,
  type: ResolvedCardType,
  values: Record<string, CardValue>,
  index: number,
  sourceId: string | undefined,
): string {
  const explicit = merged['id'];
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
  if (typeof explicit === 'number') return String(explicit);
  if (sourceId !== undefined && sourceId.trim() !== '') {
    const slug = slugify(sourceId);
    if (slug) return `${type.id}-${slug}`;
  }
  const label = values[type.idFrom];
  if (typeof label === 'string' && label.trim() !== '') {
    const slug = slugify(label);
    if (slug) return `${type.id}-${slug}`;
  }
  return `${type.id}-${index + 1}`;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return EMPTY.has(value.trim().toLowerCase()) || value.trim() === '';
  return false;
}

interface Ctx {
  file: string;
  cardType: string;
  field?: string;
  card?: string;
  row?: number;
}

function coerce(
  raw: unknown,
  def: FieldDef,
  name: string,
  ctx: Ctx,
  diagnostics: Diagnostic[],
  reportRequired = true,
): CardValue {
  const where = { file: ctx.file, cardType: ctx.cardType };
  if (isEmpty(raw)) {
    const fallback = 'default' in def ? (def.default as CardValue | undefined) : undefined;
    if (fallback !== undefined) return fallback;
    if (def.required && reportRequired) {
      diagnostics.push(
        diag('error', 'data/required', `Row ${ctx.row}: required field "${name}" is empty.`, where),
      );
    }
    return def.type === 'list' ? [] : null;
  }

  switch (def.type) {
    case 'text':
    case 'richtext': {
      const text = String(raw);
      if (def.maxLength && text.length > def.maxLength) {
        diagnostics.push(
          diag(
            'warning',
            'data/too-long',
            `Row ${ctx.row}: "${name}" is ${text.length} characters, over the declared max of ${def.maxLength}.`,
            where,
          ),
        );
      }
      if (def.type === 'text' && def.pattern && !new RegExp(def.pattern).test(text)) {
        diagnostics.push(
          diag('error', 'data/pattern', `Row ${ctx.row}: "${name}" does not match ${def.pattern}.`, where),
        );
      }
      return text;
    }
    case 'number':
    case 'integer': {
      const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(num)) {
        diagnostics.push(
          diag('error', 'data/not-a-number', `Row ${ctx.row}: "${name}" is not a number (${String(raw)}).`, where),
        );
        return null;
      }
      if (def.type === 'integer' && !Number.isInteger(num)) {
        diagnostics.push(
          diag('error', 'data/not-an-integer', `Row ${ctx.row}: "${name}" must be an integer.`, where),
        );
        return null;
      }
      if (def.min !== undefined && num < def.min) {
        diagnostics.push(diag('error', 'data/out-of-range', `Row ${ctx.row}: "${name}" < ${def.min}.`, where));
      }
      if (def.max !== undefined && num > def.max) {
        diagnostics.push(diag('error', 'data/out-of-range', `Row ${ctx.row}: "${name}" > ${def.max}.`, where));
      }
      return num;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const text = String(raw).trim().toLowerCase();
      if (['true', 'yes', 'y', '1', 'x'].includes(text)) return true;
      if (['false', 'no', 'n', '0'].includes(text)) return false;
      diagnostics.push(
        diag('error', 'data/not-a-boolean', `Row ${ctx.row}: "${name}" is not a boolean (${text}).`, where),
      );
      return null;
    }
    case 'enum': {
      const text = String(raw).trim();
      if (!def.values.includes(text)) {
        diagnostics.push(
          diag('error', 'data/bad-enum', `Row ${ctx.row}: "${name}" = "${text}" is not one of ${def.values.join(', ')}.`, where),
        );
        return null;
      }
      return text;
    }
    case 'color': {
      const text = String(raw).trim();
      if (!/^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl|oklch|lab|color)a?\([^)]*\)|var\(--[^)]*\))$/i.test(text)) {
        diagnostics.push(
          diag('warning', 'data/suspicious-color', `Row ${ctx.row}: "${name}" = "${text}" is not a recognised CSS color.`, where),
        );
      }
      return text;
    }
    case 'image':
      return String(raw).trim();
    case 'list': {
      const items = Array.isArray(raw) ? raw : String(raw).split(def.separator);
      const cleaned = items
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter((item) => !isEmpty(item));
      if (def.of === 'text') return cleaned.map((item) => String(item));
      return cleaned.map((item) => {
        const num = Number(item);
        if (!Number.isFinite(num)) {
          diagnostics.push(
            diag('error', 'data/not-a-number', `Row ${ctx.row}: "${name}" contains a non-number (${String(item)}).`, where),
          );
          return 0;
        }
        return def.of === 'integer' ? Math.trunc(num) : num;
      });
    }
    default:
      return null;
  }
}

async function toView(
  value: CardValue,
  def: FieldDef,
  project: Project,
  opts: {
    checkAssets: boolean;
    assetCache: Map<string, boolean>;
    context: Ctx;
    diagnostics: Diagnostic[];
  },
): Promise<CardValue> {
  if (value === null) return null;
  switch (def.type) {
    case 'text':
      return escapeHtml(String(value));
    case 'richtext':
      return renderRichText(String(value), {
        resolveIcon: (name) => project.icons[name] ?? null,
        paragraphs: def.paragraphs,
      });
    case 'image': {
      const relative = path.posix.join(def.base ?? '', String(value).replace(/^\/+/, ''));
      const abs = path.resolve(project.root, relative);
      if (!isSubPath(project.root, abs)) {
        opts.diagnostics.push(
          diag('error', 'asset/escapes-project', `Image "${relative}" points outside the project.`, {
            file: opts.context.file,
            cardType: opts.context.cardType,
          }),
        );
        return null;
      }
      if (opts.checkAssets && !(await fileExists(abs, opts.assetCache))) {
        opts.diagnostics.push(
          diag('error', 'asset/missing', `Row ${opts.context.row}: image "${relative}" does not exist.`, {
            file: opts.context.file,
            cardType: opts.context.cardType,
          }),
        );
      }
      return `/${projectRelative(project.root, abs)}`;
    }
    case 'list':
      return (value as Array<string | number>).map((item) =>
        typeof item === 'string' ? escapeHtml(item) : item,
      );
    default:
      return value;
  }
}

async function fileExists(abs: string, cache: Map<string, boolean>): Promise<boolean> {
  const cached = cache.get(abs);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const stat = await fs.stat(abs);
    ok = stat.isFile();
  } catch {
    ok = false;
  }
  cache.set(abs, ok);
  return ok;
}

function coerceCopies(raw: unknown, ctx: Ctx, diagnostics: Diagnostic[]): number {
  if (isEmpty(raw)) return 1;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) {
    diagnostics.push(
      diag('error', 'data/bad-copies', `"copies" must be a non-negative integer (got ${String(raw)}).`, {
        file: ctx.file,
        cardType: ctx.cardType,
        ...(ctx.card ? { card: ctx.card } : {}),
      }),
    );
    return 1;
  }
  return num;
}
