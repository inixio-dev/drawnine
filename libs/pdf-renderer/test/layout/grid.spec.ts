import { describe, expect, it } from 'vitest';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  computeGridLayout,
  CUT_MARK_OFFSET_MM,
  DEFAULT_LAYOUT_OPTIONS,
  LayoutError,
  type LayoutOptions,
} from '@app/pdf-renderer';

const noMarks: LayoutOptions = { gapMm: 0, bleedMm: 0, cutMarks: false };

describe('computeGridLayout', () => {
  it('returns no pages for zero cards', () => {
    expect(computeGridLayout(0, DEFAULT_LAYOUT_OPTIONS)).toMatchObject({
      pageCount: 0,
      slots: [],
    });
  });

  it('centres a 3×3 grid on A4', () => {
    const { slots } = computeGridLayout(9, noMarks);
    // 3 × 63 = 189 → 10.5 mm margins; 3 × 88 = 264 → 16.5 mm margins.
    expect(slots[0]?.trim).toEqual({
      xMm: 10.5,
      yMm: 297 - 16.5 - 88,
      widthMm: 63,
      heightMm: 88,
    });
    expect(slots[2]?.trim.xMm).toBeCloseTo(10.5 + 2 * 63);
    expect(slots[8]?.trim).toMatchObject({ xMm: 136.5, yMm: 16.5 });
  });

  it('orders slots row-major from the top-left', () => {
    const { slots } = computeGridLayout(4, noMarks);
    expect(slots[1]!.trim.xMm).toBeGreaterThan(slots[0]!.trim.xMm);
    expect(slots[1]!.trim.yMm).toBe(slots[0]!.trim.yMm);
    expect(slots[3]!.trim.yMm).toBeLessThan(slots[0]!.trim.yMm);
    expect(slots[3]!.trim.xMm).toBe(slots[0]!.trim.xMm);
  });

  it('keeps the grid symmetric (equal margins)', () => {
    for (const options of [
      noMarks,
      { ...noMarks, gapMm: 5 },
      { ...noMarks, bleedMm: 2 },
    ]) {
      const { slots } = computeGridLayout(9, options);
      const first = slots[0]!.bleed;
      const last = slots[8]!.bleed;
      expect(first.xMm).toBeCloseTo(A4_WIDTH_MM - (last.xMm + last.widthMm));
      expect(last.yMm).toBeCloseTo(A4_HEIGHT_MM - (first.yMm + first.heightMm));
    }
  });

  it('applies the gap between cards', () => {
    const { slots } = computeGridLayout(4, { ...noMarks, gapMm: 3 });
    const [a, b, , d] = slots;
    expect(b!.trim.xMm - (a!.trim.xMm + CARD_WIDTH_MM)).toBeCloseTo(3);
    expect(a!.trim.yMm - (d!.trim.yMm + CARD_HEIGHT_MM)).toBeCloseTo(3);
  });

  it('applies bleed around the trim box', () => {
    const { slots } = computeGridLayout(1, { ...noMarks, bleedMm: 2 });
    const { trim, bleed } = slots[0]!;
    expect(trim.widthMm).toBe(63);
    expect(trim.heightMm).toBe(88);
    expect(bleed).toEqual({
      xMm: trim.xMm - 2,
      yMm: trim.yMm - 2,
      widthMm: 67,
      heightMm: 92,
    });
  });

  it('paginates every 9 cards', () => {
    const layout = computeGridLayout(19, noMarks);
    expect(layout.pageCount).toBe(3);
    expect(layout.slots).toHaveLength(19);
    expect(layout.slots[9]).toMatchObject({ page: 1, index: 0 });
    expect(layout.slots[18]).toMatchObject({ page: 2, index: 0 });
    expect(layout.slots[9]!.trim).toEqual(layout.slots[0]!.trim);
  });

  it('rejects invalid options and layouts that do not fit', () => {
    expect(() => computeGridLayout(1, { ...noMarks, gapMm: -1 })).toThrow(
      LayoutError,
    );
    expect(() => computeGridLayout(1, { ...noMarks, gapMm: 11 })).toThrow(
      LayoutError,
    );
    expect(() => computeGridLayout(1, { ...noMarks, bleedMm: -1 })).toThrow(
      LayoutError,
    );
    expect(() =>
      computeGridLayout(1, { ...noMarks, gapMm: 10, bleedMm: 1 }),
    ).toThrow(LayoutError);
    expect(() => computeGridLayout(-1, noMarks)).toThrow(LayoutError);
    expect(() => computeGridLayout(1.5, noMarks)).toThrow(LayoutError);
  });

  it('accepts the largest gap that fits', () => {
    expect(() => computeGridLayout(9, { ...noMarks, gapMm: 10 })).not.toThrow();
  });

  describe('cut marks', () => {
    it('are empty when disabled', () => {
      expect(computeGridLayout(9, noMarks).cutMarks).toEqual([]);
    });

    it('marks the 4 shared trim lines per axis without gap', () => {
      const { cutMarks } = computeGridLayout(1, { ...noMarks, cutMarks: true });
      const vertical = cutMarks.filter((m) => m.x1Mm === m.x2Mm);
      const horizontal = cutMarks.filter((m) => m.y1Mm === m.y2Mm);
      // 4 x positions × (above + below), 4 y positions × (left + right).
      expect(vertical).toHaveLength(8);
      expect(horizontal).toHaveLength(8);
      expect(new Set(vertical.map((m) => m.x1Mm))).toEqual(
        new Set([10.5, 73.5, 136.5, 199.5]),
      );
    });

    it('marks both edges of each card when there is a gap', () => {
      const { cutMarks } = computeGridLayout(1, {
        gapMm: 4,
        bleedMm: 0,
        cutMarks: true,
      });
      expect(cutMarks).toHaveLength(6 * 2 + 6 * 2);
    });

    it('stays outside the grid and inside the page', () => {
      const options = { gapMm: 2, bleedMm: 1, cutMarks: true };
      const { cutMarks, slots } = computeGridLayout(9, options);
      const left = slots[0]!.bleed.xMm;
      const right = slots[8]!.bleed.xMm + slots[8]!.bleed.widthMm;
      for (const m of cutMarks.filter((mark) => mark.y1Mm === mark.y2Mm)) {
        const xs = [m.x1Mm, m.x2Mm];
        const outside =
          xs.every((x) => x <= left - CUT_MARK_OFFSET_MM + 1e-9) ||
          xs.every((x) => x >= right + CUT_MARK_OFFSET_MM - 1e-9);
        expect(outside).toBe(true);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(A4_WIDTH_MM);
      }
    });

    it('are omitted on an axis with no margin left', () => {
      const { cutMarks } = computeGridLayout(1, {
        gapMm: 10,
        bleedMm: 0,
        cutMarks: true,
      });
      // Horizontal margin is 0.5 mm: only vertical marks (top/bottom) remain.
      expect(cutMarks.every((m) => m.x1Mm === m.x2Mm)).toBe(true);
      expect(cutMarks.length).toBeGreaterThan(0);
    });
  });
});
