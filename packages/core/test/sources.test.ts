import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/project/load.js';
import { resolveCards } from '../src/data/resolve.js';
import { makeProject } from './helpers.js';

const CONFIG = `version: 1
name: Sources
card: { width: 63, height: 88 }
cardTypes:
  - id: unit
    template: templates/unit.liquid
    data: data/units
    fields:
      name: { type: text, required: true }
      cost: { type: integer, default: 0 }
      rules: { type: richtext, paragraphs: true }
`;

const TEMPLATE = '{{ card.name }}{{ card.rules }}';

async function load(files: Record<string, string>, config = CONFIG) {
  const fixture = await makeProject({ 'deck.yaml': config, 'templates/unit.liquid': TEMPLATE, ...files });
  const project = await loadProject({ cwd: fixture.root });
  const result = await resolveCards(project);
  return { ...result, cleanup: fixture.cleanup };
}

describe('Markdown sources', () => {
  it('reads front matter as fields and the body as rich text', async () => {
    const { cards, diagnostics, cleanup } = await load({
      'data/units/alpha.md': `---
name: Alpha
cost: 3
---
**Guard.** Blocks the first hit.
`,
    });
    try {
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(cards[0]?.values).toMatchObject({ name: 'Alpha', cost: 3 });
      expect(cards[0]?.values['rules']).toBe('**Guard.** Blocks the first hit.');
      expect(cards[0]?.view['rules']).toBe('<p><strong>Guard.</strong> Blocks the first hit.</p>');
    } finally {
      await cleanup();
    }
  });

  it('takes the id from the filename, so renaming a card does not move it', async () => {
    const { cards, cleanup } = await load({
      'data/units/dawn-sentinel.md': '---\nname: Renamed Later\n---\nText.\n',
    });
    try {
      expect(cards[0]?.id).toBe('unit-dawn-sentinel');
    } finally {
      await cleanup();
    }
  });

  it('keeps blank-line separated blocks as paragraphs', async () => {
    const { cards, cleanup } = await load({
      'data/units/a.md': '---\nname: A\n---\nFirst.\n\nSecond.\n',
    });
    try {
      expect(cards[0]?.view['rules']).toBe('<p>First.</p><p>Second.</p>');
    } finally {
      await cleanup();
    }
  });

  it('refuses a file with no front matter instead of guessing', async () => {
    await expect(load({ 'data/units/a.md': 'Just prose.\n' })).rejects.toThrow(/front matter/);
  });

  it('warns when the body has nowhere to go', async () => {
    const config = CONFIG.replace('      rules: { type: richtext, paragraphs: true }\n', '');
    const { diagnostics, cleanup } = await load({ 'data/units/a.md': '---\nname: A\n---\nBody.\n' }, config);
    try {
      expect(diagnostics.some((d) => d.code === 'data/body-ignored')).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('warns when a field is set both in the front matter and in the body', async () => {
    const { cards, diagnostics, cleanup } = await load({
      'data/units/a.md': '---\nname: A\nrules: from front matter\n---\nFrom body.\n',
    });
    try {
      expect(diagnostics.some((d) => d.code === 'data/body-conflict')).toBe(true);
      expect(cards[0]?.values['rules']).toBe('From body.');
    } finally {
      await cleanup();
    }
  });
});

describe('directory sources', () => {
  it('reads every data file in filename order', async () => {
    const { cards, cleanup } = await load({
      'data/units/b-second.md': '---\nname: Second\n---\n',
      'data/units/a-first.md': '---\nname: First\n---\n',
      'data/units/notes.txt': 'ignored',
    });
    try {
      expect(cards.map((c) => c.values['name'])).toEqual(['First', 'Second']);
    } finally {
      await cleanup();
    }
  });

  it('mixes formats under one field schema', async () => {
    const { cards, diagnostics, cleanup } = await load({
      'data/units/a.md': '---\nname: FromMarkdown\ncost: 1\n---\n',
      'data/units/b.csv': 'name,cost\nFromCsv,2\n',
      'data/units/c.yaml': '- name: FromYaml\n  cost: 3\n',
    });
    try {
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(cards.map((c) => c.values['cost'])).toEqual([1, 2, 3]);
    } finally {
      await cleanup();
    }
  });

  it('reports an empty directory rather than rendering nothing', async () => {
    await expect(load({ 'data/units/readme.txt': 'nope' })).rejects.toThrow(/No data files/);
  });
});
