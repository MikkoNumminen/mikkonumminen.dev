// When the catalog drops a weapon id (e.g. the 2026-05-04 vegetable cull),
// existing player saves can still carry instances of that id. The hydrate()
// pipeline runs salvage BEFORE the per-shape migrators, because the migrators
// (specifically `buildInstance` in helpers.ts) silently DROP any instance
// whose id isn't in the live `WEAPON_IDS`. Salvage therefore reads the
// raw legacy snapshot directly and refunds (cost + per-level upgrades + any
// installed augments) in credits — no player loses progress.
//
// The base-cost map below is load-bearing: once an id is removed from the
// live catalog (`getWeapon` would throw), this table is the only place that
// remembers what the player paid. Don't delete entries just because a weapon
// stays gone — a stale entry never matches a live id (live ids are filtered
// out before lookup), so leaving rows here is harmless and forward-safe.

import type { WeaponInstance } from "../ShipConfig";
import { weaponUpgradeCost } from "../ShipConfig";
import { WEAPON_IDS, AUGMENTS } from "@/game/data";
import type { AugmentId } from "@/types";
import type { LegacyShipSnapshot } from "./types";
import type { LegacyWeaponInstanceLike } from "./helpers";

// Snapshot of every weapon id that has ever been priced in the live catalog
// but is no longer present. When a new wave of removals lands, ADD entries
// here with the cost the weapon shipped with at the time of removal.
//
// Exported so `salvageInvariants.test.ts` can cross-check against TODO.md's
// "Phase Vegetable-Catalog" backlog — any id documented there must have a
// refund entry here, otherwise the listed weapon's removal silently
// destroyed player progress.
export const REMOVED_WEAPON_BASE_COSTS: Readonly<Record<string, number>> = {
  "spud-missile": 1100,
  "tater-net": 600,
  "tail-gunner": 700,
  "side-spitter": 500,
  "plasma-whip": 1300,
  "hailstorm": 1500
};

const LIVE_WEAPON_IDS = new Set<string>(WEAPON_IDS);

const isRemoved = (id: unknown): id is string =>
  typeof id === "string" &&
  REMOVED_WEAPON_BASE_COSTS[id] !== undefined &&
  !LIVE_WEAPON_IDS.has(id);

export interface SalvageOutcome {
  readonly slots: (WeaponInstance | null)[];
  readonly inventory: WeaponInstance[];
  readonly creditRefund: number;       // 0 when nothing was salvaged
  readonly removedIds: readonly string[]; // for "you got refunded for X" UI
}

// Refund cost for a single instance: base + per-level upgrades + augment costs.
// Skips unknown augment ids (legacy data may carry them — those are gone, no
// refund issued for them).
function refundForInstance(
  id: string,
  level: number,
  augments: readonly string[]
): number {
  const base = REMOVED_WEAPON_BASE_COSTS[id];
  if (base === undefined) return 0;
  let total = base;
  // weaponUpgradeCost(L) is the cost of going from L → L+1, so we sum
  // [1..level-1] for the rungs the player actually paid for.
  const clampedLevel = Math.max(1, Math.floor(level));
  for (let lv = 1; lv < clampedLevel; lv++) {
    total += weaponUpgradeCost(lv);
  }
  for (const augId of augments) {
    const aug = AUGMENTS[augId as AugmentId];
    if (aug) total += aug.cost;
  }
  return total;
}

// Pure function (post-migration version): walks live-shape slots + inventory,
// salvages any instance whose id is in REMOVED_WEAPON_BASE_COSTS *and* not in
// the live catalog. Slot length is preserved (entries become null) so
// subsequent migrators can keep their invariants. Inventory entries are
// dropped outright. Used by the salvage unit tests.
export function salvageRemovedWeapons(
  slots: readonly (WeaponInstance | null)[],
  inventory: readonly WeaponInstance[]
): SalvageOutcome {
  let creditRefund = 0;
  const removedIds: string[] = [];

  const cleanedSlots: (WeaponInstance | null)[] = slots.map((entry) => {
    if (entry && isRemoved(entry.id)) {
      creditRefund += refundForInstance(entry.id, entry.level, entry.augments);
      removedIds.push(entry.id);
      return null;
    }
    return entry;
  });

  const cleanedInventory: WeaponInstance[] = [];
  for (const inst of inventory) {
    if (isRemoved(inst.id)) {
      creditRefund += refundForInstance(inst.id, inst.level, inst.augments);
      removedIds.push(inst.id);
      continue;
    }
    cleanedInventory.push(inst);
  }

  return {
    slots: cleanedSlots,
    inventory: cleanedInventory,
    creditRefund,
    removedIds
  };
}

// Pre-migration scanner: walks the RAW legacy snapshot and totals up the
// refund for any removed-weapon ids the player still owns. This runs in
// hydrate() BEFORE the per-shape migrators, because those drop unknown ids
// (via `isKnownWeapon` in helpers.ts) before any other code can see them.
//
// Handles all four legacy shapes:
//   - new shape: slots: WeaponInstance[], inventory: WeaponInstance[]
//   - legacy id-array: slots: string[] + unlockedWeapons + weaponLevels + weaponAugments
//   - named slots: slots: { front, rear, ... } + unlockedWeapons + ...
//   - pre-loadout: primaryWeapon + unlockedWeapons + ...
export function calculateLegacyRefund(raw: LegacyShipSnapshot): {
  readonly creditRefund: number;
  readonly removedIds: readonly string[];
} {
  let creditRefund = 0;
  const removedIds: string[] = [];

  // Detect new-shape by scanning for instance-like entries in slots OR inventory.
  const instanceSlots: LegacyWeaponInstanceLike[] = [];
  const instanceInventory: LegacyWeaponInstanceLike[] = [];
  if (Array.isArray(raw.slots)) {
    for (const entry of raw.slots) {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && "id" in entry) {
        instanceSlots.push(entry as LegacyWeaponInstanceLike);
      }
    }
  }
  if (Array.isArray(raw.inventory)) {
    for (const entry of raw.inventory) {
      if (entry && typeof entry === "object" && "id" in entry) {
        instanceInventory.push(entry as LegacyWeaponInstanceLike);
      }
    }
  }
  const looksNewShape = instanceSlots.length > 0 || instanceInventory.length > 0;

  if (looksNewShape) {
    // Each instance is independent — refund per-instance.
    for (const inst of [...instanceSlots, ...instanceInventory]) {
      const id = inst.id;
      if (!isRemoved(id)) continue;
      const level = typeof inst.level === "number" ? inst.level : 1;
      const augments = Array.isArray(inst.augments)
        ? inst.augments.filter((a): a is string => typeof a === "string")
        : [];
      creditRefund += refundForInstance(id, level, augments);
      removedIds.push(id);
    }
    return { creditRefund, removedIds };
  }

  // Legacy ledger: unlockedWeapons names the set of distinct owned ids.
  // Per-id level lives in weaponLevels (default 1); per-id augments in
  // weaponAugments. There's no concept of two instances of the same id
  // in this shape, so each removed id is refunded exactly once.
  const unlocked = Array.isArray(raw.unlockedWeapons) ? raw.unlockedWeapons : [];
  const levels = (raw.weaponLevels ?? {}) as Record<string, unknown>;
  const augs = (raw.weaponAugments ?? {}) as Record<string, unknown>;
  for (const id of unlocked) {
    if (!isRemoved(id)) continue;
    const rawLevel = levels[id];
    const level = typeof rawLevel === "number" ? rawLevel : 1;
    const rawAugList = augs[id];
    const augments = Array.isArray(rawAugList)
      ? rawAugList.filter((a): a is string => typeof a === "string")
      : [];
    creditRefund += refundForInstance(id, level, augments);
    removedIds.push(id);
  }
  // Pre-loadout shape carries `primaryWeapon` separately. Normally it's also
  // in unlockedWeapons; be defensive in case it isn't.
  if (
    typeof raw.primaryWeapon === "string" &&
    isRemoved(raw.primaryWeapon) &&
    !unlocked.includes(raw.primaryWeapon)
  ) {
    const id = raw.primaryWeapon;
    const rawLevel = levels[id];
    const level = typeof rawLevel === "number" ? rawLevel : 1;
    const rawAugList = augs[id];
    const augments = Array.isArray(rawAugList)
      ? rawAugList.filter((a): a is string => typeof a === "string")
      : [];
    creditRefund += refundForInstance(id, level, augments);
    removedIds.push(id);
  }

  return { creditRefund, removedIds };
}
