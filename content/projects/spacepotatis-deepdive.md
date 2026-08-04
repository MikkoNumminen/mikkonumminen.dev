---
title: Spacepotatis · engineering deep-dive
project: spacepotatis
---

# Spacepotatis: Engineering Deep-Dive

This document focuses on the specific hard problems encountered during development: real bugs, gnarly decisions, tradeoffs, and the reasoning behind non-obvious implementations. It complements the architecture and feature overviews that already exist.

## The Two-Engine Rendering Bridge

The biggest structural challenge in the codebase is running Phaser 4 (2D combat) and Three.js 0.184 (3D galaxy overworld) inside the same Next.js app without them interfering with each other, or with React.

The solution is a mutual exclusion model owned by `GameCanvas.tsx` via a `mode: "galaxy" | "combat"` state value. Only one engine canvas is mounted in the DOM at a time. The switch is orchestrated in two steps: a GSAP-driven black overlay fades to opaque via `TransitionManager.fade()`, then React's diffing unmounts the deactivated engine (triggering its `dispose` hook and releasing GPU resources), then mounts the new one. After the new engine's canvas is in the DOM, `requestAnimationFrame` schedules the fade-back to transparent. The GSAP tween is kept in `TransitionManager.ts` as a thin standalone module that returns both a `Promise<void>` and a `kill()` handle.

The disposal contracts are strict: `createPhaserGame()` returns a Phaser game instance destroyed via `game.destroy(true)` on the combat-to-galaxy transition. Without these, GPU memory leaks accumulate across mission completions. No camera-zoom transition exists: ARCHITECTURE.md notes it explicitly as planned polish. The fade is the entire visual bridge today.

### The WebGL context-budget invariant

The hardest detail in the whole bridge is a two-file invariant that ties `SceneRig.dispose()` to a React `key` prop. `dispose()` calls `renderer.forceContextLoss()` immediately before `renderer.dispose()`. The comment explains why: without `forceContextLoss()` the WebGL context lingers until garbage collection during rapid galaxy-to-combat cycling, and can exhaust the browser's per-page WebGL context budget (browsers cap concurrent contexts at roughly 8-16).

The catch is that `forceContextLoss()` makes a canvas's context *permanently unrecoverable*. That is only safe if the canvas DOM element is also going away. On a galaxy-to-combat transition or a page navigation, React unmounts the canvas anyway, so it is fine. But on a warp between solar systems, the same `GameCanvas` stays mounted and would reuse the same canvas: leaving it in a permanently-lost context state, so the next `new THREE.WebGLRenderer({ canvas })` would throw deterministically (all three retries in `useGalaxyScene` would hit the same failure). The fix is that `GameCanvas.tsx` keys the galaxy `<canvas>` on `currentSolarSystemId`, forcing React to unmount the old canvas and mount a fresh DOM element on every warp. Both files carry mirrored INVARIANT comments warning that dropping the key prop without removing the `forceContextLoss()` call breaks warp deterministically. The two halves are mutually dependent.

`usePhaserGame` has a parallel concern: if Phaser's init throws partway through, a half-constructed `Phaser.Game` may already hold a WebGL context and tickers. The retry loop destroys the partial game (`created.destroy(true)`, swallowing any secondary throw) before letting the retry see the original error, so retries cannot accumulate dead contexts.

### The white-frame navigation flash

A separate compositor bug: the galaxy canvas is a large GPU-composited layer. When React tears down the `/play` tree during a route change, the browser paints a white frame where that layer was, and it flashes even on canvas-less destinations like `/shop`. The fix in `useGalaxyTransition.leaveGalaxy(href)` sets `canvas.style.visibility = "hidden"` synchronously inside the click handler, before `router.push()`, removing the compositor layer first so the teardown has nothing to flash. The comment is explicit that this must run here and not in the effect cleanup: cleanup is a passive callback React runs after the node is already detached, too late to affect the painted frame.

### Shared Three.js scaffolding

Both Three.js scenes (`GalaxyScene` and `LandingScene`) share construction code via `SceneRig.ts`. Before that factory existed, the two scenes drifted (the same renderer settings, fog density, ambient light colors, and planet add-loop maintained in two places), and produced visible flashes at scene transitions. Centralizing everything into `createSceneRig(canvas, opts)` eliminated the drift vector. It is deliberately a factory rather than a base class: a base class would need protected fields that fight the readonly-everywhere style used elsewhere, and the two scenes already keep their cameras and controls in separate classes.

## Auth-Flip Mid-Combat

A subtle lifecycle bug: NextAuth's `useSession` can flip from `"loading"` to `"authenticated"` while Phaser is in an active combat session. If `GameCanvas` had wired the `onComplete` callback directly into the Phaser mount effect, a session state change would have meant Phaser holding a stale closure that skipped `saveNow()` and `submitScore()` on mission completion.

The fix is a ref: `handleMissionComplete` is stored in `completeRef`, which Phaser receives at creation time. The ref is updated on every session change without restarting Phaser. The ARCHITECTURE.md carries an explicit "don't refactor this" warning, acknowledging that the ref pattern looks like indirection but is the correct fix for this specific lifecycle crossing.

Two related auth hardening details: the player-row upsert was rewritten from SELECT-then-INSERT (which 500'd on a concurrent first sign-in) to a single `INSERT ... ON CONFLICT (email) DO UPDATE ... RETURNING id`. And `email_verified` is checked in the NextAuth `signIn` callback rather than the `jwt` callback: returning `false` from `signIn` is the canonical NextAuth v5 reject path (redirect to the error page instead of issuing a JWT), whereas `jwt` cannot cleanly reject. The check is strict (`profile?.email_verified !== false`) so a provider that simply omits the field is still accepted; only an explicit `false` is rejected.

## The Galaxy Game Loop

The Three.js overworld loop in `GalaxyScene` clamps its delta time: `dt = Math.min((now - lastMs) / 1000, 0.05)`. The 50ms ceiling prevents a spiral-of-death when a backgrounded tab resumes and reports a multi-second frame gap, without the clamp, planet positions and camera lerps would jump arbitrarily far in a single frame. The planet update is a deliberate two-pass walk so that child-orbit bodies (a moon orbiting a planet) read the parent's *current*-frame world position rather than last-frame, avoiding a one-frame lag that compounds visibly at high orbit speeds.

## The May 2026 Save Wipe

The most consequential incident in the project's history happened on 2026-05-02. The root cause was a missing guard: three server-side cheat guards checked that specific fields did not grow too fast. None of them checked whether fields could shrink. When a buggy client posted `credits: 0, completedMissions: []`, the server validated the shape as clean, passed the growth guards (nothing grew), and overwrote a real player's progression with empty state.

The response shipped in six PRs over roughly one week:

- PR #94: `validateNoRegression` guard that rejects any POST where `completedMissions`, `unlockedPlanets`, or `playedTimeSeconds` is smaller than the stored server row. Returns HTTP 422 with `error: "save_regression"`.
- PR #96: changed the treatment of 422 from permanent (drop the snapshot) to transient (hold in localStorage, retry after the next successful `loadSave`). The original permanent-drop rule would have discarded real saves whose only problem was a timing race.
- PR #97: client-side hydration gate. `saveNow()` now refuses to POST until `loadSave` has successfully hydrated state from the server, preventing a scenario where module re-initialization posts `INITIAL_STATE` over a good server row.
- PR #98: the `save_audit` table. The wipe was diagnosed by reading Vercel logs and reverse-engineering. There was no record of what the client actually sent or what the server row looked like before overwrite. Migration `20260503000000_add_save_audit.sql` adds one row per authenticated POST attempt capturing request payload, previous snapshot, response status, error code, request IP, and user agent. The insert is best-effort: an audit write failure never blocks the actual save.
- PR #100: cross-account stamping. The localStorage save queue (`spacepotatis:pendingSave`) gained a `playerEmail` field (`INV-QUEUE-1`). A snapshot stamped for one account is invisible to a different account on the same browser. The legacy unstamped `:v1` key is silently purged on first read.
- PR #101: the `LoadResult` discriminated union. Before this, `loadSave()` returned a boolean. `false` meant either "fresh account with no save" or "server was unreachable." The silent collapse of those two states into `false` caused the splash screen to clear over `INITIAL_STATE` on network failures, making players see zero credits and locked planets and assume their data was gone. The union adds `"server-loaded" | "anon" | "no-save" | "pending-only" | "load-failed"`, and `"load-failed"` renders a full-screen `SaveLoadErrorOverlay` that prevents the splash from clearing until the user explicitly retries.

Six months later, migration `20260518150000_add_save_snapshots.sql` added the structural fix: an append-only `save_snapshots` table that receives a dual-write on every successful `POST /api/save`. The single-row OVERWRITE in `save_games` still happens for reads in v1 scope; the snapshots table is the recovery surface. The migration comment explains the future cutover: once production dual-writes validate the table, the read path switches from `save_games` to `save_snapshots`'s tail-read query.

## Guest Progress and the OAuth Reload Problem

When an anonymous player clicks "Sign in with Google," the OAuth redirect reloads the page. The in-memory `GameState` singleton resets to `INITIAL_STATE` on module re-initialization. The save queue (which requires a `playerEmail` stamp) cannot hold anonymous progress. Before the fix, clicking sign-in after earning credits and clearing missions silently wiped everything on the next load. The in-code bug name: "MENI PERUNAPROGRESS HUKKAAN" (Finnish: "the potato progress got lost"), filed 2026-04-26.

The fix is a second, orthogonal storage channel in `guestCache.ts`. `bindGuestPersistenceOnce()` subscribes to `GameState` commits and writes a versioned `GuestEnvelope` (`spacepotatis:guest-progress:v1`) to `localStorage` on every commit, but only while `getCurrentPlayerEmail() === null`. Writes are synchronous with no debounce. The rationale is explicit in the source: a debounced write opens a "data not flushed before navigation" race when the user clicks "Sign in." The OAuth redirect can leave the page before a pending `setTimeout` fires, dropping the last few seconds of progress. The comment notes the performance threshold: re-evaluate if commit rates ever climb past ~300 per mission (the point where amortized `localStorage.setItem` cost becomes user-perceptible). Current missions run ~50 commits each.

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

This is why migration `20260503010000_persist_current_solar_system.sql` exists as a separate file with a comment: "NULL on existing rows is fine. The client's `hydrate()` falls back to the first unlocked system." That single ADD COLUMN touches all eight layers and was a multi-file change.

ADR 0004 records the decision explicitly: the eight layers are not collapsed for simplicity, because each one earns its keep and collapsing them would recreate the conditions for the May 2026 wipe. Adding a single boolean field to `StateSnapshot` is an eight-file edit. The `/save-roundtrip-audit` Claude Code skill walks every `StateSnapshot` field through all eight layers and flags any that drop it silently; it runs before any commit touching the persistence sub-cluster.

## Ship Loadout Schema Migration Stack

The ship loadout went through at least four distinct serialization shapes as the weapon system evolved. The `persistence/` sub-directory has a migrator per legacy format, each with its own test file: `migrateLegacyIdArray.ts` handles the original slot-as-array-of-strings shape; `migrateNamedSlots.ts` handles the named-slots object; `migratePrimaryWeapon.ts` handles the pre-loadout single-weapon shape; `migrateNewShape.ts` handles the current instance-based format.

When the 2026-05-04 weapon catalog cull removed six weapons (`spud-missile`, `tater-net`, `tail-gunner`, `side-spitter`, `plasma-whip`, `hailstorm`), the migration pipeline faced a new problem: `buildInstance` in `helpers.ts` silently drops any instance whose id is not in the live `WEAPON_IDS` set. A player who owned one of these weapons would have it disappear from their loadout with no credit compensation. The `salvageRemovedWeapons.ts` module runs before the per-shape migrators in `hydrate()`, reads the raw legacy snapshot directly, and computes a refund of `base_cost + per_level_upgrade_costs + augment_costs` for every removed id found. The removed-weapon base-cost table in that file is explicitly marked load-bearing: once an id leaves the live catalog, this table is the only record of what the player paid. The comment states: "Don't delete entries just because a weapon stays gone."

There is also a retroactive system-unlock backfill in `hydrate()`. When `SYSTEM_UNLOCK_GATES` was introduced to gate solar system access behind mission completions, players who had already cleared the gating missions had no corresponding unlock in their save row. Rather than a one-shot migration, `hydrate()` re-derives `unlockedSolarSystems` from `completedMissions` on every load. Idempotent; already-unlocked systems are deduped via a `Set`.

## Server-Side Credit Cap Derivation

The `validateCreditsDelta` guard started as a global constant cap: one number for all players. The problem was that a balance change to a far solar system would silently loosen the cap for new players who had never reached that system. The current implementation derives caps per-request from the server's stored `completedMissions`.

The derivation: `getReachableSolarSystems(completedMissions)` walks `SYSTEM_UNLOCK_GATES` to determine which systems the player can access. `computeCreditCapsForSystems(reachableSystems)` walks every wave of every mission in those systems, takes the peak non-boss enemy `creditValue` (bosses spawn once per mission and should not drive a sustained per-second cap), and multiplies by `KILL_CADENCE_CEILING (5) × PER_SECOND_SAFETY_FACTOR (3)`. The first-clear cap adds in loot-pool `credits.max` and boss `creditValue`, multiplied by `PER_CLEAR_SAFETY_FACTOR (1.5)`.

The consequence: a 10x balance change to any enemy's `creditValue` automatically scales the corresponding cap without any code edit. A new player can only earn at tutorial rates; a tubernovae-system player gets tubernovae-tier caps. The tutorial-only floor is logged to Vercel function logs on cold start as `[saveValidation] tutorial-only caps (floor)`, so a regression after rebalance is detectable without waiting for a player report.

The guards run inside a single DB transaction with `.forUpdate()` on the previous-row SELECT (the save route's `SECURITY.md` tracks this as invariant INV-SAVE-1, closing finding SEC-013). Without the row lock, two concurrent POSTs from the same account could both validate against the same pre-write baseline, and the loser would overwrite the winner: a stale-baseline race. The `save_audit` write is deliberately placed *outside* the transaction: an audit-table outage must never roll back a real save. The credit-cap derivation also draws from the previously-stored row, never bootstrapped from the request body inside the same request (SEC-017).

One subtle data-portability fix lives in `validatePlaytimeDelta`: it coerces `updatedAt` from `Date | string` because Neon's Edge driver sometimes returns `TIMESTAMPTZ` as a string rather than a `Date`, and it fails open on an unparseable timestamp rather than rejecting a legitimate save.

## Phaser Event and Registry Safety

Phaser's native `scene.events.emit("string-name")` is compile-blind. A renamed event with one consumer left un-renamed becomes a silent drop with no error. The codebase enforces typed wrappers from day one.

`events.ts` exports a discriminated `CombatEvent` union (`playerDied | allWavesComplete | abandon`) plus `emit<E>(scene, event)` and `on<T>(scene, type, handler)` wrappers. Adding a new event requires extending the union; renaming one is a compile error everywhere.

`registry.ts` exports `REGISTRY_KEYS` and typed accessor functions (`getSummary`, `setSummary`, `getBootData`, `setBootData`). The `CombatSummary` shape travels from `CombatScene` through the Phaser registry to `GameCanvas.handleMissionComplete` and then into the `VictoryModal` React component without any `as` casts.

ADR 0006 records that the May 2026 modular audit confirmed zero string-keyed violations across the entire `phaser` module. Two events (`enemyKilled`, `waveComplete`) were emitted but had no listeners; the audit deleted both rather than leaving dead code.

The `PerkController` and `DropController` have a circular dependency at construction time: drops can grant perks, and applying a perk calls `dropController.flashPickup`. The resolution uses lazy accessors: each controller receives `() => this.otherController` closures at construction time rather than direct references, so construction order in `CombatScene.create()` does not matter.

## Web Audio Disposal

The procedural SFX engine (`sfx.ts`) has explicit disposal contracts documented as an invariant comment. The problem it prevents: in a 3-minute combat session with ~30 laser sounds per second plus explosions and hit effects, Web Audio nodes that remain connected after playback ends are GC-pinned. By mission end, thousands of detached-but-pinned nodes accumulate, holding memory and potentially degrading audio scheduling.

The contracts: every `play*` call chains through the shared `masterGain` (`this.sink`) rather than `ctx.destination` directly, so `setMuted(true)` silences all in-flight sounds in one `gain.value` assignment. Every `play*` call ends with `autoDispose(stopper, ...rest)`, which wires `stopper.onended` to disconnect every node in the chain when the scheduled stop fires. The explosion white-noise `AudioBuffer` is created once and cached, not reallocated per call.

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

The drain outcome table distinguishes five cases: 2xx (drop entry), 401 (pause the entire drain without burning attempts), 5xx or 422 `mission_not_completed` (transient, increment attempts), 400 or permanent 422 (drop with console warning so a real schema regression surfaces), and entries past 50 attempts or 30 days old (drop before issuing any HTTP request). The 401 case is specifically handled because every other entry in the queue would also 401. There is no point burning attempts on them.

The deduplication check `{missionId, score, timeSeconds}` prevents a double-enqueue from rapid double-fire of the mission-complete callback (for example, the user clicking "Continue" twice). Two clears of the same mission with different scores both enqueue legitimately.

## Vercel Hobby Tier as Architectural Constraint

The Vercel Hobby quota (100k function invocations, 100 GB-hours CPU, 100 GB egress per month) is the load-bearing constraint behind the whole rendering posture: a single uncached page shared on social media can exhaust it in hours. The non-obvious consequences worth noting here are the corner cases. The leaderboard page is the one `force-dynamic` exception to `force-static` because ISR was showing a stale loading card for up to 60 seconds after each deploy. Zod is kept out of static-page first-load bundles by moving catalog JSON validation into CI-only tests, a measured ~98 KB saving on the `/play` route, and that same 98 KB figure recurs as the justification for the lazy `import("@/lib/schemas/save")` in `sync.ts` and the structural-only (Zod-free) validators in `saveQueue` and `guestCache`. The `db.ts` Kysely setup carries a type-only workaround: `new Pool(...) as unknown as PostgresPool`, because Neon's `connect()` resolves to `void` while Kysely 0.29 expects `Promise<PostgresClient>`.

## Known Accepted Cheat Vector

ADR 0008 documents a deliberate economy hole introduced in PR #159. The sell refund changed from 50% to 100% of the player's full investment. The motivator: under the 50% rule, a free starter weapon (base cost zero) with ¢600 in upgrades sold for ¢0, because `floor(0 × 0.5) = 0`. The player's upgrade investment was trapped. With 100% refund it comes back on sale. The tradeoff is that free items granted via `grantWeapon()` or `grantAugment()` can now be converted to credits at full catalog price. This was accepted because content work was the bottleneck (a balance audit before content stabilized would tune the numbers twice), the leaderboard is a local cohort rather than a competitive surface, and the server-side credit-delta caps throttle the worst case. The same PR forced a raise to `CREDITS_DELTA_SLACK` in `saveValidation.ts`, since a player selling a fully-upgraded weapon now recovers full price at near-zero elapsed time and would otherwise trip the credit-delta guard.

---

GAPS: No CHANGELOG file was found in the repo, commit history would be required to reconstruct a fully chronological bug list. The `CombatScene.finishEarly()` boss early-finish behavior was reported by a sub-search but not confirmed line-by-line in scene source (only test scaffolding referencing `delayedCall` was directly read). The `check-schema.mjs` script internals and the `audit-readiness-check.yml` daily cron's exact query were not read in full. PR numbers cited (#94-#101, #159) come from in-code and ADR references rather than a verified PR list.
