# RAG chat: Phase 2b: GDPR plain-language document (2026-06-28)

Phase 2b turns the Phase 2 engineering into something a **non-technical
decision-maker** (business lead, procurement, data protection officer) can fully
understand: the artefact that makes the capability sellable. One document,
`content/posts/handling-sensitive-data.md`, indexed into the corpus so the
terminal can answer "how do you handle sensitive data" with a grounded answer.

## What it contains

1. **The problem, in business terms**: the legal tension between the obligation to
   *retain* personal data and the obligation to *minimise and protect* it, and how
   an AI assistant (a machine for surfacing information) sharpens it. No jargon.
2. **How the architecture answers it, plainly**: the five mechanisms (ingest-time
   isolation, pseudonymisation, role-based access, audit logging, data residency),
   each in business language, no implementation detail.
3. **The honest boundary**: explicitly an engineer's *reference implementation*,
   not a certified compliance product; it does **not** claim "GDPR-compliant"; the
   final legal assessment belongs to the organisation's DPO. Where the engineer's
   work stops and the lawyer's begins is drawn deliberately.

The legal content stays only on established, uncontested GDPR principles (data
minimisation, purpose limitation, the retain-vs-minimise tension, data residency).

## Acceptance

| Criterion | Status |
| --- | --- |
| Reads cleanly for a non-technical audience (no unexplained jargon) | ✓ |
| States the engineer/lawyer boundary explicitly | ✓ |
| Avoids any "compliant / certified" claim | ✓ |
| Indexed and retrievable | ✓, 4 chunks, classification `public` |
| Eval set includes a "how do you handle sensitive data" question that returns a grounded answer sourced from it | ✓ |

**Measured (live):** the new eval question (`gdpr-sensitive-data`) goes from
corpus-miss → **PASS** once the doc is indexed; retrieval hit-rate over the
53-question set rose 0.649 → **0.676**. The live chat answers the question grounded
in the document (top source `posts/handling-sensitive-data.md`), describing
classification, never-loading personal data, pseudonymisation, and role-based
access, no overclaim.

Stacked on Phase 2 (#319).
