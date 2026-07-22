# ADR 0013 — Client-side routing (Astro ClientRouter) with a persisted audio element

**Status:** accepted
**Date:** 2026-07-23
**Decided by:** repo owner

## Context

The sound toggle reset to _off_ on every view change. The site was a full-reload
MPA: each internal link ran a custom canvas dissolve
(`src/lib/transitions/pageTransition.ts`) that intercepted the click and
hard-navigated via `window.location.href`. That destroyed the two `<audio>`
decks in `BackgroundAudio.astro`, whose script then re-ran on the new page and
forced `setState('off')` — the choice was never persisted, by design.

The requirement is that sound be a **sticky, site-wide preference** and that the
music play **continuously** across views. A full reload always tears the audio
element down, so localStorage-plus-resume can only ever restart it (subject to
autoplay policy, with an audible gap). Genuine continuity requires the document —
and the audio element inside it — to _survive_ navigation, i.e. client-side
routing.

## Decision

Adopt Astro **`<ClientRouter />`** (view transitions / client-side routing) in
`src/layouts/BaseLayout.astro`, and mark the `.bg-audio` wrapper
**`transition:persist`** so both decks and the crossfade state survive every
navigation. The bespoke particle-dissolve transition (753 lines) is deleted in
favour of Astro's built-in view-transition animation.

Under `ClientRouter`, a bundled module `<script>` runs once per session and
`DOMContentLoaded` / `beforeunload` no longer fire per navigation. So every page
enhancement is routed through a new lifecycle helper,
**`src/lib/lifecycle.ts` → `onRoute(shouldMount, mount)`**:

- mount on `astro:page-load` when the route's marker element is present,
- dispose on `astro:before-swap`,
- a synchronous `mounted` flag makes a single arrival idempotent (the deferred
  module script's registration mount and the trailing `astro:page-load` would
  otherwise both fire — and for an async mount, `current` isn't set until the
  promise resolves, so a `current`-keyed guard would double-mount),
- a generation token disposes a late-arriving async mount that resolves after the
  page was already swapped away.

The two WebGL scenes release their GL context (`renderer.forceContextLoss()`) on
the client-side-swap teardown only. bfcache is deliberately left alone: a
restored page resumes its frozen JS rather than re-mounting (see the rejected
alternative below).

## Considered alternatives

- **Persist the choice in `localStorage` and resume on load; stay an MPA.**
  Rejected: a full reload destroys the audio element, so playback can only
  _restart_, gated by the browser autoplay policy and with a gap at each
  navigation — not the continuous playback required.
- **Hold the audio in a persistent iframe/popup.** Rejected: hacky, poor UX, and
  it fixes only audio, not the general "client state resets on navigation"
  problem the lifecycle rewrite also addresses.
- **Keep the custom canvas dissolve, drive it from the ClientRouter lifecycle.**
  Rejected: its capture-phase click interceptor plus `window.location.href` _is_
  a hard navigation, fundamentally incompatible with client-side routing;
  reconciling the two was the highest-risk part of the migration, and the owner
  chose the simpler built-in view-transition (accepting the loss of the
  particle-dissolve + per-destination glyph).
- **Have `onRoute` own the bfcache cycle (blanket `pagehide`→dispose /
  `pageshow`→mount).** Rejected after review: re-running every mount on a bfcache
  restore renders a second copy of append-render output (the terminals) over the
  DOM bfcache preserved, and re-inits a WebGL canvas whose context was
  force-lost on freeze (blank scene). Instead, a bfcache-restored page resumes
  its frozen JS, and the one enhancement that must survive a freeze — the mobile
  chat wiring in `src/components/contact/MobileContactCard.astro` — does so by
  not aborting its controller on `pagehide`, so its listeners stay attached
  across freeze/restore.

## Consequences

- Sound persists across every view, the music bed is continuous, and the toggle
  is a sticky site-wide preference. The build output stays **fully static (ADR
  0002)** — `ClientRouter` is a client runtime, not SSR.
- **New contract for client-side code:** a page's `<script>` runs once per
  session. Anything that must run on every navigation goes through `onRoute` (or
  a raw `astro:page-load` listener); anything that appends to the DOM or holds a
  WebGL context / GSAP timeline / document-level listener must be
  disposable via its `onRoute` teardown, or idempotent. `initObservability`
  stays a once-only call (`Sentry.init` must not repeat) — see ADR 0001.
- Every route's init is now lifecycle-managed: the home + projects Three.js
  scenes, the three GSAP timelines, the `/contact` terminal, the hero data-feed,
  and both voiceover layers dispose on leave and re-init on arrival. A
  pre-existing leak (the home timeline's dispose handle was discarded, so its
  ScrollTriggers never reverted) was fixed in passing.
- `prefetch` (already `prefetchAll` / `viewport` in `astro.config.mjs`) now warms
  the client-side navigations rather than full loads.
- **Cost/risk, accepted:** the migration changes every page's client lifecycle,
  so each route was verified individually. Two adversarial review rounds caught a
  blocking async double-mount (a backwards event-ordering assumption) and two
  bfcache regressions introduced by the first fix; all were resolved before merge
  (PR #399).
