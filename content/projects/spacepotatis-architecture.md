---
title: Spacepotatis — architecture & design
project: spacepotatis
---

# Spacepotatis — Architecture & Design

Spacepotatis is a Tyrian 2000-inspired vertical-scrolling browser game where the player flies a potato spaceship through a 3D galaxy overworld, selects planets, and fights waves of insects. It runs at [spacepotatis.vercel.app](https://spacepotatis.vercel.app) — sign-in with Google is optional (cloud saves and leaderboard), the full single-player game works without it.

## Overview and High-Level Architecture

The system is a client-heavy web application built on Next.js 16, with two game engines running in the browser and a small server-side surface for persistence.

```
Browser
  Three.js GalaxyScene (overworld) ◄─GSAP fade─► Phaser 4 CombatScene (shooter)
                        ▲
                   GameState (singleton)
                        ▲
              React shell (Next.js App Router)
              GameCanvas · MissionSelect · ShopUI
              Leaderboard · SignInButton · MuteToggle
                    │ fetch                │ fetch
                    ▼                      ▼
           /api/save (Edge)       /api/leaderboard (Edge, cached)
           /api/auth/* (Node)
                    └──── Kysely ──── @neondatabase/serverless (WS Pool)
                                      Neon Postgres
```

Only one game engine is live at a time. A GSAP-driven black overlay fades in, React unmounts the active engine (which triggers its `dispose` hook and releases GPU resources), then mounts the other. No camera-zoom transition exists yet; the fade is the only visual effect on scene switch.

The codebase is partitioned into ten named modules with a strictly acyclic dependency graph, established by a 2026-05-04 modular-architecture audit. The longest dependency chain is five hops: `ui → app → state → content → schemas → types`.

## Tech Stack and Key Choices

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 16 + React 19 | Most App Router pages are `force-static`; the leaderboard page is `force-dynamic` (per-request render, Neon fetch cached ~60s); game engines run client-only via `next/dynamic({ ssr: false })` |
| 2D combat | Phaser 4 | Established game-engine API with scene lifecycle, input, collision, and WebGL-backed rendering |
| 3D overworld | Three.js 0.184 + GSAP | Galaxy view with OrbitControls and procedural planet textures; GSAP drives the fade overlay |
| Styling | Tailwind CSS 3 | UI chrome (HUD, modals, shop) outside the game canvas |
| Database | PostgreSQL on Neon | Serverless WebSocket pool driver (`@neondatabase/serverless`) is Edge-runtime compatible |
| Query layer | Kysely 0.29 | Typed SQL builder; no ORM, no generated client, no Prisma |
| Auth | NextAuth v5 (Google OAuth only) | No password store, no brute-force surface; JWT sessions via `httpOnly` cookie |
| Validation | Zod 4 | All API request/response bodies; JSON catalog shape checked in CI tests (not at module-load runtime) |
| Deployment | Vercel Hobby tier | Cost ceiling that drove static-by-default architecture; Edge runtime on all data routes |
| Language | TypeScript strict + `noUncheckedIndexedAccess` | No `any`, no implicit nulls |

**Why not Prisma (ADR 0002).** Three constraints ruled it out: Prisma's generated engine binary does not run in the Edge runtime; it adds tens of megabytes to the deploy and noticeable cold-start latency; and it objects to hand-written migrations outside its own schema flow. Kysely provides full type safety through a hand-maintained `Database` interface in `src/lib/db.ts` with a small table surface.

**Why static-by-default (ADR 0001).** Vercel Hobby limits are 100k function invocations, 100 GB-hours of CPU, and 100 GB of egress per month. A single uncached endpoint featured on social media can exhaust a month's budget in hours. Most pages export `dynamic = "force-static"`. The leaderboard page is the exception: it uses `force-dynamic` (per-request render) because ISR was showing a stale loading card for up to 60 seconds after each deploy. Function invocations are bounded in two ways: the four API routes (`/api/save`, `/api/leaderboard`, `/api/handle`, `/api/auth/*`) consume invocations directly, and so does the leaderboard page — whose Neon fetch is wrapped in `unstable_cache` with 60-second revalidation so at most one DB roundtrip per 60-second window reaches Neon. The leaderboard API cache flushes via `revalidateTag` on each score POST.

**Why content as JSON (ADR 0005).** Balance values (weapon stats, enemy HP, credit rewards, perk weights) live in `src/game/data/*.json`. Loading them via `JSON.parse + Zod.parse` at module load measured at ~98 KB added to static-page first-load JS. The game instead does one `as` cast at accessor call sites and runs Zod validation only in CI (`jsonSchemaValidation.test.ts` on every push). The production bundle stays Zod-free for catalog reads.

## Data Model and Persistence

Tables are namespaced under `spacepotatis.*` (the Neon DB is shared with other services). All migrations are forward-only `.sql` files in `db/migrations/`.

```
spacepotatis.players ──┬── save_games (UNIQUE player_id, slot)
                       ├── leaderboard (player_id FK, mission_id)
                       └── save_audit  (one row per POST /api/save attempt)
                           save_snapshots (append-only history, added 2026-05-18)
```

**`save_games`** holds one row per `(player_id, slot)` with an OVERWRITE on each save. The schema stores `credits`, `ship_config (JSONB)`, `completed_missions (TEXT[])`, `unlocked_planets (TEXT[])`, `played_time_seconds`, and `updated_at`.

**`save_snapshots`** (migration 2026-05-18) is an append-only history table: every successful `POST /api/save` inserts one row here alongside the destructive UPSERT into `save_games`. The read path still goes through `save_games` (v1 scope); cutover of reads to `save_snapshots` is the structural fix for the 2026-05-02 wipe, deferred until production dual-write data validates the table.

**`save_audit`** records every authenticated `POST /api/save` attempt (success, rejection, or server error) with request payload, previous snapshot, response status, request IP, and user agent. Audit failure never blocks a save — it is a forensics table, not on the critical path.

**`leaderboard`** has a `leaderboard_mission_score_idx` on `(mission_id, score DESC, created_at DESC)` for constant-time top-N reads with deterministic tie-break.

Foreign keys use `ON DELETE CASCADE`, making `DELETE FROM spacepotatis.players WHERE id = $1` a clean GDPR right-to-erasure primitive.

### Save round-trip (eight layers)

The save path touches eight distinct layers, each capable of silently dropping a field. This was the root cause of the May 2026 incident (see below). The layers are:

1. `StateSnapshot` interface (`src/game/state/persistence.ts`)
2. `toSnapshot()` serializer
3. `SavePayloadSchema` (Zod, `src/lib/schemas/save.ts`)
4. `/api/save` POST handler (Edge runtime, writes both `save_games` and `save_audit`)
5. DB column
6. Migration (`db/migrations/*.sql`)
7. `/api/save` GET handler + `RemoteSaveSchema` (client-side response parser)
8. `sync.loadSave → hydrate()` deserializer

The `/save-roundtrip-audit` Claude Code skill walks every `StateSnapshot` field through all eight layers before any commit touching the persistence sub-cluster.

## Auth and Security Posture

**Authentication.** Google OAuth only via NextAuth v5. JWT sessions encrypted with `AUTH_SECRET`, stored in an `httpOnly` cookie. The `signIn` callback rejects profiles where `email_verified === false`. No password store means no brute-force surface.

**Authorization.** No role model — every authenticated user has identical access. The only trust boundary is authenticated vs anonymous. All authenticated routes derive `playerId` from the session email via `upsertPlayerId(email, ...)`, so a session cannot read or write rows belonging to another account. Path parameters are not used for identity.

**Server-side cheat guards** in `src/lib/saveValidation.ts` enforce gameplay invariants on every `POST /api/save`:

| Guard | Trigger | Response |
|---|---|---|
| `validateMissionGraph` | `completedMissions` entries without a satisfied `requires` chain | 422 `mission_graph_invalid` |
| `validateNoRegression` | `completedMissions`, `unlockedPlanets`, or `playedTimeSeconds` smaller than the stored row | 422 `save_regression` |
| `validatePlaytimeDelta` | Playtime grew faster than wall-clock elapsed since `updated_at` | 422 `playtime_delta_invalid` |
| `validateCreditsDelta` | Credits exceed a per-player progression-aware cap derived from server-stored `completedMissions` | 422 `credits_delta_invalid` |

All four validators run inside a single transaction with `FOR UPDATE` on the previous row, eliminating TOCTOU stale-baseline races. The credit cap is derived from the player's server-stored `completedMissions`, not from the request body, so a tampered payload cannot bootstrap a higher cap within the same request.

**Cheat guards are observation-first, not punitive (ADR 0003).** A 422 rejection is treated as transient by the client-side save queue: the snapshot is held in localStorage and retried after the next successful `loadSave` hydration. Guards reject the write, not the player. The `save_audit` table is forensic only — no automated action triggers off it.

**Input validation.** Every POST route parses via Zod schema before any DB I/O. Array fields are bounded (`.max(50)` on weapon inventory, `.max(200)` on `seenStoryEntries`) to prevent memory amplification. All queries go through Kysely's typed builder — no string-concatenated SQL.

**Security headers.** CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`. Cookies use `__Secure-`/`__Host-` prefixes.

**Supply-chain hardening.** GitHub Actions pins to commit SHAs. Dependabot watches the dependency surface. Workflows declare minimum permissions. `npm ci` enforces the committed lockfile. The `husky` pre-commit hook uses `npx --no` to block auto-downloading packages.

## State Management

No Redux, Zustand, or React Context is used. A module-level singleton called `GameState` holds in-memory truth during a session. It was split into four cohesive files during the 2026-04-27 audit:

- **`stateCore.ts`** — the singleton shape, `getState`, `subscribe`, `commit`, non-ship mutators, and the `SYSTEM_UNLOCK_GATES` map.
- **`shipMutators.ts`** — all ship-loadout mutators (`equipWeapon`, `buyAugment`, etc.).
- **`persistence.ts`** — `StateSnapshot`, `toSnapshot`, `hydrate`, and per-shape migrators (extracted into `persistence/` sub-directory, each with its own test file).
- **`sync.ts`** — `loadSave`, `saveNow`, `submitScore`; all wire payloads validated by Zod; failures degrade silently so anonymous play keeps working.

React components read state via `useSyncExternalStore` from `useGameState.ts`. Phaser and Three.js scenes access `GameState` directly, since they run outside React's render tree.

### Score and save durability queues

Two localStorage-backed queues prevent lost data across tab closes and network failures:

- **Score queue** (`spacepotatis:scoreQueue:v1`) — durably stores victories for eventual leaderboard delivery. Scores are enqueued before any network I/O. The queue drains on: authenticated mount, `visibilitychange → visible`, and `window.online`. Entries are retired after 50 failed attempts or 30 days.

- **Save queue** (`spacepotatis:pendingSave:v2`) — holds at most one pending snapshot, stamped with `playerEmail` to prevent cross-account replay. A snapshot is enqueued before the POST, so a tab close mid-flight cannot lose progression. The `:v2` key replaced the unstamped `:v1` shape; stale `:v1` blobs are silently purged on read.

## Audio and Voice Subsystem

The `audio` module is one of the ten named modules in the ADR 0007 dependency graph. It is a tier-1 leaf: it depends only on `types`, and nothing at the `types` level or below depends on it. This makes it the lowest-risk module to extract and the first candidate for hard boundary enforcement.

**Content origin.** Every voice line in the game is generated by Mikko's [AudiobookMaker](https://github.com/MikkoNumminen/AudiobookMaker) — a Chatterbox-TTS pipeline that runs locally — and shipped as MP3. Music beds are written in [Strudel](https://strudel.cc) (a live-coding music tool) and exported as OGG from the companion [strudel-patterns](https://github.com/MikkoNumminen/strudel-patterns) repo. One narrator persona — **Grandma** — voices every spoken line across all surfaces for cross-surface consistency.

**AudioBus.** `src/game/audio/AudioBus.ts` is the single source of truth for mute state. It tracks a master mute flag and a per-category flag across three categories (`music`, `voice`, `sfx`), computes effective mute as `master || category`, and fans out `setMuted(boolean)` to every registered engine when the effective mute for a category changes. Engines self-register via `audioBus.register(category, this)` in their constructor. UI flips state via `audioBus.setMasterMuted` / `setCategoryMuted`. The previous design was a `setAllMuted(muted)` hub that lazily imported sibling engines — it was category-blind and raced rapid toggles.

**Mute is session-only.** The earlier `localStorage["spacepotatis:muted"]` persistence was deliberately removed (PR #70): stale entries silenced the page on cold load with no obvious recovery. Each session starts unmuted; toggling persists across in-app navigation but not across reloads.

**Autoplay correctness layer.** `src/game/audio/userActivation.ts` is a shared "first gesture" queue. Browsers block `HTMLAudioElement.play()` until the document has received a user gesture. Music engines recover via a per-engine watchdog (every 2 s it retries paused-but-armed elements), but voice-only engines have no such retry. `onUserActivation(cb)` runs `cb` immediately if the user has already activated, otherwise queues it for the first `pointerdown` / `keydown` / `touchstart` event. This is the mechanism that prevents Grandma's voice from being silently stranded after a cold page load.

**Nine bus-registered engines.** The module barrel (`src/game/audio/index.ts`) exports one bus and nine engine singletons that each self-register with the bus via `audioBus.register(category, this)` in their constructor: `menuMusic`, `combatMusic`, `shopMusic` (category `music`); `storyAudio`, `storyLogAudio` (also category `music` — bed and voice fade together under a single category mapping); `menuBriefingAudio`, `itemSfx`, `leaderboardAudio` (category `voice`); and `sfx` (category `sfx`, procedural Web Audio oscillators — no asset files). `uiCues` is not a registered engine singleton: it is a helper module that exposes a `playUiCue(id)` function that delegates directly to `storyAudio`, reusing its single-voice slot. Combat SFX uses Web Audio with strict disposal contracts: every sound chain terminates at a shared master `GainNode` so `setMuted(true)` silences all in-flight sounds in one assignment, and every `play*` call wires `autoDispose` so chains disconnect on `ended` (preventing thousands of detached-but-pinned nodes in a long combat session).

## Key Design Decisions and Trade-offs

**ADR 0001 — Static-by-default.** Most pages are statically exported (`force-static`). The leaderboard page is `force-dynamic` (per-request render with a cached Neon fetch). The four API routes and the leaderboard page consume Function invocations; the budget constraint was a Vercel Hobby ceiling that shaped the entire architecture.

**ADR 0002 — Kysely + raw SQL migrations, no Prisma.** Edge-runtime incompatibility, bundle size, and schema-drift risk drove the rejection of Prisma.

**ADR 0003 — Anti-cheat is observation-first.** Cheat-guard rejections are HTTP 422 and treated as transient retries, not player bans. The audit log is the enforcement record.

**ADR 0004 — Eight-layer save round-trip, by design.** Each layer earns its keep. Collapsing them would recreate the conditions for the May 2026 wipe. A dedicated Claude Code skill (`/save-roundtrip-audit`) walks all eight layers before any persistence-touching commit.

**ADR 0005 — Game balance as JSON.** All tunable values live in `src/game/data/*.json`. Zod validation happens only in CI, saving ~98 KB from static-page first-load JS bundles.

**ADR 0006 — Typed Phaser event bus and registry.** `scene.events.emit("string-name")` and `game.registry.set("string-key")` are forbidden. A discriminated `CombatEvent` union in `events.ts` and typed accessors in `registry.ts` make event typos compile errors.

**ADR 0007 — Ten-module acyclic dependency graph.** Established by a 2026-05-04 audit. The graph prevents god-file creep and reduces per-task agent context. Phase 3 (mechanical extraction to hard module boundaries) is gated behind explicit user approval.

**ADR 0008 — Accepting a known sell-rate cheat vector.** The 100% sell-refund rule introduced in PR #159 allows free granted items to be converted to credits at full catalog value. This was accepted because: player-experience benefit is real, the leaderboard is a local cohort (not competitive), and server-side credit-delta caps throttle the worst case. A balance audit is scheduled once content work stabilises.

## Testing Strategy

**Framework.** Vitest 4, running in a Node environment. Test files in `src/**/*.test.ts`, `scripts/**/*.test.mjs`, and `tests/**/*.test.ts`.

**Coverage.** Collected via V8. Three.js scenes, Phaser scenes and entities, and React lifecycle hooks are excluded from coverage because they require a live WebGL context, a live Phaser game instance, or a React renderer, respectively.

**Notable test types.**

- **JSON schema validation tests** (`src/game/data/__tests__/jsonSchemaValidation.test.ts`) — run the Zod schemas in `src/lib/schemas/` against every balance JSON file on every push. These are the drift gate that makes the "no Zod at module load" strategy safe.
- **Per-shape persistence migrators** — each legacy save format has its own `*.test.ts` under `src/game/state/persistence/`, covering the shape-detection and migration logic independently.
- **Security regression tests** (`tests/security/`) — run separately as a named CI step so a regression surfaces as a clearly-labelled failed check rather than buried in general test output.
- **Cheat-guard unit tests** — `src/lib/saveValidation.ts` guards are pure functions with their own test suite.
- **Save-load logic tests** — `useCloudSaveSyncLogic.ts` decision helpers (`loadResultToState`, `decideFetch`) are extracted to pure functions and covered by vitest without a React renderer.

The README reports approximately 1,170 tests on every CI run.

**Pre-commit hook.** Husky runs lint-staged + typecheck in roughly 5 seconds on commit. Full vitest suite runs on push, not commit, to keep the local cycle fast.

## Infrastructure, Deployment, and CI/CD

**Deployment target.** Vercel Hobby tier. The `vercel.json` only sets `ignoreCommand` (a script that skips deploys for markdown-only changes). Vercel handles HTTPS, HSTS, and edge caching.

**CI pipeline** (`ci.yml`, triggered on push to `master` and all PRs; excludes markdown and `.claude/` changes):

1. Typecheck (`tsc --noEmit`)
2. Lint (ESLint flat config)
3. Test (`vitest run`)
4. Security regression tests (dedicated vitest run on `tests/security/`)
5. Build (`next build`), with first-load JS per route surfaced in the GitHub Actions summary
6. Coverage (`vitest run --coverage`), uploaded as an artifact retained 14 days

All Actions steps pin to commit SHAs. Concurrency is configured to cancel in-progress runs on the same ref.

**Observability.** Vercel function logs capture cheat-guard violations (structured log lines with player UUID and guard name). The `save_audit` table records every `POST /api/save` attempt. A daily GitHub Actions cron (`audit-readiness-check.yml`) queries the `save_audit` table and opens a `save-architecture-ready` issue when the table has accumulated enough data to inform the append-only `save_snapshots` migration path — eliminating the guesswork from "when should we cut over."

**Database migrations.** Forward-only `.sql` files in `db/migrations/`, applied via `scripts/migrate.mjs`. A HARD RULE in `CLAUDE.md` requires that no PR adding a migration is considered done until the migration is applied to production. `scripts/check-schema.mjs` compares the live schema against the migration files and is the first tool to run when investigating a 500 from `/api/save`.

## Notable Engineering Challenges

**The May 2026 save wipe.** Three anti-cheat guards protected against fields growing too fast. None checked for shrinkage. When a buggy client posted `credits=0, completedMissions=[]`, the server happily overwrote a real save. The response: ship `validateNoRegression` and a client-side hydration gate within hours to stop the bleed, then add the `save_audit` table for forensics, then add the daily readiness-check cron, then land the `save_snapshots` append-only table as the structural fix. The incident post-mortem and operator runbook are in `docs/INCIDENT_RUNBOOK.md`.

**Auth-flip during active combat.** If a sign-in event fires while Phaser is running (`useSession` flips `"loading"` → `"authenticated"`), re-instantiating Phaser to pick up the new closure would tear down the active game. The fix: the Phaser-mount effect captures `handleMissionComplete` through a `completeRef`, so session changes update the ref without triggering a Phaser restart. This invariant is documented explicitly in `ARCHITECTURE.md` with a "don't refactor this" warning.

**Guest/anonymous progress persistence.** When an anonymous player clicks "Sign in with Google", the OAuth redirect reloads the page. The in-memory `GameState` resets to `INITIAL_STATE` on module re-init, and the save queue (which requires a `playerEmail` stamp on every snapshot — `INV-QUEUE-1`) can never persist unauthenticated state. Before the fix, clicking sign-in after earning credits silently wiped the progress on the next load (the "MENI PERUNAPROGRESS HUKKAAN" bug, 2026-04-26).

The fix is a second, orthogonal storage channel in `src/game/state/guestCache.ts`. `bindGuestPersistenceOnce()` subscribes to `GameState` commits and writes a `GuestEnvelope` (versioned, `spacepotatis:guest-progress:v1`) to `localStorage` on every commit — but only while `getCurrentPlayerEmail() === null`. Writes are synchronous (no debounce) so an in-flight progress commit is always captured before a navigation leaves the page. The claim path fires exactly once, in `sync.ts`'s `no-save` branch: the only code path that knows the cloud has no row to overwrite. After claim, the cache is cleared.

Three correctness invariants close the security and consistency boundaries: (1) the cache is never claimed when the cloud already has a save; (2) the writer only runs while the user is anonymous — authenticated commits go through the normal cloud save path; (3) `stateCore.resetState()` is called on sign-out, which resets in-memory `GameState` to `INITIAL_STATE` before `setCurrentPlayerEmail(null)` re-enables the writer, preventing the just-signed-out user's memory from being re-serialized as guest progress. The trust boundary for the claim flow is `/api/save`, not this module — `localStorage` is per-origin and the structural validator on read passes anything with the right top-level keys; the downstream POST goes through `SavePayloadSchema` and `saveValidation.ts` on the server.

**Cross-account save leak prevention.** The localStorage save queue now stamps every pending snapshot with `playerEmail`. On sign-in, `setCurrentPlayerEmail(email)` resets `hydrationCompleted` and the queue refuses to flush any snapshot whose stamp does not match the current account. The legacy unstamped `:v1` key is silently dropped on read.

**Silent save-load failure masquerade.** Before PR #101, a `false` return from `loadSave` could mean either "fresh account" or "server unreachable." When the server was unreachable, the client silently fell back to `INITIAL_STATE`, the splash cleared, and the player saw zero credits and locked planets. The fix: a `LoadResult` discriminated union (`server-loaded | anon | no-save | pending-only | load-failed`) and a `SaveLoadErrorOverlay` component that renders a full-screen alert dialog on `load-failed`, preventing the splash from clearing over bad state.

## Scale and Performance Considerations

**Static-by-default limits function invocations.** Marketing-traffic spikes hit the Vercel edge cache, not the function quota. Most pages are `force-static` and consume no invocations. The leaderboard page is `force-dynamic` and does consume invocations, bounded by a cached Neon fetch (~60s revalidation) so at most one DB roundtrip per window reaches Neon. The four API routes also consume invocations.

**Edge runtime on all data routes.** `/api/save` and `/api/leaderboard` run on the Edge runtime with the WebSocket-backed Neon pool driver, minimising cold-start latency and per-invocation cost.

**Leaderboard caching.** `GET /api/leaderboard` is cached via `unstable_cache` with a 60-second revalidation. `POST /api/leaderboard` calls `revalidateTag('leaderboard')` so the cache self-flushes without a polling loop.

**Bundle size.** Phaser and Three.js are dynamically imported inside `GameCanvas` and split into their own chunks. Zod is excluded from static-page first-load bundles by moving catalog validation to CI-only tests. The documented target is under 800 KB gzipped for the `/play` route at MVP; first-load JS per route is surfaced in the CI build summary on every run.

**Procedural graphics.** Every Phaser sprite is generated programmatically in `BootScene.generateTextures()` using `Phaser.GameObjects.Graphics`. No PNG assets are preloaded. This eliminates the asset-preload phase entirely and keeps the initial load latency low.

**Galaxy starfield.** Currently 2,000 `THREE.Points`. The architecture notes this as a potential bottleneck on low-end GPUs and recommends measuring before switching to a single full-sphere shader.
