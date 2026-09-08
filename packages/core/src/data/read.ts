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
}

/**
 * Reads a data file into untyped rows. CSV keeps its header names verbatim;
 * YAML/JSON accept either a top-level array or `{ cards: [...] }`.
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
  throw new DeckError(`Unsupported data format: ${ext || absPath}`, {
    code: 'data/unsupported-format',
    diagnostics: [
      {
        severity: 'error',
        code: 'data/unsupported-format',
        message: `Unsupported data format "${ext}".`,
        file: absPath,
        hint: 'Use .csv, .tsv, .json, .yaml or .yml.',
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
