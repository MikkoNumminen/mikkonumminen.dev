import { describe, it, expect } from 'vitest';
import { responsiveTitleScale, responsiveGalaxyX } from './responsiveLayout';

// The home title/galaxy responsive clamps. The subtle, easy-to-regress part is
// the ORDERING: the frustum-fit cap is hard, the readability floor is soft and
// yields to it; the galaxy is pulled toward centre on narrow aspects but never
// past its design x or past x=0. Expected values are hand-computed.

const titleBase = {
  titleNaturalHalfWidth: 5,
  rightPadding: 2,
  designWidth: 1100,
  minScale: 0.3,
};

describe('responsiveTitleScale', () => {
  it('returns full scale (1) on a wide viewport with fit slack', () => {
    // widthScale = min(1, 2000/1100) = 1; fitScale = (100-2)/5 = 19.6
    const s = responsiveTitleScale({ ...titleBase, width: 2000, visibleHalfWidth: 100 });
    expect(s).toBeCloseTo(1, 10);
  });

  it('lets the frustum-fit cap pull below the width scale', () => {
    // widthScale 1; fitScale = (5-2)/5 = 0.6 → 0.6 wins
    const s = responsiveTitleScale({ ...titleBase, width: 2000, visibleHalfWidth: 5 });
    expect(s).toBeCloseTo(0.6, 10);
  });

  it('keeps the hard fit cap even below the readability floor', () => {
    // fitScale = (3-2)/5 = 0.2 < minScale 0.3 → stays 0.2 (clipping is worse)
    const s = responsiveTitleScale({ ...titleBase, width: 2000, visibleHalfWidth: 3 });
    expect(s).toBeCloseTo(0.2, 10);
  });

  it('lifts to the readability floor when the fit cap leaves slack', () => {
    // widthScale = min(1, 110/1100) = 0.1; fitScale = 19.6 → floor 0.3 applies
    const s = responsiveTitleScale({ ...titleBase, width: 110, visibleHalfWidth: 100 });
    expect(s).toBeCloseTo(0.3, 10);
  });

  it('is monotonic non-decreasing as the visible width grows', () => {
    const narrow = responsiveTitleScale({
      ...titleBase,
      width: 2000,
      visibleHalfWidth: 4,
    });
    const wider = responsiveTitleScale({
      ...titleBase,
      width: 2000,
      visibleHalfWidth: 8,
    });
    expect(wider).toBeGreaterThanOrEqual(narrow);
  });
});

const galaxyBase = { radius: 8, leftPadding: 1, designX: -13 };

describe('responsiveGalaxyX', () => {
  it('rests at the design x on a wide viewport', () => {
    // maxMag = 50-8-1 = 41 → min(0, max(-13, -41)) = -13
    expect(responsiveGalaxyX({ ...galaxyBase, visibleHalfWidth: 50 })).toBe(-13);
  });

  it('pulls the disk inward (toward 0) on a narrow viewport', () => {
    // maxMag = 15-8-1 = 6 → min(0, max(-13, -6)) = -6
    expect(responsiveGalaxyX({ ...galaxyBase, visibleHalfWidth: 15 })).toBe(-6);
  });

  it('clamps to centre (0) when the frustum is narrower than the disk', () => {
    // maxMag = 5-8-1 = -4 → -maxMag = 4 → min(0, max(-13, 4)) = 0
    expect(responsiveGalaxyX({ ...galaxyBase, visibleHalfWidth: 5 })).toBe(0);
  });

  it('always stays within [designX, 0]', () => {
    for (const visibleHalfWidth of [2, 9, 14, 21, 80]) {
      const x = responsiveGalaxyX({ ...galaxyBase, visibleHalfWidth });
      expect(x).toBeGreaterThanOrEqual(-13);
      expect(x).toBeLessThanOrEqual(0);
    }
  });
});
