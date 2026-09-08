import { describe, expect, it } from 'vitest';
import { gridFor, impose, type CardUnit } from '../src/layout/imposition.js';

const A4 = { width: 210, height: 297 };
const CELL = { width: 63, height: 88 };

function units(count: number, withBacks = false): CardUnit[] {
  return Array.from({ length: count }, (_, i) => {
    const front = { card: { id: `c${i}` }, face: 'front', typeId: 't' } as unknown as CardUnit['front'];
    const back = { card: { id: `c${i}` }, face: 'back', typeId: 't' } as unknown as CardUnit['front'];
    return withBacks ? { front, back } : { front };
  });
}

describe('imposition', () => {
  it('fits the largest grid that respects the margin', () => {
    expect(gridFor({ page: A4, cell: CELL, margin: 10, gutter: 0, duplex: 'none' })).toEqual({
      columns: 3,
      rows: 3,
    });
    expect(gridFor({ page: A4, cell: CELL, margin: 10, gutter: 3, duplex: 'none' })).toEqual({
      columns: 2,
      rows: 3,
    });
  });

  it('refuses a card that cannot fit rather than clipping it', () => {
    expect(() => gridFor({ page: A4, cell: { width: 300, height: 88 }, margin: 10, gutter: 0, duplex: 'none' })).toThrow(
      /does not fit/,
    );
  });

  it('centres the grid in the usable area', () => {
    const layout = impose(units(1), { page: A4, cell: CELL, margin: 10, gutter: 0, duplex: 'none' });
    const slot = layout.pages[0]?.slots[0];
    // 210 - 3*63 = 21mm of slack, split evenly.
    expect(slot?.x).toBeCloseTo(10.5, 6);
  });

  it('splits into pages of columns x rows', () => {
    const layout = impose(units(10), { page: A4, cell: CELL, margin: 10, gutter: 0, duplex: 'none' });
    expect(layout.perPage).toBe(9);
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[1]?.slots).toHaveLength(1);
  });

  it('mirrors back pages on the long edge so duplex printing lines up', () => {
    const layout = impose(units(3, true), { page: A4, cell: CELL, margin: 10, gutter: 0, duplex: 'long-edge' });
    expect(layout.pages.map((p) => p.face)).toEqual(['front', 'back']);
    const front = layout.pages[0]?.slots.map((s) => s.column);
    const back = layout.pages[1]?.slots.map((s) => s.column);
    expect(front).toEqual([0, 1, 2]);
    expect(back).toEqual([2, 1, 0]);
  });

  it('mirrors rows instead when flipping on the short edge', () => {
    const layout = impose(units(1, true), { page: A4, cell: CELL, margin: 10, gutter: 0, duplex: 'short-edge' });
    expect(layout.pages[1]?.slots[0]?.row).toBe(2);
    expect(layout.pages[1]?.slots[0]?.column).toBe(0);
  });

  it('emits no back pages when duplex is off', () => {
    const layout = impose(units(2, true), { page: A4, cell: CELL, margin: 10, gutter: 0, duplex: 'none' });
    expect(layout.pages).toHaveLength(1);
  });
});
