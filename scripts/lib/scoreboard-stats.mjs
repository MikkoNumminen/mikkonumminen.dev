// Pure stats + scoreboard assembly for the optim-rollout replicate study.
// No IO, no study-specific constants — everything study-specific (name, round,
// context, methodology prose) rides in on the input `data`, so a future round
// is a new *.input.json, not a code edit. scripts/build-scoreboard.mjs wraps
// this with file read/write. Unit-tested in scoreboard-stats.test.mjs.

const round = (x) => Math.round(x);

// How to regenerate — tool-level metadata (not study-specific), stamped onto
// every scoreboard so a reader knows the provenance.
export const REGENERATE_HINT =
  'node scripts/build-scoreboard.mjs --input <cells.json> --output <scoreboard.json> (per-draw tokens via scripts/draw-tokens.mjs)';

/**
 * Median + spread for a list of draw token-totals.
 * Population (not sample) variance — the draws ARE the cell, not a sample of it.
 * Returns null for an empty list so the caller can skip the cell.
 */
export function stat(vals) {
  const n = vals.length;
  if (!n) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2);
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    n,
    median,
    mean: round(mean),
    min: s[0],
    max: s[n - 1],
    stddev: round(Math.sqrt(variance)),
  };
}

/**
 * Compute one cell's stats from its raw draws. Returns null if either arm is empty.
 * saved/pct use medians; the pinned variant uses the cold arm's MEAN (the study
 * "pins the before-arm by averaging").
 */
export function computeCell(c) {
  const A = stat(c.arm_A_draws);
  const B = stat(c.arm_B_draws);
  if (!A || !B) return null;
  const savedMedian = A.median - B.median;
  const savedPinned = A.mean - B.median;
  return {
    model: c.model,
    n_arm_A: A.n,
    n_arm_B: B.n,
    arm_A_draws: c.arm_A_draws,
    arm_B_draws: c.arm_B_draws,
    arm_A: A,
    arm_B: B,
    saved_median: savedMedian,
    pct_saved_median: round((savedMedian / A.median) * 100),
    before_arm_pinned_mean: A.mean,
    saved_pinned: savedPinned,
    pct_saved_pinned: round((savedPinned / A.mean) * 100),
    prior_rounds: c.prior_rounds ?? null,
    verdict: c.verdict ?? null,
  };
}

/**
 * Pure: raw-draws input `data` -> published scoreboard object.
 * Aggregate is ratio-of-sums over per-cell MEDIANS (volume-weighted), matching
 * the rounds-1-5 study convention. Study-identity fields pass through from data.
 */
export function buildScoreboard(data) {
  const cells = {};
  let aggA = 0;
  let aggB = 0;
  let nCells = 0;
  for (const [key, c] of Object.entries(data.cells ?? {})) {
    const cell = computeCell(c);
    if (!cell) continue;
    cells[key] = cell;
    aggA += cell.arm_A.median;
    aggB += cell.arm_B.median;
    nCells++;
  }
  return {
    generated_at: data.generated_at ?? null,
    study: data.study ?? 'skills-optim-replicates',
    round: data.round ?? null,
    source_repo: data.source_repo ?? null,
    regenerate: REGENERATE_HINT,
    context: data.context ?? null,
    methodology: data.methodology ?? null,
    cells,
    aggregate: nCells
      ? {
          cells_measured: nCells,
          sum_median_arm_A: aggA,
          sum_median_arm_B: aggB,
          net_saved: aggA - aggB,
          net_pct_saved: round(((aggA - aggB) / aggA) * 100),
        }
      : null,
  };
}
