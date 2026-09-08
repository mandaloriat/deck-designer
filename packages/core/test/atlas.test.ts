import { describe, expect, it } from 'vitest';
import { MAX_COLUMNS, MAX_ROWS, atlasCapacity, chunkForAtlases, planAtlas } from '../src/layout/atlas.js';
import type { Geometry } from '../src/project/model.js';

const CARD: Geometry = { width: 58, height: 88, bleed: 3, safe: 4, cornerRadius: 3.5 };

describe('atlas planning', () => {
  it('fills rows before adding them', () => {
    expect(planAtlas(CARD, 40, { maxSize: 4096, maxDpi: 300 })).toMatchObject({ columns: 10, rows: 4, count: 40 });
    expect(planAtlas(CARD, 7, { maxSize: 4096, maxDpi: 300 })).toMatchObject({ columns: 7, rows: 1 });
    expect(planAtlas(CARD, 11, { maxSize: 4096, maxDpi: 300 })).toMatchObject({ columns: 10, rows: 2 });
  });

  it('never exceeds the size cap, however the rounding falls', () => {
    // Rounding each card up half a pixel and multiplying by ten columns is how
    // a 4096 cap used to produce a 4100px image.
    for (const count of [1, 9, 10, 23, 40, 70]) {
      const plan = planAtlas(CARD, count, { maxSize: 4096, maxDpi: 1200 });
      expect(plan.widthPx).toBeLessThanOrEqual(4096);
      expect(plan.heightPx).toBeLessThanOrEqual(4096);
      expect(plan.widthPx).toBe(plan.cardWidthPx * plan.columns);
    }
  });

  it('keeps a small deck sharp instead of stretching it across ten columns', () => {
    const few = planAtlas(CARD, 9, { maxSize: 4096, maxDpi: 300 });
    const many = planAtlas(CARD, 40, { maxSize: 4096, maxDpi: 300 });
    expect(few.cardWidthPx).toBeGreaterThan(many.cardWidthPx);
  });

  it('does not render finer than the deck prints', () => {
    expect(planAtlas(CARD, 1, { maxSize: 100_000, maxDpi: 300 }).dpi).toBe(300);
  });

  it('refuses more faces than a grid can hold', () => {
    expect(() => planAtlas(CARD, 71, { maxSize: 4096, maxDpi: 300 })).toThrow(/do not fit/);
    expect(() => planAtlas(CARD, 0, { maxSize: 4096, maxDpi: 300 })).toThrow(/at least one/);
  });

  it('splits a long deck into atlas-sized chunks', () => {
    expect(atlasCapacity({})).toBe(MAX_COLUMNS * MAX_ROWS);
    const chunks = chunkForAtlases(Array.from({ length: 150 }, (_, i) => i), {});
    expect(chunks.map((c) => c.length)).toEqual([70, 70, 10]);
  });

  it('honours a forced grid', () => {
    expect(planAtlas(CARD, 12, { maxSize: 4096, maxDpi: 300, columns: 4, rows: 3 })).toMatchObject({
      columns: 4,
      rows: 3,
    });
  });
});
