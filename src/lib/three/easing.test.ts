import { describe, it, expect } from 'vitest';
import { easeInOutCubic, easeOutCubic } from './easing';

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

describe('easeInOutCubic', () => {
  it('pins the endpoints and the midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('settles at both ends, unlike easeOutCubic', () => {
    // The reason it exists: a shape-to-shape crossfade has no impulse at
    // either end, so it must not start fast.
    expect(easeInOutCubic(0.05)).toBeLessThan(easeOutCubic(0.05));
    expect(easeInOutCubic(0.95)).toBeGreaterThan(0.9);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const y = easeInOutCubic(x);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
  });
});
