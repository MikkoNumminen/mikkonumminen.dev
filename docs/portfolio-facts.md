# Where the portfolio's facts live

Written for an agent, not for a reader. If you are about to write anything that
states a fact about these projects, a CV, a blog post, a project page, an answer
in the contact terminal, read this first. Every mistake it prevents was made at
least once.

## The rule

**Do not re-derive facts from the other repositories.** They are already
gathered here, curated, and in several cases guarded by tests. Cloning the
knowledge by reading eighteen repos produces a worse answer more slowly, and it
produces a DIFFERENT answer, which is how two documents on this site end up
disagreeing.

Read these, in this order.

| Question | Source | Guarded by |
| --- | --- | --- |
| Which technologies to name, and which to leave out | `src/data/techStack.ts` | `techStack.test.ts` |
| Which projects exist, their stack, live URL and status | `src/data/projects.ts` | `projects.test.ts` |
| How a project actually works, in depth | `content/projects/*.md` | nothing, see drift below |
| The story of a project in prose | `content/narratives/*.md` | nothing |
| Career shape and dates | `src/data/timeline.ts` | `timeline.test.ts` |
| The CV | `content/cv.md` | `houseStyle.test.ts` |
| Published documents and their PDFs | `src/data/papers.ts` | `papers.test.ts` |

`src/data/techStack.ts` is the one to read first and the one most often skipped.
It carries a documented bar for inclusion (no model names, no commodity
libraries, no implementation details of something already listed, no OS
utilities or hosting vendors) and it records where each technology was used:
`work` and `both` mark the ones used at Kasvu Labs, and the unmarked default is
own projects. That distinction is invisible from the repositories themselves.

There are **13 projects**, and `content/cv.md` says "thirteen" in prose. If you
add a fourteenth, both change together.

## Numbers on the project pages are point-in-time

`content/projects/*.md` and `content/narratives/*.md` were true when written.
Nothing re-checks them, and the repositories keep growing.

Before quoting a measured number into anything durable, re-measure it:

| Stack | Command |
| --- | --- |
| Python | `python -m pytest --collect-only -q` (last line is the count) |
| Node, Vitest or Jest | the runner's own summary, not a grep for `it(` |
| .NET | `dotnet test --list-tests`, or count `[Fact]` and `[Theory]` together |
| Rust | `cargo test -- --list` |
| Commits and dates | `git rev-list --count HEAD`, `git log --reverse --format=%ad --date=short \| head -1` |

A worked example, because this one nearly reached a CV: the claude-continue
pages said "~300 tests run offline in ~0.4 s". Measured 2026-08-14, pytest
collects **714** in 0.63 s. The pages were right in June and stale by August.

Grep counts of `it(` or `def test_` are an approximation, not a count. They miss
parametrised cases and count commented-out ones. Use the runner.

## The repositories, and what each one is

Eighteen directories sit under `D:\koodaamista\`. They are not eighteen
projects. Several are the same project, a fork, or not a codebase at all.

**Same project, never list twice**

- `retail-rag` and `feedback-intelligence` are one project. The original local
  repo's history was replayed on publication: they share 45 commit subjects, and
  `retail-rag`'s last commit day is `feedback-intelligence`'s first. Call it
  **Feedback Intelligence**.
- `claude-audit-skill` is the pre-rename ancestor of `claude-skills`. Its
  `origin` already points at `claude-skills.git`.
- `Readlog-csharp` is a deliberate port of `ReadLog`, not a separate product.
  Both are deployed, which is the point worth making about them.

**Not the owner's code**

- `chatterbox` is a fork of `resemble-ai/chatterbox`. The upstream code is not
  own work; a handful of local commits are, and they are surgical fixes to
  PyTorch inference internals. Attribute the fixes, never the library.

**Not projects**

- `chat-control` is five Windows `.bat` launchers under 600 bytes that dispatch
  into WSL. Operational glue for the RAG deployment.
- `control-cli` is a real Rust and Dioxus tool but has no git repository at all.
- `SongGenerator-local-backup` is a backup directory.

**Do not open locally**

- `LuokkaretkiGenerator` is SongGenerator's working tree. It is unfinished, and
  its `README.md` is the only source for what this site says about it.

## The CV has two outputs and one source

`content/cv.md` is the source. `/cv` renders it through the `cv` content
collection. `public/mikko-numminen-cv.pdf` is served by the hero pill, the
footer link and the terminal's `download cv`.

The PDF was produced by **Typst 0.15.0** and **no `.typ` source exists in this
repository**, so it cannot be regenerated here and it has drifted from the
markdown. `scripts/render-audit-doc.mjs` already turns markdown into a PDF
through Chrome and is the intended way out of that, for the reason its own
header states: a doc whose PDF can only be rebuilt by whoever still has the
script is a doc whose PDF drifts.

Two things to know before pointing that renderer at a CV: it does not strip YAML
frontmatter, so the frontmatter prints as body text, and its stylesheet is built
for reading studies rather than for scanning, so a CV comes out roughly twice as
long as it needs to be.

## Facts worth knowing that no single repository states

- The projects interlock. `Platform` consumes `HRManager` as a git submodule.
  `Spacepotatis` uses voice lines generated by `AudiobookMaker` and music from
  `strudel-patterns`. This site's narration comes from `AudiobookMaker` too.
- Feedback Intelligence is where 24 years of retail becomes architecture rather
  than a claim: its retail domain is a data file of 30 departments of a Finnish
  hybrid hypermarket, and switching one flag swaps the entire domain with no
  core edits.
- The measurement habit is the through-line, and it is checkable: a blind
  30-round model comparison with its statistics and the judge's conflict of
  interest stated, a skills estimate revised down from 67% to a measured 22%,
  eval reports labelled non-evidential where the data was placeholder, and a
  published retraction of a finding traced to too few rounds and a rate limiter
  corrupting the measurement.
