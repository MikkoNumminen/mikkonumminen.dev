import { describe, it, expect } from 'vitest';
import { easeOutCubic } from './easing';

describe('easeOutCubic', () => {
  it('fixes the endpoints at 0 and 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it('matches 1 - (1-x)^3 at the midpoint', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10); // 1 - 0.5^3
  });

  it('is front-loaded — above the linear diagonal early', () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });

  it('is strictly increasing across [0,1]', () => {
    let prev = easeOutCubic(0);
    for (let x = 0.1; x <= 1.0001; x += 0.1) {
      const v = easeOutCubic(x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
