import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/project/load.js';
import { resolveCards } from '../src/data/resolve.js';
import { expandCopies } from '../src/project/model.js';
import { composeCards } from '../src/template/compose.js';
import { makeProject, MINIMAL_CONFIG, MINIMAL_TEMPLATE } from './helpers.js';

async function withDeck<T>(
  csv: string,
  fn: (input: Awaited<ReturnType<typeof loadProject>>) => Promise<T>,
  config = MINIMAL_CONFIG,
): Promise<T> {
  const fixture = await makeProject({
    'deck.yaml': config,
    'templates/unit.liquid': MINIMAL_TEMPLATE,
    'data/units.csv': csv,
  });
  try {
    return await fn(await loadProject({ cwd: fixture.root }));
  } finally {
    await fixture.cleanup();
  }
}

describe('card resolution', () => {
  it('coerces values and applies declared defaults', async () => {
    await withDeck('name,cost\nAlpha,3\nBeta,\n', async (project) => {
      const { cards, diagnostics } = await resolveCards(project);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(cards[0]?.values).toMatchObject({ name: 'Alpha', cost: 3, rarity: 'common' });
      expect(cards[1]?.values['cost']).toBe(0);
    });
  });

  it('derives readable, stable ids from the name column', async () => {
    await withDeck('name\nDawn Sentinel\nEmber Whelp\n', async (project) => {
      const { cards } = await resolveCards(project);
      expect(cards.map((c) => c.id)).toEqual(['unit-dawn-sentinel', 'unit-ember-whelp']);
    });
  });

  it('flags duplicate ids instead of silently overwriting a card', async () => {
    await withDeck('id,name\nx,One\nx,Two\n', async (project) => {
      const { diagnostics } = await resolveCards(project);
      expect(diagnostics.some((d) => d.code === 'data/duplicate-id')).toBe(true);
    });
  });

  it('rejects values outside a declared enum or type', async () => {
    await withDeck('name,cost,rarity\nAlpha,many,legendary\n', async (project) => {
      const { diagnostics } = await resolveCards(project);
      const codes = diagnostics.map((d) => d.code);
      expect(codes).toContain('data/not-a-number');
      expect(codes).toContain('data/bad-enum');
    });
  });

  it('requires required fields', async () => {
    await withDeck('name,cost\n,3\n', async (project) => {
      const { diagnostics } = await resolveCards(project);
      expect(diagnostics.some((d) => d.code === 'data/required')).toBe(true);
    });
  });

  it('warns about columns the schema does not declare', async () => {
    await withDeck('name,powerr\nAlpha,3\n', async (project) => {
      const { diagnostics } = await resolveCards(project);
      expect(diagnostics.some((d) => d.code === 'data/unknown-field')).toBe(true);
    });
  });

  it('keeps copies out of the card list and expands them only for print runs', async () => {
    await withDeck('name,copies\nAlpha,3\nBeta,1\n', async (project) => {
      const { cards } = await resolveCards(project);
      expect(cards).toHaveLength(2);
      expect(expandCopies(cards)).toHaveLength(4);
    });
  });

  it('escapes text for rendering while keeping raw values for logic', async () => {
    await withDeck('name\nA & B\n', async (project) => {
      const { cards } = await resolveCards(project);
      expect(cards[0]?.values['name']).toBe('A & B');
      expect(cards[0]?.view['name']).toBe('A &amp; B');
    });
  });

  it('reports missing artwork with the row that references it', async () => {
    const config = MINIMAL_CONFIG.replace(
      '      rules: { type: richtext }',
      '      rules: { type: richtext }\n      art: { type: image }',
    );
    await withDeck(
      'name,art\nAlpha,assets/nope.png\n',
      async (project) => {
        const { diagnostics } = await resolveCards(project);
        expect(diagnostics.some((d) => d.code === 'asset/missing')).toBe(true);
      },
      config,
    );
  });
});

describe('composition', () => {
  it('renders one fragment per requested face and skips missing backs', async () => {
    await withDeck('name\nAlpha\n', async (project) => {
      const { cards } = await resolveCards(project);
      const composed = await composeCards(project, cards, { faces: ['front', 'back'] });
      expect(composed).toHaveLength(1);
      expect(composed[0]?.html).toContain('<h1>Alpha</h1>');
    });
  });

  it('surfaces template errors with the file name', async () => {
    const fixture = await makeProject({
      'deck.yaml': MINIMAL_CONFIG,
      'templates/unit.liquid': '{{ card.name | nosuchfilter }}',
      'data/units.csv': 'name\nAlpha\n',
    });
    try {
      const project = await loadProject({ cwd: fixture.root });
      const { cards } = await resolveCards(project);
      await expect(composeCards(project, cards)).rejects.toThrow(/unit\.liquid/);
    } finally {
      await fixture.cleanup();
    }
  });
});
