import type { Reporter, CommandResult } from '../output.js';
import { prepare, type SelectionOptions } from '../select.js';

export interface CardsOptions extends SelectionOptions {
  fields?: string[];
}

export async function cardsCommand(options: CardsOptions, reporter: Reporter): Promise<CommandResult> {
  const { cards, diagnostics } = await prepare(options, false);

  const fields = options.fields?.length
    ? options.fields
    : [...new Set(cards.flatMap((card) => Object.keys(card.values)))].slice(0, 4);

  const rows: string[][] = [['ID', 'TYPE', 'COPIES', ...fields.map((f) => f.toUpperCase())]];
  for (const card of cards) {
    rows.push([
      card.id,
      card.type,
      String(card.copies),
      ...fields.map((field) => formatValue(card.values[field])),
    ]);
  }
  reporter.table(rows);

  return {
    data: cards.map((card) => ({
      id: card.id,
      type: card.type,
      copies: card.copies,
      values: card.values,
      source: card.source,
    })),
    diagnostics: diagnostics.filter((d) => d.severity === 'error'),
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  const text = String(value).replace(/\s+/g, ' ');
  return text.length > 40 ? `${text.slice(0, 39)}...` : text;
}
