const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

/** Tags that survive rich-text sanitisation. Attributes are dropped except `class`. */
const ALLOWED_TAGS = new Set([
  'b',
  'i',
  'em',
  'strong',
  'u',
  's',
  'small',
  'sup',
  'sub',
  'br',
  'p',
  'span',
  'div',
  'ul',
  'ol',
  'li',
  'hr',
]);

const CLASS_ATTR = /\bclass\s*=\s*"([^"<>]*)"|\bclass\s*=\s*'([^'<>]*)'/i;

/**
 * Escapes everything, then re-admits an allowlist of formatting tags. Working
 * from a fully escaped string means an unexpected construct degrades to visible
 * text rather than to injected markup.
 */
export function sanitizeInlineHtml(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(/&lt;(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^&]|&(?!gt;))*?)(\/?)&gt;/g, (match, slash, tag, attrs, selfClose) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return match;
    if (slash) return `</${name}>`;
    const classMatch = CLASS_ATTR.exec(String(attrs).replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    const className = classMatch?.[1] ?? classMatch?.[2];
    const cleaned = className ? ` class="${escapeHtml(className)}"` : '';
    const close = selfClose || name === 'br' || name === 'hr' ? ' /' : '';
    return `<${name}${cleaned}${close}>`;
  });
}

export interface RichTextOptions {
  /** Resolves `[[token]]` to an icon URL. Returning null leaves the token as text. */
  resolveIcon?: (name: string) => string | null;
  /** Convert blank lines to paragraphs instead of `<br>`. */
  paragraphs?: boolean;
}

/**
 * Rich text is a deliberately small superset of plain text: `**bold**`,
 * `*italic*`, line breaks, `[[icon]]` tokens, plus the allowlisted inline tags.
 * Anything else stays literal, which keeps data files readable by non-authors.
 */
export function renderRichText(value: string, options: RichTextOptions = {}): string {
  let out = sanitizeInlineHtml(value);

  out = out.replace(/\[\[([a-zA-Z0-9._:-]+)\]\]/g, (match, name: string) => {
    const url = options.resolveIcon?.(name) ?? null;
    if (!url) return match;
    return `<img class="dd-icon" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
  });

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, '$1<em>$2</em>');

  if (options.paragraphs) {
    const blocks = out.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    return blocks.map((b) => `<p>${b.replace(/\n/g, '<br />')}</p>`).join('');
  }
  return out.replace(/\n/g, '<br />');
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
