import { slugify, type Card } from '@deck-designer/core';

export const DEFAULT_NAME_PATTERN = '{type}/{id}.{face}.png';

export interface NameContext {
  card: Card;
  /** Value `{name}` resolves to, usually the field the id is derived from. */
  label?: string;
  face: string;
  /** 1-based position within the card's type. */
  index: number;
  /** Digits to pad `{index}` to, so a directory listing sorts correctly. */
  indexWidth: number;
}

const TOKEN = /\{(id|type|face|index|name)\}/g;

/**
 * Renders an output filename. `{index}` is zero-padded to a fixed width across
 * the whole run: a file browser sorting by name then matches deck order, which
 * it would not with `1, 10, 2`.
 */
export function formatName(pattern: string, context: NameContext): string {
  const name = context.label && context.label.trim() !== '' ? slugify(context.label) : context.card.id;

  const rendered = pattern.replace(TOKEN, (_match, token: string) => {
    switch (token) {
      case 'id':
        return context.card.id;
      case 'type':
        return context.card.type;
      case 'face':
        return context.face;
      case 'index':
        return String(context.index).padStart(context.indexWidth, '0');
      case 'name':
        return name;
      default:
        return '';
    }
  });

  const cleaned = rendered
    .split('/')
    .map((segment) => segment.replace(/[\\:*?"<>|]/g, '-').trim())
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..');

  if (cleaned.length === 0) throw new Error(`Name pattern "${pattern}" produced an empty path.`);
  return cleaned.join('/');
}

export function validateNamePattern(pattern: string): void {
  if (!/\{(id|name|index)\}/.test(pattern)) {
    throw new Error(
      `Name pattern "${pattern}" has no {id}, {name} or {index}, so every component would overwrite the previous one.`,
    );
  }
}
