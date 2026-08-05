# Iteration 0: raw assessor returns

Verbatim panel output, one section per dimension, kept unedited so the
aggregated scores in `LEDGER.md` can be checked against what the assessors
actually said. Rejected suspicions are kept deliberately: they stop later
iterations re-litigating gaps that inspection already disproved.

---

## 5. Automation & tooling: 6.8 (weight 12%)

**Carried by:** workflows are genuinely disciplined (explicit least-privilege
permissions, per-job timeouts, a real docs↔package.json drift guard, a properly
gated Python backend, well-reasoned dependabot holds). Held back by incomplete
branch-protection wiring, so CI is not actually a hard gate.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | Branch protection on `master` requires only the `chat-backend` context. `check` (typecheck/format/lint/test:coverage/build), E2E `scenes`, and CodeQL `Analyze` are not required, a PR can merge with any of them failing. Verified live against the GitHub API, not inferred. The comment at `.github/workflows/ci.yml:44-46` assumes `check` is already required; it is not. | 1.5 | S |
| 2 | `.github/workflows/ci.yml:60-63` runs `ruff check`, `mypy`, `pytest` but never `ruff format --check .`, which `chat-backend/README.md:369-373` documents as part of the gate. CI enforces less than the docs promise. | 0.5 | S |
| 3 | `.github/workflows/codeql.yml:7-11` triggers on `pull_request`/`push` with no `concurrency` block, unlike `ci.yml:14-17` and `e2e.yml:15-17`. Redundant analyses queue instead of cancelling. | 0.4 | S |
| 4 | No single local command reproduces the `check` job. `README.md:151-162` lists five separate commands; `package.json` has no `verify`/`ci` script chaining them. | 0.35 | S |
| 5 | Every `uses:` step pins a floating major tag, not a commit SHA (`actions/checkout@v7`, `setup-node@v7`, `setup-python@v7`, `codeql-action/{init,analyze}@v4`, `upload-artifact@v7`). Partially mitigated by dependabot watching `github-actions`, but a tag re-point between runs would execute silently. | 0.3 | M |
| 6 | `.github/dependabot.yml` has no `docker` ecosystem entry for `chat-backend/Dockerfile:5` (`python:3.12-slim`), so the base image gets no update PRs. Low severity, that image is a local/WSL artifact, never built in CI. | 0.15 | S |

**Rejected after inspection** (do not re-litigate):

1. "The Python backend is never CI-checked": false. `.github/workflows/ci.yml:47-63` runs ruff, mypy and pytest on every push/PR with its own timeout.
2. "A workflow is missing `permissions:`": false. All three declare `contents: read` at workflow level; `codeql.yml:23-24` adds job-scoped `security-events: write` only where needed.
3. "A job is missing `timeout-minutes`": false. Every job in all three workflows sets one.
4. "No docs↔scripts drift guard exists": false. `scripts/docs-sync.test.mjs` asserts every `prebuild` step is named in the README and that the README documents no dead script; it runs under `test:coverage`.
5. "`concurrency` is missing across the board": false for `ci.yml` and `e2e.yml`; only `codeql.yml` lacks one (gap 3).
6. "Dependabot isn't configured": false. Three ecosystems, grouped PRs, and specifically justified version holds tied to peer-dependency conflicts.

**Note for the fix phase:** gap 1 is a repository *settings* change, not a file
change. It cannot land in this PR and needs the owner's decision: tightening
required checks changes what the owner themselves can merge.

---

## 7. Machine-readable artifacts: 7.6 (weight 7%)

**Carried by:** two real JSON Schemas gating their data files as a hard
`npm run build` CI step, and content-collection frontmatter that is a genuine Zod
schema with enums and refinements. Held back by eval fixtures and agent-verdict
outputs having no declared shape at all.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | The five eval fixtures (`chat-backend/evals/eval_set*.json`, `shoutbox_redteam.jsonl`) have no schema, pydantic model, or dataclass anywhere. `run_eval.py:55-60` only checks `data["queries"]` is a list of dicts; per-entry fields are read with untyped access downstream, so a malformed fixture surfaces as a `KeyError` deep in scoring. Only one fixture gets any structural check, on two fields. | 0.9 | M |
| 2 | `public/data/skills-registry.schema.json:9-84` declares only `type`/`required`/`$ref`/`oneOf`, no `enum`, no `minimum`, and `additionalProperties: true` throughout, despite a closed value space (`receipt.source` is only ever one of three strings; the token counts should be `minimum: 0`). A misspelled key in the artifact served to the public terminal passes validation silently. | 0.6 | S |
| 3 | `.claude/agent-verdicts/*.json` (34 files) have no schema and nothing checks them, yet `scripts/sync-skill-registry.mjs:20-30,51` picks the newest by filename regex and `writeFileSync`s it verbatim into the served `public/data/skills-registry.json`. A hand-edited verdict is promoted straight to the public artifact with no shape check. | 0.5 | S |
| 4 | `sync-skill-registry.mjs:32-53` records the source's `generated_at` but not which process produced the copy or when it ran; two sync events on the same source are indistinguishable in the committed JSON. | 0.3 | S |
| 5 | `public/data/shoutbox.schema.json` declares `const`, `minimum`, and `additionalProperties: false`, none of which `scripts/lib/validate-json-schema.mjs` implements. Fully compensated by hand-rolled equivalents in `validate-shoutbox.mjs:53-93` and openly documented in both files, so effective coverage is fine; the schema file overclaims to any *other* consumer (editor tooling, a future script). | 0.2 | S |

**Rejected after inspection** (do not re-litigate):

1. "The dependency-free validator silently under-checks shoutbox": the limitation is documented in a comment and hand-rolled equivalents exist. Downgraded to a documentation-consistency nit (gap 5), not a coverage hole.
2. "`content/code/readlog/prisma/schema.prisma` is an unvalidated data schema". It is a demo project's ORM schema under `content/code/`, out of scope.
3. "Schema validation is a local convenience, not a CI gate": false. `package.json:23` wires both validators into `prebuild`, and `ci.yml:41` runs `npm run build`, which npm invokes `prebuild` before. A schema violation fails the PR.
4. "Blog frontmatter has no enforced enums": false. `src/content.config.ts:69,96` use closed Zod enums and `:83-88` refines against the live project-id list.

---

## 2. Code legibility: 9.3 (weight 18%)

**Carried by:** doc-header discipline, WHY-not-WHAT comments, and justified
numeric constants holding uniformly across `src/`, `chat-backend/`, `scripts/`
and `.claude/skills/`. One file shows a real but minor gap.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | `chat-backend/ragctl.py:1-29`, the module docstring lists `status/watch/doctor/up/down/model/english` but never the `queue`/`approve`/`reject`/`reply`/`publish` shoutbox-moderation verbs, a ~290-line security-relevant feature at `:1327-1618`. A reader trusting the file's own header would not know this file moderates the shoutbox. | 0.3 | S |
| 2 | `chat-backend/ragctl.py` (1731 lines) bundles CLI dispatch, a status board, Windows-interop shims, a watchdog daemon, a security pre-flight and shoutbox moderation. Each section is internally well-commented and the co-location is explicitly justified at `:1329-1333`, so this is a soft concern, not an unexplained one. | 0.2 | M |

**Rejected after inspection** (do not re-litigate):

1. "`page-content/*.astro` files lack doc blocks". They are thin compositional wiring; the non-obvious bits (commit-line truncation, climb inversion) do carry WHY comments. The convention is "doc block scales with non-obviousness," applied consistently.
2. "~28 header-less `.ts` files in `three/` and `terminal/`": found by a naive first-3-lines grep, disproved by direct reads: every one carries an export-level JSDoc. **This is the same false positive June's strict panel produced ("~45 header-less files"). It has now been disproved twice, do not raise it a third time.**
3. "Voiceover components missing PARALLEL TO markers": all three carry it, and it is propagated to the scene layer and CSS, exceeding the requirement.
4. "Magic numbers in three.js/GSAP scenes are unexplained": sampled `field/tuning.ts`, `homeScene.ts`, `projectsScene.ts`, `experienceTimeline.ts`; all grouped under block comments giving the design reasoning.
5. "Trivial WHAT-only comments": searched the common smell patterns across `src/`, `chat-backend/`, `scripts/`; zero matches outside test files.
6. "Unexplained TODO debt markers". Both TODOs in `apply-measurement-overlay.mjs` name the failure mode and enumerate fix options.

---

## 1. Onboarding & navigation: 8.7 (weight 18%)

**Carried by:** thorough, cross-linked docs (README, AGENTS.md,
`chat-backend/README.md`, `docs/rag-chat.md`, the ADR index, per-directory maps)
that an agent could act on almost entirely unassisted. Docked almost entirely for
stale numeric claims that would make an agent distrust its own verification run.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | `README.md:111`, `AGENTS.md:191`, `chat-backend/README.md:266,269`, `docs/rag-chat.md:391,437` all describe the acceptance harness as "9 cases"/"9/9". `chat-backend/evals/acceptance.py:441-476` now has 11 static cases plus the 16 golden must-refuse queries pulled from `eval_set.json`, 27 run by default. An agent following the documented claim sees a mismatched result and cannot tell whether the doc or the harness is broken. | 0.5 | S |
| 2 | `chat-backend/README.md:253` says `eval_set.json` "holds 17 questions"; it holds 58 (42 `must_retrieve` + 16 `must_refuse_*`). Same stale-count pattern, same file. | 0.3 | S |
| 3 | `README.md:127` and `docs/rag-chat.md:11` point to `LAUNCH.md` as the host-setup runbook for "publishing the backend via a Tailscale Funnel", but LAUNCH.md's steps 0-7 are entirely Cloudflare named-tunnel (`cloudflared`, `TUNNEL_TOKEN`), zero mentions of Tailscale. The drift is acknowledged at `docs/rag-chat.md:14-15`, but only there, not in LAUNCH.md itself nor in the README pointer. An agent that opens LAUNCH.md directly gets a runbook for infrastructure that is not live. | 0.4 | M |
| 4 | `scripts/generate-blog-drafts.mjs` / `npm run blog:drafts` (`package.json:22`) is a real guarded tool with zero mentions in README, AGENTS.md, or `docs/` (repo-wide grep). Discoverable only by opening the file. | 0.1 | S |

**Rejected after inspection** (do not re-litigate):

1. "CLAUDE.md is missing from the onboarding docs". It is deliberately gitignored (`.gitignore:49`) and untracked, i.e. local per-machine guidance. `AGENTS.md` is the committed contract. A deliberate split, not an oversight.
2. "README's script list has drifted from package.json": every one of the 15 scripts named in README's Local development section exists verbatim in `package.json:9-33`, and AGENTS.md's Commands block matches too.
3. "The `content/code/` 55-file claim is inflated": `find content/code -type f | wc -l` returns exactly 55.
4. "`.claude/skills/` aren't discoverable from committed docs": README lines 231-255 document all 7 by name with links, and all 7 exist.
5. "Broken doc cross-references": ~17 cited paths across README/AGENTS/chat-backend README were checked; all resolve.

---

## 4. Decision & rationale: 8.3 (weight 12%)

**Carried by:** 16/16 ADRs template-complete with genuine rejected-alternatives
and disciplined two-way supersession; in-file rationale in `chat-backend/` is
exceptional. Held back by two genuinely unrecorded recent decisions and an
audits index that orphans most of its own directory.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | ADR 0009 carries an "Update" line for the Gemma→qwen2.5:7b swap (`docs/decisions/0009-rag-chat-backend.md:7`), setting the repo's own precedent for recording a model change, but the later swap of the *deployed* default to Poro never got one, despite being backed by a 3-layer, 540-generation blind study (`content/posts/rag-finnish-blind-test.md`). `.env.example:36` and `config.py:31` still read as if qwen2.5:7b were the whole story. | 0.7 | S |
| 2 | `docs/audits/README.md:6-18` indexes 7 reports; the directory holds ~30. Unindexed and unlinked from anywhere in the repo: all seven `rag-phase0..6-2026-06-28.md`, `corpus-gaps-2026-06-25.md`, `audit-2026-05-26.md`, both `readme-drift-*.md`, `MOBILE-AUDIT-2026-05-15.md` (05-16 *is* indexed), and three PDFs. | 0.5 | S |
| 3 | No ADR for the shoutbox (PRs #492-#499) despite three non-obvious, alternative-laden choices: the deliberate no-LLM gate (`shoutbox.py:22-24`), the moderation-queue-not-HTTP boundary (`moderate.py:1-17`), and Telegram-over-email (`notify.py:1-11`). Each file's doc-block is good; nothing ties the three together the way 0010 or 0012 do. | 0.3 | M |
| 4 | The research-coverage-precision work (#369-#372) rejected three approaches, distance threshold, framing-vocabulary whitelist, preposition adjacency, recorded only in a PR commit body, with no hit anywhere under `docs/` or `chat-backend/`. An agent that doesn't think to `git log --grep` could retry all three. | 0.15 | S |

**Rejected after inspection** (do not re-litigate):

1. "The particle-field rewrite shipped without an ADR": 0014 covers it, plus 0015/0016 for the follow-on work.
2. "Hybrid retrieval tuning has no decision record": 0011, with a substantive Considered-alternatives section.
3. "The same-origin chat proxy has no ADR": 0012.
4. "The no-LLM shoutbox gate is undocumented": false for in-file rationale (`shoutbox.py:22-24` states it with reasoning); only the centralization is missing (gap 3).
5. "ADR 0005 cross-references a dead file". It exists.
6. "Supersession pointers are one-directional". Both 0005↔0006 and 0015↔0016 carry reciprocal back-pointers.

---

## 3. Self-verification gates: 7.7 (weight 16%)

**Carried by:** a genuinely sophisticated adversarial test culture,
rule-attributed red-team cases, offline-faked pipeline tests that prove the model
is never called, XSS-payload DOM tests. Undercut by a merge gate that only
requires the Python job, an e2e suite that never interacts, and correctness-
critical async logic at 0%.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | Branch protection requires only `chat-backend`. The `check` job (typecheck/format/lint/test:coverage/build) and the `scenes` e2e job can go red and GitHub still allows the merge. For all of `src/`, a failing test does not block a merge without a human reading the checks tab, the opposite of what this dimension measures. **Independently found by the automation assessor via its own API call.** | 0.7 | S |
| 2 | `e2e/scenes.spec.ts` (91 lines, the only e2e file) is boot-only: load, nudge the mouse, assert no console error and a nonzero canvas. Nothing types a terminal command, submits the shoutbox form, or drives a real `/chat` SSE stream. Both actual hazards are verified only with `fetch` stubbed or entirely inside Python, never through the request the browser really constructs. | 0.5 | M |
| 3 | `src/lib/terminal/commands.ts` (501 lines) sits at 33% statements; its test file only asserts command-list metadata and never invokes a handler. This is exactly the file that `src/lib/terminal/dom.ts:17-20` names as "responsible for escaping every interpolation" before the `printHTML` innerHTML sink, no test would catch a future call site that forgets `escape()`. | 0.4 | M |
| 4 | `src/lib/lifecycle.ts:40-107`, 0% coverage, and not glue: it is a generation-token race guard preventing double-mount across Astro router swaps and disposing an async mount that resolves after a swap. Needs no WebGL, only `document.addEventListener` and promises, so it is trivially jsdom-testable. Nothing in the coverage exclude list documents it, because it is not excluded, just untested. | 0.3 | S |
| 5 | `vitest.config.ts:36-42` pins the ratchet at `lines/statements: 34` with a comment claiming "~35% current". A live `test:coverage` run today measured **51.66%**, ~17 points of slack, enough to delete a third of the tested surface before CI notices. | 0.2 | S |
| 6 | `src/lib/gsap/homeTimeline.ts` (339 lines, 0%) keeps its section-mood blending inside one monolithic `initHomeTimeline` with no pure logic extracted, the exact discipline `vitest.config.ts:29-31` credits the three.js files for. `src/lib/terminal/skills.ts` tests only `parseRegistry`; `runSkillsCommand`'s rendered output is unexercised. | 0.2 | M |

**Rejected after inspection** (do not re-litigate):

1. "The Python suite isn't wired into CI". It is, and it is the one required status check.
2. "The shoutbox gate lacks adversarial coverage": `test_shoutbox_redteam.py` asserts *which* rule refused (not merely that something did), includes accepted-controls so an over-eager gate can't hide, and pins a documented known gap (`rt-18`) rather than only recording wins.
3. "The terminal innerHTML sink lacks XSS tests": `dom.test.ts` runs a live `<img onerror=...>` payload through and asserts both the escaped string and that no `<img>` node was parsed.
4. "The eval fixtures are silently unexecuted": `acceptance.py` requires a live indexed backend and is deliberately not pytest-collected (documented in its own docstring); the pure-logic pieces are unit tested offline.
5. "The pre-LLM containment gate is only prompt-string-tested": `test_pipeline.py:430-450` exercises it with a `FakeLLM`/`FakeDB` and asserts the model is never invoked.

---

## 8. Security/ops docs: 6.8 (weight 7%)

**Carried by:** the backend's own containment docs are excellent and precise,
`docs/rag-chat.md`'s containment table with exact config keys, `shoutbox.py`'s
docstring (which states outright that the funnel exposes every route
unauthenticated and that the per-IP limit is therefore a courtesy check), ADR
0012, and a real `docs/deploy-rag-chat.md` runbook. Held back because the
*canonical* docs agents are pointed at describe a different, older system.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | `SECURITY.md:24-29` and `docs/security/threat-model.md:20-26` assert "no server runtime… no database, and no authentication" and "no form submissions stored server-side", contradicted by `chat-backend/` (FastAPI + Postgres) and the shoutbox write path, which stores submissions pending moderation. Neither doc mentions the backend, the funnel, or the chat anywhere. `AGENTS.md:125` and `CONTRIBUTING.md:52` send agents to these two files *specifically* for security boundaries. | 1.4 | M |
| 2 | `docs/security/threat-model.md:43-53` labels its CSP block "the canonical copy", but it no longer matches `vercel.json:82`: missing the funnel `connect-src` entry added by ADR 0012, and `manifest-src` reads `'self'` where the live header says `'none'`. This also breaches the doc's own invariant #4 ("no new third-party origins without updating this model"). | 0.9 | S |
| 3 | `AGENTS.md` has no mention of the shoutbox at all, despite it being a public write endpoint whose containment model (proxied-path rate-limit weakness, `QUEUE_MAX_PENDING` backpressure, link/markup rejection) exists only in `shoutbox.py`'s docstring. | 0.5 | S |
| 4 | `docs/security/threat-model.md:7`, "Last reviewed: 2026-06-13", and nothing in the doc has been touched since, across three major architecture changes (RAG phases 0-6, ADR 0012's proxy, the shoutbox). | 0.3 | S |

**Rejected after inspection** (do not re-litigate):

1. "The funnel exposure is undocumented". It is documented thoroughly and accurately in `shoutbox.py:1-25`, `chat-backend/README.md`, `docs/rag-chat.md` and `AGENTS.md:148-158`. Just not in the canonical location (gap 1).
2. "Secret handling is undocumented": `chat-backend/.env.example` covers what is gitignored, that the Telegram pair is the one secret-shaped value, and why `SHOUTBOX_ENABLED` defaults off. There is no funnel *token* to document: Tailscale Funnel authenticates by tailnet membership, confirmed by repo-wide search.
3. "The prompt-injection boundary is undocumented": architectural (not prompt-only) containment is documented in `chat-backend/README.md:209-249` and `docs/rag-chat.md:339-397`, with an acceptance harness carrying an injection/prompt-reveal pair.
4. "The deploy runbook is aspirational". It is specific and operational, including the WSL 9p stale-cache pre-flight and a stated recovery path for a stale re-index pruning the corpus.

---

## 6. Type safety & data: 8.3 (weight 10%)

**Carried by:** both language boundaries hold real strictness, `tsc` strict +
`noUncheckedIndexedAccess` clean, mypy `strict = true` clean over 45 files, zero
`any` and zero `# type: ignore`, Pydantic at every HTTP input, Zod-schema content
collections, and an exemplary documented runtime shape-guard in `skills.ts`.
Held back because that strictness is not uniformly *enforced* at the merge gate
or extended to every file.

| # | Gap | Points | Cost |
| --- | --- | ---: | --- |
| 1 | The `check` job that runs `npm run typecheck` is not a required status check; `gh api .../rulesets` returns `[]`, so no ruleset supplements branch protection. A PR can merge with a red `check`. **Third independent confirmation of the same finding.** | 0.6 | S |
| 2 | The 17 `scripts/*.mjs` files are plain JS outside the type-checked surface: `tsconfig.json` sets `allowJs` but not `checkJs`, and `npm run typecheck` is `astro check`, which does not read them. Several `JSON.parse` local data with no shape validation. Diverges from the repo's own stated "TypeScript strict" convention. | 0.5 | M |
| 3 | `chat-backend/ragctl.py` (1731 lines) is excluded from CI's `mypy app evals`. Running the same pinned strict config against it surfaces 13 real errors: an unannotated parameter at `:759`, untyped `dict` generics at `:170,293,1341,1391`, `no-any-return` at `:173,554`, and a narrowing miss at `:823`. | 0.5 | S |
| 4 | Non-null assertions on uniform/array indexing with no invariant comment: `buildSun.ts:197-198`, `projectsScene.ts:532,540,667,684`, `createPlanetLabels.ts:107-108`, `labelLayout.ts:73,76-77`. The repo's own rule is that `!` needs a documented invariant. | 0.2 | S |
| 5 | `src/pages/404.astro:99` blind-casts `JSON.parse(...) as NotFoundData`, breaking the `unknown`+guard pattern every other parse site follows. Blast radius near-nil (author-controlled build-embedded JSON), hence ranked last. | 0.1 | S |

**Rejected after inspection** (do not re-litigate):

1. "`skills.ts:135`'s cast is an unchecked trust boundary": false, and it is the dimension's best example: ~40 lines of guards over every field the renderer walks, with an explicit comment naming it the one acknowledged boundary.
2. "Untyped dict-shuffling at the DB boundary": false. `retrieval.py:120-129` is the single conversion point, coercing every field into a frozen dataclass; `Any` never travels past it.
3. "`as unknown as` double-casts are production escape hatches": false, all confined to `*.test.ts` mocking browser/three.js globals.
4. "The mypy config is permissively 'strict'": false. `strict = true` with only `ignore_missing_imports` for third-party stub gaps; clean over 45 files at the pinned version.
5. "The `chat-backend` job doesn't gate merges either": false, it **is** the sole required check. The workflow comment at `ci.yml:43-46` is stale and inverted relative to reality.
