# Audit & review reports

Dated, point-in-time reports. Each is a snapshot — read the newest in a series.
A superseded report carries a banner pointing forward to its replacement.

## Codebase audits & reviews

| Date | Report | Scope | Status |
| --- | --- | --- | --- |
| 2026-08-03 | [ai-first-2026-08-03/](ai-first-2026-08-03/) (`RUBRIC.md`, `LEDGER.md`, `00-baseline-raw.md`) | Whole-repo AI-first re-rate campaign (frontend + `chat-backend/`); baseline 8.12, target ≥9.5 | **in progress** |
| 2026-06-14 | [ai-first-rating-2026-06-14.md](ai-first-rating-2026-06-14.md) | AI-first re-rate — campaigns #231–244 then #247–258; reached 9.1/10 (every dimension ≥9), frontend-only scope | superseded by 08-03 campaign |
| 2026-06-13 | [ai-first-rating-2026-06-13.md](ai-first-rating-2026-06-13.md) | AI-first / agent-operability re-rate | superseded by 06-14 |
| 2026-06-12 | [ai-first-rating-2026-06-12.md](ai-first-rating-2026-06-12.md) | AI-first rating (baseline) | superseded by 06-13 |
| 2026-06-11 | [improvement-review-2026-06-11.md](improvement-review-2026-06-11.md) | Multi-agent improvement review (45 findings) | actioned (#207–211) |
| 2026-05-26 | [audit-2026-05-26.md](audit-2026-05-26.md) | Static/TypeScript/ESLint/npm-audit + five-scope manual pass (resource lifecycle, data integrity, concurrency, error paths, external boundaries) at commit `1b2fa55` | historical |
| 2026-05-17 | [FULL-AUDIT-2026-05-17.md](FULL-AUDIT-2026-05-17.md) | Full robustness/a11y/security/SEO/i18n audit; per-dimension detail in `sections/` (indexed within this report, not separately below) | audit of record |
| 2026-05-16 | [MOBILE-AUDIT-2026-05-16.md](MOBILE-AUDIT-2026-05-16.md) | Mobile/responsive audit | historical |
| 2026-05-15 | [MOBILE-AUDIT-2026-05-15.md](MOBILE-AUDIT-2026-05-15.md) | Earlier mobile audit (read-only, static analysis + Lighthouse on a simulated Moto G Power / Slow 4G) | superseded by 05-16 |
| 2026-05-07 | [AUDIT-2026-05-07.md](AUDIT-2026-05-07.md) | Hiring-grade code audit (six-agent, ~10.4k LOC) | historical |
| 2026-04-08 | [AUDIT-2026-04-08.md](AUDIT-2026-04-08.md) | First principal-engineer audit | superseded by FULL-AUDIT |

## README drift reports

Checks whether `README.md` still describes the shipped repo; not full audits.

| Date | Report | About |
| --- | --- | --- |
| 2026-07-24 | [readme-drift-2026-07-24.md](readme-drift-2026-07-24.md) | Drift check triggered by PRs #406/#407 (unified particle field, goat bleat); 9 drifts found, 7 rewritten |
| 2026-05-26 | [readme-drift-2026-05-26.md](readme-drift-2026-05-26.md) | Drift check at commit `1b2fa55`; 3 drifts found (detection only, no rewrites applied) |

`readme-drift-scratch.md` is a working artifact (the extracted voice profile the
drift-detection agents use to match tone before rewriting) — not a report, excluded
from the index above.

## RAG chat upgrade — phase audit trail (2026-06-25 to 2026-06-28)

The eight-part trail behind the RAG upgrade (#317–#324), read in order:

| Report | Covers |
| --- | --- |
| [corpus-gaps-2026-06-25.md](corpus-gaps-2026-06-25.md) | Consolidated fill-list of gaps the corpus mining agent flagged rather than invent, ahead of Phase 1 |
| [rag-phase0-diagnosis-2026-06-28.md](rag-phase0-diagnosis-2026-06-28.md) | Phase 0: diagnoses where retrieval depth is lost and builds the before/after eval instrument every later phase reports against |
| [rag-phase1-corpus-2026-06-28.md](rag-phase1-corpus-2026-06-28.md) | Phase 1: narrow corpus expansion — adds the `doc_type`/`doc_date` metadata backbone and indexes the ADRs, the one clear gap Phase 0 found |
| [rag-phase2-gdpr-2026-06-28.md](rag-phase2-gdpr-2026-06-28.md) | Phase 2: configurable GDPR-aware ingest-time context control, shipped benign by default and driven by a policy file |
| [rag-phase2b-gdpr-doc-2026-06-28.md](rag-phase2b-gdpr-doc-2026-06-28.md) | Phase 2b: turns the Phase 2 engineering into a plain-language document a non-technical reader can act on |
| [rag-phase3-narratives-2026-06-28.md](rag-phase3-narratives-2026-06-28.md) | Phase 3: precomputed per-project development narratives, so "how did you build X" can draw on a whole assembled arc instead of scattered chunks |
| [rag-phase4-memory-2026-06-28.md](rag-phase4-memory-2026-06-28.md) | Phase 4: stateful, bounded conversation memory — the foundation "tell me more" needs a referent for |
| [rag-phase5-disclosure-2026-06-28.md](rag-phase5-disclosure-2026-06-28.md) | Phase 5: progressive disclosure — concise answer first, explicit offer to expand into the Phase 3 narrative |
| [rag-phase6-contextbar-2026-06-28.md](rag-phase6-contextbar-2026-06-28.md) | Phase 6: a live, honestly-measured context-fill readout (terminal donut) plus `/clear` to reset the session |

## RAG chat — post-launch findings

| Date | Report | About |
| --- | --- | --- |
| 2026-08-01 | [swedish-locale-removal-2026-08.md](swedish-locale-removal-2026-08.md) | Why Swedish (#476) was dropped as a served locale but kept as a lingua detection candidate — removing it from detection misroutes Swedish input to Finnish |
| 2026-07-26 | [unnamed-project-retrieval-dead-end-2026-07-26.md](unnamed-project-retrieval-dead-end-2026-07-26.md) | The rejected ranking-concentration heuristic from the unnamed-project fabrication fix (#425) and the actual root cause (the per-project diversity cap), so it isn't retried |
| 2026-07-16 | [research-coverage-dead-ends-2026-07-16.md](research-coverage-dead-ends-2026-07-16.md) | Three rejected approaches from the research-coverage precision fix (#369–#372) and the actual root cause, so they aren't retried |

## Published research reports (PDF)

Standalone measurement reports that were also published as contact-terminal
downloads and, where noted, `type:research` corpus posts.

| Date | Report | About |
| --- | --- | --- |
| 2026-07-26 | [AGENT-DELEGATION-2026-07-26.pdf](AGENT-DELEGATION-2026-07-26.pdf) | Seven instrumented cost-routing-agent delegations from one real working session — tokens, tool calls, wall-clock, and what the delegation caught or missed; published as `download --delegation` |
| 2026-07-21 | [PORO-FINNISH-REVIEW-2026-07-21.pdf](PORO-FINNISH-REVIEW-2026-07-21.pdf) | Poro's review of all 396 Finnish UI strings (2 of 276 flagged genuine, PR #389); published as `download --translations` and a corpus research post |

## Skill-portfolio calibration & token studies

| Date | Report | About |
| --- | --- | --- |
| 2026-06-02 | [skills-suite-calibration-2026-06-02.md](skills-suite-calibration-2026-06-02.md) | Suite-wide A/B calibration, all 8 cleanly-A/B-able mikko- skills across Opus/Sonnet/Haiku, plus an after-optimization re-measure |
| 2026-06-01 | [skill-calibration-2026-06-01.md](skill-calibration-2026-06-01.md), [skills-results-2026-06-01.md](skills-results-2026-06-01.md), [optim-rollout-2026-06-01-ledger.md](optim-rollout-2026-06-01-ledger.md), [optim-rollout-2026-06-01-morning-report.md](optim-rollout-2026-06-01-morning-report.md) | Calibration of the two skill-auditing skills, a results sheet on what they cost/saved, and the autonomous overnight optimization rollout (nothing merged without review) |
| 2026-05-31 | [skills-optim-study-2026-05-31.md](skills-optim-study-2026-05-31.md) | Five-round paired A/B study of local-computation optimization across three skills |
| 2026-05-22 | [builtin-review-calibration-2026-05-22.md](builtin-review-calibration-2026-05-22.md), [spacepotatis-skills-calibration-2026-05-22.md](spacepotatis-skills-calibration-2026-05-22.md) | `/review` + Spacepotatis calibration |
| — | [skills-pdf-current-state.md](skills-pdf-current-state.md), [skills-pdf-redesign-validation.md](skills-pdf-redesign-validation.md) | Registry-PDF design notes: baseline audit of the three legibility problems, then four-agent validation of the redesign that fixed them |

Generated PDFs for these reports live alongside the `.md` (rendered by
`scripts/render-audit-pdfs.mjs`, skipped in CI — the committed PDF is canonical).
The raw `.json` data files behind them (`skills-optim-study-*.json` including the
`2026-06-01-replicates` set, `skills-results-2026-06-01.json`,
`skills-suite-calibration-2026-06-02.json`) are working artifacts cited from their
companion `.md`, not indexed separately.
