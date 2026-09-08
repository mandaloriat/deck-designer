import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parse as parseCsv } from 'csv-parse/sync';
import { DeckError } from '../util/errors.js';

export interface RawRow {
  values: Record<string, unknown>;
  /** 1-based line/entry number, for diagnostics that point at the file. */
  row: number;
  file: string;
  /** Id implied by the source, e.g. a per-component file's basename. */
  id?: string;
  /** Free text following the front matter, assigned to the type's `body` field. */
  body?: string;
}

export const DATA_EXTENSIONS = ['.csv', '.tsv', '.json', '.yaml', '.yml', '.md', '.markdown'] as const;

/**
 * Expands a data source into concrete files. A directory means "every data file
 * in it, in filename order", which is what makes one-file-per-component
 * practical without a glob syntax to learn.
 */
export async function expandDataSource(absPath: string): Promise<string[]> {
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch (cause) {
    throw new DeckError(`No such data source: ${absPath}`, { code: 'data/missing-file', cause });
  }
  if (stat.isFile()) return [absPath];
  if (!stat.isDirectory()) {
    throw new DeckError(`Data source is neither a file nor a directory: ${absPath}`, {
      code: 'data/not-a-data-source',
    });
  }

  let entries;
  try {
    entries = await fs.readdir(absPath, { withFileTypes: true });
  } catch (cause) {
    throw new DeckError(`Cannot read data directory ${absPath}: ${(cause as Error).message}`, {
      code: 'data/unreadable-directory',
      cause,
    });
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => (DATA_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase()))
    .sort()
    .map((name) => path.join(absPath, name));

  if (files.length === 0) {
    throw new DeckError(`No data files in ${absPath}`, {
      code: 'data/empty-directory',
      diagnostics: [
        {
          severity: 'error',
          code: 'data/empty-directory',
          message: `The data directory ${absPath} holds no ${DATA_EXTENSIONS.join(', ')} files.`,
        },
      ],
    });
  }
  return files;
}

/**
 * Reads a data file into untyped rows. CSV keeps its header names verbatim;
 * YAML/JSON accept either a top-level array or `{ cards: [...] }`; Markdown is
 * one component per file, its YAML front matter holding the fields.
 */
export async function readDataFile(absPath: string): Promise<RawRow[]> {
  let source: string;
  try {
    source = await fs.readFile(absPath, 'utf8');
  } catch (cause) {
    throw new DeckError(`Cannot read data file: ${absPath}`, { code: 'data/missing-file', cause });
  }

  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.csv' || ext === '.tsv') {
    return readDelimited(source, absPath, ext === '.tsv' ? '\t' : ',');
  }
  if (ext === '.json') return readStructured(safeJson(source, absPath), absPath);
  if (ext === '.yaml' || ext === '.yml') return readStructured(safeYaml(source, absPath), absPath);
  if (ext === '.md' || ext === '.markdown') return [readFrontMatter(source, absPath)];
  throw new DeckError(`Unsupported data format: ${ext || absPath}`, {
    code: 'data/unsupported-format',
    diagnostics: [
      {
        severity: 'error',
        code: 'data/unsupported-format',
        message: `Unsupported data format "${ext}".`,
        file: absPath,
        hint: `Use ${DATA_EXTENSIONS.join(', ')}.`,
      },
    ],
  });
}

function safeJson(source: string, file: string): unknown {
  try {
    return JSON.parse(source);
  } catch (cause) {
    throw new DeckError(`Invalid JSON in ${path.basename(file)}: ${(cause as Error).message}`, {
      code: 'data/parse',
      cause,
    });
  }
}

function safeYaml(source: string, file: string): unknown {
  try {
    return YAML.parse(source);
  } catch (cause) {
    throw new DeckError(`Invalid YAML in ${path.basename(file)}: ${(cause as Error).message}`, {
      code: 'data/parse',
      cause,
    });
  }
}

function readDelimited(source: string, file: string, delimiter: string): RawRow[] {
  let records: Record<string, string>[];
  try {
    records = parseCsv(source, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      delimiter,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
    }) as Record<string, string>[];
  } catch (cause) {
    throw new DeckError(`Invalid CSV in ${path.basename(file)}: ${(cause as Error).message}`, {
      code: 'data/parse',
      cause,
    });
  }
  return records.map((values, i) => ({ values, row: i + 2, file }));
}

const FRONT_MATTER = /^\ufeff?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

/**
 * One component per file: YAML front matter for the typed fields, everything
 * after it as the body. Prose belongs in a text editor, not in a spreadsheet
 * cell, and a file per component makes a wording change a one-line diff.
 */
function readFrontMatter(source: string, file: string): RawRow {
  const match = FRONT_MATTER.exec(source);
  if (!match) {
    throw new DeckError(`${path.basename(file)} has no YAML front matter`, {
      code: 'data/no-front-matter',
      diagnostics: [
        {
          severity: 'error',
          code: 'data/no-front-matter',
          message: `${path.basename(file)} must start with a --- delimited YAML block.`,
          file,
          hint: 'Put the fields between two --- lines, and the body text after them.',
        },
      ],
    });
  }

  const parsed = safeYaml(match[1] ?? '', file);
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
    throw new DeckError(`${path.basename(file)}: front matter must be a mapping`, { code: 'data/shape' });
  }

  const body = (match[2] ?? '').trim();
  return {
    values: (parsed ?? {}) as Record<string, unknown>,
    row: 1,
    file,
    id: path.basename(file, path.extname(file)),
    ...(body ? { body } : {}),
  };
}

function readStructured(data: unknown, file: string): RawRow[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { cards?: unknown }).cards)
      ? ((data as { cards: unknown[] }).cards)
      : null;
  if (!list) {
    throw new DeckError(`${path.basename(file)} must contain an array of cards (or a top-level "cards" array)`, {
      code: 'data/shape',
    });
  }
  return list.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new DeckError(`${path.basename(file)}: entry ${i + 1} is not an object`, { code: 'data/shape' });
    }
    return { values: entry as Record<string, unknown>, row: i + 1, file };
  });
}
