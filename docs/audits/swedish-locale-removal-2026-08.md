# Swedish-locale removal — what stayed and why (2026-08-01)

Companion note to PR #476 (`chore(i18n): remove Swedish`, merged as commit
`2146721`). The reasoning behind the one counterintuitive part of that removal
lives only in the PR body and a code comment; this note exists so a future
agent doesn't "tidy" it back out.

## What went

Swedish as a **served** locale: the 598-line `src/i18n/locales/sv.ts`
dictionary, 8 blog posts, 6 `/sv/*` route files, the locale union, the
content-collection enum entry, the switcher entry, the redirect branch, the
404 strings, and every test that named it. `LOCALES` in
[`src/i18n/types.ts`](../../src/i18n/types.ts) is now `['en', 'fi']`. Built
pages went from 40 to 27. `/sv` and `/sv/:path*` now permanently redirect to
the English equivalent (bookmarked/indexed URLs, not a 404).

**Why remove it at all:** the Swedish was machine-translated and never read
by anyone who speaks it. The Finnish that came out of the same pipeline was
eventually reviewed and had real grammatical errors in every one of seven
posts, two of which said the *opposite* of the English (see
[PORO-FINNISH-REVIEW-2026-07-21.pdf](PORO-FINNISH-REVIEW-2026-07-21.pdf)).
There was no reason to believe the unreviewed Swedish was any better, and no
way to check. Publishing text in your own name that you cannot verify is
worse than publishing nothing — and every locale slot also taxes a
translation pass, a review pass, a narration, and a test/schema slot on every
future change to copy.

## What was deliberately kept: `sv` in language *detection*

`src/i18n/` no longer serves Swedish, but
[`chat-backend/app/guardrails.py`](../../chat-backend/app/guardrails.py) still
lists `Language.SWEDISH` in lingua's detection candidate set alongside
`ENGLISH` and `FINNISH` (`_LANGUAGES`, confirmed current). This was the first
thing the PR tried to remove, on the theory that a language the site cannot
serve can only ever be a wrong answer to route to. **Measured, that is
worse:** with only EN/FI as candidates, the detector has nowhere else to put
Swedish input, so `"Vilket projekt är mest komplext?"` was classified as
Finnish and would have been answered in Finnish — a worse outcome than
English for a Swedish speaker. Restoring `SWEDISH` as a detection candidate
(without ever serving a Swedish UI or answer) makes that same input fail
`looks_finnish` and fall through to English instead, which a Swedish speaker
is far likelier to read. Detecting a language is not the same as serving it.

The comment at `guardrails.py` around `_LANGUAGES` states this measurement
inline, specifically so nobody re-derives the tidy-looking (and wrong)
version.

## What a future agent might "helpfully" break

- Removing `Language.SWEDISH` from lingua's candidate set to match the
  removal of `sv` from `LOCALES` — this is the exact regression the PR
  measured and reverted from. The two lists are intentionally different: one
  is what the site serves, the other is what the router must be able to rule
  out.
- Two tests had hardcoded `['en', 'fi', 'sv']` instead of importing `LOCALES`
  and still passed typecheck after the removal — a string literal in a test
  isn't checked against the union. Both were fixed to import `LOCALES`
  directly; if you add a locale-list assertion, import the source of truth
  rather than retyping it.
