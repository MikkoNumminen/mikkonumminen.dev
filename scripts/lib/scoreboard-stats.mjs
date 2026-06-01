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
 * Keep only finite numbers from a draws list (drops a non-array arm, and any
 * stray null/object/string/Infinity/NaN a hand-maintained input might carry).
 * The single source of truth for "what counts as a draw", shared by stat() and
 * computeCell() so the published draws array and `n` can never disagree.
 */
export function finiteNums(vals) {
  return Array.isArray(vals)
    ? vals.filter((v) => typeof v === 'number' && Number.isFinite(v))
    : [];
}

/**
 * Median + spread for a list of draw token-totals.
 * Population (not sample) variance — the draws ARE the cell, not a sample of it.
 * Returns null when there are no valid draws so the caller can skip the cell.
 *
 * Defensive on input: a hand-maintained *.input.json can carry a malformed arm
 * (a non-array, or a stray non-number from a paste/typo). We keep only finite
 * numbers, so a bad draw is dropped (and an all-bad/missing arm becomes null ->
 * cell skipped) rather than crashing the build or poisoning mean/median/stddev
 * with NaN. Valid numeric input is unchanged — this only filters garbage.
 */
export function stat(vals) {
  const nums = finiteNums(vals);
  const n = nums.length;
  if (!n) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? s[mid] : round((s[mid - 1] + s[mid]) / 2);
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
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
    // Store the same finite draws the stats were computed on, so arm_*_draws
    // and n stay consistent even if the input carried a stray non-number.
    arm_A_draws: finiteNums(c.arm_A_draws),
    arm_B_draws: finiteNums(c.arm_B_draws),
    arm_A: A,
    arm_B: B,
    saved_median: savedMedian,
    // Guard the divisor: real draws are large positive token counts, but a
    // degenerate all-zero arm would otherwise yield NaN.
    pct_saved_median: A.median > 0 ? round((savedMedian / A.median) * 100) : 0,
    before_arm_pinned_mean: A.mean,
    saved_pinned: savedPinned,
    pct_saved_pinned: A.mean > 0 ? round((savedPinned / A.mean) * 100) : 0,
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
          net_pct_saved: aggA > 0 ? round(((aggA - aggB) / aggA) * 100) : 0,
        }
      : null,
  };
}
