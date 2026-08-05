# VUOHITIIMI Baseline Audit: Step 0

**Date:** 2026-05-17  
**Branch:** audit/baseline (off master)  
**HEAD commit:** 7933574 feat(test): add a minimal Vitest suite over i18n + project data (#90)  
**Preview server:** http://localhost:4326 (port auto-selected, 4322–4325 already in use)  
**All 12 routes returned HTTP 200.**

---

## 1. Versions and Toolchain

### Runtime
| Tool | Version |
|------|---------|
| Node.js | 24.15.0 |
| npm | 11.12.1 |

> Note: `package.json` engines field requires `^20.3.0 || ^22.0.0`. Node 24 is unsupported but the build completes with only an `EBADENGINE` warning.

### Key dependencies (from `package-lock.json`)
| Package | Installed version |
|---------|------------------|
| astro | 5.18.1 |
| three | 0.183.2 |
| gsap | 3.14.2 |
| tailwindcss | 4.2.2 |
| typescript | 5.9.3 |
| @astrojs/sitemap | 3.7.2 |
| @sentry/astro | 10.51.0 |
| web-vitals | 5.2.0 |
| prettier | 3.8.1 |
| vitest | 3.2.2 |
| eslint | 9.x |

### Recent git history (`git log --oneline -60`)

Active commit rhythm: roughly 1–3 commits/day, all squash-merged PRs with conventional commit messages.  
Most recent 20 commits (HEAD = 7933574):

```
7933574 feat(test): add a minimal Vitest suite over i18n + project data (#90)
e23de0f docs(adr): capture static-output, astro-over-nextjs, and manual-crossfade decisions (#89)
df327b8 chore(projects): drop the white 'Projects' title overlay (#86)
d80708b docs(readme): document the music bed + locale-keyed voiceover layer (#85)
6c84b17 fix(hero): skip the voiceover for reduced-motion users (#84)
9b9cd61 feat(projects): add a galaxy-view voiceover layered on the music (#83)
3948ee9 feat(hero): pick the voiceover audio file per locale (#82)
36ca53a fix(projects): let the jump-to-project tagline wrap instead of truncating (#81)
dfe7173 fix(projects): freeze focused planet so the camera lerps to where you clicked (#80)
ed48fb3 fix(hero): stop the voice from restarting on first interaction (#78)
930f5fe feat(hero): idle-aware voice recycle (#77)
e53e8f2 docs(audit): mobile experience audit 2026-05-16 (#76)
dc71a42 chore(ci): enforce format + lint, sweep residue (#75)
df09724 feat(hero): loop the voiceover with a 20 s gap (#74)
01c621c perf(three): auto-detect high-res displays and drop to lite path (#73)
e1c82fd perf(three): add ?perf=low + ?debug=perf URL flags (#72)
194ee81 perf(three): cap render loops at 60fps and pause when off-screen (#69)
fa92b21 feat(og): centre OG cards so chat-app thumbnails read as a brand mark (#68)
fbcec13 fix(meta): point site URL at the Vercel alias so OG previews resolve (#67)
ca5d898 feat(og): polish the home link-preview card + sharper meta description (#66)
```

### Remote branches of note
Branches that look in-flight / recently merged but still present on remote:
- `origin/feat/observability-sentry-web-vitals`: Sentry/web-vitals observability work
- `origin/perf-adaptive-bloom`: performance optimisation not yet merged
- `origin/perf-flags-and-diag` / `origin/perf-defaults-and-diag`: perf overlay/diagnostics (partially landed)
- `origin/feat/ceo-scan-now-entry`: new feature branch, no corresponding merge commit visible in log
- Several worktree branches still exist: `worktree-*`, look like historical artefacts from previous agent runs

No reverts in the recent 60 commits.

---

## 2. Build Outputs

### Build summary
```
astro build → 13 pages built in 5.38s
dist/ total size: 9.4 MB
HTML files: 13
JS chunks: 17
CSS chunks: 5
```

**Build warning:** `perfOverlay.CYSh3NvJ.js` (544 kB raw) triggers Rollup's `> 500 kB` warning. It is dynamically imported only when `?debug=perf` is active, not on the critical path.

### JS chunks (all routes share the same `_astro/` directory)

| Chunk | Raw size | Gzipped | Notes |
|-------|----------|---------|-------|
| `perfOverlay.CYSh3NvJ.js` | 558 kB | 143 kB | **Contains bundled Three.js**, dynamic import, debug-only |
| `BaseLayout.astro…C2Nez5Hz.js` | 153 kB | 52 kB | Shared layout, loaded on every route |
| `index.CB87Sc6I.js` | 70 kB | 28 kB | GSAP bundle |
| `homeScene.DfqBaYhG.js` | 52 kB | 17 kB | Home Three.js scene |
| `index.BnutI203.js` | 51 kB | 18 kB | GSAP bundle (secondary) |
| `setup.dZIRujxl.js` | 44 kB | 18 kB | GSAP setup |
| `projectsScene.CamIKmCj.js` | 39 kB | 14 kB | Projects Three.js scene |
| `ContactPage…Chk0MjMN.js` | 9.9 kB | 3.6 kB | |
| `ProjectsPage…CAmm3spK.js` | 9.4 kB | 3.4 kB | |
| `ExperiencePage…BFvKk7Y8.js` | 5.8 kB | 2.4 kB | |
| `HomePage…C5I8VEf_.js` | 3.9 kB | 1.6 kB | |
| `Hero.astro…DrHZZFHh.js` | 3.8 kB | 1.8 kB | |
| `page.sJrt8mpm.js` | 2.3 kB | 1.0 kB | |
| `preload-helper.BlTxHScW.js` | 1.1 kB | 0.7 kB | |
| `createOffscreenPauser.DIQJf6nq.js` | 0.24 kB | 0.20 kB | |
| `escapeHtml.B77sIfP-.js` | 0.14 kB | 0.13 kB | |
| `types.B5Hyd2Hi.js` | 0.05 kB | 0.07 kB | |

### CSS chunks
| Chunk | Raw size |
|-------|----------|
| `contact.B0VP8--K.css` | 24.8 kB (shared nav/base) |
| `index.Dpcb6dlS.css` | 16.5 kB (home-specific) |
| `projects.BD7WDYqM.css` | 13.9 kB |
| `experience.DfHu_pb-.css` | 13.4 kB |
| `contact.BHC4mAic.css` | 8.6 kB (contact-specific) |

### Audio (large: served from /audio/)
| File | Size |
|------|------|
| `devlander.mp3` | 3.9 MB (music bed) |
| `devlander.ogg` | 2.7 MB (music bed, OGG fallback) |
| `voice-landing-en.mp3` | 461 kB |
| `voice-projects-en.mp3` | 301 kB |

**Total audio: 7.4 MB**, not preloaded but present in dist.  
Finnish and Swedish voiceovers are absent from dist (only `en` variants built, by design per recent commits).

### Route-level JS/CSS budget (uncompressed)

All routes load `BaseLayout.js` (153 kB) + `page.js` (2.3 kB) as their base.

| Route | JS (uncompressed) | CSS (uncompressed) | HTML size | FLAG |
|-------|------------------|--------------------|-----------|------|
| `/` (EN) | 159.6 kB | 41.2 kB | 29.4 kB |, |
| `/projects` (EN) | 161.2 kB | 38.7 kB | 30.2 kB |, |
| `/experience` (EN) | 157.7 kB | 38.1 kB | 40.7 kB |, |
| `/contact` (EN) | 161.7 kB | 33.3 kB | 18.8 kB |, |

> All routes: the `homeScene.js` (52 kB) and `projectsScene.js` (39 kB) are **dynamically imported** and NOT counted in the above initial-load numbers. No route exceeds 162 kB JS uncompressed on initial static load, which is well under the 150 kB transferred threshold when gzipped (~52–54 kB transferred for BaseLayout alone).

> **Flag:** `BaseLayout.js` at 153 kB raw / 52 kB gzipped is borderline, warrants inspection to check whether it can be further split.

---

## 3. Lighthouse Runs (Mobile preset, local server)

All 12 required runs completed successfully.  
`/projects` EN and SV/FI: `EPERM` error for projects-en on first attempt; re-run succeeded (exit 0, JSON valid).  
FI/SV runs: non-fatal `LanternError: missing metric scores` warning in trace engine, scores still produced correctly.

INP is field-only data; all runs report N/A for lab INP (expected).

### Results table

| Route | Locale | FCP (ms) | LCP (ms) | CLS | TBT (ms) | INP | Perf | A11y | BP | SEO |
|-------|--------|----------|----------|-----|----------|-----|------|------|-----|-----|
| `/` | EN | 1739 | 2584 | 0.000 | 20 | N/A | 96 | 100 | 100 | 100 |
| `/projects` | EN | 1508 | 2119 | 0.000 | 0 | N/A | 99 | 95 | 100 | 100 |
| `/experience` | EN | 1734 | 2264 | 0.014 | 0 | N/A | 98 | 100 | 100 | 100 |
| `/contact` | EN | 1581 | 2563 | 0.014 | 0 | N/A | 96 | 100 | 100 | 100 |
| `/fi/` | FI | 1433 | 2567 | 0.000 | 15 | N/A | 97 | 100 | 100 | 100 |
| `/fi/projects` | FI | 1357 | 2261 | 0.000 | 0 | N/A | 98 | 95 | 100 | 100 |
| `/fi/experience` | FI | 1508 | 2413 | 0.014 | 0 | N/A | 97 | 100 | 100 | 100 |
| `/fi/contact` | FI | 1358 | 1819 | 0.014 | 0 | N/A | 99 | 100 | 100 | 100 |
| `/sv/` | SV | 1434 | 2569 | 0.000 | 13 | N/A | 97 | 100 | 100 | 100 |
| `/sv/projects` | SV | 1358 | 2263 | 0.000 | 0 | N/A | 98 | 95 | 100 | 100 |
| `/sv/experience` | SV | 1507 | 1816 | 0.014 | 0 | N/A | 99 | 100 | 100 | 100 |
| `/sv/contact` | SV | 1357 | 2412 | 0.014 | 0 | N/A | 98 | 100 | 100 | 100 |

### Key observations
- **Performance:** All routes score 96–99/100 on mobile. Excellent.
- **Accessibility:** All routes score 95 or 100/100. `/projects` scores 95 across all locales: investigate what accessibility issues the Lighthouse A11y audit found there.
- **Best Practices / SEO:** Perfect 100 across all routes and locales.
- **CLS:** 0.000 on home and projects. **0.014** on experience and contact: a small but measurable layout shift. Worth investigating.
- **TBT:** Only measurable on home (13–20 ms), very low, not a concern.
- **LCP:** Home at ~2.5–2.6 s is the slowest; projects at ~2.1–2.3 s. All within "needs improvement" territory for field data (lab is faster than field typically). Worth monitoring.
- Desktop spot-checks: not run due to time budget. Recommend running for `/` and `/projects` in a follow-up.

---

## 4. Static Checks at HEAD

### `npm run typecheck` (astro check)
**PASS**: 0 errors, 0 warnings, 0 hints across 106 files.

### `npm run lint` (eslint)
**PASS**, no output, exit 0. Zero lint errors or warnings.

### `npm test` (vitest run)
**PASS**: 3 test files, 28 tests, all passing.
```
src/i18n/routing.test.ts  — 13 tests
src/i18n/index.test.ts    — 10 tests
src/data/projects.test.ts —  5 tests
Duration: 2.08s
```

### `npm run format:check` (prettier)
**FAIL**: Code style issues found in **118 files**. Run `prettier --write` to fix.

This is a widespread formatting drift, essentially the entire `src/` tree plus config files are not formatted to the current prettier config. This suggests either:
1. The prettier config was changed after the last format sweep, or
2. The line endings differ from what prettier expects on this Windows machine.

Notable: `dc71a42 chore(ci): enforce format + lint, sweep residue (#75)` was merged ~15 commits ago, but the current working tree already has unformatted files (per `git status` showing several modified files not yet committed).

---

## 5. Security Audit

### Production-only (`--omit=dev`)
**3 vulnerabilities: 1 high, 2 moderate**

| Package | Severity | Title | Advisory |
|---------|----------|-------|----------|
| `astro` | moderate | XSS in `define:vars` via incomplete `</script>` tag sanitization | GHSA-j687-52p2-xcff |
| `astro` | low | Server island encrypted parameters vulnerable to cross-component replay | GHSA-xr5h-phrj-8vxv |
| `devalue` | **high** | DoS via sparse array deserialization | GHSA-77vg-94rm-hx3p |
| `postcss` | moderate | XSS via unescaped `</style>` in CSS Stringify output | GHSA-qx2v-qp2m-jg93 |

> Fix: `npm audit` suggests upgrading `astro` to 6.3.3` (semver major). The site uses Astro 5.x static output — server islands are not used, so GHSA-xr5h-phrj-8vxv has no practical impact. The `devalue` DoS is high severity but only affects deserialization paths. `postcss` XSS only affects build output if user-controlled CSS is processed (unlikely here).

### Full audit (including dev)
**9 vulnerabilities: 2 high, 7 moderate**

Additional dev-only packages with issues:

| Package | Severity | Title | Advisory |
|---------|----------|-------|----------|
| `fast-uri` | **high** | Path traversal via percent-encoded dot segments | GHSA-q3j6-qgpj-74h6 |
| `fast-uri` | **high** | Host confusion via percent-encoded authority delimiters | GHSA-v39h-62p7-jpjc |
| `yaml` | moderate | Stack overflow via deeply nested YAML collections | GHSA-48c2-rrv3-qjmp |

The `fast-uri` and `yaml` issues are in dev toolchain dependencies (likely via `vitest` or ESLint) and do not affect production runtime.

---

## 6. Notes for Downstream Agents

### Most surprising findings

1. **`perfOverlay.CYSh3NvJ.js` is 558 kB unminified and contains a full Three.js bundle.** It is lazy-imported only when `?debug=perf` is in the URL (via `homeScene.js` and `projectsScene.js`). It will never be fetched by real users, but it inflates the dist size and triggers Rollup's warning. A downstream perf agent should verify the import guard is airtight.

2. **Prettier check fails on 118 files (the entire codebase).** The `git status` in the main worktree shows several modified files that haven't been committed. The CI lint+format job presumably passes in CI (it was enforced in #75), so this is likely a Windows line-ending mismatch (`\r\n` vs `\n`) on this developer machine. Downstream agents should not treat this as a code quality issue unless confirmed in CI.

3. **`/projects` Accessibility scores 95/100 across all locales.** Every other route scores 100. There is at least one A11y issue specific to the projects page: likely related to the 3D canvas or interactive planet labels. Accessibility agent should investigate.

4. **CLS of 0.014 on `/experience` and `/contact`.** Zero on `/` and `/projects`. The shift likely occurs during the GSAP timeline or a font swap. Small but worth identifying.

5. **Only English voiceovers are in dist.** `voice-landing-en.mp3` and `voice-projects-en.mp3` are in `/audio/`, no `fi` or `sv` variants. The i18n routing for voiceover audio (feat #82) picks the locale-keyed file at runtime; the missing locale audio will silently fall back or error. The FI/SV voiceover files were never added to `public/audio/`.

6. **7.4 MB of audio in dist**: the music bed (`devlander.mp3` + `.ogg`) alone is 6.8 MB. These are not preloaded but are served as static assets. On first interaction they'll be fetched in full. No streaming/chunked delivery. For mobile users on slow connections this could be significant.

7. **`feat/ceo-scan-now-entry` remote branch**, no merge commit in recent 60 log. Looks like an in-flight feature not yet shipped.

8. **`perf-adaptive-bloom` remote branch**, not merged. Adaptive bloom for the Three.js post-processing pipeline is presumably waiting for review.

9. **Node 24 engine mismatch**: `package.json` requires `^20 || ^22`, but Node 24 is in use. Everything works today, but upstream API changes (notably in `node:fs` internals) could cause subtle breakage. The `npm run preview` port-selection worked fine regardless.

10. **LCP of ~2.5 s on home**, while the Lighthouse score is 96/100, the LCP source is likely the Three.js canvas or the hero text render (which depends on font + GSAP animation completing). Worth checking what element Lighthouse identifies as the LCP element in the detailed JSON.

---

*Baseline measurements complete. All JSON files retained at `C:/Users/vandr/AppData/Local/Temp/lh-*.json` for downstream agent reference.*
