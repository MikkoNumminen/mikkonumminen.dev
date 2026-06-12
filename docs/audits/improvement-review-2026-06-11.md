# Improvement review — mikkonumminen.dev

**Date:** 2026-06-11  ·  **Method:** 11 parallel scoped reviewers → adversarial per-finding verification (every finding independently re-checked against the actual code).

**Results:** 51 raw findings → **45 confirmed**, 0 uncertain, 6 false positives.

| severity | count |
|---|---|
| critical | 0 |
| high | 2 |
| medium | 9 |
| low | 25 |
| nit | 9 |

**By category:** i18n 7, perf 7, css 7, elegance 6, bug 5, a11y 4, build 3, leak 2, dx 2, correctness 1, security 1


## HIGH

### 1. [a11y] Project side-panel buttons have a keyboard focus indicator identical to hover (no outline, ~2px shift + 8% tint)
- **Location:** `src/styles/projects-scene.css:248-254`
- **Why:** A keyboard user tabbing the project list cannot tell which item is focused: an 8%-alpha background tint plus a 2px horizontal nudge is not a perceivable focus indicator and fails WCAG 2.4.7 (Focus Visible) / 1.4.11 (Non-text Contrast). This is the primary keyboard entry point into the projects experience, so the whole interactive solar system becomes effectively unusable without a mouse.
- **Fix:** Give :focus-visible its own clearly distinct indicator instead of reusing hover. Either drop the `outline: none` so the themed global ring shows, or add a dedicated high-contrast ring, e.g. `.projects-scene__list-item:focus-visible { outline: 2px solid var(--color-projects-accent); outline-offset: 2px; }` (keep the hover background as the hover-only affordance).
- **Verified:** The cited code is accurate. In /Users/mikko/koodailua/mikkonumminen.dev/src/styles/projects-scene.css lines 248-254, `:hover` and `:focus-visible` share one rule: `background: rgba(120,170,255,0.08); border-color: color-mix(in srgb, var(--brand,#80c8ff) 45%, transparent); transform: translateX(2px); outline: none;`. The element is a real keyboard-focusable `<button …
- **Fix check:** Correct and safe. Both proposed variants are pure CSS, no impact on the static build, no animation/60fps concern, and don't change mouse-hover behavior. Dropping `outline: none` from the shared rule lets the global themed `:focus-visible` ring (projects-accent, 3px offset) paint — that works …

### 2. [i18n] Terminal `download` and `skills` command output is untranslated English on /fi and /sv routes
- **Location:** `src/i18n/locales/fi.ts, src/i18n/locales/sv.ts:fi.ts:380-436, sv.ts:380-436`
- **Why:** A visitor on /fi/contact or /sv/contact who runs `download` or `skills` (the two commands the contact page most heavily promotes — cmdHelpTip even points at them in en) gets an English wall of text inside an otherwise Finnish/Swedish terminal. On a site whose quality bar is an Apple launch page, mixed-language UI in the one fully-interactive surface is a visible regression. Type-checking passes because the keys are present and typed as string — only their value is wrong.
- **Fix:** Translate the placeholder values in fi.ts and sv.ts (cmdDownloadIntro, cmdDownloadOptionCv/Skills/Research/Catalog/Study/Replicates/Results, cmdDownloadResearchIntro/Hint, cmdDownloadAmbiguous, cmdDownloadSkills/Catalog/Study/Replicates/ResultsNotAvailable, and the whole cmdSkills* block) and remove the `awaiting translation` comments. Until then, consider a build-time guard/test asserting no fi/sv value equals its en counterpart for the terminal namespace, so this can't silently ship.
- **Verified:** Read the real files and confirmed the issue. The reviewer cited src/components/contact/terminal/ but the actual modules live at src/lib/terminal/commands.ts and src/lib/terminal/skills.ts; aside from that path slip, every claim checks out.  In src/i18n/locales/fi.ts and sv.ts (lines 380-436) the terminal block carries `// i18n: awaiting Finnish/Swedish translation — English placeholders` comments …
- **Fix check:** Correct and safe. The flagged keys are plain string constants with no interpolation or control-flow role, so replacing the English placeholder values with Finnish/Swedish translations (and deleting the awaiting-translation comments) has zero impact on the static build, 60fps, Three.js disposal, or …


## MEDIUM

### 3. [a11y] Mobile contact card streams a decorative auto-play "terminal session" through an aria-live log on page load
- **Location:** `src/components/contact/MobileContactCard.astro:28-43 (markup), 285-303 (auto-play loop)`
- **Why:** role=log + aria-live=polite is meant for user-initiated or genuinely live updates. Here it auto-announces a purely cosmetic animation duplicating info that's already available as semantic links below, producing a long, confusing screen-reader monologue the moment the contact page loads on mobile.
- **Fix:** This output is decorative and duplicated by the action buttons — mark the output container `aria-hidden="true"` and remove role="log"/aria-live. (If you want the content readable, drop the live-region semantics and let the static buttons be the accessible path; don't announce a typing animation.)
- **Verified:** Read /Users/mikko/koodailua/mikkonumminen.dev/src/components/contact/MobileContactCard.astro in full and verified every claim against the actual code.  Markup (lines 28-43): the output container is literally `<div class="mcc__output" id="mcc-output" role="log" aria-live="polite" aria-atomic="false" ...>`. The reviewer's quote is exact.  Behavior: `start()` is invoked on load unconditionally …
- **Fix check:** Correct and safe. Adding aria-hidden="true" and removing role="log"/aria-live="polite"/aria-atomic on #mcc-output is a pure-markup change: it does not touch the script, so the visual typing animation, the data-* attributes it reads, the requestAnimationFrame/timeout teardown (cleanup on …

### 4. [a11y] LinkifiedText hardcodes English "(opens in a new tab)" in aria-label on fi/sv pages
- **Location:** `src/components/LinkifiedText.astro:21`
- **Why:** A screen reader on a page declared `lang="fi"`/`lang="sv"` will switch voice/pronunciation for the link text then read an out-of-language English fragment, which is jarring and inconsistent with the rest of the localized UI. WCAG 3.1.2 (Language of Parts) territory.
- **Fix:** Pass a localized suffix into LinkifiedText (e.g. add a `t.common.opensInNewTab` key per locale, like the existing ariaLinkedIn strings) and interpolate it instead of the hardcoded English: `aria-label={`${part.value} ${opensInNewTabLabel}`}`.
- **Verified:** Confirmed against actual code. LinkifiedText.astro line 21 hardcodes the English aria-label suffix and the component renders localized timeline body and lesson text from TimelineContent.astro. linkify.ts turns project hosts into links and the fi and sv localized bodies contain the host vuohiliitto dot com so the English suffix is read aloud on Finnish and Swedish pages which is a real WCAG 3.1.2 …
- **Fix check:** Correct and safe. Pass a localized suffix into LinkifiedText via a prop or translations mirroring the existing ariaLinkedIn pattern. Build-time only and ships nothing to the runtime bundle so there is no 60fps or static-build impact. One caveat is that the suggested common namespace key path does …

### 5. [build] robots.txt Sitemap directive points at a different host than the one actually served/built
- **Location:** `public/robots.txt:8`
- **Why:** A `Sitemap:` directive in robots.txt that references a different host than the host serving robots.txt is treated by Google/Bing as a cross-submission and is effectively ignored unless the foreign host is verified in Search Console. mikkonumminen.dev does not currently serve this site, so the sitemap is undiscoverable via robots.txt on the live host — search engines never get pointed at the 13 localized URLs. This is the project's primary SEO discovery path and it is broken on every deploy today.
- **Fix:** Make robots.txt reference the same host the build uses. Easiest: emit robots.txt dynamically (or template it) from the same `site` value astro.config resolves, e.g. generate it in a build step / @astrojs/sitemap-adjacent script so `Sitemap:` always equals `${site}/sitemap-index.xml`. Short-term, change the line to `https://mikkonumminen-dev.vercel.app/sitemap-index.xml` to match reality, and flip it to the apex only when the apex actually serves the site.
- **Verified:** Every factual claim checks out against the real files. public/robots.txt line 8 is a hardcoded `Sitemap: https://mikkonumminen.dev/sitemap-index.xml`. astro.config.mjs (lines 29-34) resolves `site` dynamically with a fallback of `https://mikkonumminen-dev.vercel.app`, and the config comment (lines 13-17) states the current production host IS `mikkonumminen-dev.vercel.app` until the apex DNS is …
- **Fix check:** The proposed fix is directionally correct and safe for a static build. The short-term option (change line 8 to `https://mikkonumminen-dev.vercel.app/sitemap-index.xml` to match the host actually served today) is a one-line edit to a static file with zero impact on the build, 60fps, or Three.js …

### 6. [correctness] Timeline-entry reveal delay uses a monotonic global counter, so late single reveals sit invisible for up to ~1s
- **Location:** `src/lib/gsap/experienceTimeline.ts:371-388`
- **Why:** It reads as a bug: cards appear to 'lag' or fail to show until well after they're on screen, on a page whose quality bar is an Apple launch page. The stagger only behaves for simultaneous batches, which is the rare case.
- **Fix:** Index within the current batch and reset each callback: iterate the intersecting `records` (optionally sorted by top) and set `transition-delay = i * 80ms` where `i` is the position in *that* callback's intersecting subset, not a global counter. Drop the module-level `revealOrder`.
- **Verified:** real bug
- **Fix check:** fix is correct and safe

### 7. [i18n] `whoami` hardcodes English sentence fragments concatenated onto translated prefixes
- **Location:** `src/lib/terminal/commands.ts:54, 57, 60`
- **Why:** On /fi/contact and /sv/contact, `whoami` renders a Finnish/Swedish prefix (e.g. 'suurin:' / 'störst:') immediately followed by English '1828+ tests, 91.9% coverage.' and 'projects shipped solo · ... tokens saved · 2 PRs upstream to'. whoami is the single most-run terminal command (cmdHelpTip leads with it), so this mixed-language line is the first thing most localized visitors see.
- **Fix:** Add terminal keys for these fragments (e.g. cmdWhoamiLargestSuffix, cmdWhoamiYearStats) with the numbers interpolated, and translate them in fi/sv — or restructure so the full sentence lives in the dictionary with `{link}`-style placeholders the handler fills.
- **Verified:** Read src/lib/terminal/commands.ts directly. The whoami handler (lines 48-64) matches the reviewer's quote exactly. Lines 54 and 60 concatenate translated prefixes with hardcoded English JS string literals: line 54 emits `${escape(tt.cmdWhoamiLargest)} <a ...>hr-manager-pearl.vercel.app</a> — 1828+ tests, 91.9% coverage.` and line 60 emits `${escape(tt.cmdWhoamiYear)} 7 projects shipped solo · …
- **Fix check:** Correct and safe. Adding terminal dictionary keys (e.g. cmdWhoamiLargestSuffix, cmdWhoamiYearStats) with fi/sv translations, or restructuring the full sentence into the dictionary with a {link} placeholder the handler fills, is pure string/i18n work. No impact on the static build, no …

### 8. [i18n] Cross-locale content drift: token-saving figure is 3.13M in en but stale 2.76M in fi/sv
- **Location:** `src/i18n/locales/fi.ts, src/i18n/locales/sv.ts:fi.ts:246,275 · sv.ts:247,276 · en.ts:110,253,282`
- **Why:** Finnish and Swedish visitors are shown an outdated, lower headline metric than English visitors for the same claim — a factual inconsistency in the portfolio's central 'AI-native velocity' pitch. Type-checks can't catch value drift between locales.
- **Fix:** Update the 2,76M figures in fi.ts (lines 246, 275) and sv.ts (lines 247, 276) to match en's 3,13M (with locale-correct decimal comma), and add a velocity `link` to fi/sv (see separate finding). Better: source the figure from one constant rather than embedding it in three prose strings.
- **Verified:** Verified against current code. en.ts:253 (ai-workflows body) and en.ts:282 (2026-build lesson) both state "~3.13M tokens", and en.ts:110 carries the velocity link label "How 3.13M tokens was estimated". The fi/sv locales still carry the older figure: fi.ts:246 "noin 2,76 miljoonaa tokenia vuodessa" + fi.ts:275 "~2,76M tokenia säästöä"; sv.ts:247 "~2,76 miljoner token per år" + sv.ts:276 "~2,76M …
- **Fix check:** The proposed fix is correct and safe. Editing the four prose strings (fi.ts:246,275 and sv.ts:247,276) from 2,76 → 3,13 (keeping the locale-correct decimal comma, which both locales already use, e.g. "2,76M") is a pure string change with no structural/type impact — it cannot break the static build, …

### 9. [i18n] Cross-locale content drift: fi/sv claim a hardcoded skill count of 'ten' and 'quarterly audits' that en no longer makes
- **Location:** `src/i18n/locales/fi.ts, src/i18n/locales/sv.ts:fi.ts:68,103,195,199,246,275 · sv.ts:68,103,196,200,247,276 · en.ts:68,107,202,206,253`
- **Why:** The localized pages tell a materially different and now-contradictory story: '10 skills, audited quarterly, two drift bugs found' in fi/sv vs en's '34 skills, 33 calibrated' framing elsewhere on the same site. A bilingual reader or recruiter switching languages sees inconsistent, stale numbers.
- **Fix:** Re-align the fi/sv focus[2], spacepotatis description+highlight, velocity body, and ai-workflows body with the current en wording (drop the hardcoded 'ten', drop the 'quarterly audit / two drift bugs' specifics, or add them to en if they're still true). Keep skill counts out of free prose where possible.
- **Verified:** Every cited line checks out against the current code (line offsets are off by a few because the reviewer used 1-based and slightly different counts, but the content matches exactly).  focus[2] / "AI-native" card: en.ts:68 'ships a catalog of custom Claude Code skills ... version-controlled, audited, treated as production artifacts' — no count, no cadence. fi.ts:68 'kymmentä omaa Claude Code …
- **Fix check:** Correct and safe. These are plain string literals in TypeScript locale modules (src/i18n/locales/*.ts) with no runtime, render, animation, or build logic attached, so re-aligning prose cannot affect the static build, 60fps, Three.js disposal, or prefers-reduced-motion. The proposed direction (drop …

### 10. [perf] All planet procedural textures are generated synchronously in one tight loop, blocking the main thread on first navigation
- **Location:** `/Users/mikko/koodailua/mikkonumminen.dev/src/lib/three/projectsScene.ts:181-185 (calls buildPlanet -> buildPlanetTexture, src/lib/three/projects/buildPlanetTexture.ts:175-295)`
- **Why:** The scene is deferred (boot.ts) to the first interaction, so this burst lands exactly when an engaged user starts interacting — producing a long task / dropped frames right at the moment of first navigation, against the 'Apple launch page' / 60fps bar.
- **Fix:** Spread the work: build planets one (or a couple) per requestAnimationFrame / `await` tick so each frame stays under budget and the sun+starfield can render immediately while planets pop in, or move `paintDiffuse`/`paintBump` to an OffscreenCanvas in a Worker and upload the resulting ImageBitmap. Even a simple `for ... { build; await new Promise(r => requestAnimationFrame(r)); }` in the mount path removes the single long task.
- **Verified:** Confirmed against current code.
- **Fix check:** Direction is correct and static-safe but the one-liner is not a safe drop-in.

### 11. [security] CSP connect-src misses region-scoped Sentry ingest hosts (*.ingest.{region}.sentry.io)
- **Location:** `vercel.json:60 (connect-src) — see also src/lib/observability/initObservability.ts:25-27`
- **Why:** If the configured PUBLIC_SENTRY_DSN is a region DSN (the default Sentry now hands out for new EU and many US projects), every error/Web-Vitals envelope POST is blocked by CSP and silently dropped — the observability the file goes to lengths to wire up (full tracesSampleRate, web-vitals attach) produces nothing in production, with no error visible to the user. The risk is conditional on the DSN's region, which is why it's medium not high.
- **Fix:** Broaden the directive to cover the region segment, e.g. `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io`, or use `https://*.sentry.io` if you accept the wider scope. Confirm against the actual DSN host before shipping.
- **Verified:** Verified both cited locations. vercel.json:60 CSP is exactly `connect-src 'self' https://*.ingest.sentry.io` (reviewer's quote is accurate). initObservability.ts:25-27 header comment asserts "SDK v10 routes all traffic through *.ingest.*" — accurate. package.json pins @sentry/browser and @sentry/astro ^10.51.0 (installed 10.51.0), confirming "SDK v10". The DSN is read from PUBLIC_SENTRY_DSN; …
- **Fix check:** Correct and safe. Adding `https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io` to connect-src (or the broader `https://*.sentry.io`) only widens the allowlist for Sentry-owned ingest hosts; it has zero effect on the static build, 60fps animations, Three.js teardown, or any existing runtime …


## LOW

### 12. [a11y] Home nav-card keyboard focus collapses to a soft glow only (outline removed, lift killed under reduced motion)
- **Location:** `src/styles/nav-cards.css:76-85, 90, 160-169`
- **Why:** For a reduced-motion keyboard user the only remaining focus indicator on the home page's primary navigation cards is a low-contrast gradient glow with no outline and no border change, which is hard to perceive and weaker than WCAG 2.4.7 expects.
- **Fix:** Add an explicit focus ring that survives reduced motion, e.g. `.nav-card:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 4px; }`, and extend the per-accent border-color rules to `:focus-visible` as well as `:hover` so focus is not styling-equivalent to hover-minus-border.
- **Verified:** Read src/styles/nav-cards.css in full. Every cited line is accurate:  - Lines 76-80: `.nav-card:hover, .nav-card:focus-visible { transform: translateY(-6px); outline: none; }` — focus reuses the hover transform AND explicitly sets `outline: none`. - Lines 82-85: the `::before` radial glow goes opacity 0→1 on both hover and focus. - Lines 87-115: every per-accent `border-color` brighten rule is …
- **Fix check:** Directionally correct and safe, with one caveat on the suggested color. Adding an explicit `outline` on `.nav-card:focus-visible` that survives the reduced-motion block is the right move and won't affect the static build or 60fps (outline isn't animated). Extending the per-accent border-color rules …

### 13. [bug] Reduced-motion goat is positioned once at DOMContentLoaded and never repositioned on resize
- **Location:** `src/lib/gsap/experienceTimeline.ts:253-264`
- **Why:** Decorative and aria-hidden, so impact is cosmetic — but on a polish-grade page a goat floating in the wrong place after a resize/orientation change reads as broken, and measuring at DOMContentLoaded can also catch pre-font-load layout.
- **Fix:** Either add a debounced resize listener in the reduced-motion branch that recomputes and re-sets --goat-x/--goat-y (returning a dispose that removes it), or position the goat purely via CSS relative to the first card so no JS measurement is needed in the static case.
- **Verified:** The cited code matches the finding exactly. In src/lib/gsap/experienceTimeline.ts the reduced-motion branch (line 253 `if (reducedMotion)`) computes the goat position once: line 257 reads `timelineEntries[0].getBoundingClientRect()`, lines 258-261 compute x/y and write `--goat-x`/`--goat-y`, and line 263 returns a no-op `dispose`. There is no resize, orientationchange, ResizeObserver, or …
- **Fix check:** The JS option in the proposed fix is correct and safe: add a debounced resize (and ideally orientationchange) listener inside the reduced-motion branch that recomputes x/y from timelineEntries[0].getBoundingClientRect() using the existing GOAT_LEFT_CLAMP_PX/GOAT_GAP_PX/clampGoatY logic and re-sets …

### 14. [bug] Commands can be submitted during the boot typing animation, interleaving output
- **Location:** `src/lib/terminal/terminal.ts:150-170, 173`
- **Why:** The whole point of the `busy` guard (per its own comment) is to prevent interleaved output in the shared output div, but boot is exactly the longest async window and is left unguarded. The first impression of the terminal — its scripted boot — can be visibly corrupted by an eager visitor, which undercuts the 'Apple launch page' polish bar.
- **Fix:** Gate input during boot: either set `input.disabled = true` (or `busy = true`) before `runBoot` and clear it in a `finally` after boot completes, or attach the submit/keydown listeners only after `await runBoot(...)` returns. Disabling the input also gives a visible cue that the terminal isn't ready yet.
- **Verified:** The finding is accurate against the current code in src/lib/terminal/terminal.ts. The submit listener is registered at line 151 and the keydown listener at line 101, both BEFORE `await runBoot(ctx, elements, t)` at line 173. The `busy` guard (declared line 150, set true only inside the submit handler at line 156) is the ONLY gate against concurrent output, and it is never set during boot. The …
- **Fix check:** The proposed fix is correct and safe. The cleanest variant is to set `busy = true` before line 173 and reset it in a `try/finally` around `await runBoot(...)`, reusing the existing guard so a mid-boot submit early-returns at the `if (busy) return` check (line 155). This is pure client-side JS with …

### 15. [bug] `download` with an unknown flag silently prints the default menu instead of erroring
- **Location:** `src/lib/terminal/commands.ts:193-211`
- **Why:** Inconsistent CLI behavior: a typo'd download flag looks like it 'worked' (a menu appears) rather than telling the user the flag was wrong, so they may not realize their requested file wasn't downloaded. It also breaks the parsing contract the other three commands establish.
- **Fix:** After the `selected.length === 0` / `--research` handling, detect leftover unrecognized `--` tokens (args starting with `--` that aren't `--research` and aren't a known target flag) and print `tt.cmdDownloadUnknownFlag` + the usage line, mirroring `contact`/`links`/`skills`.
- **Verified:** Read src/lib/terminal/commands.ts lines 104-254. The reviewer's quote is accurate. The download handler builds `selected = targets.filter((tgt) => args.includes(tgt.flag))` (line 193). For an unknown flag like `download --foo` or a typo `download --cvv`: no target flag matches, so `selected.length === 0`; `args.includes('--research')` is false (line 195); control falls through to lines 205-209 …
- **Fix check:** Conceptually correct and safe — pure string logic, no new runtime deps, no impact on the static build, 60fps, or animation teardown, and it mirrors the established contact/links/skills pattern. The detection (args starting with `--`, not `--research`, not in the set of `targets.map(t => t.flag)`) …

### 16. [bug] In-flight async commands keep mutating the output after Ctrl+L clear or Ctrl+C
- **Location:** `src/lib/terminal/terminal.ts:131-142`
- **Why:** Minor visual glitch rather than a crash, but it contradicts the 'no interleaved/orphaned output' invariant the `busy` guard is trying to maintain — the guard only covers form submit, not the clear/interrupt shortcuts that can fire during the same async window.
- **Fix:** Make `busy` visible to the keydown handler (e.g. a shared `isBusy()` closure) and ignore Ctrl+L / Ctrl+C while a command is in flight, or capture a per-command sequence id in the context so late `print`s from a superseded command are dropped after a clear.
- **Verified:** Verified against current code. The `busy` flag (src/lib/terminal/terminal.ts:150) is a submit-handler-local closure variable, checked only in the form 'submit' listener (line 155); the keydown handler (lines 101-145) never reads it. Ctrl+L (lines 131-135) calls ctx.clear() → output.innerHTML = '' (src/lib/terminal/dom.ts:45-47); Ctrl+C (lines 136-141) calls echoPromptLine(output, input.value, …
- **Fix check:** Both proposed fixes are correct and safe. Exposing `busy` via a shared isBusy() closure and ignoring Ctrl+L/Ctrl+C while a command is in flight is the minimal change: it lives in the keydown branch (not in any rAF/render loop, so zero 60fps impact), is pure client-side JS (no SSR/static-build …

### 17. [build] Canonical / og:url / hreflang emit trailing slashes that vercel.json trailingSlash:false 308-redirects away
- **Location:** `src/layouts/BaseLayout.astro:25-35 (canonical/og:url/hreflang) vs vercel.json:6`
- **Why:** The canonical URL declared in <head> resolves to a 308 redirect to the slash-less form, so the canonical tag and the actual indexable URL disagree on every page and every hreflang alternate. Search engines may treat this as a soft canonical conflict and waste crawl budget on redirects; hreflang clusters built from redirecting URLs are also weaker. It is a self-inflicted inconsistency between the two config files.
- **Fix:** Make the two agree. Either set `trailingSlash: 'always'` + `build.format: 'directory'` in astro.config and `"trailingSlash": true` in vercel.json, OR set `trailingSlash: 'never'` + `build.format: 'file'` in astro.config to match vercel.json's `trailingSlash:false`. The slash-less variant is the cleaner public URL given cleanUrls is already on.
- **Verified:** verified real issue
- **Fix check:** fix is sound

### 18. [build] All security + cache headers live only in vercel.json — they vanish on the S3+CloudFront swap the project mandates
- **Location:** `vercel.json:8-64`
- **Why:** On an S3+CloudFront deploy, the dist/ artifact is byte-identical but ships with NO CSP, NO HSTS, NO clickjacking protection, and NO long-lived caching on hashed assets — a silent, total loss of the security posture this config carefully builds. 'Single config swap' is not actually achievable today because the header layer is Vercel-proprietary and unreplicated.
- **Fix:** Express the header policy in a host-neutral form that can be applied on either platform: e.g. a shared headers manifest consumed both by vercel.json and by a CloudFront response-headers-policy / Lambda@Edge (or document the exact CloudFront policy in the repo). At minimum, add a note/checklist so the swap doesn't silently drop them.
- **Verified:** Verified against the actual files. vercel.json (lines 8-64) is exactly as quoted: all security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) and all Cache-Control rules (/_astro, /fonts, /audio immutable; favicon + og short cache) are defined only in this file. I searched the whole repo: no `_headers` file (find returned nothing), no CloudFront …
- **Fix check:** The proposed fix is correct and safe. The minimum form (a swap checklist / deployment note, or a documented CloudFront response-headers-policy committed to the repo) is pure documentation or a deploy-time artifact — it touches no runtime, build, or animation code, so it cannot break the static …

### 19. [css] Reveal stagger uses a global monotonic counter, so late-revealing cards get huge transition-delays and feel sluggish
- **Location:** `src/lib/gsap/experienceTimeline.ts:372-388 (esp. 380-382)`
- **Why:** The reveal transition (opacity/transform 0.8s, css lines 114-116) plus an ~0.9s accumulated delay means later cards visibly lag behind the scroll, reading as jank rather than a deliberate cascade. The further down the timeline the user reads, the worse it gets — the opposite of the intended effect.
- **Fix:** Reset the stagger per intersection batch and cap it: compute a local index over the currently-intersecting records only (e.g. records.filter(r=>r.isIntersecting).forEach((rec,i)=>{ delay = Math.min(i,4)*80 })), or drop the JS-driven delay and use a small fixed CSS delay. Do not carry a global counter across the whole scroll.
- **Verified:** The cited code at src/lib/gsap/experienceTimeline.ts:372-388 matches the quote exactly: `let revealOrder = 0` is a module-scope counter that is never reset; the IO callback sets `target.style.transitionDelay = ${revealOrder * 80}ms`, increments `revealOrder`, then unobserves the target. The counter is global across the whole scroll, not per-batch, so the Nth card to ever reveal gets (N-1)*80ms of …
- **Fix check:** Correct and safe. The proposed per-batch local index with a cap (records.filter(r=>r.isIntersecting).forEach((rec,i)=>{ delay = Math.min(i,4)*80 })) is a pure client-side change with no effect on the static build, no rAF/Three.js lifecycle concerns, and 60fps is unaffected (it only sets a CSS …

### 20. [css] Dead mobile overrides on .terminal / .terminal__title — comment misdescribes what they target
- **Location:** `src/styles/terminal.css:347-365`
- **Why:** Dead rules plus a comment that actively misleads the next maintainer about why they exist. Anyone tuning the mobile fallback will edit values here that never render, then chase a ghost.
- **Fix:** Delete the `.terminal { ... }` and `.terminal__title { display: none }` overrides from the 640px block (keep `.crt { display: none }`). If the no-JS desktop noscript fallback actually needs mobile tuning, target `.terminal__noscript` explicitly. Then rewrite the comment to state plainly that only `.crt` is hidden on phones.
- **Verified:** Verified against the current code. terminal.css lines 347-365 match the finding verbatim: inside @media (max-width: 640px) the block sets `.crt { display: none }`, then `.terminal { width: 96vw; margin-top: 5.5rem; border-radius: 10px }`, then `.terminal__title { display: none }`. In Terminal.astro (/Users/mikko/koodailua/mikkonumminen.dev/src/components/contact/Terminal.astro), `.crt` is the …
- **Fix check:** Correct and safe. Deleting the `.terminal { ... }` and `.terminal__title { display: none }` overrides while keeping `.crt { display: none }` removes only rules that render nothing today, so there is no impact on the static build, 60fps, prefers-reduced-motion, or any existing behavior — purely a …

### 21. [css] .terminal__hints hardcodes #6e8e75 — duplicates the --color-term-dim token with a now-stale comment
- **Location:** `src/styles/terminal.css:317-320`
- **Why:** A magic literal that silently mirrors a token. If the dim token is ever re-tuned, the hints text will not follow and will drift out of sync (and potentially back below AA) without anyone noticing.
- **Fix:** Replace `color: #6e8e75;` with `color: var(--color-term-dim);` and delete the stale 'Brightened from…' comment (the AA rationale now lives on the token in global.css).
- **Verified:** Both cited facts check out against the current code. src/styles/terminal.css lines 317-320 contain the comment "Brightened from --color-term-dim to clear WCAG AA 4.5:1 ... --color-term-dim is kept for stylistic dim text elsewhere." immediately followed by `color: #6e8e75;`. src/styles/global.css line 21 defines `--color-term-dim: #6e8e75;`, and its own comment (lines 18-20) says it was bumped …
- **Fix check:** Correct and safe. Replacing `color: #6e8e75;` with `color: var(--color-term-dim);` resolves to the same color (no visual change), and the token is globally in scope because it is declared in @theme (compiles to :root custom properties) and is already referenced at terminal.css:197 and elsewhere. No …

### 22. [css] External-API accent color #80c8ff repeated ~15x across three files with no token
- **Location:** `src/styles/project-detail.css:176-191 (and project-grid.css 185-197, projects-scene.css 251-379)`
- **Why:** There is already a `@theme` token convention in global.css for accents (--color-projects-accent, etc.), but this 'external API' blue isn't one of them — so a single design tweak means editing ~15 spots in two equivalent notations. Easy to miss one and ship a mismatched shade.
- **Fix:** Add a `--color-api-accent: #80c8ff;` (and/or an `--color-api-accent-rgb: 128, 200, 255;` triple, matching the timeline's --accent-rgb pattern) to the @theme block, then reference it via `var(...)` / `rgba(var(--color-api-accent-rgb), …)`. Consider extracting the duplicated externalApis-pill rule into one shared selector.
- **Verified:** The core claim is real: the external-API accent blue is hardcoded and untokenized, and the pill recipe IS duplicated verbatim. I confirmed in project-detail.css:176-177 (`background: rgba(128, 200, 255, 0.1); border: 1px solid rgba(128, 200, 255, 0.32)`) and project-grid.css:185-186 — byte-identical. The `#80c8ff` color appears for the externalApis pill text (project-detail:181/189, …
- **Fix check:** Directionally correct and build-safe: adding `--color-api-accent`/`--color-api-accent-rgb` to the @theme block matches the existing convention and Tailwind v4 emits plain CSS vars, so it won't touch the static build, 60fps, or runtime behavior. Two caveats: (1) the fix must NOT fold the …

### 23. [css] CRT chrome (gradient, vignette, scanlines, flicker, dots) duplicated byte-for-byte between terminal.css and mobile-contact-card.css
- **Location:** `src/styles/mobile-contact-card.css:14-133 (mirrors terminal.css 3-132)`
- **Why:** Two surfaces that are never visible at the same time (crt hidden <640px, mcc shown <640px) carry two copies of one CRT look. Any aesthetic change to the terminal frame must be made twice and kept in lockstep by hand — exactly the drift this 'every pixel matters' bar can't afford.
- **Fix:** Hoist the shared shell into prefix-agnostic helpers — e.g. shared classes `.crt-shell`, `.crt-vignette`, `.crt-scanlines`, `.crt-flicker`, `.crt-dot--{red,amber,green}` and one `@keyframes crt-flicker` — applied to both the desktop and mobile markup; keep only the genuinely-divergent bits (sizing, border-radius, padding) per surface.
- **Verified:** Read both files in full. The duplication is real and the evidence is accurate. Byte-for-byte matches confirmed: shell background `radial-gradient(ellipse at center, #07120a 0%, #040806 60%, #020403 100%)` (terminal.css:7 == mobile-contact-card.css:14); `.crt__vignette` (14-24) vs `.mcc__vignette` (22-32) identical gradient + z-index:3; `.crt__scanlines` (26-39) vs `.mcc__scanlines` (34-47) …
- **Fix check:** Sound and safe. Hoisting the shared shell (background, vignette, scanlines, flicker + one @keyframes crt-flicker, dot colors, chrome grid) into prefix-agnostic helper classes applied to both markups is a pure CSS-only refactor with no impact on the static build, JS, animation perf, or a11y. One …

### 24. [elegance] Visibility/offscreen rAF-loop scaffold is copy-pasted across all three rAF owners
- **Location:** `src/lib/three/homeScene.ts, src/lib/three/projectsScene.ts, src/lib/home/dataFeedConsole.ts:homeScene 880-906; projectsScene 591-619; dataFeedConsole 327-340`
- **Why:** This is the single largest genuine duplication in the scene layer. The loop/visibility lifecycle is subtle (the raf!==0 guards, the lastFrame reset on resume, the document.hidden interaction with the pauser) and must be kept correct in three places by hand; a divergence causes either a stuck-paused canvas or a double-running rAF — the exact bug the guards exist to prevent.
- **Fix:** Extract a `createRenderLoop({ tick(delta, elapsed), target, targetFrameMs })` helper that owns startTime/lastFrame, the 60fps clamp, the IntersectionObserver pauser, the visibilitychange listener, and a single dispose(). homeScene/projectsScene pass only their per-frame body; dataFeedConsole reuses it (its dirty-check paint becomes the tick body). Removes ~60 lines of identical lifecycle code and collapses three maintenance points to one.
- **Verified:** Read all three files plus the helper. The finding is partly real but materially overstated. REAL: the caller-side glue — onResume/onPause callback bodies (raf!==0 guards, lastFrame=performance.now(), tick()/cancelAnimationFrame) and the full onVisibilityChange handler (document.hidden -> cancel; else raf===0 && pauser.isVisible() -> tick) — IS near-identical between homeScene.ts (880-904) and …
- **Fix check:** Direction is sound and static-build/60fps-safe, but riskier and less clean than the finding implies. A createRenderLoop helper is feasible, yet the three call sites genuinely differ: dataFeedConsole deliberately omits the manual visibilitychange resume path (relies on native rAF tab-pause) and uses …

### 25. [elegance] Centered-radial-gradient CanvasTexture boilerplate repeated in 5+ builders
- **Location:** `src/lib/three/buildCollisionSparks.ts, buildProjectsZoneDecor.ts, buildExperienceZoneDecor.ts, src/lib/three/projects/buildExternalIndicator.ts:buildCollisionSparks 31-58 (makeFlashTexture); buildProjectsZoneDecor 55-78 (makeFlareTexture); buildExperienceZoneDecor 151-168 (makeSnowflakeTexture) & 170-187 (makeDustTexture); buildExternalIndicator 22-46 (getPulseTexture)`
- **Why:** The duplicated null-context guard and CanvasTexture wiring are spread across five builders, so a cross-cutting change (e.g. setting colorSpace, disabling mipmaps for these sprite textures) has to be repeated five times and is easy to apply inconsistently — which is itself a correctness risk for the visual bar.
- **Fix:** Add `makeRadialSpriteTexture(size, stops: Array<[number, string]>): Texture` in a lib/three/textures helper. Each builder becomes one call with its stop list. One place to own colorSpace/mipmap settings for all sprite glow textures.
- **Verified:** Read all four cited files plus the wider grep for createRadialGradient. The claimed centered-radial-gradient CanvasTexture skeleton (createElement('canvas') -> width=height=size -> getContext('2d') -> if(!ctx) throw -> createRadialGradient(c,c,0,c,c,c) -> addColorStop xN -> fillStyle/fillRect -> new CanvasTexture -> needsUpdate=true -> return) is genuinely present and near-identical in: …
- **Fix check:** Correct and safe. The proposed makeRadialSpriteTexture(size, stops) helper is not speculative — it is exactly buildSun.ts's existing makeRadialTexture, which already builds, ships, and passes typecheck, so promoting it to a shared lib/three/textures module and having the five builders call it is …

### 26. [elegance] #rrggbb hex parse duplicated within parseAccentRgb (and again in experienceTimeline)
- **Location:** `src/lib/transitions/pageTransition.ts, src/lib/gsap/experienceTimeline.ts:pageTransition 608-616 and 641-649 (same function, twice); experienceTimeline 140-146 (parseHex)`
- **Why:** The two copies inside one function are pure noise: a future change (e.g. 8-digit hex with alpha) must be made in two spots 30 lines apart, and the third copy in experienceTimeline means three independent hex decoders can drift.
- **Fix:** Hoist a local `hex6ToRgb(h: string): AccentRgb` inside pageTransition and call it from both branches; optionally promote it (and experienceTimeline.parseHex) to a shared lib/utils/color.ts. At minimum dedupe the two in-function copies.
- **Verified:** Read both files at the cited lines. The evidence is accurate. In src/lib/transitions/pageTransition.ts, parseAccentRgb (function at line 607) contains the #rrggbb decode block TWICE: lines 611-615 (fast-path input, after regex /^#([0-9a-f]{6})$/i at 608) and lines 644-648 (canvas-normalised read-back, after the identical regex at 641). Both produce { r: parseInt(h.slice(0,2),16), g: …
- **Fix check:** The "at minimum" fix is correct and safe: extract a local hex6ToRgb(h: string): AccentRgb in pageTransition.ts and call it from both branches. Both branches already yield AccentRgb, so this is a behavior-preserving extraction. No build/static/60fps concern — parseAccentRgb is documented as called …

### 27. [elegance] projectsScene reimplements its own findPlanetByMeshId lookup inline in selectById/hoverById
- **Location:** `src/lib/three/projectsScene.ts:338-341 (helper), 627, 637`
- **Why:** Inconsistent pattern in one file — two ways to resolve id→planet. The inline forms also drop the helper's `if (!id) return null` guard, so they aren't even identical, which is exactly the silent drift a shared helper prevents.
- **Fix:** Rename the helper to `planetById(id)` (it resolves by project id, not mesh id — the current name overstates it) and call it from both selectById and hoverById: `const entry = planetById(id);`.
- **Verified:** Confirmed real. Helper findPlanetByMeshId at src/lib/three/projectsScene.ts:338-341 is used at 356 and 494, but selectById (line 627) and hoverById (line 637) re-implement the same project.id===id lookup inline. Real low-severity duplication. The dropped-guard claim is overstated: selectById already guards null at 623 and hoverById re-expresses the guard via its id ternary, so both are …
- **Fix check:** Fix intent is sound but as written breaks astro check: in hoverById id is string-or-null while the helper param is string-or-undefined, so the call is a type error until the param is widened or the call adapted. After that adjustment it is a safe pure refactor with no build, fps, or behavior impact.

### 28. [elegance] spawnStreaksInward and spawnStreaksOutward are one parameterised function
- **Location:** `src/lib/transitions/pageTransition.ts:315-344 and 347-373`
- **Why:** ~28 lines duplicated for one operation with a direction flag. Any tweak to streak size/delay distribution must be mirrored, and the variants already diverge subtly (inward adds a per-target angular jitter the outward one omits) — making it hard to tell which differences are intentional.
- **Fix:** Collapse to `private spawnStreaks(dir: 'in' | 'out')`, branching only on the origin-radius vs target-radius assignment and keeping the shared size/delay trailer in one place.
- **Verified:** Read src/lib/transitions/pageTransition.ts lines 315-373. The two private methods spawnStreaksInward (315-344) and spawnStreaksOutward (347-373) genuinely duplicate: the identical w/h/cx/cy/maxDim setup (316-320 == 348-352), the identical `for (let i = 0; i < STREAK_COUNT; i++)` loop, the identical `if (!s) continue` pool guard, and the identical trailer `s.ox/s.oy/s.tx/s.ty` plus `s.size = 1.5 + …
- **Fix check:** The proposed `private spawnStreaks(dir: 'in' | 'out')` collapse is correct and safe: it refactors two private methods with two known call sites, touches no static-build/SSR surface, leaves the render loop and rAF/teardown untouched, and does the same per-frame work so 60fps is unaffected. One …

### 29. [i18n] velocity receipt link present in en but missing from fi/sv, so localized visitors lose the verification link
- **Location:** `src/i18n/locales/fi.ts, src/i18n/locales/sv.ts:fi.ts:99-108 · sv.ts:99-108 · en.ts:108-111`
- **Why:** The velocity section makes a bold token-saving claim; en backs it with a 'how this was estimated' receipt link, but Finnish and Swedish visitors get the claim with no way to verify it. The whole section's framing ('Fast — for real' / 'Nopeaa — todistettavasti' / 'Snabbt — på riktigt') is undercut when the proof link is absent.
- **Fix:** Add a `link` to fi.velocity and sv.velocity pointing at the same SKILLS.md, with a translated label (e.g. fi: 'Miten 3,13M tokenia arvioitiin', sv: 'Hur 3,13M token uppskattades'). `link` is optional by design, but the asymmetry here is unintended.
- **Verified:** Verified against current code. en.ts:108-111 define velocity.link with href to Spacepotatis docs/SKILLS.md and label How 3.13M tokens was estimated. fi.ts velocity (99-108) and sv.ts velocity (99-108) both go straight from body to stats with no link key. Velocity.astro:24 renders the receipt link only when t.velocity.link is truthy, so it shows on en and is silently absent on fi/sv. Reviewer …
- **Fix check:** Correct and safe. ReceiptLink is exactly href and label strings (types.ts:6-9), so adding a link object between body and stats in fi.velocity and sv.velocity is type-valid and keeps astro check green. Pure static data, no SSR/Three.js/animation impact; Velocity.astro already handles the link branch …

### 30. [i18n] Stale `cmdHelpTip` in fi/sv points only at `download --cv`, omitting the promoted `skills` / `download --skills` commands
- **Location:** `src/i18n/locales/fi.ts, src/i18n/locales/sv.ts:fi.ts:357 · sv.ts:357 · en.ts:366`
- **Why:** The terminal `help` output is the primary discovery surface. fi/sv users are steered toward the CV download but never told the `skills` measurement command (the site's headline feature) exists. This is the same drift class as the figure mismatch: en moved, fi/sv didn't.
- **Fix:** Update cmdHelpTip in fi.ts and sv.ts to mention `skills` and `download --skills`, matching en's tip.
- **Verified:** Grep confirms Finnish and Swedish line 357 help tip lists only the cv download while English line 366 also lists the skills command and skills download; the tip prints at the end of help output; the skills command and skills download are real and current; English was updated but Finnish and Swedish were not which is real drift
- **Fix check:** A pure two string edit in Finnish and Swedish adding the skills command and skills download to mirror English; command tokens stay untranslated so only prose changes which is safe with no build or runtime impact

### 31. [i18n] Skills-registry terminal table renders hardcoded English headers/labels on all locales
- **Location:** `src/lib/terminal/skills.ts:167, 171, 187, 280, 125, 131`
- **Why:** Even after the cmdSkills* dictionary keys are translated, the `skills` command's own tabular body stays English on /fi and /sv — the column headers, the totals summary line, and the empty-state strings. Lower severity because it's tabular/jargon-y, but it's still untranslated user-facing prose mixed into a localized terminal.
- **Fix:** Move the table headers, the `total:` summary template, `(no skills)`, `known repos:`, and `[receipt]` / `/yr` labels into the terminal translation namespace and thread `tt` through renderAggregate/renderRepo/renderSkillLine (renderAggregate already receives `tt`; the others need it passed in).
- **Verified:** I opened src/lib/terminal/skills.ts and verified every cited line against the actual code. All quotes are accurate: line 167 `printTable(ctx, ['Repo', 'Skills', 'Redirects', 'Receipts', 'Tokens/yr'], rows)`; line 171 the literal `total: ${reg.totals.skills} skills · ... · ~${formatNumber(...)} tokens/yr` summary; line 187 `ctx.print('(no skills)', 'dim')`; line 280 `ctx.print(\`known repos: …
- **Fix check:** The proposed fix is correct and safe. The five literals (table headers, `total:` summary template, `(no skills)`, `known repos:`, `[receipt]`/`/yr`) can be lifted into the terminal namespace as new keys, and `tt` threaded through renderRepo and renderSkillLine (renderAggregate already has it). …

### 32. [leak] Bloom composer never disposes its OutputPass (ShaderMaterial + fullscreen-quad geometry leak)
- **Location:** `src/lib/three/postprocessing.ts:51, 60-64`
- **Why:** The module's own doc comment advertises a clean dispose contract ('The caller swaps renderer.render() for composer.render()'), and homeScene faithfully calls `bloom?.dispose()`. In the current MPA wiring the page fully unloads on navigation so the browser reclaims the GL context anyway, which keeps real-world impact low — but this is a self-contained, reusable module whose teardown is silently incomplete, and it will leak per mount the moment the scene is ever reused without a full page unload.
- **Fix:** Hold a reference to the OutputPass (and ideally the RenderPass) and dispose it explicitly: `const outputPass = new OutputPass(); composer.addPass(outputPass);` then in dispose add `outputPass.dispose();`. Alternatively dispose every disposable pass generically: `for (const pass of composer.passes) (pass as { dispose?: () => void }).dispose?.();` before `composer.dispose()`.
- **Verified:** Verified against the actual code and node_modules. src/lib/three/postprocessing.ts:51 adds `composer.addPass(new OutputPass())` inline — the instance is never retained. The dispose closure (lines 60-64) only calls `bloomPass.dispose()` and `composer.dispose()`. I confirmed in node_modules that EffectComposer.dispose() (EffectComposer.js:354-361) frees only renderTarget1, renderTarget2, and …
- **Fix check:** Correct and safe. The primary proposed fix mirrors the existing bloomPass handling exactly: `const outputPass = new OutputPass(); composer.addPass(outputPass);` then add `outputPass.dispose();` to the dispose closure. The generic alternative — iterating `composer.passes` and calling …

### 33. [leak] Projects drawer is never disposed on page teardown; its document-level listeners only clean up in the error path
- **Location:** `src/page-content/ProjectsPage.astro:232-245, 282-295`
- **Why:** The document-level capture-phase click listener and keydown listener survive for the life of the document on the happy path. On a full MPA navigation the page unloads so memory is reclaimed, which keeps the real-world impact low, but it is a genuine lifecycle gap: the drawer's teardown is dead code on the success path, and any future SPA-style remount or repeated boot would stack duplicate document listeners.
- **Fix:** Hoist `drawer` to a script-scope `let drawer: DrawerHandle | null = null;` (mirroring `sceneHandle`), assign it in `bootProjectsScene`, and call `drawer?.dispose()` inside the `beforeunload` handler alongside `sceneHandle?.dispose()`.
- **Verified:** Verified every claim against the actual code. In src/lib/projects/drawer.ts, initProjectDrawer registers three listeners that only its dispose() removes: document keydown (onEscape, line 246), document capture-phase click (onDocumentClick, line 247), and closeBtn click (line 245); dispose() at lines 249-254 is the sole teardown. In src/page-content/ProjectsPage.astro, `drawer` is a const scoped …
- **Fix check:** Correct and safe. Hoisting `drawer` to a script-scope `let drawer: DrawerHandle | null = null;` (DrawerHandle is already exported from drawer.ts, line 16, so it just needs adding to the existing `import { initProjectDrawer }` statement), assigning it inside bootProjectsScene, and calling …

### 34. [perf] will-change: transform, opacity is left on every timeline entry permanently, promoting 7-15 compositor layers for the page lifetime
- **Location:** `src/styles/experience-timeline.css:101-117 (line 108)`
- **Why:** will-change tells the browser to keep each element on its own GPU layer; leaving it set on all entries forever consumes GPU memory and compositor resources with no benefit once the reveal is done (MDN explicitly warns against leaving it on many elements). On a long timeline (each entry has full body + lessons + tags) this is a non-trivial standing cost.
- **Fix:** Scope the hint to animation only: drop it from the base .timeline__entry selector and apply it transiently, e.g. .timeline__entry:not(.is-visible) { will-change: transform, opacity }, or set will-change in the IntersectionObserver callback before adding is-visible and clear it on transitionend. Only entries actively animating should carry the hint.
- **Verified:** The code matches the claim. In src/styles/experience-timeline.css line 108, the base selector .timeline__entry sets `will-change: transform, opacity` unconditionally (lines 101-109). Nothing ever clears it: there is no rule resetting will-change to auto after .is-visible anywhere in the file, and the JS does not touch it. The IntersectionObserver in src/lib/gsap/experienceTimeline.ts (lines …
- **Fix check:** Partially correct. The recommended CSS one-liner `.timeline__entry:not(.is-visible) { will-change: transform, opacity }` is subtly WRONG for this setup: the reveal transition runs while .is-visible IS present (transition is defined on .is-visible, lines 114-116), so :not(.is-visible) would drop the …

### 35. [perf] Snow buffer is re-uploaded to the GPU every frame even when the scene is static (reduced-motion / delta=0)
- **Location:** `src/lib/three/buildExperienceZoneDecor.ts:410-430 (line 430)`
- **Why:** A prefers-reduced-motion client is meant to see a static scene with minimal work, yet this does a useless per-frame VBO re-upload plus 60 sin() recomputations. Small (60 verts) so low severity, but it is exactly the always-on GPU churn the project's reduced-motion / 60fps constraints want avoided, and it scales if SNOW_COUNT grows.
- **Fix:** Skip the position work when delta <= 0: guard the snow loop and needsUpdate with `if (delta > 0) { ... }`. Apply the same early bail to the meteor/goat/dust updates so reduced-motion frames are genuinely idle.
- **Verified:** The finding is accurate against the current code. In src/lib/three/buildExperienceZoneDecor.ts, tick(delta, boost) (lines 410-497) sets `posAttr.needsUpdate = true` unconditionally at line 430. SNOW_COUNT = 60 (line 43), so the position attribute is a 60x3 Float32Array. With delta=0: `snowT += delta * speedMul` does not advance snowT (line 412), `fall = delta * speedMul = 0` (line 416), so y is …
- **Fix check:** The narrow part of the proposed fix is correct and safe: wrapping the snow loop + `posAttr.needsUpdate = true` in `if (delta > 0) { ... }` is behavior-preserving because at delta=0 the loop produces identical positions, so skipping it (and the dirty flag) changes nothing visible while eliminating …

### 36. [perf] Goat ticker forces a full layout read of every timeline entry on every frame, forever — even when idle
- **Location:** `src/lib/gsap/experienceTimeline.ts:316-367`
- **Why:** On the experience page this is continuous layout thrash at 60fps whether or not the user is scrolling, working directly against the 60fps target. getBoundingClientRect in a per-frame loop is one of the classic reflow hot spots; doing it twice for the active entry doubles the cost needlessly.
- **Fix:** Reuse the rect already measured in the scan loop instead of re-calling getBoundingClientRect on `closest` (line 346). Skip the `setProperty` writes once `Math.abs(target - current) < 0.1` for both axes (goat at rest). Optionally drive the measurement from the master ScrollTrigger's onUpdate (a dirty flag set on scroll) so the per-entry rect loop only runs on frames where the scroll position actually changed.
- **Verified:** Read src/lib/gsap/experienceTimeline.ts in full. The cited code is accurate. `tickActiveAndGoat` is registered with `gsap.ticker.add(...)` at line 366 (gated on `timelineEntries.length > 0`) and runs every animation frame for the page lifetime. Each frame it loops every entry calling `el.getBoundingClientRect()` (line 325), then calls `closest.getBoundingClientRect()` AGAIN at line 346 on the …
- **Fix check:** The proposed fixes are correct and safe. (1) Reusing the rect captured in the scan loop instead of re-calling getBoundingClientRect at line 346 removes one forced read per frame with zero behavior change — straightforward and safe. (2) Early-out on `Math.abs(target-current) < 0.1` for both axes is …


## NIT

### 37. [bug] Registry fetch cache timestamp is captured before the fetch resolves, shortening the effective TTL
- **Location:** `src/lib/terminal/skills.ts:66-88`
- **Why:** The TTL check is `now2 - registryCache.loadedAt < CACHE_TTL_MS`. If the network is slow (up to the 10s timeout), the cache is stamped with a time up to 10s in the past, so a 60s TTL becomes as low as ~50s. More subtly, because `registryCache` is only assigned *after* the promise resolves, two `skills` invocations fired back-to-back before the first resolves both observe `registryCache === null` and each issue an independent fetch — the dedup the cache is meant to provide does not apply during the in-flight window.
- **Fix:** Cache the in-flight promise immediately (synchronously) so concurrent calls share it, and stamp `loadedAt` with the resolution time. e.g. set `registryCache = { promise, loadedAt: Date.now() }` right after creating `promise`, then in the `.then` clear it back to null only on failure (and optionally restamp `loadedAt = Date.now()` on success).
- **Verified:** The cited code at src/lib/terminal/skills.ts lines 65-89 matches the reviewer's quote exactly. `const now = Date.now()` is captured at line 66 before the fetch starts; the fetch uses `AbortSignal.timeout(10_000)` (line 74); and `registryCache` is assigned only inside the `.then` callback (lines 85-87) with `loadedAt: now` (start time, not completion time).  Both mechanisms the reviewer describes …
- **Fix check:** The proposed fix is correct and safe. Caching the in-flight promise synchronously (`registryCache = { promise, loadedAt: Date.now() }` right after creating `promise`) is the standard promise-dedup pattern and resolves both points. It correctly preserves the existing intentional behavior of NOT …

### 38. [css] .mcc__cursor--idle is dead and duplicates .mcc__cursor's animation
- **Location:** `src/styles/mobile-contact-card.css:205-207`
- **Why:** Unreachable rule that also happens to restate its base class — pure noise that implies a state (idle cursor) the component never enters.
- **Fix:** Delete the `.mcc__cursor--idle` rule.
- **Verified:** Verified directly against the current code. In src/styles/mobile-contact-card.css lines 205-207 the rule is `.mcc__cursor--idle { animation: mcc-cursor-blink 1.05s steps(1) infinite; }`. Its single `animation` declaration is byte-identical to line 201 on the base `.mcc__cursor` rule. A repo-wide grep for `mcc__cursor` shows the `--idle` modifier appears ONLY in this CSS file (line 205) and …
- **Fix check:** Correct and safe. The `.mcc__cursor--idle` selector is unreferenced anywhere (no static class, no classList.add, no concatenated/template className forming `--idle`), so deleting the three-line rule cannot alter any rendered output or animation. It is a pure CSS deletion: no effect on the static …

### 39. [css] Empty .layer--sky rule (comment only, no declarations)
- **Location:** `src/styles/mountain-scene.css:34-36`
- **Why:** An empty ruleset ships as dead bytes and reads like an unfinished stub. The note is useful but the selector adds nothing.
- **Fix:** Delete the empty rule; if the note is worth keeping, leave it as a standalone comment near `.mountain-scene`'s gradient where the tween actually happens.
- **Verified:** Read src/styles/mountain-scene.css lines 34-36. The file contains exactly `.layer--sky { /* the body gradient is what we tween — no SVG content needed */ }` — a selector with zero declarations, only a comment. The reviewer's quote matches the file verbatim. grep confirms `.layer--sky` is applied in MountainScene.astro (`<div class="layer layer--sky" data-layer="sky">`), but all rendering comes …
- **Fix check:** Correct and safe. Deleting an empty ruleset has no effect on the cascade, rendering, the static build, 60fps, or prefers-reduced-motion handling — the `.layer--sky` element still inherits all styling from the base `.layer` class. Keeping the note as a standalone comment near the `.mountain-scene` …

### 40. [dx] Command lookup is case-sensitive but tab-completion lower-cases the partial, so `HELP`+Tab and `HELP`+Enter disagree
- **Location:** `src/lib/terminal/dispatch.ts:33-38, 55-60`
- **Why:** Small inconsistency: tab-completion implies case-insensitivity, but the dispatcher is strict, so a user who tab-completes from an uppercased prefix or pastes a capitalized command gets a 'command not found'. Real terminals are case-sensitive, so this is defensible — but then tab-complete shouldn't lowercase either.
- **Fix:** Pick one model. Either lowercase `name` before `commandMap.get` (and build the map with lowercased keys) for a friendly case-insensitive CLI, or drop the `.toLowerCase()` in `tabComplete` so both paths are consistently case-sensitive.
- **Verified:** Verified against the current code in src/lib/terminal/dispatch.ts and its wiring. The two paths genuinely treat case differently:  1. Dispatch (case-sensitive): line 33 does `const cmd = commandMap.get(name)` where `name = tokens[0]` is the RAW, non-lowercased token (line 21). The map is built at terminal.ts:52 as `new Map(commands.map((c) => [c.name, c]))`, and every command name in commands.ts …
- **Fix check:** Both proposed options are correct and safe — pure string handling, no impact on the static build, 60fps, Three.js disposal, or reduced-motion. Option A (lowercase the lookup token: `commandMap.get(name.toLowerCase())`) works as-is because the map keys are already all lowercase, so the parenthetical …

### 41. [dx] pageTransition.ts reimplements theme validation instead of reusing theme.ts's isTheme
- **Location:** `src/lib/transitions/pageTransition.ts:90-97`
- **Why:** Two parallel sources of truth for the theme set. Adding a fifth theme requires editing both the `THEMES` array and this local predicate; missing the local one would silently mis-validate stored session themes. pageTransition.ts already imports `Theme` from theme.ts, so the import cost is zero.
- **Fix:** Delete `isValidTheme` and import `isTheme` from '../theme'; replace the two call sites (`isValidTheme(stored)`, `isValidTheme(raw)`) with `isTheme(...)`.
- **Verified:** Verified directly against both files. pageTransition.ts lines 90-97 define a hand-written `isValidTheme(value: string | null): value is Theme` that checks `value === 'home' || value === 'projects' || value === 'experience' || value === 'contact'` — exactly the four-string union the reviewer quoted. theme.ts (line 13) already exports `isTheme(value: unknown): value is Theme` backed by the `THEMES` …
- **Fix check:** Correct and safe. The signatures differ only in input type — `isValidTheme` takes `string | null`, `isTheme` takes `unknown`. Both call sites pass `string | null` values (`document.body.dataset.theme ?? null` and `sessionStorage.getItem(...)`), and `unknown` accepts those, so the swap is type-safe; …

### 42. [elegance] Per-impact decay-energy pattern is hand-rolled four times instead of a tiny helper
- **Location:** `src/lib/three/homeScene.ts, src/lib/three/buildExperienceZoneDecor.ts, src/lib/three/buildProjectsZoneDecor.ts:homeScene 788-799 (collisionFlash/collisionRim); buildExperienceZoneDecor 442-449 (clickImpulse); buildProjectsZoneDecor 176-179 (spinImpulse)`
- **Why:** Same decaying-impulse idea expressed four ways adds reading overhead when comparing the scene builders side by side, though each instance is small and the PEAK/DECAY constants legitimately differ — hence nit, not a must-fix.
- **Fix:** Optional: a 2-line `decayImpulse(value, delta, rate)` returning `Math.max(0, value - delta*rate)` makes each call site one line and names the intent. Only worth doing if these files are touched for another reason.
- **Verified:** The shared decay-clamp line genuinely appears four times across the three cited files, and the citations are accurate: - homeScene.ts:792-795 `collisionFlashEnergy = Math.max(0, collisionFlashEnergy - delta * COLLISION_FLASH_DECAY)` and :799 `collisionRimEnergy = Math.max(0, collisionRimEnergy - delta * COLLISION_RIM_DECAY)` (two instances, inside the `if (!reducedMotion)` block). - …
- **Fix check:** The proposed `decayImpulse(value, delta, rate) => Math.max(0, value - delta * rate)` is arithmetically identical to all four call sites, so it is safe for the static build, has zero runtime/60fps impact (a trivial pure function, inlinable), and preserves behavior exactly. It's correctly scoped as …

### 43. [perf] Per-frame object-literal allocation in the title hover hot path (zoneScreenHotspot)
- **Location:** `src/lib/three/homeScene.ts:450-458, 814-816`
- **Why:** Two tiny objects per frame won't move the FPS needle, but they add steady minor-GC pressure for no reason in a scene whose explicit bar is sustained 60fps, and they contradict the file's own zero-alloc convention which makes the code harder to reason about as 'allocation-free'.
- **Fix:** Inline the projection+hit-test directly in the zones loop (it already has `mxPx`/`myPx`), computing hx/hy/hr as locals without a helper, or have `zoneScreenHotspot` write into a reused module-scope scratch object instead of returning a new literal.
- **Verified:** Verified against the current code. src/lib/three/homeScene.ts:450-458 — `zoneScreenHotspot` ends with `return { x, y, r };`, a fresh object literal on every call. It is invoked once per zone at line 815 (`const { x: hx, y: hy, r: hr } = zoneScreenHotspot(entry);`) inside the `for (const entry of zones)` loop (814-820), which lives in the `tick` function (defined at 726, scheduled via …
- **Fix check:** Correct and safe. The returned x/y/r are consumed immediately in the same loop iteration and never retained, so either proposed fix is behavior-preserving: (a) inline the getWorldPosition/project/hit-test into the loop (mxPx/myPx are already locals there) computing hx/hy/hr directly, or (b) have …

### 44. [perf] dataFeedConsole.paint allocates two throwaway arrays on every paint
- **Location:** `src/lib/home/dataFeedConsole.ts:142-143`
- **Why:** The buffer is only ~5 elements and the widget is a small 2D canvas, so the cost is negligible — but the file is otherwise carefully optimized (dirty-check + 60fps cap + offscreen pauser) specifically to minimize per-frame work, so these two allocations are an avoidable wart inconsistent with the surrounding effort.
- **Fix:** Compute the visible window without intermediate arrays: track that `visible` is the last MAX_LINES of `buffer` plus the active line, and iterate with index math (e.g. compute `start = Math.max(0, buffer.length - (active ? MAX_LINES - 1 : MAX_LINES))` and loop), or maintain a single reused scratch array filled in place.
- **Verified:** Lines 142-143 match the reviewer's quote exactly: `const all: ConsoleLine[] = active ? [...buffer, active] : buffer;` followed by `const visible = all.slice(-MAX_LINES);`. The `slice` on line 143 allocates a fresh array on every paint regardless of branch; the spread on line 142 allocates a second array only when `active` is non-null (when active is null, `all` aliases `buffer` with no spread …
- **Fix check:** Correct in principle and safe for the static build / 60fps. A reused scratch array or index-math window (start = buffer.length - (active ? MAX_LINES-1 : MAX_LINES)) would eliminate both allocations. The rewrite must faithfully reproduce the existing windowing semantics that the draw loop depends …

### 45. [perf] manifest.webmanifest and the served PDFs get no Cache-Control rule
- **Location:** `vercel.json:36-43 (cache rules) and 45-63 (catch-all)`
- **Why:** The manifest and the multi-hundred-KB PDFs (skills-registry.pdf ~384KB, skills-suite-calibration.pdf ~434KB) are static and rarely change but are re-fetched without an explicit cache policy, costing bandwidth and TTFB on repeat views / installs. Minor, but trivially fixable and consistent with the other asset rules already present.
- **Fix:** Add a Cache-Control rule for `/manifest.webmanifest` (e.g. max-age=86400) and one for `/(.*)\.pdf` (e.g. public, max-age=604800), mirroring the existing favicon/og entries.
- **Verified:** Read vercel.json directly. The cache rules are exactly as described: /_astro, /fonts, /audio (lines 10-34, immutable 1yr), /favicon.svg and /og-(.*)\.(svg|png) (lines 36-43, max-age=86400). The catch-all /(.*) at lines 44-63 sets only security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy, CSP) and no Cache-Control — accurate. …
- **Fix check:** Correct and safe. Adding a /manifest.webmanifest rule (max-age=86400) and a /(.*)\.pdf rule (public, max-age=604800) mirrors the existing favicon/og entries and is header-only — it does not touch the static build, JS bundles, or animations, so it cannot affect the fully-static-output constraint or …
