import { describe, expect, it } from 'vitest';
import { cssMm, dpiToScale, mmToCssPx, mmToDevicePx, parseLength, PAGE_SIZES } from '../src/util/units.js';

describe('units', () => {
  it('reads bare numbers in the project unit', () => {
    expect(parseLength(10, 'mm')).toBe(10);
    expect(parseLength(1, 'in')).toBeCloseTo(25.4, 10);
    expect(parseLength(1, 'cm')).toBe(10);
  });

  it('honours an explicit suffix over the project unit', () => {
    expect(parseLength('0.5in', 'mm')).toBeCloseTo(12.7, 10);
    expect(parseLength('72pt', 'mm')).toBeCloseTo(25.4, 10);
    expect(parseLength('96px', 'in')).toBeCloseTo(25.4, 10);
  });

  it('rejects nonsense instead of silently producing NaN', () => {
    expect(() => parseLength('wide', 'mm')).toThrow();
    expect(() => parseLength('10 furlongs', 'mm')).toThrow();
    expect(() => parseLength(Number.NaN, 'mm')).toThrow();
  });

  it('maps millimetres onto the CSS and device grids', () => {
    expect(mmToCssPx(25.4)).toBe(96);
    expect(mmToDevicePx(25.4, 300)).toBe(300);
    expect(dpiToScale(300)).toBe(3.125);
    expect(cssMm(1 / 3)).toBe('0.3333mm');
  });

  it('knows the common page sizes', () => {
    expect(PAGE_SIZES['A4']).toEqual({ width: 210, height: 297 });
    expect(PAGE_SIZES['LETTER']?.width).toBeCloseTo(215.9, 6);
  });
});
