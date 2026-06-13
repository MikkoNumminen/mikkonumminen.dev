import { describe, it, expect, afterEach } from 'vitest';
import { prefersReducedMotion } from './reducedMotion';

// prefersReducedMotion gates every scene's animation path — when it returns
// true the Three.js scenes and GSAP timelines fall back to static frames. The
// contract: never throw in a non-browser/SSR context, and reflect the media
// query when one is available. (Lives in its own module precisely so this test
// doesn't drag in the gsap ScrollTrigger registration side effect of ./setup.)

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
  })) as unknown as typeof window.matchMedia;
}

describe('prefersReducedMotion', () => {
  it('returns false when matchMedia is unavailable (jsdom default / SSR)', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when the reduce query matches', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when the reduce query does not match', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});
