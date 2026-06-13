import { describe, it, expect } from 'vitest';
import { colorsFor, cursorOnAt, slideOffsetAt, canAcceptPush } from './dataFeedConsole';

// Pure helpers behind the data-feed console. The widget itself is canvas-bound
// (NOOP in jsdom), but these were lifted to module scope so the palette, cursor
// blink, slide easing, and the all-or-nothing push cap are testable.

describe('colorsFor', () => {
  it('returns the exact cmd palette at full opacity', () => {
    expect(colorsFor('cmd', 1)).toEqual({
      prompt: 'rgba(111, 207, 224, 1)',
      text: 'rgba(220, 240, 255, 1)',
    });
  });

  it('dims out lines by 0.85 and status lines by 0.7', () => {
    expect(colorsFor('out', 1).prompt).toBe('rgba(95, 200, 230, 0.85)');
    expect(colorsFor('status', 1).text).toBe('rgba(200, 220, 240, 0.7)');
  });

  it('passes opacity through linearly', () => {
    expect(colorsFor('cmd', 0.5).prompt).toBe('rgba(111, 207, 224, 0.5)');
  });

  it('stays a cool palette — green never exceeds blue for any kind', () => {
    for (const kind of ['cmd', 'out', 'status'] as const) {
      const c = colorsFor(kind, 1);
      for (const s of [c.prompt, c.text]) {
        const m = s.match(/rgba\((\d+), (\d+), (\d+)/);
        expect(m, s).not.toBeNull();
        if (m) expect(Number(m[2])).toBeLessThanOrEqual(Number(m[3]));
      }
    }
  });
});

describe('cursorOnAt', () => {
  it('is on at t=0 and toggles each CURSOR_BLINK_MS (520ms)', () => {
    expect(cursorOnAt(0)).toBe(true);
    expect(cursorOnAt(519)).toBe(true);
    expect(cursorOnAt(520)).toBe(false);
    expect(cursorOnAt(1040)).toBe(true);
  });
});

describe('slideOffsetAt', () => {
  it('starts at the full line height and snaps to 0 once complete', () => {
    expect(slideOffsetAt(0)).toBeCloseTo(13, 10); // LINE_HEIGHT
    expect(slideOffsetAt(140)).toBe(0); // SLIDE_DURATION_MS
    expect(slideOffsetAt(500)).toBe(0); // clamped past the end
  });

  it('decreases monotonically and is front-loaded (ease-out)', () => {
    expect(slideOffsetAt(70)).toBeLessThan(slideOffsetAt(0));
    expect(slideOffsetAt(70)).toBeLessThan(13 * 0.5); // most travel happens early
  });
});

describe('canAcceptPush', () => {
  it('accepts a batch that fills exactly to the cap', () => {
    expect(canAcceptPush(0, 8, 8)).toBe(true);
  });

  it('rejects a batch that would overflow the cap', () => {
    expect(canAcceptPush(7, 2, 8)).toBe(false);
    expect(canAcceptPush(8, 1, 8)).toBe(false);
  });

  it('accepts an empty batch', () => {
    expect(canAcceptPush(8, 0, 8)).toBe(true);
  });
});
