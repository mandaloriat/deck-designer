/**
 * The knobs a deck exposes: CSS custom properties it declares as tunable.
 *
 * Editing these is what deck design actually consists of once the layout
 * exists, and they are the one thing a visual editor can round-trip safely: a
 * custom property is a key and a value, so writing one back cannot corrupt a
 * template the way rewriting rendered HTML would.
 */
export type ThemeKind = 'color' | 'length' | 'number' | 'text';

export interface ThemeVariable {
  /** Including the leading dashes, as written in CSS. */
  name: string;
  label: string;
  value: string;
  kind: ThemeKind;
  /** For lengths: the unit found on the current value. */
  unit?: string;
  min?: number;
  max?: number;
  /** Project-relative stylesheet that declares it. */
  file: string;
}

/** Every CSS named colour, so a hand-written `rebeccapurple` still gets a swatch. */
const NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond',
  'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral',
  'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
  'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid',
  'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite',
  'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
  'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray',
  'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon',
  'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose',
  'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid',
  'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
  'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
  'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey',
  'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'transparent', 'turquoise',
  'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen', 'currentcolor',
]);

const LENGTH = /^(-?\d*\.?\d+)(mm|cm|in|pt|px|rem|em|ch|vw|vh|%)$/;
const NUMBER = /^-?\d*\.?\d+$/;

export function classify(value: string): { kind: ThemeKind; unit?: string } {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return { kind: 'color' };
  if (/^(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/i.test(trimmed)) return { kind: 'color' };
  if (NAMED_COLORS.has(trimmed.toLowerCase())) return { kind: 'color' };

  const length = LENGTH.exec(trimmed);
  if (length) return { kind: 'length', unit: length[2] as string };
  if (NUMBER.test(trimmed)) return { kind: 'number' };
  return { kind: 'text' };
}

/** `--card-corner-radius` reads better as "Card corner radius" in a panel. */
export function labelFor(name: string): string {
  const words = name.replace(/^--/, '').replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Matches one custom property declaration. Kept deliberately narrow: it finds
 * `--name:` followed by everything up to the terminator, so rewriting replaces
 * a value and nothing else in the file.
 */
function declaration(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(${escaped}\\s*:\\s*)([^;}]*?)(\\s*[;}])`);
}

export function readVariable(css: string, name: string): string | undefined {
  const match = declaration(name).exec(css);
  return match ? (match[2] as string).trim() : undefined;
}

export function countDeclarations(css: string, name: string): number {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (css.match(new RegExp(`${escaped}\\s*:`, 'g')) ?? []).length;
}

export class ThemeWriteError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ThemeWriteError';
    this.code = code;
  }
}

/** Values that would let a write escape the declaration it is meant to change. */
const UNSAFE = /[;{}<>]|\/\*|\*\//;

/**
 * Replaces one custom property's value, leaving every other byte of the file
 * alone. Formatting, comments and ordering survive, because a design tool that
 * reformats your stylesheet on every colour tweak is one you stop using.
 */
export function writeVariable(css: string, name: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') throw new ThemeWriteError(`${name} cannot be set to an empty value.`, 'theme/empty-value');
  if (UNSAFE.test(trimmed)) {
    throw new ThemeWriteError(`${name}: "${trimmed}" contains characters that would break the declaration.`, 'theme/unsafe-value');
  }
  if (!declaration(name).test(css)) {
    throw new ThemeWriteError(`${name} is not declared in this stylesheet.`, 'theme/not-declared');
  }
  return css.replace(declaration(name), `$1${trimmed}$3`);
}
