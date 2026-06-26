// Anonymous-progress cache.
//
// Why this exists:
//
//   - The per-account `saveQueue` deliberately rejects stamp-less snapshots
//     (see saveQueue.ts header — non-empty `playerEmail` is INV-QUEUE-1).
//     That guarantee closes a real cross-account leak vector and must NOT
//     be relaxed.
//
//   - But it leaves a hole: a user playing as guest, then clicking "Sign in
//     with Google", goes through a full OAuth page reload. The in-memory
//     `GameState` resets to `INITIAL_STATE` on module re-init, the
//     saveQueue could never persist the anonymous progress, and the
//     freshly-signed-in account starts with zero credits even though the
//     player just earned 100. That's the "MENI PERUNAPROGRESS HUKKAAN" bug
//     reported on 2026-04-26.
//
// The fix is a SECOND, orthogonal storage channel:
//
//   - Storage key: `STORAGE_KEY` (distinct from saveQueue's per-account
//     queue — these never share state).
//   - Writer: subscribes to GameState commits. Writes only when the user
//     is anonymous (`getCurrentPlayerEmail() === null`). Synchronous —
//     see "Why no debounce?" below.
//   - Reader / claim: triggered exactly once, in sync.ts's `no-save`
//     branch — the only code path that knows the cloud has no row to
//     overwrite.
//   - Cross-tab sync: a `storage` event listener mirrors writes from
//     other tabs into this tab's GameState so two anonymous tabs don't
//     silently overwrite each other.
//
// Strict invariants:
//
//   1. We NEVER overwrite an existing cloud save. Claim only fires when
//      `loadSave` returns `kind: "no-save"` (literal 200 + null body).
//   2. The writer only writes while anonymous — authenticated commits go
//      through `saveNow` / saveQueue / cloud, never this cache.
//   3. The cache is cleared after consume (claim), and on sign-out (the
//      "scrub this device" gesture), and on a successful server-loaded
//      result (cloud is now this user's source of truth — guest progress
//      from a prior session is no longer relevant for this account).
//   4. Validation on read is structural only — Zod stays out of the hot
//      bundle path. The writer is the only producer; we trust its output
//      and rely on `hydrate()`'s missing-field tolerance for forward-compat.
//
// THE TRUST BOUNDARY for the claim flow is `/api/save`, NOT this module.
// localStorage is per-origin so anyone with the same browser can edit it
// via DevTools, and our structural-only validator on read (`isEnvelopeShape`)
// will pass anything with the right top-level keys. The downstream POST
// goes through SavePayloadSchema + saveValidation.ts on the server, which
// is where bad data is actually rejected. Treat this module as a UX
// affordance, never as a security guard.
//
// Why no debounce?
//
//   The writer fires on every GameState commit — typically ~50 per mission
//   (kills, mission-complete, etc.). Each `localStorage.setItem` is ~1 ms,
//   so total amortized cost is ~50 ms across a 30-minute mission. We
//   considered coalescing via `setTimeout`, but a debounced write opens a
//   "data not flushed before navigation" race the synchronous version
//   doesn't have: when the user clicks "Sign in with Google", the OAuth
//   redirect can leave the page before a pending timer fires, leaking the
//   last few seconds of progress. With synchronous writes, the moment any
//   commit returns, the cache reflects the freshest snapshot. Re-evaluate
//   if commit rates ever climb past ~300/mission (roughly the point where
//   amortized localStorage cost becomes user-perceptible).

"use client";

import { readAuthCache } from "@/lib/authCache";
import { subscribe } from "./stateCore";
import { hydrate, toSnapshot, type StateSnapshot } from "./persistence";
import { getCurrentPlayerEmail } from "./syncCache";

// `:v1` suffix in the key matches the convention used by saveQueue's
// `spacepotatis:pendingSave:v2`. Versioning the key (in addition to the
// inner `v: 1` field) means a future shape break can nuke a whole version
// atomically by removing the suffixed key, without risking a parser that
// trips over a half-migrated envelope.
const STORAGE_KEY = "spacepotatis:guest-progress:v1";
const SCHEMA_VERSION = 1;

interface GuestEnvelope {
  readonly v: number;
  readonly savedAtMs: number;
  readonly snapshot: StateSnapshot;
}

function isEnvelopeShape(value: unknown): value is GuestEnvelope {
  if (value === null || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (typeof e.v !== "number") return false;
  if (typeof e.savedAtMs !== "number") return false;
  if (e.snapshot === null || typeof e.snapshot !== "object") return false;
  return true;
}

// Synchronous, no-throw read. Returns null on absent / unparseable / version
// mismatch. The caller (claim, boot recovery) treats null as "no guest
// progress" — never as a failure to surface.
export function readGuestSnapshot(): StateSnapshot | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEnvelopeShape(parsed)) return null;
  if (parsed.v !== SCHEMA_VERSION) return null;
  // We trust the inner shape because the writer is the only producer; the
  // hydrate() consumer downstream falls back to INITIAL_STATE for any
  // missing/unrecognized fields, so a partial snapshot can't corrupt state.
  // The actual trust boundary is /api/save; see the module header.
  return parsed.snapshot;
}

// Set once per page lifetime when the first localStorage write fails.
// Prevents log spam when quota errors persist (e.g. mobile Safari, private
// browsing) while still leaving a single breadcrumb in production logs so
// "my progress vanished after sign-in" reports are debuggable.
let storageWarnedThisSession = false;

export function writeGuestSnapshot(snapshot: StateSnapshot): void {
  if (typeof window === "undefined") return;
  const envelope: GuestEnvelope = {
    v: SCHEMA_VERSION,
    savedAtMs: Date.now(),
    snapshot
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    // Quota / private mode / disk full. The cache is a UX affordance,
    // never load-bearing for correctness, so we never crash. But we do
    // warn ONCE per page lifetime so the failure leaves a trail in
    // production console logs — silent-forever made user reports of
    // "my progress disappeared after sign-in" undebuggable.
    if (!storageWarnedThisSession) {
      storageWarnedThisSession = true;
      console.warn(
        "guestCache: localStorage write failed (quota / private mode?)",
        err
      );
    }
  }
}

export function clearGuestSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same rationale as write — never let storage failures crash a flow.
  }
}

// ---------------------------------------------------------------------------
// Binding lifecycle.
//
// Reference-counted: every call increments refs and only the LAST cleanup
// actually unsubscribes. This handles both the production case (single
// caller — GuestProgressMount) and the StrictMode dev double-mount cycle
// without leaking the writer or losing in-flight progress on rebind.
//
// Boot recovery runs at most once per page lifetime — gated by its own
// flag so a remount can't wipe in-memory progress that was earned between
// the first mount and the remount.
// ---------------------------------------------------------------------------

let activeRefs = 0;
let activeUnsubscribe: (() => void) | null = null;
let storageListener: ((e: StorageEvent) => void) | null = null;
let bootRecoveryDone = false;

// Suppresses the writer for the duration of a cross-tab hydrate. Without
// this, hydrating from a `storage` event would commit, the writer would
// fire, write a fresh envelope (new savedAtMs), the OTHER tab would
// receive its own storage event, hydrate again, write again — infinite
// ping-pong as savedAtMs advances each cycle.
let suppressWriterDuringRemoteHydrate = false;

function attemptBootRecovery(): boolean {
  if (bootRecoveryDone) return false;
  bootRecoveryDone = true;
  if (typeof window === "undefined") return false;
  if (getCurrentPlayerEmail() !== null) return false;
  // Don't auto-hydrate if the auth cache says this is a returning
  // authenticated user — they'd briefly see anon progress before
  // server-loaded overwrites it. Delegate to authCache.readAuthCache so
  // we're not coupled to its serialization format.
  const authCached = readAuthCache();
  if (authCached?.status === "authenticated") return false;
  const cached = readGuestSnapshot();
  if (!cached) return false;
  hydrate(cached);
  return true;
}

// Idempotent boot-side wiring. Reference-counted: each call returns its
// own cleanup, and only the last cleanup actually tears the writer down.
// Boot recovery runs once per page lifetime (not once per call).
//
// Production: GuestProgressMount calls this exactly once on mount.
// Dev (StrictMode): React calls mount → cleanup → remount → cleanup at
// hot reload boundaries. Refs go 1 → 0 → 1 → 0; the writer is correctly
// reattached and detached around each cycle. Boot recovery only runs the
// first time, so in-memory progress earned between mount cycles isn't
// clobbered by re-reading a stale localStorage snapshot.
export function bindGuestPersistenceOnce(): () => void {
  activeRefs++;

  // Shared cleanup: every caller (first binder or later) gets THIS closure.
  // The teardown logic checks ref count + activeUnsubscribe at call time, so
  // whichever cleanup runs LAST is the one that actually detaches. If the
  // cleanups were asymmetric (first binder owns teardown, others just
  // decrement), the first binder calling its cleanup early would leave the
  // teardown closure orphaned and the writer would leak past the final unbind.
  //
  // INVARIANT: `activeUnsubscribe` is set EXACTLY ONCE per binding cycle —
  // when activeRefs transitions 0 → 1 — and nulled when refs return to 0.
  // The closure relies on this monotonicity. Do NOT reassign
  // `activeUnsubscribe` mid-cycle (e.g. via a hypothetical "rebind with new
  // options" path) without rethinking the ref-count bookkeeping; an
  // overlapping reassign would silently leak the previous teardown.
  const decrementAndMaybeUnsub = (): void => {
    activeRefs = Math.max(0, activeRefs - 1);
    if (activeRefs === 0 && activeUnsubscribe !== null) {
      const unsub = activeUnsubscribe;
      activeUnsubscribe = null;
      unsub();
    }
  };

  if (activeRefs > 1) {
    // Already bound by an earlier caller. The subscription is alive; this
    // caller just rides on the existing one.
    return decrementAndMaybeUnsub;
  }

  // First binder. Run boot recovery and attach all the listeners.
  attemptBootRecovery();

  const unsubFromState = subscribe(() => {
    if (typeof window === "undefined") return;
    if (suppressWriterDuringRemoteHydrate) return;
    if (getCurrentPlayerEmail() !== null) return;
    writeGuestSnapshot(toSnapshot());
  });

  // Cross-tab sync via the `storage` event. Test environments install a
  // plain-object `window` shim that lacks addEventListener; bail out
  // cleanly in that case rather than throwing — the storage listener is a
  // production-only nicety, not a correctness requirement (the same-tab
  // writer still works without it).
  const canListen = typeof window.addEventListener === "function";
  if (canListen) {
    storageListener = (e: StorageEvent) => {
      // Storage events fire across tabs (NOT in the originating tab). We
      // mirror sibling-tab writes into our in-memory GameState so two
      // anonymous tabs stay coherent.
      //
      // We treat the event as ADVISORY — a "the cache may have changed"
      // signal — and re-read storage via readGuestSnapshot rather than
      // parsing `e.newValue` directly. Two reasons:
      //   1. Storage events can be dispatched by browser extensions or
      //      other JS on the page; the `newValue` they carry is untrusted.
      //      readGuestSnapshot runs the structural validator, so a hostile
      //      `newValue` that fakes the right key but bogus content gets
      //      rejected on parse.
      //   2. If the cache was further mutated between dispatch and the
      //      handler firing (multi-tab burst), `e.newValue` is stale.
      //      Storage is the single source of truth — re-read it.
      if (e.key !== STORAGE_KEY) return;
      if (getCurrentPlayerEmail() !== null) return; // not our concern once authenticated
      if (e.newValue === null) {
        // Sibling tab cleared the cache — typically because it just signed
        // in and consumed the snapshot. Don't overwrite our in-memory state
        // back to INITIAL; just leave it. The next legitimate write here
        // will repopulate the cache.
        return;
      }
      const fresh = readGuestSnapshot();
      if (!fresh) return;
      suppressWriterDuringRemoteHydrate = true;
      try {
        hydrate(fresh);
      } catch (err) {
        // A sibling tab wrote an envelope that passes our structural
        // validator but trips up `migrateShip` (or any future field-level
        // hydration check). The exception would otherwise escape the event
        // listener and surface as "Uncaught error in event handler" in
        // production console logs. Swallow + warn — our in-memory state
        // is unaffected because hydrate is atomic (commits at the end), so
        // skipping is the safe outcome.
        console.warn("guestCache: cross-tab hydrate failed; ignoring storage event", err);
      } finally {
        suppressWriterDuringRemoteHydrate = false;
      }
    };
    window.addEventListener("storage", storageListener);
  }

  activeUnsubscribe = () => {
    unsubFromState();
    if (storageListener && typeof window.removeEventListener === "function") {
      window.removeEventListener("storage", storageListener);
    }
    storageListener = null;
  };

  return decrementAndMaybeUnsub;
}

// Test-only — reset the binding flags and any active subscription so a
// fresh test case can rebind without leaking listeners from a previous
// case. Production calls bindGuestPersistenceOnce once per page load and
// never explicitly unbinds outside StrictMode tear-downs.
export function resetGuestPersistenceForTests(): void {
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }
  activeRefs = 0;
  bootRecoveryDone = false;
  suppressWriterDuringRemoteHydrate = false;
  storageWarnedThisSession = false;
}
