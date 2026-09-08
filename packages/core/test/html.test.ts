import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRichText, sanitizeInlineHtml, slugify } from '../src/util/html.js';

describe('escaping', () => {
  it('escapes every character that could open a tag or attribute', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('keeps allowlisted formatting tags and drops everything else', () => {
    expect(sanitizeInlineHtml('a <strong>b</strong> c')).toBe('a <strong>b</strong> c');
    expect(sanitizeInlineHtml('<span class="cost">3</span>')).toBe('<span class="cost">3</span>');
    expect(sanitizeInlineHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(sanitizeInlineHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('strips attributes other than class', () => {
    expect(sanitizeInlineHtml('<span onclick="x" class="k">v</span>')).toBe('<span class="k">v</span>');
    expect(sanitizeInlineHtml('<b style="width:99in">v</b>')).toBe('<b>v</b>');
  });
});

describe('rich text', () => {
  it('supports the small markup set', () => {
    expect(renderRichText('**Guard.** then *this*')).toBe('<strong>Guard.</strong> then <em>this</em>');
    expect(renderRichText('one\ntwo')).toBe('one<br />two');
  });

  it('substitutes icon tokens only when the icon exists', () => {
    const resolveIcon = (name: string): string | null => (name === 'attack' ? '/assets/icons/attack.svg' : null);
    expect(renderRichText('deal [[attack]] 1', { resolveIcon })).toContain('<img class="dd-icon" src="/assets/icons/attack.svg"');
    expect(renderRichText('deal [[unknown]] 1', { resolveIcon })).toBe('deal [[unknown]] 1');
  });

  it('cannot be used to inject markup through data', () => {
    expect(renderRichText('<img src=x onerror=alert(1)>')).not.toContain('<img src=x');
  });

  it('slugifies accented names into stable ids', () => {
    expect(slugify('Élan Vital!')).toBe('elan-vital');
    expect(slugify('  ')).toBe('');
  });
});
