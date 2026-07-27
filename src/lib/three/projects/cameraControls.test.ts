import { describe, it, expect } from 'vitest';
import {
  clampPolar,
  zoomRadius,
  exceedsDragThreshold,
  damp,
  fitRadius,
  sphericalToCartesian,
} from './cameraControls';

describe('clampPolar', () => {
  it('passes a value within range', () => {
    expect(clampPolar(1.2, 0.25, Math.PI - 0.25)).toBe(1.2);
  });
  it('clamps below min and above max', () => {
    expect(clampPolar(0.1, 0.25, 3)).toBe(0.25);
    expect(clampPolar(3.5, 0.25, 3)).toBe(3);
  });
});

describe('zoomRadius', () => {
  it('is a no-op at deltaY 0 (exp(0) = 1)', () => {
    expect(zoomRadius(30, 0, 0.0015, 12, 60)).toBeCloseTo(30, 10);
  });
  it('zooms out on positive delta and in on negative', () => {
    expect(zoomRadius(30, 100, 0.0015, 12, 60)).toBeGreaterThan(30);
    expect(zoomRadius(30, -100, 0.0015, 12, 60)).toBeLessThan(30);
  });
  it('clamps to [min, max]', () => {
    expect(zoomRadius(30, 100000, 0.0015, 12, 60)).toBe(60);
    expect(zoomRadius(30, -100000, 0.0015, 12, 60)).toBe(12);
  });
});

describe('exceedsDragThreshold', () => {
  it('is true past the threshold and false within it', () => {
    expect(exceedsDragThreshold(3, 4, 4)).toBe(true); // hypot 5
    expect(exceedsDragThreshold(1, 1, 4)).toBe(false); // hypot ~1.41
  });
});

describe('damp', () => {
  it('moves a fraction of the way to the target', () => {
    expect(damp(0, 10, 0.5)).toBe(5);
  });
  it('is a no-op once at the target', () => {
    expect(damp(7, 7, 0.18)).toBe(7);
  });
  it('converges monotonically toward the target', () => {
    let v = 0;
    for (let i = 0; i < 80; i++) v = damp(v, 10, 0.18);
    expect(v).toBeCloseTo(10, 3);
  });
});

describe('fitRadius', () => {
  const FOV = 52;
  const R_MAX = 21.4;
  const MARGIN = 2.6;
  // The scene's default view: camera at (0, 8, 28), about 16 degrees above the
  // ecliptic.
  const POLAR = Math.acos(8 / Math.hypot(0, 8, 28));
  const tanHalf = Math.tan((FOV * Math.PI) / 180 / 2);

  /**
   * Worst-case screen offset of the outermost orbit, as a fraction of the
   * half-extent, accounting for perspective. <= 1 means nothing clips.
   */
  function worstFill(radius: number, aspect: number, polar: number, rMax = R_MAX) {
    const vertical = Math.abs(Math.cos(polar));
    const toward = Math.abs(Math.sin(polar));
    let wx = 0;
    let wy = 0;
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const depth = radius - rMax * Math.sin(a) * toward;
      if (depth <= 0.01) return Infinity;
      wx = Math.max(wx, Math.abs(rMax * Math.cos(a)) / (tanHalf * aspect * depth));
      wy = Math.max(wy, Math.abs(rMax * Math.sin(a) * vertical) / (tanHalf * depth));
    }
    return Math.max(wx, wy);
  }

  it('keeps the whole outermost orbit on screen, at every aspect', () => {
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.78, 2.4, 3.5]) {
      const r = fitRadius(R_MAX, MARGIN, FOV, aspect, POLAR, 9, 400);
      expect(worstFill(r, aspect, POLAR), `aspect ${aspect}`).toBeLessThanOrEqual(1);
    }
  });

  it('accounts for the near edge magnifying, not just the flat radius', () => {
    // A fit that ignores perspective lands here and clips the near side.
    const flat = (R_MAX + MARGIN) / (tanHalf * (16 / 9));
    const r = fitRadius(R_MAX, MARGIN, FOV, 16 / 9, POLAR, 9, 400);
    expect(r).toBeGreaterThan(flat);
    expect(worstFill(flat, 16 / 9, POLAR)).toBeGreaterThan(1);
  });

  it('does not pull back as if the system were a sphere', () => {
    const asSphere = (R_MAX + MARGIN) / tanHalf;
    const r = fitRadius(R_MAX, MARGIN, FOV, 16 / 9, POLAR, 9, 400);
    expect(r).toBeLessThan(asSphere);
  });

  it('pulls further back on portrait viewports, which are width-bound', () => {
    const landscape = fitRadius(R_MAX, MARGIN, FOV, 16 / 9, POLAR, 9, 400);
    const portrait = fitRadius(R_MAX, MARGIN, FOV, 0.75, POLAR, 9, 400);
    expect(portrait).toBeGreaterThan(landscape);
  });

  it('handles a top-down view, where the disc is seen face-on', () => {
    const r = fitRadius(R_MAX, MARGIN, FOV, 1, 0, 9, 400);
    expect(worstFill(r, 1, 0)).toBeLessThanOrEqual(1);
  });

  it('grows with the system it has to frame', () => {
    expect(fitRadius(30, MARGIN, FOV, 1.5, POLAR, 9, 400)).toBeGreaterThan(
      fitRadius(20, MARGIN, FOV, 1.5, POLAR, 9, 400),
    );
  });

  it('clamps to [min, max]', () => {
    expect(fitRadius(0.01, MARGIN, FOV, 1.5, POLAR, 20, 400)).toBe(20);
    expect(fitRadius(500, MARGIN, FOV, 1.5, POLAR, 9, 68)).toBe(68);
  });
});

describe('sphericalToCartesian', () => {
  it('preserves the radius as the vector magnitude', () => {
    const p = sphericalToCartesian(0.7, 1.1, 25);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(25, 6);
  });
  it('places azimuth 0 / polar π/2 on the +z axis', () => {
    const p = sphericalToCartesian(0, Math.PI / 2, 10);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(10, 6);
  });
  it('places azimuth π/2 / polar π/2 on the +x axis', () => {
    const p = sphericalToCartesian(Math.PI / 2, Math.PI / 2, 10);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
});
