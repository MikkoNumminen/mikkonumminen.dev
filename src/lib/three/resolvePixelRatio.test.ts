import { describe, it, expect } from 'vitest';
import { resolvePixelRatio } from './resolvePixelRatio';

// The DPR clamp shared by createRenderer + createResizeHandler. Pinning it once
// guards the E-MA1 regression (the two paths drifting to different caps).

describe('resolvePixelRatio', () => {
  it('clamps a high DPR down to the cap', () => {
    expect(resolvePixelRatio(3, 1.5)).toBe(1.5);
    expect(resolvePixelRatio(2, 1.5)).toBe(1.5);
  });

  it('passes a DPR at or below the cap through unchanged', () => {
    expect(resolvePixelRatio(1, 1.5)).toBe(1);
    expect(resolvePixelRatio(1.5, 1.5)).toBe(1.5);
  });

  it('defaults the cap to 1.5 when omitted', () => {
    expect(resolvePixelRatio(3)).toBe(1.5);
    expect(resolvePixelRatio(1)).toBe(1);
  });

  it('respects a custom cap', () => {
    expect(resolvePixelRatio(5, 2)).toBe(2);
    expect(resolvePixelRatio(0.8, 2)).toBe(0.8);
  });
});
