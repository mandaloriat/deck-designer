import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/project/load.js';
import { resolveCards } from '../src/data/resolve.js';
import { DeckError } from '../src/util/errors.js';
import { makeProject, MINIMAL_CONFIG, MINIMAL_TEMPLATE } from './helpers.js';

describe('project loading', () => {
  it('resolves geometry and per-type overrides', async () => {
    const fixture = await makeProject({
      'deck.yaml': `${MINIMAL_CONFIG}    card: { width: 70 }\n`,
      'templates/unit.liquid': MINIMAL_TEMPLATE,
      'data/units.csv': 'name\nAlpha\n',
    });
    try {
      const project = await loadProject({ cwd: fixture.root });
      expect(project.geometry).toEqual({ width: 63, height: 88, bleed: 3, safe: 0, cornerRadius: 0 });
      expect(project.cardTypes[0]?.geometry.width).toBe(70);
      expect(project.cardTypes[0]?.geometry.height).toBe(88);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports config problems as diagnostics rather than throwing raw zod output', async () => {
    const fixture = await makeProject({ 'deck.yaml': 'version: 1\nname: Broken\n' });
    try {
      await expect(loadProject({ cwd: fixture.root })).rejects.toBeInstanceOf(DeckError);
      const error = await loadProject({ cwd: fixture.root }).catch((e: DeckError) => e);
      expect((error as DeckError).diagnostics.some((d) => d.message.includes('card'))).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('refuses paths that escape the project directory', async () => {
    const fixture = await makeProject({
      'deck.yaml': `version: 1
name: Escape
card: { width: 63, height: 88 }
cardTypes:
  - id: unit
    template: ../../../etc/passwd
`,
    });
    try {
      await expect(loadProject({ cwd: fixture.root })).rejects.toThrow(/escapes the project/);
    } finally {
      await fixture.cleanup();
    }
  });

  it('refuses remote font sources so builds stay offline', async () => {
    const fixture = await makeProject({
      'deck.yaml': `version: 1
name: Remote
card: { width: 63, height: 88 }
fonts:
  - family: Inter
    src: https://fonts.example/inter.woff2
cardTypes:
  - id: unit
    template: templates/unit.liquid
`,
      'templates/unit.liquid': MINIMAL_TEMPLATE,
    });
    try {
      await expect(loadProject({ cwd: fixture.root })).rejects.toThrow(/Remote font/);
    } finally {
      await fixture.cleanup();
    }
  });

  it('discovers icons by filename', async () => {
    const fixture = await makeProject({
      'deck.yaml': MINIMAL_CONFIG,
      'templates/unit.liquid': MINIMAL_TEMPLATE,
      'data/units.csv': 'name\nAlpha\n',
      'assets/icons/attack.svg': '<svg />',
      'assets/icons/notes.md': 'ignored',
    });
    try {
      const project = await loadProject({ cwd: fixture.root });
      expect(project.icons).toEqual({ attack: '/assets/icons/attack.svg' });
      const { cards } = await resolveCards(project);
      expect(cards).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });
});
