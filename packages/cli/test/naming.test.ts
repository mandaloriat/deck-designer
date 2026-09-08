import { describe, expect, it } from 'vitest';
import type { Card } from '@deck-designer/core';
import { DEFAULT_NAME_PATTERN, formatName } from '../src/naming.js';

function card(id: string, type = 'creature'): Card {
  return {
    id,
    type,
    index: 0,
    copies: 1,
    values: {},
    view: {},
    source: { file: null, row: null },
  };
}

describe('filename patterns', () => {
  it('fills the documented tokens', () => {
    expect(
      formatName(DEFAULT_NAME_PATTERN, { card: card('ember-whelp'), face: 'front', index: 1, indexWidth: 1 }),
    ).toBe('creature/ember-whelp.front.png');
  });

  it('pads {index} so a directory listing keeps project order', () => {
    expect(formatName('{index}-{id}.png', { card: card('x'), face: 'front', index: 7, indexWidth: 3 })).toBe(
      '007-x.png',
    );
  });

  it('slugifies {name} and falls back to the id', () => {
    const context = { card: card('x'), face: 'front', index: 1, indexWidth: 1 };
    expect(formatName('{name}.png', { ...context, label: 'Élan Vital' })).toBe('elan-vital.png');
    expect(formatName('{name}.png', context)).toBe('x.png');
  });

  it('cannot be used to write outside the output directory', () => {
    expect(
      formatName('{id}.png', { card: card('../../etc/passwd'), face: 'front', index: 1, indexWidth: 1 }),
    ).toBe('etc/passwd.png');
  });

  it('allows a constant name, because one shared back is a real case', () => {
    // Whether a pattern is safe depends on how many faces it is asked to name,
    // so the check lives where the files are written, not here.
    expect(formatName('back.png', { card: card('x'), face: 'back', index: 1, indexWidth: 1 })).toBe('back.png');
  });
});
