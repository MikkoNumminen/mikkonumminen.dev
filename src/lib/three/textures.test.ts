import { describe, it, expect } from 'vitest';
import { decayImpulse } from './textures';

// decayImpulse is the per-frame ramp-down used by every scene that pushes a
// click/impact energy to 1 and lets it fall back to baseline. It feeds visible
// motion, so the clamp-at-zero and the delta*rate step are worth pinning.

describe('decayImpulse', () => {
  it('subtracts delta * rate from the value', () => {
    expect(decayImpulse(1, 0.5, 1)).toBe(0.5);
    expect(decayImpulse(0.3, 0.1, 1)).toBeCloseTo(0.2, 10);
  });

  it('clamps at zero — never returns a negative impulse', () => {
    expect(decayImpulse(1, 1, 2)).toBe(0);
    expect(decayImpulse(0, 1, 1)).toBe(0);
  });

  it('is a no-op when delta is zero (a paused / dropped frame)', () => {
    expect(decayImpulse(0.7, 0, 5)).toBe(0.7);
  });

  it('scales the decay by rate', () => {
    expect(decayImpulse(1, 0.1, 5)).toBeCloseTo(0.5, 10);
  });
});
