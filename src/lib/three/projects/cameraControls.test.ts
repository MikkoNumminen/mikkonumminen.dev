import { describe, it, expect } from 'vitest';
import {
  clampPolar,
  zoomRadius,
  exceedsDragThreshold,
  damp,
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
