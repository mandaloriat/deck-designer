import { describe, expect, it } from 'vitest';
import { gridFor, planSheets, type FacePair } from '../src/layout/grid.js';

const A4 = { width: 210, height: 297 };
const CARD = { width: 63, height: 88 };

function pairs(count: number, withBacks = false): FacePair<string>[] {
  return Array.from({ length: count }, (_, i) =>
    withBacks ? { front: `f${i}`, back: `b${i}` } : { front: `f${i}` },
  );
}

describe('grid fitting', () => {
  it('fits the largest grid that respects the margin', () => {
    expect(gridFor({ page: A4, cell: CARD, margin: 10 })).toEqual({ columns: 3, rows: 3 });
    expect(gridFor({ page: A4, cell: CARD, margin: 10, spacing: { horizontal: 3, vertical: 3 } })).toEqual({
      columns: 2,
      rows: 3,
    });
  });

  it('packs small components densely', () => {
    expect(gridFor({ page: A4, cell: { width: 25, height: 25 }, margin: 5 })).toEqual({
      columns: 8,
      rows: 11,
    });
  });

  it('refuses a component that cannot fit rather than clipping it', () => {
    expect(() => gridFor({ page: A4, cell: { width: 300, height: 88 }, margin: 10 })).toThrow(/does not fit/);
  });
});

describe('sheet planning', () => {
  it('centres the grid in the usable area', () => {
    const plan = planSheets(pairs(1), { page: A4, cell: CARD, margin: 10 });
    // 210 - 3*63 = 21mm of slack, split evenly.
    expect(plan.sheets[0]?.cells[0]?.x).toBeCloseTo(10.5, 6);
  });

  it('splits into sheets of columns x rows', () => {
    const plan = planSheets(pairs(10), { page: A4, cell: CARD, margin: 10, duplex: 'none' });
    expect(plan.perSheet).toBe(9);
    expect(plan.sheets).toHaveLength(2);
    expect(plan.sheets[1]?.cells).toHaveLength(1);
  });

  it('mirrors back sheets on the long edge so duplex printing lines up', () => {
    const plan = planSheets(pairs(3, true), { page: A4, cell: CARD, margin: 10, duplex: 'long-edge' });
    expect(plan.sheets.map((s) => s.face)).toEqual(['front', 'back']);
    expect(plan.sheets[0]?.cells.map((c) => c.column)).toEqual([0, 1, 2]);
    expect(plan.sheets[1]?.cells.map((c) => c.column)).toEqual([2, 1, 0]);
    // The pairing survives the mirroring.
    expect(plan.sheets[1]?.cells.map((c) => c.item)).toEqual(['b0', 'b1', 'b2']);
  });

  it('mirrors rows instead when flipping on the short edge', () => {
    const plan = planSheets(pairs(1, true), { page: A4, cell: CARD, margin: 10, duplex: 'short-edge' });
    expect(plan.sheets[1]?.cells[0]).toMatchObject({ row: 2, column: 0 });
  });

  it('emits no back sheets when duplex is off', () => {
    const plan = planSheets(pairs(2, true), { page: A4, cell: CARD, margin: 10, duplex: 'none' });
    expect(plan.sheets).toHaveLength(1);
  });

  it('keeps every sheet on the same grid so cells land in the same place', () => {
    const plan = planSheets(pairs(10), { page: A4, cell: CARD, margin: 10, duplex: 'none' });
    const first = plan.sheets[0]?.cells[0];
    const last = plan.sheets[1]?.cells[0];
    expect(last?.x).toBe(first?.x);
    expect(last?.y).toBe(first?.y);
  });
});
