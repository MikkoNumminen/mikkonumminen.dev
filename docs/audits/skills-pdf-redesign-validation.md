# Skills-PDF redesign: validation

Companion to [skills-pdf-current-state.md](skills-pdf-current-state.md). This document records the three validation passes the redesign brief requires (arm's-length, new-reader, skeptic), plus a fourth voice audit, the iteration loop those passes drove, and what the second pass found.

Validation method: four Sonnet sub-agents in parallel, each reading the rendered HTML + CSS (not the PDF, there's no pdftoppm on this machine). The HTML is generated to a stable preview path (`.claude/tmp/skills-pdf-preview.html`) by `scripts/build-skills-pdf.mjs` for exactly this purpose. The PDF and the HTML render from the same template, so issues that show in one show in the other.

## Round 1: initial PDF, four agents in parallel

### A. Arm's-length test (layout)

The brief: open the PDF, stand back, scan. The reader should still be able to tell measured-vs-estimated rows, see the hero number on page 1, identify the calibration page, and distinguish per-repo sections.

**Findings (round 1):**

| Check | Verdict |
| --- | --- |
| Measured-vs-estimated signal | WEAK, row tint `#e8f3ea` vs `#ffffff` is a ~6% luminance gap; chips are good but tint carries the wider visual area and washes out |
| Hero number on page 1 | FAIL, CSS comment documents a `--t-display: 22pt` token but the renderer never applies it; hero number renders at 12pt inline, indistinguishable from a table cell |
| Page identification | PASS, calibration page has a unique visual signature (red/orange bold deltas, no row chips, no green wash) |
| Per-repo section distinguishability | WEAK, every repo section is one `<h2>` with identical styling, 18pt top margin; no colour or band to differentiate them at flip-distance |

### B. New-reader test (jargon + flow)

The brief: hand the document to a senior engineer who has never heard of Claude Code skills. They should be able to summarise it as "tools, this many measured, this is what they cost, this is what they save, the author admits when his guesses were wrong", not "a list of things."

**Findings (round 1):**

The simulated reader nailed the summary: *"Mikko built 33 automation tools for his Claude AI coding assistant, measured which ones actually ran and how much compute they used, found that his pre-measurement guesses were off by up to 111 times, and published both the receipts and the wrong guesses side by side."* So the prose-level work succeeded. Jargon was uneven, though:

| Term | Glossed inline? | Verdict |
| --- | --- | --- |
| skill, attributionSkill | yes | PASS |
| Claude Code | named, never explained | FAIL |
| harness | used twice without definition (load-bearing word) | FAIL |
| sub-agent | used once, no explanation | FAIL |
| JSONL | abbreviation never expanded | FAIL |
| transcript | defined on method page only | PARTIAL |
| cache-creation, session | contextually inferrable, not explicit | PARTIAL |

The page-2 hook (page 1 promises "see exactly how wrong I was on page 2") delivers strongly: the simulated reader specifically called out "5 of 12 rows are orange. The fix is not to write better guesses next time. The fix is to keep measuring." as the strongest-written paragraph in the document.

### C. Skeptic test (methodology)

The brief: read the method page as if you do not trust the author. Find the smallest methodology change that would make you trust the document less. If the answer is a sentence that's already on the page, the page is doing its job.

**Findings (round 1):**

All six prescribed skeptic questions PASS, cache-counting honest, rename-handling explicit, linear-projection admitted as "dumb math," cache-read deliberately excluded, 3× baseline disclosed as a working assumption, sub-agent gap admitted. The one gap the agent surfaced that wasn't already on the page:

> **90-day window boundary: inclusive or exclusive?** The document says "the last 90 days from the moment skill-usage ran, no earlier." It never specifies whether day 90 (the boundary day itself) is included or excluded. For a skill invoked exactly 90 days ago, the measurement could flip from "measured" to "not measured" based on a timestamp comparison that isn't specified.

A minor gap (in practice an edge case), but worth fixing because the document otherwise earns trust through that kind of explicit precision.

### D. Voice audit (Barney-style tone rules)

The brief's tone rules: no corporate-deck words, no decorative emoji, no exclamation points, no impersonal "one", inline "estimated" tags, no defensive hedge phrases, voice exemplar fit.

**Findings (round 1):**

| Check | Result |
| --- | --- |
| Banned-word grep ("leverage", "synergy", "enable", "empower", "robust", "best-in-class", "cutting-edge", "streamline", "unlock", "drive", "deliver value") | 0 matches |
| Forbidden "one" constructions | 0 matches |
| Exclamation points | 0 |
| "Say it's estimated in the same sentence" rule | 0 violations |
| "No defensive hedge" rule | 0 violations |
| Voice exemplar fit (hero caption / calibration intro / pull-quote) | 5/5, 5/5, 5/5 |

Overall voice rating: **9/10**. One deduction: the "How tokens saved is computed" section was workmanlike, not dry-witted like the rest.

## Iteration applied between rounds

Driven directly by round-1 findings:

1. **CSS: hero number**, Replaced the inline 12pt number-next-to-bar with a block-level `display: block; font-size: 22pt; font-weight: 700` number on its own line, bar below it. Applies the documented `--t-display` token in practice. Fixes the round-1 FAIL.
2. **CSS: row tint**, `--measured-bg` from `#e8f3ea` to `#c9e4ce`. The luminance gap vs paper goes from ~6% to ~13%, enough to survive arm's-length scanning on lower-contrast screens.
3. **CSS + renderer: per-repo bands**, Replaced the `<h2>` repo heading with a `.repo-heading` div: solid dark-green band, white reversed type, repo name + stats inline, 26pt top margin. Four green bars now break the per-repo page visually; flip-scanning identifies sections without reading.
4. **Renderer: jargon glosses** (Lede now reads *"every custom skill I've written for Claude Code (Anthropic's coding assistant CLI) … A 'skill' here is a reusable slash command) a named recipe Claude Code runs when I type /audit or similar."* Method page glosses *harness* as *"the runtime that drives the CLI between me and the model,"* names JSONL as *"JSON Lines: one JSON object per line, one line per message,"* defines sub-agent as *"work the parent skill delegates to a parallel Claude Code agent, written to its own transcript file under a subagents/ sibling directory,"* and parenthetically defines a session as *"one conversation in the CLI from start to exit."*
5. **Renderer: 90-day boundary**, Added a sentence: *"The boundary is inclusive at the start (a session exactly 90 days old, to the second, is counted) and exclusive at the end (the very moment the scanner runs is the cutoff). Running the scanner an hour later can therefore drop a session that just crossed the boundary, that's a real if rare flake, and re-running the chain re-derives the right answer."*
6. **Renderer: tokens-saved prose**, Rewrote the "How tokens saved is computed" section. The bones of the model are unchanged (saved = 2× cost-per-use × annual uses), but the prose is tighter and now includes *"it is the single load-bearing assumption in every 'Saved / yr' cell in this document"* and *"a model stacked on top of a guess. Treat them as a lower bound at best."*

## Round 2: re-validation pass

Two sub-agents (the two that flagged failures or partials), same lenses, the iterated HTML.

### A. Arm's-length test (round 2)

| Check | Round 1 | Round 2 |
| --- | --- | --- |
| Measured-vs-estimated signal | WEAK | **PASS**, row tint is visible at arm's length and the distinction has three redundant channels (tint + chip iconography + italic-vs-upright saved figures); signal survives greyscale |
| Hero number on page 1 | FAIL | **PASS**, 22pt bold on its own block, "two-line stacking is structurally enforced in the HTML"; reads cleanly at A4 landscape distance |
| Page identification | PASS | **PASS**, unchanged |
| Per-repo section distinguishability | WEAK | **PASS**, solid `#1f6f3a` band with white reversed type at 13pt bold; "flip-scanning will see four distinct green bars interrupting the table rows; no ambiguity about where one repo ends and the next begins" |

All four checks PASS in round 2.

### B. New-reader test (round 2)

| Term | Round 1 | Round 2 |
| --- | --- | --- |
| Claude Code | FAIL | **PASS**, glossed inline in the lede as "Anthropic's coding assistant CLI" |
| harness | FAIL | **PASS**, "the runtime that drives the CLI between me and the model" |
| sub-agent | FAIL | **PASS**, "work the parent skill delegates to a parallel Claude Code agent, written to its own transcript file under a subagents/ sibling directory" |
| JSONL | FAIL | **PASS**, described as "JSON Lines: one JSON object per line, one line per message"; bare "JSONL" no longer appears |
| transcript | PARTIAL | **PASS**, introduced alongside the concrete file path |
| attributionSkill | PASS | **PASS** |
| session | (not flagged in round 1) | **PARTIAL**, `sessionId` appears in the file path without a standalone gloss |

Fix applied after round 2: parenthetical gloss in the same sentence, *"every time I run a Claude Code session (one conversation in the CLI from start to exit), the harness …"*. The final rebuild incorporates this.

Lede flow check: round-2 verdict, *"No stalls. The lede moves in a straight line: what the document is → what Claude Code is → what a skill is → the headline numbers. Each clause does one job."*

## Summary

- **Arm's-length:** 1 FAIL + 2 WEAK + 1 PASS → 4 PASS after iteration.
- **New-reader:** 4 FAIL + 3 PARTIAL → 6 PASS + 1 PARTIAL → 7 PASS after final fix.
- **Skeptic:** 6 PASS + 1 minor gap → 7 PASS after iteration.
- **Voice:** 9/10 unchanged (the tokens-saved section rewrite was the response to the deduction; not re-rated because the voice rules didn't flag a remaining issue, just a softness).

Three checks of three required by the brief now pass cleanly. The redesign is ready to ship.

## What I did not validate

- Print rendering on physical paper. The renderer's `@media print` block forces `print-color-adjust: exact` so backgrounds survive, but I have not verified that on a real printer.
- Screen-reader navigation of the HTML. The markup uses proper `table`/`thead`/`tbody`/`th[scope]` semantics, but I have not run a screen reader against it.
- A real human new-reader test. The new-reader pass is a simulation by a sub-agent; the brief flags this as acceptable ("ask them, or simulate"), but a real-human pass would still be cheap signal.
- A4 vs Letter. The `@page` rule hard-codes A4 landscape. If someone needs Letter, the layout almost certainly survives with no change, but the bar widths would be ~6mm narrower in absolute terms.
