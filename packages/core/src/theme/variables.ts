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
  return new RegExp(`(${escaped}\\s*:\\s*)([^;}]*?)(\\s*[;}])`, 'g');
}

/**
 * Where the comments are. A theme stylesheet is exactly the kind of file that
 * collects commented-out alternatives, and `/* --ink: red; *\/` is not a
 * declaration: reading one would report the wrong value and writing one would
 * edit a line that does nothing while the live declaration stayed put.
 *
 * Strings are skipped as they are passed, so a quoted "\/*" cannot open a
 * comment that swallows the rest of the file.
 */
function commentRanges(css: string): [number, number][] {
  const ranges: [number, number][] = [];
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < css.length && css[i] !== ch) i += css[i] === '\\' ? 2 : 1;
      i += 1;
    } else if (ch === '/' && css[i + 1] === '*') {
      // An unterminated comment runs to the end of the file, as CSS says.
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      ranges.push([i, stop]);
      i = stop;
    } else {
      i += 1;
    }
  }
  return ranges;
}

/** Every real declaration of `name`, in source order. */
function declarations(css: string, name: string): RegExpExecArray[] {
  const ranges = commentRanges(css);
  const pattern = declaration(name);
  const found: RegExpExecArray[] = [];
  for (let match = pattern.exec(css); match !== null; match = pattern.exec(css)) {
    if (!ranges.some(([start, end]) => match.index >= start && match.index < end)) found.push(match);
  }
  return found;
}

export function readVariable(css: string, name: string): string | undefined {
  const match = declarations(css, name)[0];
  return match ? (match[2] as string).trim() : undefined;
}

export function countDeclarations(css: string, name: string): number {
  return declarations(css, name).length;
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
  const match = declarations(css, name)[0];
  if (!match) throw new ThemeWriteError(`${name} is not declared in this stylesheet.`, 'theme/not-declared');
  // Spliced by offset rather than String.replace, which would find the first
  // textual match and so could land inside a comment.
  const start = match.index + (match[1] as string).length;
  return css.slice(0, start) + trimmed + css.slice(start + (match[2] as string).length);
}
