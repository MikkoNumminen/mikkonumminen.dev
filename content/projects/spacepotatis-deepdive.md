---
title: Spacepotatis — engineering deep-dive
project: spacepotatis
---

# Spacepotatis — Engineering Deep-Dive

This document focuses on the specific hard problems encountered during development — real bugs, gnarly decisions, tradeoffs, and the reasoning behind non-obvious implementations. It complements the architecture and feature overviews that already exist.

## The Two-Engine Rendering Bridge

The biggest structural challenge in the codebase is running Phaser 4 (2D combat) and Three.js 0.184 (3D galaxy overworld) inside the same Next.js app without them interfering with each other — or with React.

The solution is a mutual exclusion model owned by `GameCanvas.tsx` via a `mode: "galaxy" | "combat"` state value. Only one engine canvas is mounted in the DOM at a time. The switch is orchestrated in two steps: a GSAP-driven black overlay fades to opaque via `TransitionManager.fade()`, then React's diffing unmounts the deactivated engine (triggering its `dispose` hook and releasing GPU resources), then mounts the new one. After the new engine's canvas is in the DOM, `requestAnimationFrame` schedules the fade-back to transparent. The GSAP tween is kept in `TransitionManager.ts` as a thin standalone module that returns both a `Promise<void>` and a `kill()` handle.

The disposal contracts are strict: `GalaxyScene.dispose()` tears down the Three.js `WebGLRenderer`, all geometries, and the `OrbitControls`. `createPhaserGame()` returns a Phaser game instance that is destroyed via `game.destroy(true)` on the combat-to-galaxy transition. Without these, GPU memory leaks accumulate across mission completions.

No camera-zoom transition exists: ARCHITECTURE.md notes it explicitly as planned polish. The fade is the entire visual bridge today.

Both Three.js scenes (`GalaxyScene` and `LandingScene`) share construction code via `SceneRig.ts`. Before that factory existed, the two scenes drifted — the same renderer settings, fog density, ambient light colors, and planet add-loop maintained in two places — and produced visible flashes at scene transitions because they were setting the same clear color to slightly different values. Centralizing everything into `createSceneRig(canvas, opts)` eliminated the drift vector entirely.

## Auth-Flip Mid-Combat

A subtle lifecycle bug: NextAuth's `useSession` can flip from `"loading"` to `"authenticated"` while Phaser is in an active combat session. If `GameCanvas` had wired the `onComplete` callback directly into the Phaser mount effect, a session state change would have meant Phaser holding a stale closure that skipped `saveNow()` and `submitScore()` on mission completion.

The fix is a ref: `handleMissionComplete` is stored in `completeRef`, which Phaser receives at creation time. The ref is updated on every session change without restarting Phaser. The ARCHITECTURE.md carries an explicit "don't refactor this" warning, acknowledging that the ref pattern looks like indirection but is the correct fix for this specific lifecycle crossing.

## The May 2026 Save Wipe

The most consequential incident in the project's history happened on 2026-05-02. The root cause was a missing guard: three server-side cheat guards checked that specific fields did not grow too fast. None of them checked whether fields could shrink. When a buggy client posted `credits: 0, completedMissions: []`, the server validated the shape as clean, passed the growth guards (nothing grew), and overwrote a real player's progression with empty state.

The response shipped in six PRs over roughly one week:

- PR #94: `validateNoRegression` guard that rejects any POST where `completedMissions`, `unlockedPlanets`, or `playedTimeSeconds` is smaller than the stored server row. Returns HTTP 422 with `error: "save_regression"`.
- PR #96: changed the treatment of 422 from permanent (drop the snapshot) to transient (hold in localStorage, retry after the next successful `loadSave`). The original permanent-drop rule would have discarded real saves whose only problem was a timing race.
- PR #97: client-side hydration gate. `saveNow()` now refuses to POST until `loadSave` has successfully hydrated state from the server, preventing a scenario where module re-initialization posts `INITIAL_STATE` over a good server row.
- PR #98: the `save_audit` table. The wipe was diagnosed by reading Vercel logs and reverse-engineering — there was no record of what the client actually sent or what the server row looked like before overwrite. Migration `20260503000000_add_save_audit.sql` adds one row per authenticated POST attempt capturing request payload, previous snapshot, response status, error code, request IP, and user agent. The insert is best-effort: an audit write failure never blocks the actual save.
- PR #100: cross-account stamping. The localStorage save queue (`spacepotatis:pendingSave`) gained a `playerEmail` field (`INV-QUEUE-1`). A snapshot stamped for one account is invisible to a different account on the same browser. The legacy unstamped `:v1` key is silently purged on first read.
- PR #101: the `LoadResult` discriminated union. Before this, `loadSave()` returned a boolean. `false` meant either "fresh account with no save" or "server was unreachable." The silent collapse of those two states into `false` caused the splash screen to clear over `INITIAL_STATE` on network failures, making players see zero credits and locked planets and assume their data was gone. The union adds `"server-loaded" | "anon" | "no-save" | "pending-only" | "load-failed"`, and `"load-failed"` renders a full-screen `SaveLoadErrorOverlay` that prevents the splash from clearing until the user explicitly retries.

Six months later, migration `20260518150000_add_save_snapshots.sql` added the structural fix: an append-only `save_snapshots` table that receives a dual-write on every successful `POST /api/save`. The single-row OVERWRITE in `save_games` still happens for reads in v1 scope; the snapshots table is the recovery surface. The migration comment explains the future cutover: once production dual-writes validate the table, the read path switches from `save_games` to `save_snapshots`'s tail-read query.

## Guest Progress and the OAuth Reload Problem

When an anonymous player clicks "Sign in with Google," the OAuth redirect reloads the page. The in-memory `GameState` singleton resets to `INITIAL_STATE` on module re-initialization. The save queue (which requires a `playerEmail` stamp) cannot hold anonymous progress. Before the fix, clicking sign-in after earning credits and clearing missions silently wiped everything on the next load. The in-code bug name: "MENI PERUNAPROGRESS HUKKAAN" (Finnish: "the potato progress got lost"), filed 2026-04-26.

The fix is a second, orthogonal storage channel in `guestCache.ts`. `bindGuestPersistenceOnce()` subscribes to `GameState` commits and writes a versioned `GuestEnvelope` (`spacepotatis:guest-progress:v1`) to `localStorage` on every commit — but only while `getCurrentPlayerEmail() === null`. Writes are synchronous with no debounce. The rationale is explicit in the source: a debounced write opens a "data not flushed before navigation" race when the user clicks "Sign in." The OAuth redirect can leave the page before a pending `setTimeout` fires, dropping the last few seconds of progress. The comment notes the performance threshold: re-evaluate if commit rates ever climb past ~300 per mission (the point where amortized `localStorage.setItem` cost becomes user-perceptible). Current missions run ~50 commits each.

Three correctness invariants close the security and consistency boundaries: the cache is never claimed when the server already has a row; the writer only runs while the user is anonymous; and `resetState()` on sign-out clears in-memory `GameState` before `setCurrentPlayerEmail(null)` re-enables the writer, preventing a freshly-signed-out user's state from being re-serialized as guest progress.

A `suppressWriterDuringRemoteHydrate` flag prevents infinite ping-pong across tabs: without it, a cross-tab `storage` event would cause this tab to hydrate from storage, commit to `GameState`, which would fire the writer, write a fresh envelope with a new `savedAtMs`, which would trigger the other tab's storage listener, causing it to hydrate and write again.

## The Eight-Layer Save Round-Trip

Each save traverses eight distinct layers in sequence, each capable of silently dropping a field:

1. `StateSnapshot` interface in `persistence.ts`
2. `toSnapshot()` serializer
3. `SavePayloadSchema` (Zod, `src/lib/schemas/save.ts`)
4. `POST /api/save` handler (writes `save_games` and `save_audit`)
5. DB column in `save_games`
6. SQL migration in `db/migrations/`
7. `GET /api/save` handler plus `RemoteSaveSchema`
8. `sync.loadSave` calling `hydrate()`

This is why migration `20260503010000_persist_current_solar_system.sql` exists as a separate file with a comment: "NULL on existing rows is fine — the client's `hydrate()` falls back to the first unlocked system." That single ADD COLUMN touches all eight layers and was a multi-file change.

ADR 0004 records the decision explicitly: the eight layers are not collapsed for simplicity, because each one earns its keep and collapsing them would recreate the conditions for the May 2026 wipe. Adding a single boolean field to `StateSnapshot` is an eight-file edit. The `/save-roundtrip-audit` Claude Code skill walks every `StateSnapshot` field through all eight layers and flags any that drop it silently; it runs before any commit touching the persistence sub-cluster.

## Ship Loadout Schema Migration Stack

The ship loadout went through at least four distinct serialization shapes as the weapon system evolved. The `persistence/` sub-directory has a migrator per legacy format, each with its own test file: `migrateLegacyIdArray.ts` handles the original slot-as-array-of-strings shape; `migrateNamedSlots.ts` handles the named-slots object; `migratePrimaryWeapon.ts` handles the pre-loadout single-weapon shape; `migrateNewShape.ts` handles the current instance-based format.

When the 2026-05-04 weapon catalog cull removed six weapons (`spud-missile`, `tater-net`, `tail-gunner`, `side-spitter`, `plasma-whip`, `hailstorm`), the migration pipeline faced a new problem: `buildInstance` in `helpers.ts` silently drops any instance whose id is not in the live `WEAPON_IDS` set. A player who owned one of these weapons would have it disappear from their loadout with no credit compensation. The `salvageRemovedWeapons.ts` module runs before the per-shape migrators in `hydrate()`, reads the raw legacy snapshot directly, and computes a refund of `base_cost + per_level_upgrade_costs + augment_costs` for every removed id found. The removed-weapon base-cost table in that file is explicitly marked load-bearing: once an id leaves the live catalog, this table is the only record of what the player paid. The comment states: "Don't delete entries just because a weapon stays gone."

There is also a retroactive system-unlock backfill in `hydrate()`. When `SYSTEM_UNLOCK_GATES` was introduced to gate solar system access behind mission completions, players who had already cleared the gating missions had no corresponding unlock in their save row. Rather than a one-shot migration, `hydrate()` re-derives `unlockedSolarSystems` from `completedMissions` on every load. Idempotent; already-unlocked systems are deduped via a `Set`.

## Server-Side Credit Cap Derivation

The `validateCreditsDelta` guard started as a global constant cap — one number for all players. The problem was that a balance change to a far solar system would silently loosen the cap for new players who had never reached that system. The current implementation derives caps per-request from the server's stored `completedMissions`.

The derivation: `getReachableSolarSystems(completedMissions)` walks `SYSTEM_UNLOCK_GATES` to determine which systems the player can access. `computeCreditCapsForSystems(reachableSystems)` walks every wave of every mission in those systems, takes the peak non-boss enemy `creditValue` (bosses spawn once per mission and should not drive a sustained per-second cap), and multiplies by `KILL_CADENCE_CEILING (5) × PER_SECOND_SAFETY_FACTOR (3)`. The first-clear cap adds in loot-pool `credits.max` and boss `creditValue`, multiplied by `PER_CLEAR_SAFETY_FACTOR (1.5)`.

The consequence: a 10x balance change to any enemy's `creditValue` automatically scales the corresponding cap without any code edit. A new player can only earn at tutorial rates; a tubernovae-system player gets tubernovae-tier caps. The tutorial-only floor is logged to Vercel function logs on cold start as `[saveValidation] tutorial-only caps (floor)`, so a regression after rebalance is detectable without waiting for a player report.

The guards run inside a single DB transaction with `FOR UPDATE` on the previous row, eliminating a TOCTOU race: without the lock, two concurrent POSTs from the same account could both read the same baseline and both pass a regression check that should have failed for the second one.

## Phaser Event and Registry Safety

Phaser's native `scene.events.emit("string-name")` is compile-blind. A renamed event with one consumer left un-renamed becomes a silent drop with no error. The codebase enforces typed wrappers from day one.

`events.ts` exports a discriminated `CombatEvent` union (`playerDied | allWavesComplete | abandon`) plus `emit<E>(scene, event)` and `on<T>(scene, type, handler)` wrappers. Adding a new event requires extending the union; renaming one is a compile error everywhere.

`registry.ts` exports `REGISTRY_KEYS` and typed accessor functions (`getSummary`, `setSummary`, `getBootData`, `setBootData`). The `CombatSummary` shape travels from `CombatScene` through the Phaser registry to `GameCanvas.handleMissionComplete` and then into the `VictoryModal` React component without any `as` casts.

ADR 0006 records that the May 2026 modular audit confirmed zero string-keyed violations across the entire `phaser` module. Two events (`enemyKilled`, `waveComplete`) were emitted but had no listeners; the audit deleted both rather than leaving dead code.

The `PerkController` and `DropController` have a circular dependency at construction time: drops can grant perks, and applying a perk calls `dropController.flashPickup`. The resolution uses lazy accessors: each controller receives `() => this.otherController` closures at construction time rather than direct references, so construction order in `CombatScene.create()` does not matter.

## Web Audio Disposal

The procedural SFX engine (`sfx.ts`) has explicit disposal contracts documented as an invariant comment. The problem it prevents: in a 3-minute combat session with ~30 laser sounds per second plus explosions and hit effects, Web Audio nodes that remain connected after playback ends are GC-pinned. By mission end, thousands of detached-but-pinned nodes accumulate, holding memory and potentially degrading audio scheduling.

The contracts: every `play*` call chains through the shared `masterGain` (`this.sink`) rather than `ctx.destination` directly — so `setMuted(true)` silences all in-flight sounds in one `gain.value` assignment. Every `play*` call ends with `autoDispose(stopper, ...rest)`, which wires `stopper.onended` to disconnect every node in the chain when the scheduled stop fires. The explosion white-noise `AudioBuffer` is created once and cached, not reallocated per call.

The `MUTE_RAMP_TC` constant (5ms) avoids click artifacts when muting mid-envelope: an abrupt `gain.value = 0` assignment produces an audible click on some browsers when a sound is in its attack phase.

## Audio Mute Architecture

The previous mute design was a `setAllMuted(muted)` function in `music.ts` that lazily imported five sibling engine modules and called `setMuted` on each. Two problems: it was category-blind (music and SFX silenced together with no way to separate them), and the dynamic import was a microtask that could race with rapid toggle events. A user clicking mute twice quickly could end up with engines in inconsistent states.

`AudioBus.ts` replaces all of that. Engines self-register under one of `music | voice | sfx` categories in their constructor. The bus tracks a master flag and per-category flags, computes the effective mute as `master || category`, and fans out `setMuted(effective)` only to the engines in categories whose effective mute actually changed. The diff-before-fanout logic (`snapshotMutes()` before the state change, `applyDiff()` after) prevents redundant `setMuted(false)` calls from going out to already-unmuted engines.

Mute is intentionally session-only. An earlier design persisted state to `localStorage["spacepotatis:muted"]`. The problem: stale entries from testing sessions kept silencing the page on cold load with no visible indicator and no obvious recovery path for a regular user. The decision to remove persistence is documented in the `AudioBus` source header.

`menuBriefingAudio.ts` has a separate autoplay correctness problem: `HTMLAudioElement.play()` is blocked until the document receives a user gesture, but the music engine has a per-engine watchdog (2s retry loop for paused-but-armed elements) that recovers on its own. Voice-only engines have no such retry. `userActivation.ts` provides a shared "first gesture" queue: `onUserActivation(cb)` runs `cb` immediately if the user has already activated the document, otherwise queues it for the first `pointerdown`, `keydown`, or `touchstart`. This is the mechanism that prevents Grandma's voice from being silently stranded after a cold page load.

## Procedural Assets

`BootScene.generateTextures()` draws every game sprite programmatically using `Phaser.GameObjects.Graphics` and registers them with `generateTexture(key, ...)`. No PNG files are preloaded. This eliminates the asset-preload phase entirely and means cold-load latency is bounded only by First Load JS.

The BootScene comment explains the error-handling posture: each `draw*` helper allocates a `Graphics` object, calls `generateTexture`, then destroys it. A throw inside one helper leaks at most one in-flight `Graphics` object. The outer try/catch logs the error but still hands off to `CombatScene` so the game does not hang on `BootScene`. Missing textures surface as Phaser console warnings rather than a stuck scene.

The galaxy starfield is 2,000 `THREE.Points`. ARCHITECTURE.md notes this as a potential bottleneck on low-end GPUs with a recommendation to measure before switching to a single full-sphere shader.

## The Score Queue and Durability Guarantees

Before the score queue, a victory that coincided with a network failure, an authentication state that hadn't resolved yet, or a tab close during the POST simply lost the score. The queue in `scoreQueue.ts` is a localStorage-backed array of `{ missionId, score, timeSeconds, firstSeenMs, attempts }` entries.

Enqueue happens before any network I/O in `GameCanvas.handleMissionComplete`, so even a tab close the moment combat ends preserves the score for the next session. Anonymous wins enqueue too; the drain is a no-op until sign-in.

The drain outcome table distinguishes five cases: 2xx (drop entry), 401 (pause the entire drain without burning attempts), 5xx or 422 `mission_not_completed` (transient, increment attempts), 400 or permanent 422 (drop with console warning so a real schema regression surfaces), and entries past 50 attempts or 30 days old (drop before issuing any HTTP request). The 401 case is specifically handled because every other entry in the queue would also 401 — there is no point burning attempts on them.

The deduplication check `{missionId, score, timeSeconds}` prevents a double-enqueue from rapid double-fire of the mission-complete callback (for example, the user clicking "Continue" twice). Two clears of the same mission with different scores both enqueue legitimately.

## Vercel Hobby Tier as Architectural Constraint

The deployment constraint is not incidental — it shaped the entire rendering architecture. Vercel Hobby provides 100k function invocations, 100 GB-hours of CPU, and 100 GB of egress per month. A single uncached page on social media can exhaust that in hours.

The response: every Next.js page exports `dynamic = "force-static"` except the leaderboard, which is `force-dynamic` because ISR was showing a stale loading card for up to 60 seconds after each deploy. All data routes run on the Edge runtime (not Node) using the `@neondatabase/serverless` WebSocket pool driver, minimizing cold-start cost. The leaderboard API response is cached with 60-second revalidation via `unstable_cache`, and score POSTs call `revalidateTag('leaderboard')` to flush the cache without a polling loop.

Phaser and Three.js are dynamically imported inside `GameCanvas` with `ssr: false`, so neither engine executes during server-side rendering. Bundles split cleanly; SSR compute stays at zero. Zod is kept out of static-page first-load bundles by moving catalog JSON validation into CI-only tests (`jsonSchemaValidation.test.ts`), saving ~98 KB from the `/play` route's First Load JS.

ADR 0002 explains why Prisma was not used: its generated engine binary is incompatible with the Edge runtime, it adds tens of megabytes to the deploy, and it conflicts with hand-written forward-only migrations. Kysely provides full type safety through a hand-maintained `Database` interface.

## Known Accepted Cheat Vector

ADR 0008 documents a deliberate economy hole introduced in PR #159. The sell refund was changed from 50% to 100% of the player's full investment (base cost plus all upgrade costs plus augment costs). The motivator: under the 50% rule, a free starter weapon (base cost zero) with ¢600 in upgrades sold for ¢0, because `floor(0 × 0.5) = 0`. With 100% refund, the ¢600 upgrade investment comes back on sale.

The tradeoff: free items granted via `grantWeapon()` or `grantAugment()` can now be converted to credits at full catalog price, providing free credit generation. The decision to accept this was deliberate: content work was the bottleneck, a balance audit before content stabilized would tune numbers twice, and the leaderboard is a local cohort rather than a competitive surface. Server-side credit-delta caps throttle the worst case. A future balance audit scheduled once content work stabilizes is the documented resolution path.

---

GAPS: No CHANGELOG file was found in the repo — commit history would be required to reconstruct a chronological bug list. The exact `seen_story_entries` column migration comment's PR reference was not verified against a PR list. The `check-schema.mjs` script internals and the `audit-readiness-check.yml` daily cron's exact query were not read in full.
