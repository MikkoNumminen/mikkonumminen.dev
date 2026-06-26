"use client";

// PUBLIC API — this file is part of the `audio` module's contract.
//   Stable. Breaking changes require a coordinated update of every caller.
//   See ./README.md for the rationale.
//
// AudioBus is the single source of truth for mute state across the audio
// cluster. Each engine registers itself with the bus under one of three
// categories (music / voice / sfx) and the bus calls back into the engine
// whenever the effective mute for that category flips.
//
// What it replaces:
//  - The `setAllMuted(muted: boolean)` hub in music.ts that lazy-imported
//    five sibling engines and called setMuted on each. Centralized
//    propagation, but blind to category and brittle in edge cases (the
//    dynamic import was a microtask that could race with rapid toggles).
//  - The per-engine `private muted = false; setMuted(muted) { ... }` storage
//    duplicated across six files. The bus owns the authoritative state;
//    engines just react.
//
// What it enables:
//  - Master mute (every category off) — what the current MuteToggle wires.
//  - Per-category mute (music vs voice vs sfx) — UI not yet shipped, but
//    the data model supports it for the eventual category-slider work.
//  - One subscribe() surface for UI components that need to mirror the
//    mute state in a button or icon — replaces sfx.subscribe.
//
// Lifecycle:
//  - Engines register in their constructor (singletons born at module load).
//  - The bus calls `engine.setMuted(isMuted(category))` synchronously on
//    register so the engine boots in the right state.
//  - On every state change the bus fans out to every registered engine in
//    the affected categories.
//
// Mute is session-only. The bus does not read from or write to localStorage.
// See MuteToggle.tsx for the rationale.

/**
 * The set of mute categories the bus tracks. `music` covers the menu /
 * combat / shop beds plus story cinematics + story-log bed; `voice` covers
 * Grandma's narration surfaces (briefings, item cues, leaderboard intro);
 * `sfx` covers procedural combat impact sounds. The set is closed.
 *
 * @stable
 */
export type AudioCategory = "music" | "voice" | "sfx";

/**
 * The contract every engine must satisfy to register with the bus. Engines
 * implement `setMuted` to react to mute changes — fade volume, pause an
 * element, set a master gain to zero, etc. The bus calls this synchronously
 * on `register()` (with the current effective mute) and then on every flip.
 *
 * @stable
 */
export interface AudioBusEngine {
  setMuted(muted: boolean): void;
}

/**
 * Snapshot of the bus's mute state. Returned by `audioBus.getState()` and
 * pushed to every `audioBus.subscribe()` listener on register and on change.
 * Each call returns fresh outer + nested objects so subscribers can't bleed
 * mutations into each other through a shared reference.
 *
 * @stable
 */
export interface AudioBusState {
  readonly masterMuted: boolean;
  readonly muted: {
    readonly music: boolean;
    readonly voice: boolean;
    readonly sfx: boolean;
  };
}

// INTERNAL
type Listener = (state: AudioBusState) => void;

// INTERNAL — exported only via the `audioBus` singleton below.
class AudioBus {
  private masterMuted = false;
  private categoryMuted: { music: boolean; voice: boolean; sfx: boolean } = {
    music: false,
    voice: false,
    sfx: false
  };
  private readonly engines: {
    music: Set<AudioBusEngine>;
    voice: Set<AudioBusEngine>;
    sfx: Set<AudioBusEngine>;
  } = { music: new Set(), voice: new Set(), sfx: new Set() };
  private readonly listeners = new Set<Listener>();

  /**
   * Register an engine under one of the three categories. Synchronously
   * seeds the engine with the current effective mute (so an engine born
   * after a master-mute already started does not boot in the wrong state)
   * and returns an unregister function. Called from each engine's
   * constructor; not intended for ad-hoc use.
   *
   * INVARIANT: every engine in the `audio` module MUST call this in its
   * constructor. Engines that skip it never receive mute toggles.
   *
   * @stable
   */
  register(category: AudioCategory, engine: AudioBusEngine): () => void {
    this.engines[category].add(engine);
    // Sync the new engine to the current bus state. Without this, an engine
    // that boots after a mute toggle would start in the wrong state.
    engine.setMuted(this.isMuted(category));
    return () => {
      this.engines[category].delete(engine);
    };
  }

  /**
   * Whether the master mute is on. Independent of per-category state.
   *
   * @stable
   */
  isMasterMuted(): boolean {
    return this.masterMuted;
  }

  /**
   * Whether the given category is effectively muted right now — true if
   * either master mute is on or the category-specific mute is on. Engines
   * call this from their `play*` paths to early-return before allocating an
   * `HTMLAudioElement` (the iOS ~6-element budget defense in `itemSfx`).
   *
   * @stable
   */
  isMuted(category: AudioCategory): boolean {
    return this.masterMuted || this.categoryMuted[category];
  }

  /**
   * Flip the master mute. Fans out to every registered engine in every
   * category whose effective mute actually changed. Used by `MuteToggle`.
   * Idempotent — re-setting to the current value is a cheap no-op.
   *
   * @stable
   */
  setMasterMuted(muted: boolean): void {
    if (this.masterMuted === muted) return;
    const before = this.snapshotMutes();
    this.masterMuted = muted;
    this.applyDiff(before);
    this.notify();
  }

  /**
   * Flip the per-category mute (music / voice / sfx). Fans out only to
   * engines registered under that category. UI for category sliders is not
   * yet shipped, but the data model supports it.
   *
   * @stable
   */
  setCategoryMuted(category: AudioCategory, muted: boolean): void {
    if (this.categoryMuted[category] === muted) return;
    const before = this.snapshotMutes();
    this.categoryMuted[category] = muted;
    this.applyDiff(before);
    this.notify();
  }

  /**
   * Read the current mute snapshot. Returns a fresh outer + nested object
   * each call so a subscriber that mutates the snapshot can't corrupt other
   * subscribers' views.
   *
   * @stable
   */
  getState(): AudioBusState {
    return {
      masterMuted: this.masterMuted,
      muted: { ...this.categoryMuted }
    };
  }

  /**
   * Subscribe to mute-state changes. The callback fires synchronously once
   * with the current state on subscribe, and again on every change. Returns
   * an unsubscribe function. Used by UI mirrors (mute-button icon, etc.).
   *
   * @stable
   */
  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  // INTERNAL
  // Snapshot the per-category effective mute so applyDiff can fan out only
  // to the categories whose state actually changed (saves a round of redundant
  // setMuted calls when toggling master between two already-muted categories).
  private snapshotMutes(): { music: boolean; voice: boolean; sfx: boolean } {
    return {
      music: this.isMuted("music"),
      voice: this.isMuted("voice"),
      sfx: this.isMuted("sfx")
    };
  }

  private applyDiff(before: { music: boolean; voice: boolean; sfx: boolean }): void {
    for (const cat of ["music", "voice", "sfx"] as const) {
      const after = this.isMuted(cat);
      if (after === before[cat]) continue;
      for (const engine of this.engines[cat]) engine.setMuted(after);
    }
  }

  private notify(): void {
    // One snapshot per subscriber — getState() returns a fresh outer + fresh
    // nested `muted` object each call, so subscribers can't bleed mutations
    // into each other through a shared reference. Tiny allocation cost,
    // pays for itself the first time someone writes to a received snapshot.
    for (const cb of this.listeners) cb(this.getState());
  }
}

/**
 * The single mute fan-out hub for every audio engine. Engines self-register
 * via `audioBus.register(category, this)` in their constructor; UI flips
 * state via `setMasterMuted` / `setCategoryMuted`; observers mirror state
 * via `subscribe`.
 *
 * INVARIANT: this is the ONLY hub. Never re-introduce a manual fan-out like
 * the old `setAllMuted(muted)` that lazy-imported sibling engines and called
 * setMuted on each — that pattern was racy under rapid toggles and category-
 * blind. See ./README.md.
 *
 * @stable
 */
export const audioBus = new AudioBus();
