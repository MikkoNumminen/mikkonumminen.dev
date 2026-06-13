import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleProjectsSceneBoot } from './boot';

// scheduleProjectsSceneBoot is the perf-critical deferred-boot: it must fire the
// expensive WebGL import exactly once — on the first interaction or a fallback
// timer, whichever comes first — and never after cancel(). Bouncing visitors
// must not pay the cost, engaged ones must boot on first movement.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('scheduleProjectsSceneBoot', () => {
  it('fires onBoot once via the fallback timer when there is no interaction', () => {
    const onBoot = vi.fn();
    scheduleProjectsSceneBoot({ onBoot, fallbackMs: 1000 });
    expect(onBoot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onBoot).toHaveBeenCalledTimes(1);
  });

  it('fires on the first interaction and cancels the fallback timer', () => {
    const onBoot = vi.fn();
    scheduleProjectsSceneBoot({ onBoot, fallbackMs: 1000 });
    window.dispatchEvent(new Event('scroll'));
    expect(onBoot).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onBoot).toHaveBeenCalledTimes(1); // fallback did not re-fire
  });

  it('never fires after cancel()', () => {
    const onBoot = vi.fn();
    const handle = scheduleProjectsSceneBoot({ onBoot, fallbackMs: 1000 });
    handle.cancel();
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(5000);
    expect(onBoot).not.toHaveBeenCalled();
  });

  it('ignores interactions after the first (started guard)', () => {
    const onBoot = vi.fn();
    scheduleProjectsSceneBoot({ onBoot, fallbackMs: 1000 });
    window.dispatchEvent(new Event('mousemove'));
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('scroll'));
    expect(onBoot).toHaveBeenCalledTimes(1);
  });

  it('defaults the fallback to 2000ms', () => {
    const onBoot = vi.fn();
    scheduleProjectsSceneBoot({ onBoot });
    vi.advanceTimersByTime(1999);
    expect(onBoot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onBoot).toHaveBeenCalledTimes(1);
  });
});
