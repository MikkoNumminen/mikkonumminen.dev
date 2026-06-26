// Server-side guards for /api/save and /api/leaderboard. Pure functions so
// they're trivially testable and Edge-runtime safe (no Node primitives).
//
// Goal: catch the obvious cheats — DevTools writes to the Zustand store,
// hand-crafted POSTs against the API — without rejecting legitimate play.
// Numbers here are intentionally loose; tighten only after we've watched
// real telemetry for false positives.

import {
  getAllAugments,
  getEnemy,
  getAllLootPools,
  getAllMissions,
  getMission,
  getAllWeapons,
  getWavesForMission,
  MAX_AUGMENTS_PER_WEAPON,
  SYSTEM_UNLOCK_GATES
} from "@/game/data";
import { MAX_LEVEL } from "@/types";
// AI-NOTE: `weaponUpgradeCost` remains imported from `state` — it's a runtime
// cost-curve function tied to the ship-upgrade ladder. Re-homing it would
// require lifting credit-cap derivation into state. ACCEPTED architectural
// back-edge for this single function — see docs/audit/04-found-bugs.md
// 2026-05-29. The pure constant `MAX_LEVEL` moved to `@/types` and
// `SYSTEM_UNLOCK_GATES` moved to `@/game/data` to close two-thirds of the
// original back-edge.
import { weaponUpgradeCost } from "@/game/state/ShipConfig";
import type { MissionId, SolarSystemId } from "@/types";

// ---------------------------------------------------------------------------
// Per-player, progression-aware cheat-guard caps
// ---------------------------------------------------------------------------
// The credits-delta cap used to be a global constant; that meant a brand-new
// player's cap was tuned to endgame loot, and a balance change to a far
// system silently loosened the cap for tutorial-only players too. The
// progression-aware version derives caps per-request from the player's
// completedMissions: only systems they've actually reached count toward
// their personal cap. New player can only earn at tutorial-system rates;
// players in tubernovae get tubernovae-tier caps; future systems light up
// only for players who've cleared their gating mission.
//
// Formulas (per reachable-system set):
//
//   maxPerSecond
//     = max(non-boss enemy creditValue across reachable systems' missions)
//       * KILL_CADENCE_CEILING * PER_SECOND_SAFETY_FACTOR
//   Bosses are excluded — they spawn once per mission, they shouldn't drive
//   a sustained per-second cap. KILL_CADENCE_CEILING is the wildest sustained
//   kill rate a player can plausibly maintain (5/s — packed wave + rapid-fire).
//   SAFETY_FACTOR is 3x to absorb chained explosions, multi-projectile
//   weapons, and lucky runs.
//
//   maxPerFirstClear
//     = ceil((max loot-pool credit max in reachable systems
//             + max boss creditValue across reachable systems) * 1.5)
//   Covers the worst-case first-clear in any reachable system.
//
// Reachable systems are derived purely from the SERVER's stored
// completedMissions — never trusted from the request body. So a cheater
// can't expand their cap by lying about completions: validateMissionGraph
// runs first and rejects illegitimate completions; only after that pass
// do we recompute caps from the (now-trusted) completedMissions.

const KILL_CADENCE_CEILING = 5;
const PER_SECOND_SAFETY_FACTOR = 3;
const PER_CLEAR_SAFETY_FACTOR = 1.5;

// Per-save slack for the credits delta. Two parts:
//
// 1) `BASE_SLACK` (100) — absorbs rounding and the rare frame where the
//    client batches a couple of stray credit awards across the save
//    boundary. Pre-#159 this was the entire slack.
//
// 2) `MAX_SINGLE_EQUIPMENT_REFUND` — the catalog-derived ceiling on a
//    single legitimate sell event. PR #159 raised the sell rate to 100%,
//    so a player who sells a fully-upgraded fully-augmented weapon
//    (max base cost + every Mk-up step paid + the two most expensive
//    augments) recovers the entire investment in one transaction. The
//    saveQueue debounces saves to ~1s after the last state change, so
//    that single transaction can land on a save with deltaTime ≈ 0 —
//    deltaTime * maxPerSecond would not cover it. Without absorbing the
//    sell-back into the slack, every Mk5-weapon sell would 422 a
//    legitimate player.
//
// The slack is a server-derived constant from catalog data — same shape
// as `maxPerFirstClear`. A future balance audit (see ADR 0008) may
// re-tune this if the cheat surface widens unacceptably; for now the
// trade-off is documented and accepted: a save with deltaTime=0 can
// claim up to MAX_SINGLE_EQUIPMENT_REFUND credits "free", but the same
// player could earn that legitimately by selling one fully-decked-out
// weapon, and the leaderboard is local-cohort, not competitive.
const BASE_CREDITS_DELTA_SLACK = 100;

export interface CreditCaps {
  readonly maxPerSecond: number;
  readonly maxPerFirstClear: number;
}

// Lazy-initialized caches — avoids walking the catalog at module import time
// (which would create an infra → content module-load edge). Values are
// identical to what the old eager `export const` produced; they're just
// computed on first call rather than when the module is first imported.
let _maxSingleEquipmentRefund: number | null = null;
let _creditsDeltaSlack: number | null = null;
let _globalCreditCaps: CreditCaps | null = null;

function computeMaxSingleEquipmentRefund(): number {
  // Worst-case sell from a single weapon: max base cost + the full
  // Mk-1→MAX_LEVEL upgrade ladder + the two most expensive augments
  // installed (MAX_AUGMENTS_PER_WEAPON cap).
  const weaponBaseMax = Math.max(...getAllWeapons().map((w) => w.cost));
  let upgradeLadder = 0;
  for (let lv = 1; lv < MAX_LEVEL; lv++) {
    upgradeLadder += weaponUpgradeCost(lv);
  }
  const augmentCosts = getAllAugments()
    .map((a) => a.cost)
    .sort((a, b) => b - a);
  let topAugmentSum = 0;
  for (let i = 0; i < MAX_AUGMENTS_PER_WEAPON && i < augmentCosts.length; i++) {
    topAugmentSum += augmentCosts[i] ?? 0;
  }
  return weaponBaseMax + upgradeLadder + topAugmentSum;
}

export function MAX_SINGLE_EQUIPMENT_REFUND(): number {
  if (_maxSingleEquipmentRefund === null) {
    _maxSingleEquipmentRefund = computeMaxSingleEquipmentRefund();
  }
  return _maxSingleEquipmentRefund;
}

export function CREDITS_DELTA_SLACK(): number {
  if (_creditsDeltaSlack === null) {
    _creditsDeltaSlack = BASE_CREDITS_DELTA_SLACK + MAX_SINGLE_EQUIPMENT_REFUND();
  }
  return _creditsDeltaSlack;
}

// A system is reachable if:
//   - It's the always-unlocked starting system ("tutorial"), OR
//   - The player has completed any mission belonging to it (they've been
//     there), OR
//   - The player has completed a mission listed in SYSTEM_UNLOCK_GATES
//     whose target system is this one (they've earned the unlock even if
//     they haven't played a mission there yet).
//
// The third rule is what lets a player's cap expand the moment they
// finish boss-1, even before they POST their first tubernovae score.
export function getReachableSolarSystems(
  completedMissions: readonly MissionId[]
): Set<SolarSystemId> {
  const reachable = new Set<SolarSystemId>(["tutorial"]);
  for (const id of completedMissions) {
    const mission = safeGetMission(id);
    if (mission) reachable.add(mission.solarSystemId);
  }
  for (const [gateMission, gatedSystem] of SYSTEM_UNLOCK_GATES) {
    if (completedMissions.includes(gateMission)) {
      reachable.add(gatedSystem);
    }
  }
  return reachable;
}

// Compute the credit caps a player with this set of reachable systems is
// allowed to claim. Walks waves of every combat mission in the reachable
// systems to find peak non-boss creditValue (drives per-second cap), and
// cross-references loot pools + boss enemy values for the per-clear cap.
export function computeCreditCapsForSystems(
  reachableSystems: ReadonlySet<SolarSystemId>
): CreditCaps {
  let peakNonBossCredit = 0;
  let maxBossCreditInReach = 0;

  for (const mission of getAllMissions()) {
    if (mission.kind !== "mission") continue;
    if (!reachableSystems.has(mission.solarSystemId)) continue;
    const waves = getWavesForMission(mission.id);
    for (const wave of waves) {
      for (const spawn of wave.spawns) {
        let enemy;
        try {
          enemy = getEnemy(spawn.enemy);
        } catch {
          // Wave references an enemy id we no longer recognise. Skip
          // rather than throw — data integrity is its own test layer.
          continue;
        }
        if (enemy.behavior === "boss") {
          if (enemy.creditValue > maxBossCreditInReach) {
            maxBossCreditInReach = enemy.creditValue;
          }
        } else if (enemy.creditValue > peakNonBossCredit) {
          peakNonBossCredit = enemy.creditValue;
        }
      }
    }
  }

  let maxLootCreditInReach = 0;
  for (const pool of getAllLootPools()) {
    if (!reachableSystems.has(pool.systemId)) continue;
    if (pool.credits.max > maxLootCreditInReach) {
      maxLootCreditInReach = pool.credits.max;
    }
  }

  return {
    maxPerSecond:
      peakNonBossCredit * KILL_CADENCE_CEILING * PER_SECOND_SAFETY_FACTOR,
    maxPerFirstClear: Math.ceil(
      (maxLootCreditInReach + maxBossCreditInReach) * PER_CLEAR_SAFETY_FACTOR
    )
  };
}

// Convenience composition for callers that only have completedMissions.
export function computeCreditCapsForPlayer(
  completedMissions: readonly MissionId[]
): CreditCaps {
  return computeCreditCapsForSystems(getReachableSolarSystems(completedMissions));
}

// SECURITY-CRITICAL: SEC-027 — server-derived unlocked-systems set, NOT trusted from request body (mirrors hydrate() and SEC-017's deriveCapInputMissions)
// Same derivation as `hydrate()` in `src/game/state/persistence.ts`:
// `unlockedSolarSystems = {"tutorial"} ∪ completedMission.solarSystemId
//   ∪ SYSTEM_UNLOCK_GATES[completedMission]`. The starting system is always
// unlocked; every other system requires either a completed mission inside it,
// or a completed gate mission whose target is that system.
//
// Used by `POST /api/save`'s SEC-027 check to validate `currentSolarSystemId`
// against the server's view of unlocked systems. The body's
// `unlockedSolarSystems` field is IGNORED by the guard — accepting it on the
// wire is purely backwards compatibility (an attacker can forge it; the
// derivation here is the trust source). Mirrors the SEC-017 pattern where
// `deriveCapInputMissions` shields the credits cap from forged completion
// claims.
export function deriveUnlockedSolarSystems(
  completedMissions: readonly MissionId[]
): ReadonlySet<SolarSystemId> {
  return getReachableSolarSystems(completedMissions);
}

// DO NOT INLINE: deriveCapInputMissions intentionally separates trusted-prev from user-submitted (SEC-017, INV-SAVE-4)
// SEC-017 — Credit-cap input must be SERVER-DERIVED, not the user-submitted
// `completedMissions` list. `validateMissionGraph` enforces internal
// consistency of the body (every entry's `requires` are also in the body),
// but does NOT require any entry to be present in `prevRow.completed_missions`.
// If a future PR adds a mission with `requires: []` outside the tutorial
// system, an attacker could submit it as completed in the same POST that
// requests inflated credits — expanding their cap on the same request.
//
// `deriveCapInputMissions` starts from the trusted server-stored list
// (`prev`) and grows ONLY by submitted missions whose `requires` are
// entirely already-trusted. The unlock chain must be grounded in the
// previously-stored row, not bootstrapped inside the same request.
//
// Today's content has no `requires: []` mission past `tutorial`, so this is
// a no-op for legitimate saves. The future-rake closure is the value.
//
// Iteration order matters: we walk `submitted` in order and grow `trusted`
// monotonically. `validateMissionGraph` already guarantees the chain is
// acyclic and internally consistent, so a single pass is enough — every
// new mission's prereqs either come from `prev` or from missions earlier
// in `submitted` that themselves grounded against `prev`.
//
// Defensive on unknown ids: `safeGetMission` returns null rather than
// throwing, so an attacker-supplied unknown id is silently dropped from
// the cap-input set. The schema layer (`SavePayloadSchema`) already
// rejects unknown ids before this runs; this is belt-and-braces.
export function deriveCapInputMissions(
  prev: readonly MissionId[],
  submitted: readonly MissionId[]
): readonly MissionId[] {
  const trusted = new Set<MissionId>(prev);
  for (const id of submitted) {
    if (trusted.has(id)) continue;
    const mission = safeGetMission(id);
    if (!mission) continue;
    let allRequiresGrounded = true;
    for (const req of mission.requires) {
      if (!trusted.has(req)) {
        allRequiresGrounded = false;
        break;
      }
    }
    if (allRequiresGrounded) {
      trusted.add(id);
    }
  }
  return Array.from(trusted);
}

// Aggregate ceiling across ALL systems — exposed for legacy callers that
// don't know about per-player progression yet. Equals what the most
// progressed player would see; used by /api/save when reading the prior
// save row's completedMissions falls back to "no prior row".
// Lazily computed on first call; see lazy-init note near CREDITS_DELTA_SLACK.
export function GLOBAL_CREDIT_CAPS(): CreditCaps {
  if (_globalCreditCaps === null) {
    _globalCreditCaps = computeCreditCapsForSystems(
      new Set(getAllLootPools().map((p) => p.systemId))
    );
    // Surface the tutorial-only baseline caps once on cold start so a
    // regression after a balance change shows up during local dev without
    // needing extra instrumentation. Tutorial-only is the floor — every
    // other player gets at least these caps. Dev-only: the gate must NOT
    // fire on Vercel Edge production cold starts (process is shimmed there
    // and NODE_ENV === "production"), which would log on every cold start
    // of /api/save and /api/leaderboard.
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
      const tutorialCaps = computeCreditCapsForSystems(new Set(["tutorial"]));
      // eslint-disable-next-line no-console
      console.log("[saveValidation] tutorial-only caps (floor)", {
        maxPerSecond: tutorialCaps.maxPerSecond,
        maxPerFirstClear: tutorialCaps.maxPerFirstClear,
        CREDITS_DELTA_SLACK: CREDITS_DELTA_SLACK()
      });
    }
  }
  return _globalCreditCaps;
}

// Deprecated single-value accessors kept for backwards compatibility with
// older tests and call sites. Prefer per-player caps via
// computeCreditCapsForPlayer for any new code.
export function MAX_CREDITS_PER_SECOND(): number {
  return GLOBAL_CREDIT_CAPS().maxPerSecond;
}
export function MAX_CREDITS_PER_FIRST_CLEAR(): number {
  return GLOBAL_CREDIT_CAPS().maxPerFirstClear;
}

// Wall-clock slack on the playtime guard. 60s covers client/server clock
// skew, the time between snapshot serialization and the POST landing,
// and the rare double-save during a network retry.
export const PLAYTIME_DELTA_SLACK_SECONDS = 60;

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface MissionGraphInput {
  readonly completedMissions: readonly MissionId[];
  readonly unlockedPlanets: readonly MissionId[];
}

// Reject saves whose unlock chain has been bypassed: every entry in
// completedMissions must have all of its `requires` already in
// completedMissions, and every entry in unlockedPlanets that's a combat
// mission (not a shop/scenery planet) must satisfy the same rule.
//
// Permissive on duplicates and on shop/scenery unlocks (those have no
// gameplay prerequisite — you can warp to a market without having
// cleared anything).
export function validateMissionGraph(input: MissionGraphInput): ValidationResult {
  const completed = new Set<MissionId>(input.completedMissions);

  for (const id of input.completedMissions) {
    const mission = safeGetMission(id);
    if (!mission) continue;
    for (const req of mission.requires) {
      if (!completed.has(req)) {
        return {
          ok: false,
          error: `completed mission "${id}" missing prerequisite "${req}"`
        };
      }
    }
  }

  for (const id of input.unlockedPlanets) {
    const mission = safeGetMission(id);
    if (!mission) continue;
    if (mission.kind !== "mission") continue;
    for (const req of mission.requires) {
      if (!completed.has(req)) {
        return {
          ok: false,
          error: `unlocked planet "${id}" missing prerequisite "${req}"`
        };
      }
    }
  }

  return { ok: true };
}

export interface CreditsDeltaSide {
  readonly credits: number;
  readonly playedTimeSeconds: number;
  readonly completedMissionsCount: number;
}

export interface CreditsDeltaInput {
  // null when no prior save row exists — the first save is bounded against
  // zero (i.e. all of the new credits must fit under the time + completion
  // budget the player has actually accumulated).
  readonly prev: CreditsDeltaSide | null;
  readonly next: CreditsDeltaSide;
  // Per-player cap. Optional for backwards compatibility — defaults to
  // GLOBAL_CREDIT_CAPS (the tutorial+all-systems aggregate ceiling). New
  // callers should always pass per-player caps from
  // computeCreditCapsForPlayer(completedMissions) so the cap reflects the
  // player's actual progression.
  readonly caps?: CreditCaps;
}

// Reject saves whose credits jumped by more than the player could plausibly
// have earned since the previous save. Spending (negative delta) is always
// allowed — the market drains credits and we don't want to police that.
export function validateCreditsDelta(input: CreditsDeltaInput): ValidationResult {
  const { prev, next, caps = GLOBAL_CREDIT_CAPS() } = input;
  const prevCredits = prev?.credits ?? 0;
  const prevTime = prev?.playedTimeSeconds ?? 0;
  const prevCompleted = prev?.completedMissionsCount ?? 0;

  const deltaCredits = next.credits - prevCredits;
  if (deltaCredits <= 0) return { ok: true };

  const deltaTime = Math.max(0, next.playedTimeSeconds - prevTime);
  const deltaCompleted = Math.max(0, next.completedMissionsCount - prevCompleted);

  const maxDelta =
    deltaTime * caps.maxPerSecond +
    deltaCompleted * caps.maxPerFirstClear +
    CREDITS_DELTA_SLACK();

  if (deltaCredits > maxDelta) {
    return {
      ok: false,
      error: `credits delta ${deltaCredits} exceeds max ${maxDelta} (delta_time=${deltaTime}s, delta_completed=${deltaCompleted})`
    };
  }
  return { ok: true };
}

// Wall-clock guard on playedTimeSeconds growth. Closes the credits-cap
// escape hatch where a cheater POSTs an inflated `playedTimeSeconds`
// alongside inflated credits — without this, the credits-delta cap
// would happily allow `playtime * 100` extra credits for whatever
// playtime the body claimed. Here we tie the playtime delta to real
// seconds elapsed since the last save's updated_at.
//
// Skipped on the first save (no prior row to compare against). The
// credits cap still constrains first saves via `prev=null` defaulting
// previous values to zero.
export interface PlaytimeDeltaInput {
  readonly prev: {
    readonly playedTimeSeconds: number;
    // Accept Date OR string — Neon's Edge driver sometimes returns
    // TIMESTAMPTZ as a string and the route shouldn't have to coerce
    // before calling the validator.
    readonly updatedAt: Date | string;
  } | null;
  readonly next: {
    readonly playedTimeSeconds: number;
  };
  // Injected for test determinism. Production callers pass Date.now().
  readonly nowMs: number;
}

export function validatePlaytimeDelta(input: PlaytimeDeltaInput): ValidationResult {
  const { prev, next, nowMs } = input;
  if (!prev) return { ok: true };

  const deltaPlayed = next.playedTimeSeconds - prev.playedTimeSeconds;
  if (deltaPlayed <= 0) return { ok: true };

  const prevUpdatedMs =
    prev.updatedAt instanceof Date
      ? prev.updatedAt.getTime()
      : new Date(prev.updatedAt).getTime();
  // Defensive: an unparseable timestamp shouldn't lock the player out;
  // this only happens if the DB row has bogus data, which is its own
  // problem to debug. Fail open so legitimate saves still go through.
  if (!Number.isFinite(prevUpdatedMs)) return { ok: true };

  const wallClockSeconds = Math.max(0, (nowMs - prevUpdatedMs) / 1000);
  const allowedDelta = wallClockSeconds + PLAYTIME_DELTA_SLACK_SECONDS;

  if (deltaPlayed > allowedDelta) {
    return {
      ok: false,
      error: `playtime delta ${deltaPlayed}s exceeds wall-clock ${allowedDelta.toFixed(1)}s since last save`
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Save-state regression guard
// ---------------------------------------------------------------------------
// `validateCreditsDelta` and `validatePlaytimeDelta` only catch INFLATION —
// cheating UP. They explicitly allow regression (credits going down, playtime
// going down) because spending credits in the shop is a legitimate down-delta
// for credits, and the playtime guard short-circuits on negative deltas.
//
// The hole that left: any client path that POSTs an empty/default snapshot
// (credits=0, completedMissions=[], playedTimeSeconds=0) blows away a real
// save. This is exactly what wiped numminen.mikko.petteri@gmail.com's row at
// 2026-05-02 21:51:54 — months of progression destroyed by a single POST that
// the server happily accepted because the down-delta passed the cheat checks.
//
// This guard rejects four monotonic-field regressions. Each field NEVER
// decreases under normal play, so a strictly-shrinking POST is a wipe signal:
//
//   1. completedMissions shrunk — no "un-complete" mutator exists.
//   2. unlockedPlanets shrunk — no "lock a planet" mutator exists.
//   3. playedTimeSeconds dropped — only addPlayedTime ever moves it, and
//      it's strictly additive (an equal value means "same save instant",
//      a smaller value means a regression).
//   4. seenStoryEntries shrunk — markStorySeen in stateCore.ts only appends
//      (it early-returns on duplicates). A partial POST that omits the field
//      coalesces to [] server-side and would wipe cross-device story history;
//      the local `seenStoriesLocal.ts` backup masks this on the same device
//      only, so cross-device players lose state silently without this guard.
//
// We deliberately do NOT guard credits — the market drains credits and a
// legitimate full-spend looks like a regression-to-zero. The three monotonic
// fields above already catch every realistic wipe pattern: a player with
// non-zero credits has played the game, so they have prior playtime and at
// least one completed mission, both of which the wipe collapses to zero.
//
// Pure function so the route can call it after the existing graph/playtime/
// credits guards without any I/O.

export interface RegressionGuardInput {
  readonly prev: {
    readonly playedTimeSeconds: number;
    readonly completedMissions: readonly MissionId[];
    readonly unlockedPlanets: readonly MissionId[];
    // Optional — older callers / tests that pre-date the seen-story guard
    // omit this field. An undefined value is equivalent to an empty list:
    // there are no prior entries that COULD be regressed.
    readonly seenStoryEntries?: readonly string[];
  } | null;
  readonly next: {
    readonly playedTimeSeconds: number;
    readonly completedMissions: readonly MissionId[];
    readonly unlockedPlanets: readonly MissionId[];
    readonly seenStoryEntries?: readonly string[];
  };
}

// INVARIANT: guards three monotonic fields, intentionally NOT credits — market spend is a legitimate down-delta (INV-SAVE-3)
export function validateNoRegression(input: RegressionGuardInput): ValidationResult {
  const { prev, next } = input;
  // No prior row → first save → nothing to regress from.
  if (!prev) return { ok: true };

  // Mission list shrank. Even one mission missing is a regression — clients
  // never un-complete missions.
  const missingMissions = setDifference(prev.completedMissions, next.completedMissions);
  if (missingMissions.length > 0) {
    return {
      ok: false,
      error: `completedMissions regressed — missing previously-completed: ${missingMissions.join(", ")}`
    };
  }

  // Unlocks shrank. Symmetric to completedMissions — clients never lock a
  // planet. Without this check, a wipe could erase a player's hard-earned
  // unlocks even if their completedMissions list happened to survive.
  const missingUnlocks = setDifference(prev.unlockedPlanets, next.unlockedPlanets);
  if (missingUnlocks.length > 0) {
    return {
      ok: false,
      error: `unlockedPlanets regressed — missing previously-unlocked: ${missingUnlocks.join(", ")}`
    };
  }

  // Playtime moved backwards. Equal is fine (no-op save), strictly less is not.
  if (next.playedTimeSeconds < prev.playedTimeSeconds) {
    return {
      ok: false,
      error: `playedTimeSeconds regressed from ${prev.playedTimeSeconds} to ${next.playedTimeSeconds}`
    };
  }

  // seenStoryEntries shrank. markStorySeen is append-only; a partial POST that
  // drops the field would coalesce to [] server-side and wipe cross-device
  // history. Same set-difference pattern as the mission checks above.
  const prevSeen = prev.seenStoryEntries ?? [];
  const nextSeen = next.seenStoryEntries ?? [];
  const missingSeen = setDifferenceStrings(prevSeen, nextSeen);
  if (missingSeen.length > 0) {
    return {
      ok: false,
      error: `seenStoryEntries regressed — missing previously-seen: ${missingSeen.join(", ")}`
    };
  }

  return { ok: true };
}

function setDifference(
  prev: readonly MissionId[],
  next: readonly MissionId[]
): MissionId[] {
  const nextSet = new Set(next);
  const missing: MissionId[] = [];
  for (const id of prev) {
    if (!nextSet.has(id)) missing.push(id);
  }
  return missing;
}

function setDifferenceStrings(
  prev: readonly string[],
  next: readonly string[]
): string[] {
  const nextSet = new Set(next);
  const missing: string[] = [];
  for (const id of prev) {
    if (!nextSet.has(id)) missing.push(id);
  }
  return missing;
}

function safeGetMission(id: MissionId) {
  try {
    return getMission(id);
  } catch {
    // Schema validation already rejects unknown mission ids before the
    // validators run; this is purely defensive against future drift.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-mission score cap — SEC-014
// ---------------------------------------------------------------------------
// Derives the theoretical maximum legitimate score for a mission from
// waves.json + enemies.json. The ScoreSystem caps combo at 8 and rounds
// per kill: `Math.round(scoreValue * combo)`. The maximum score is therefore
// `sum(enemy.scoreValue * 8 * spawnCount)` across all waves. A 2× safety
// factor absorbs any future addScore() bonuses (perks, collectibles) that
// aren't wave-enemy kills. Missions with no waves (shop/hub planets) get a
// non-zero fallback so score=0 still passes the guard.
const SCORE_SAFETY_FACTOR = 2;
const MAX_COMBO = 8;
const FALLBACK_MIN_CAP = 100;

// SECURITY-CRITICAL: per-mission cap derived from waves+enemies bounds leaderboard score takeover (SEC-014, INV-LB-1)
export function maxLegitScore(missionId: MissionId): number {
  const waves = getWavesForMission(missionId);
  let theoreticalMax = 0;
  for (const wave of waves) {
    for (const spawn of wave.spawns) {
      let enemy;
      try {
        enemy = getEnemy(spawn.enemy);
      } catch {
        // Wave references an enemy id we no longer recognise. Skip rather
        // than throw — data integrity is its own test layer (same rationale
        // as the sibling getEnemy guard in deriveCreditCaps above). A
        // dropped enemy only lowers the theoretical max, which fails safe:
        // it can never inflate the legit-score ceiling a cheater could pass.
        continue;
      }
      theoreticalMax += enemy.scoreValue * MAX_COMBO * spawn.count;
    }
  }
  return Math.max(
    FALLBACK_MIN_CAP,
    Math.ceil(theoreticalMax * SCORE_SAFETY_FACTOR)
  );
}
