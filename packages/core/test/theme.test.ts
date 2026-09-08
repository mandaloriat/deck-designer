import { describe, expect, it } from 'vitest';
import { loadProject, resolveTheme } from '../src/index.js';
import {
  classify,
  countDeclarations,
  labelFor,
  readVariable,
  ThemeWriteError,
  writeVariable,
} from '../src/theme/variables.js';
import { makeProject, MINIMAL_CONFIG, MINIMAL_TEMPLATE } from './helpers.js';

const CSS = `:root {
  /* the deck's ink */
  --ink: #1b1a17;
  --gap:   2.5mm ;
  --scale: 1.25;
  --font: "EB Garamond", serif;
}
`;

describe('classify', () => {
  it('recognises the shapes a control can be built for', () => {
    expect(classify('#1b1a17')).toEqual({ kind: 'color' });
    expect(classify('#abc')).toEqual({ kind: 'color' });
    expect(classify('oklch(62% 0.15 45)')).toEqual({ kind: 'color' });
    expect(classify(' rebeccapurple ')).toEqual({ kind: 'color' });
    expect(classify('white')).toEqual({ kind: 'color' });
    expect(classify('2.5mm')).toEqual({ kind: 'length', unit: 'mm' });
    expect(classify('-3px')).toEqual({ kind: 'length', unit: 'px' });
    expect(classify('1.25')).toEqual({ kind: 'number' });
    expect(classify('"EB Garamond", serif')).toEqual({ kind: 'text' });
  });
});

describe('labelFor', () => {
  it('turns a property name into something readable', () => {
    expect(labelFor('--card-corner-radius')).toBe('Card corner radius');
    expect(labelFor('--ink')).toBe('Ink');
  });
});

describe('readVariable', () => {
  it('reads the declared value without its surrounding whitespace', () => {
    expect(readVariable(CSS, '--ink')).toBe('#1b1a17');
    expect(readVariable(CSS, '--gap')).toBe('2.5mm');
    expect(readVariable(CSS, '--font')).toBe('"EB Garamond", serif');
    expect(readVariable(CSS, '--missing')).toBeUndefined();
  });

  it('does not match a longer property that ends with the same name', () => {
    expect(readVariable('--card-ink: red;', '--ink')).toBeUndefined();
  });

  it('reads a declaration that closes the block instead of ending in a semicolon', () => {
    expect(readVariable(':root{--ink:#000}', '--ink')).toBe('#000');
  });
});

describe('countDeclarations', () => {
  it('counts every declaration, so a shadowed knob can be reported', () => {
    expect(countDeclarations(CSS, '--ink')).toBe(1);
    expect(countDeclarations(`${CSS}\n.dark { --ink: #fff; }`, '--ink')).toBe(2);
  });
});

describe('writeVariable', () => {
  it('replaces only the value, leaving formatting and comments alone', () => {
    const next = writeVariable(CSS, '--ink', '#ffffff');
    expect(next).toBe(CSS.replace('#1b1a17', '#ffffff'));
    expect(next).toContain("/* the deck's ink */");
  });

  it('keeps the spacing a hand-written declaration had', () => {
    expect(writeVariable(CSS, '--gap', '4mm')).toContain('--gap:   4mm ;');
  });

  it('round-trips: what it writes is what reading gets back', () => {
    for (const [name, value] of [
      ['--ink', 'oklch(62% 0.15 45)'],
      ['--gap', '0.25in'],
      ['--font', '"Iowan Old Style", Georgia, serif'],
    ] as const) {
      expect(readVariable(writeVariable(CSS, name, value), name)).toBe(value);
    }
  });

  it('refuses values that would escape the declaration', () => {
    for (const bad of ['red; display: none', '} .dd-card { color: red', '#fff /* x', 'a<script>']) {
      expect(() => writeVariable(CSS, '--ink', bad)).toThrow(ThemeWriteError);
    }
    expect(() => writeVariable(CSS, '--ink', '   ')).toThrow(/empty/);
    expect(() => writeVariable(CSS, '--nope', 'red')).toThrow(/not declared/);
  });
});

const THEME_CONFIG = `${MINIMAL_CONFIG}styles:
  - base.css
theme:
  - --ink
  - { name: --radius, label: Corner, min: 0, max: 10 }
  - --absent
`;

describe('resolveTheme', () => {
  it('pairs each declared knob with the stylesheet that sets it', async () => {
    const fixture = await makeProject({
      'deck.yaml': THEME_CONFIG,
      'base.css': ':root { --ink: #111; --radius: 3.5mm; }',
      'templates/unit.liquid': MINIMAL_TEMPLATE,
      'data/units.csv': 'name\nAlpha\n',
    });
    try {
      const { variables, diagnostics } = resolveTheme(await loadProject({ cwd: fixture.root }));
      expect(variables).toEqual([
        { name: '--ink', label: 'Ink', value: '#111', kind: 'color', file: 'base.css' },
        { name: '--radius', label: 'Corner', value: '3.5mm', kind: 'length', unit: 'mm', min: 0, max: 10, file: 'base.css' },
      ]);
      // A knob nothing declares is a typo in the config, not an empty control.
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ code: 'theme/not-declared', severity: 'warning' });
    } finally {
      await fixture.cleanup();
    }
  });

  it('points at the declaration the cascade uses, and says the others exist', async () => {
    const fixture = await makeProject({
      'deck.yaml': `${MINIMAL_CONFIG.replace('  - id: unit', '  - id: unit\n    styles: [later.css]')}styles:
  - base.css
theme: [--ink]
`,
      'base.css': ':root { --ink: #111; }',
      'later.css': ':root { --ink: #222; }',
      'templates/unit.liquid': MINIMAL_TEMPLATE,
      'data/units.csv': 'name\nAlpha\n',
    });
    try {
      const { variables, diagnostics } = resolveTheme(await loadProject({ cwd: fixture.root }));
      expect(variables[0]).toMatchObject({ value: '#222', file: 'later.css' });
      expect(diagnostics[0]).toMatchObject({ code: 'theme/shadowed' });
    } finally {
      await fixture.cleanup();
    }
  });
});
