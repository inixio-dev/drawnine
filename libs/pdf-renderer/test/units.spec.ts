import { describe, expect, it } from 'vitest';
import { mmToPt } from '@app/pdf-renderer';

describe('mmToPt', () => {
  it('converts 25.4 mm to 72 pt', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72);
  });

  it('converts the card width (63 mm)', () => {
    expect(mmToPt(63)).toBeCloseTo(178.583, 3);
  });
});
