import { describe, it, expect } from 'vitest';
import { stat, computeCell, buildScoreboard } from './scoreboard-stats.mjs';

describe('stat', () => {
  it('odd-length median is the middle value', () => {
    expect(stat([116085, 121426, 125778, 126654, 130827]).median).toBe(125778);
  });

  it('even-length median is the rounded mean of the two middle values', () => {
    expect(stat([10, 20, 30, 41]).median).toBe(25); // round((20+30)/2)
  });

  it('reports n / mean / min / max / population stddev', () => {
    const s = stat([2, 4, 6]);
    expect(s).toMatchObject({ n: 3, median: 4, mean: 4, min: 2, max: 6 });
    // population variance ((2-4)^2+(4-4)^2+(6-4)^2)/3 = 8/3 -> sqrt -> round
    expect(s.stddev).toBe(Math.round(Math.sqrt(8 / 3)));
  });

  it('single draw: median = mean = min = max, stddev 0', () => {
    expect(stat([42])).toEqual({
      n: 1,
      median: 42,
      mean: 42,
      min: 42,
      max: 42,
      stddev: 0,
    });
  });

  it('empty list -> null (caller skips the cell)', () => {
    expect(stat([])).toBeNull();
  });

  it('drops malformed input: non-array -> null; stray non-numbers filtered out', () => {
    expect(stat('abc')).toBeNull();
    expect(stat(undefined)).toBeNull();
    // only the two finite numbers (100, 300) survive {} / null / '200' / Infinity / NaN
    const s = stat([100, {}, null, '200', 300, Infinity, NaN]);
    expect(s).toMatchObject({ n: 2, median: 200, mean: 200, min: 100, max: 300 });
  });
});

describe('computeCell', () => {
  it('saved + pct on medians; pinned uses the cold-arm mean', () => {
    const cell = computeCell({
      model: 'opus',
      arm_A_draws: [100, 200, 300],
      arm_B_draws: [10, 20, 30],
    });
    expect(cell.arm_A.median).toBe(200);
    expect(cell.arm_B.median).toBe(20);
    expect(cell.saved_median).toBe(180);
    expect(cell.pct_saved_median).toBe(90);
    expect(cell.before_arm_pinned_mean).toBe(200); // mean of 100,200,300
    expect(cell.saved_pinned).toBe(180);
  });

  it('returns null when an arm has no draws', () => {
    expect(computeCell({ arm_A_draws: [1, 2], arm_B_draws: [] })).toBeNull();
  });

  it('guards a zero-median cold arm: pct is 0, never NaN', () => {
    const cell = computeCell({ arm_A_draws: [0, 0], arm_B_draws: [0] });
    expect(cell.pct_saved_median).toBe(0);
    expect(cell.pct_saved_pinned).toBe(0);
    expect(Number.isNaN(cell.pct_saved_median)).toBe(false);
  });

  it('pinned uses the cold-arm MEAN, distinct from the median, on skewed draws', () => {
    // mean(100,100,400)=200 != median=100, so the pinned % (95) differs from the
    // median % (90) — a regression swapping A.mean->A.median would fail here.
    const cell = computeCell({ arm_A_draws: [100, 100, 400], arm_B_draws: [10, 10, 10] });
    expect(cell.arm_A.median).toBe(100);
    expect(cell.before_arm_pinned_mean).toBe(200);
    expect(cell.pct_saved_median).toBe(90); // (100-10)/100
    expect(cell.pct_saved_pinned).toBe(95); // (200-10)/200
  });

  it('skips a cell with a malformed (non-array) arm instead of crashing', () => {
    expect(computeCell({ arm_A_draws: 'abc', arm_B_draws: [1] })).toBeNull();
  });
});

describe('buildScoreboard', () => {
  const data = {
    generated_at: '2026-06-01T00:00:00Z',
    study: 'demo',
    round: 9,
    source_repo: 'repo',
    context: 'ctx',
    methodology: { k: 'v' },
    cells: {
      'a|opus': { model: 'opus', arm_A_draws: [100], arm_B_draws: [25] },
      'b|haiku': { model: 'haiku', arm_A_draws: [200], arm_B_draws: [100] },
    },
  };

  it('aggregate is the ratio of sum-of-medians (volume-weighted)', () => {
    const sb = buildScoreboard(data);
    // sumA 300, sumB 125, saved 175, pct round(175/300*100) = 58
    expect(sb.aggregate).toMatchObject({
      cells_measured: 2,
      sum_median_arm_A: 300,
      sum_median_arm_B: 125,
      net_saved: 175,
      net_pct_saved: 58,
    });
  });

  it('passes study identity + metadata through from the input', () => {
    const sb = buildScoreboard(data);
    expect(sb).toMatchObject({
      generated_at: '2026-06-01T00:00:00Z',
      study: 'demo',
      round: 9,
      source_repo: 'repo',
      context: 'ctx',
      methodology: { k: 'v' },
    });
    expect(typeof sb.regenerate).toBe('string');
  });

  it('skips a cell with an empty arm; aggregate is null when no cell survives', () => {
    const sb = buildScoreboard({ cells: { x: { arm_A_draws: [1], arm_B_draws: [] } } });
    expect(sb.cells).toEqual({});
    expect(sb.aggregate).toBeNull();
  });

  it('guards a zero-sum cold aggregate: net_pct_saved is 0, never NaN', () => {
    const sb = buildScoreboard({ cells: { z: { arm_A_draws: [0], arm_B_draws: [0] } } });
    expect(sb.aggregate.net_pct_saved).toBe(0);
    expect(Number.isNaN(sb.aggregate.net_pct_saved)).toBe(false);
  });
});
