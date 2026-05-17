# Audit A — Positioning & Narrative

**Auditor:** Agent A (read-only)
**Date:** 2026-05-17
**Branch:** audit/A (off audit/baseline)
**Scope:** Home page time-to-understanding, headline claim substantiation, seven-repo narrative legibility, CTA audit, funnel coherence, and clever-but-confusing copy.

All citations are source files in the worktree unless noted as `dist/index.html`.

---

## Findings by severity

---

### BLOCKERS

#### B-1: JSON-LD `jobTitle` is populated from narrative copy, not a job title

**File:** `src/page-content/HomePage.astro:44`
**Evidence:**
```js
jobTitle: t.intro.heading.replace(/\.$/, ''),
```
`t.intro.heading` resolves to `"Seven repos. They build on each other."` — confirmed in `dist/index.html`:
```json
{"@type":"Person","jobTitle":"Seven repos. They build on each other",...}
```
This is the value Google and LinkedIn read when a recruiter pastes the URL into a tool that consumes structured data. Every machine-readable profile built from this page says Mikko's job title is a narrative slogan, not a role.

**Suggested direction:** Set `jobTitle` to a literal string — `"Full-stack Developer"` — independent of `t.intro.heading`. The narrative heading should stay as it is; the schema field needs its own value.

---

### MAJORS

#### M-1: Time-to-understanding is deferred past the hero entirely

**Files:** `src/components/home/Hero.astro`, `dist/index.html`

**Evidence (cold-read, desktop):**

The full-screen hero (`100vh`) contains:
- `h1.sr-only`: `"Mikko Numminen"` — screen-reader only, not visible
- `hero__eyebrow`: `"portfolio · 2026"` — confirms it is a portfolio
- `hero__subtitle`: `"full-stack developer · finland"` — answers (a) role and (b) location
- `hero__corner--tr`: `"61° N · 24° E"` + `"tampere · hervanta"` — hidden at ≤860px

The subtitle delivers the core answers before the scroll, but at 55% opacity (`color: rgba(255,255,255,0.55)`) set in very small, widely-spaced uppercase mono (`letter-spacing: 0.25em`, `font-size: clamp(0.78rem, 1.4vw, 0.95rem)`). At typical reading distance and viewport sizes, this is peripheral design detail, not a headline.

For (c) — proof — there is nothing in the hero. The scroll hint says `"scroll"` with no hint that evidence follows. A recruiter who does not scroll sees: a name, "full-stack developer · finland", and a 3D particle animation. Proof is zero seconds away if they scroll, but there is no signal that it is there.

**Estimated time-to-understanding:**
- (a) what Mikko does: ~3 s (subtitle is discoverable, not prominent)
- (b) where he is: ~3–5 s (subtitle; corner coordinates hidden on mobile)
- (c) proof: ~15–25 s (requires scrolling to Intro section; no preview in hero)

**Suggested direction:** Either promote the subtitle font size and opacity so it reads as a genuine subhead, or add a one-line tease in the hero before the scroll hint (e.g., a stat or a "seven projects shipped this year" line). The scroll hint currently gives no reward signal.

---

#### M-2: Headline claims are stated but not linkable — "1828+ tests" and "91.9% coverage"

**Files:** `src/components/home/Intro.astro:29–45`, `src/i18n/locales/en.ts:62–63`, `src/i18n/locales/en.ts:161`

**Evidence:**

The Intro section displays `1828+` and `91.9%` as large typographic numbers. Focus section (`en.ts:62`) and project detail for HRM (`en.ts:161`) both repeat these figures. None of these are linked. The HRM planet in `/projects` has a GitHub link (`https://github.com/MikkoNumminen/HRManager`) and a live demo link, but when a recruiter reads `"1828+ tests at 91.9% coverage"` from the home page, there is no path to verify it without already knowing to navigate to Projects, click HRM, then open GitHub, then look at CI. That is a five-step verification chain for a claim positioned as the most prominent proof point on the page.

Additional unlinked figures:
- `"387 commits"` in Velocity (`en.ts:103`) — no link to the Spacepotatis GitHub
- `"~1170 tests"` in Velocity — same issue
- `"ten audited Claude Code skills"` in Focus item 03 (`en.ts:67`) — references `.claude/skills/` but not a link

The live demo at `https://hr-manager-pearl.vercel.app` is only surfaced after clicking through to the projects page and clicking the HRM planet. It is invisible on the home page.

**Suggested direction:** Each quantified claim in Intro and Focus should either link directly to the supporting artifact (GitHub Actions CI badge, a specific commit, the coverage report page) or be followed by a visible `→ HRM on GitHub` anchor. A claim this precise that can be spot-checked should be spot-checkable in one click.

---

#### M-3: "VUOHITIIMI" is named nowhere on the live site; the narrative claim is invisible to first-time visitors

**Files:** `src/i18n/locales/en.ts:47`, `README.md:1`

**Evidence:**

The README header reads `# mikkonumminen.dev` with a subtitle referencing "VUOHITIIMI" only in the audit context (baseline.md calls it the "VUOHITIIMI narrative"). The word `VUOHITIIMI` does not appear anywhere in `en.ts`, any component, or `dist/index.html`. The site's copy refers only to `"vuohiliitto.com"` (a live URL in the Intro body and in the Platform integration entry). The guild connection is there, but the "goat team" organizational wrapper is README-only.

**Why this matters:** The README and the audit scope describe this as a key narrative ("seven-repo VUOHITIIMI narrative"), but a first-time visitor sees only individual project names with brief inter-connections. The strategic claim that these seven repos form a deliberate, maintained ecosystem — not just a portfolio dump — is present in the copy but is not named or foregrounded.

**Suggested direction:** This is a naming and framing decision. If VUOHITIIMI is meant to be the unifying brand, either name it on the site (even as a footnote in the intro body) or accept it is a developer-facing label only. If the latter, the narrative on the site ("Seven repos. They build on each other.") must do all the framing work, and the copy should be reviewed to confirm it does.

---

#### M-4: `/projects` and `/experience` have no CTA pointing toward conversion

**Files:** `src/page-content/ProjectsPage.astro`, `src/page-content/ExperiencePage.astro`

**Evidence:**

`/projects` (`ProjectsPage.astro`): The page is a full-screen WebGL solar system with a side panel listing projects. The only navigation affordance is the persistent top nav. There is no bottom section, no footer CTA, no "want to work together?" prompt. After a recruiter finishes exploring the projects, the only path forward is the nav bar or the browser back button.

`/experience` (`TimelineContent.astro:125–129`): The experience page is the exception — it does have a CTA at the summit:
```html
<a href="/contact" class="timeline__cta">
  <span class="timeline__cta-text">drop into the terminal →</span>
</a>
```
This is good. But it is only reachable after scrolling past all timeline entries to the summit, which may be 10–15 scrolled viewports on a typical display.

`/` has `NavCards` at the bottom linking to all three pages including contact. But the navcard contact description is `"Drop into a terminal and reach me directly."` — functional, but the CTA voice is navigational, not motivational ("reach me" vs. "let's talk").

**Suggested direction:** Add a minimal CTA block at the bottom of `/projects` (can reuse the same terminal-card design from NavCards). On `/`, make the contact NavCard copy more action-oriented.

---

### MINORS

#### m-1: "12-day Spacepotatis" statistic is inconsistently stated

**File:** `src/i18n/locales/en.ts:104`, `103`

**Evidence:**

Velocity section body (`en.ts:102`): `"Spacepotatis went from empty repo to live browser game in two weeks"`

Velocity stat label (`en.ts:104`): `"days from empty repo to live Spacepotatis"` with `num: '12'`

"Two weeks" vs. "12 days" — these are not equivalent. One is rounded up (14 days = 2 weeks), the other is the precise figure. A recruiter who reads both in one scroll will notice the inconsistency. This is minor because they are adjacent and the stat number "12" is the more prominent figure, but the body copy should say "12 days" not "two weeks" to match.

**Suggested direction:** Change Velocity body copy to "twelve days" (or "12 days") to match the stat.

---

#### m-2: Project descriptions mention "Stryker mutation testing" only in experience timeline, not in project detail

**File:** `src/i18n/locales/en.ts:280–283`

**Evidence:**

The timeline entry for `2026-build` includes a lesson:
> `"HRM runs Stryker on every PR. 91.9% line coverage means the lines ran; the mutation score means the assertions actually catch bugs."`

This is a meaningful quality signal. But the HRM project detail description (`en.ts:160`) does not mention mutation testing or Stryker. The projects page is where a recruiter would look for technical rigor, but the supporting evidence is buried in the experience timeline.

**Suggested direction:** Add Stryker/mutation testing to HRM project highlights or description.

---

#### m-3: AudiobookMaker has no live demo link; its proof of craft is inaccessible

**File:** `src/data/projects.ts:169–194`

**Evidence:**
```ts
{
  id: 'audiobookmaker',
  ...
  githubUrl: 'https://github.com/MikkoNumminen/AudiobookMaker',
  // No liveUrl
  status: 'wip',
}
```
AudiobookMaker ships "as a Windows installer with auto-updates" but there is no link to the GitHub Releases page where the installer lives. A recruiter who is curious about a 1729-test desktop app with voice cloning has no path to download or inspect a release from the portfolio.

**Suggested direction:** Add `liveUrl` pointing to the GitHub Releases page (e.g., `https://github.com/MikkoNumminen/AudiobookMaker/releases`).

---

### NITS

#### n-1: `strudel-patterns` has no live demo link despite being a "live-coded" project

**File:** `src/data/projects.ts:200–235`

**Evidence:** The description says `"Live-coded electronic music written in Strudel"` but there is no `liveUrl`. Strudel patterns can typically be shared as URLs on the Strudel REPL. A link to even one playable track would substantiate the claim.

**Suggested direction:** Add at least one Strudel REPL share link as `liveUrl`, or add a note in description if public sharing is not possible.

---

#### n-2 [judgment]: "Spacepotatis" — the name pays for itself

**File:** `src/i18n/locales/en.ts:190`, `src/data/projects.ts:196`

**Assessment:** "Spacepotatis" (Swedish: "space potato") is unusual but immediately decoded in context: `"browser shooter — your potato vs the galaxy"`. The tagline does the translation work. The name is memorable, consistent with the project's tone (a deliberately campy terminal-boot-to-arcade-combat game), and signals that the creator does not take themselves too seriously. Cognitive load is low because the tagline eliminates ambiguity in one line.

**Verdict:** Pays for itself. No change recommended.

---

#### n-3 [judgment]: "Strudel Patterns" — marginally confusing without context

**File:** `src/data/projects.ts:225`, `src/i18n/locales/en.ts:201`

**Assessment:** "Strudel" is the name of a JavaScript pattern engine (a TidalCycles port). For anyone outside the live-coding community, the word reads as the pastry. The description clarifies this in sentence two (`"a JavaScript pattern engine, port of TidalCycles"`), but the tagline `"Algorithmic music in Strudel"` leaves the uninitiated visitor parsing "algorithmic music in pastry" for a beat.

**Verdict:** Small cost, recoverable by reading. Acceptable as-is, but moving the engine name clarification to the tagline would eliminate the confusion entirely (e.g., `"Algorithmic music via live-coded Strudel patterns"`).

---

#### n-4 [judgment]: "VUOHITIIMI" — zero cost because it is invisible to visitors

**File:** Not present on the live site (README-only)

**Assessment:** Since the word does not appear anywhere in the site copy, no visitor is burdened by it. It functions as an internal project codename. The potential cost would only arise if it were surfaced — at which point the Finnish goat-team pun would need a translation assist for the EN/SV audiences.

**Verdict:** Not a live-site issue. Document this as a README/developer-facing codename and make no change unless the brand is intentionally surfaced.

---

## Funnel coherence assessment

The four pages as experienced in sequence:

1. **`/` (home):** Establishes identity (name + role + location in hero), then presents evidence in five scroll sections (about → connections → integrations → velocity → nav cards). Ends with cards pointing to all three pages equally.

2. **`/projects`:** Delivers depth on each project but does not orient the visitor relative to the home-page claims. A recruiter who jumps here directly misses the "seven repos that build on each other" framing. The page is self-contained but not funnel-aware.

3. **`/experience`:** Tells the chronological story and ends with a direct CTA to `/contact`. This is the strongest funnel link in the site.

4. **`/contact`:** Terminal interface. Functional. No summary of "why contact" — assumes the visitor is already motivated.

**Coherence verdict:** The funnel exists in spirit (intro → proof → story → contact) but it is parallel, not sequential. The home page presents all three next-step cards as equally weighted options. A first-time recruiter can choose any order and will not feel they have missed a setup. The experience page is the only page that actively pushes toward contact. The projects page is a dead-end. This is a minor structural weakness, not a breaking one — the site is clearly portfolio-mode, not SaaS-funnel mode — but the absence of any CTA on `/projects` leaves the most evidence-rich page without a next step.

---

## What I didn't cover

- No recruiter user testing or eye-tracking data — reading-time estimates are cold-read inferences, not measured.
- No A/B or heatmap evidence for which sections visitors actually reach.
- Did not audit Finnish or Swedish locale copy — findings are EN-only.
- Did not audit mobile hero rendering in detail — the baseline audit notes that corners are hidden at ≤860px, which changes M-1's time-to-understanding on mobile; no measurement was made.
- Did not audit the contact terminal for messaging coherence — out of scope.
- Did not review OG card copy against the findings here — a separate concern.
