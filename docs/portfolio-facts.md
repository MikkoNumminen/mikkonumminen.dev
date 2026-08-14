# Where the portfolio's facts live

Written for an agent, not for a reader. If you are about to write anything that
states a fact about these projects, a CV, a blog post, a project page, an answer
in the contact terminal, read this first. Every mistake it prevents was made at
least once.

## The rule

**Do not re-derive facts from the other repositories.** They are already
gathered here, curated, and in several cases guarded by tests. Cloning the
knowledge by reading every sibling repository produces a worse answer more
slowly, and it produces a DIFFERENT answer, which is how two documents on this
site end up disagreeing.

Read these, in this order. The guard column says what a test actually asserts,
which is narrower than the source in every row: no test on this site checks a
number against the repository it came from.

| Question | Source | Guarded by |
| --- | --- | --- |
| Which technologies to name, and which to leave out | `src/data/techStack.ts` | `src/data/techStack.test.ts`, including the curation bar against `projects.ts` |
| Which projects exist, their stack, live URL and status | `src/data/projects.ts` | `src/data/projects.test.ts`, structure and ids only. `liveUrl` and `status` are asserted by nothing, so a dead link or a stale `live` passes CI |
| How a project actually works, in depth | `content/projects/*.md` | `src/houseStyle.test.ts`, prose style only. No fact is checked, see drift below |
| The story of a project in prose | `content/narratives/*.md` | `src/houseStyle.test.ts`, prose style only |
| Career shape and dates | `src/data/timeline.ts` | `src/data/timeline.test.ts`, structure and locale parity |
| The CV | `content/cv.md` | `src/houseStyle.test.ts`, prose style only. `src/components/home/cvSurfaces.test.ts` guards the links to the PDF, not the text |
| Published documents and their PDFs | `src/data/papers.ts` | `src/data/papers.test.ts`, which does check that every listed PDF exists on disk |

`src/data/techStack.ts` is the one to read first and the one most often skipped.
It carries a documented bar for inclusion (no model names, no commodity
libraries, no implementation details of something already listed, no OS
utilities or hosting vendors) and it records where each technology was used:
`work` and `both` mark the ones used at Kasvu Labs, and the unmarked default is
own projects. That distinction is invisible from the repositories themselves.

There are **13 projects** in `src/data/projects.ts`, and `content/cv.md` says
"thirteen" in prose. Two more copies of the count live in the `2026-build`
timeline entry in `src/i18n/locales/en.ts` and `fi.ts`, once in the body and
once as a `13 repos` tag. Those two lagged at "nine projects" and "9 repos"
until August 2026, while the CV's entry for the same year already said
thirteen. Adding a fourteenth means changing all four files, and no test checks
that they agree.

## Numbers on the project pages are point-in-time

`content/projects/*.md` and `content/narratives/*.md` were true when written.
Nothing re-checks them, and the repositories keep growing.

Before quoting a measured number into anything durable, re-measure it:

| Stack | Count | Runtime |
| --- | --- | --- |
| Python | `python -m pytest --collect-only -q` (last line is the count) | `python -m pytest -q` (last line, e.g. `707 passed, 7 skipped in 10.19s`) |
| Node, Vitest or Jest | the runner's own summary, not a grep for `it(` | the same summary line |
| .NET | `dotnet test --list-tests`, or count `[Fact]` and `[Theory]` together | `dotnet test` |
| Rust | `cargo test -- --list` | `cargo test` |
| Commits and dates | `git rev-list --count HEAD`, `git log --reverse --format=%ad --date=short \| head -1` | n/a |

**Collection time is not run time, and the two differ by a factor of fifty.**
`--collect-only` imports the test modules and executes none of them. If a page
states how long a suite takes, that number has to come from a real run.

A worked example, because this one nearly reached a CV: the claude-continue
pages said "~300 tests run offline in ~0.4 s". Measured 2026-08-14, pytest
collects **714** in 0.20 s and runs them in **10.19 s** (707 passed, 7 skipped).
The count was stale by August, and the old runtime was a collection time
mislabelled as a run.

Note the skips too. A page that says "714 tests run" is overstating by the 7
that never execute on this platform.

Grep counts of `it(` or `def test_` are an approximation, not a count. They miss
parametrised cases and count commented-out ones. Use the runner.

## The repositories, and what each one is

Twenty directories sit under `D:\koodaamista\`, counted 2026-08-14. They are not
twenty projects. Several are the same project, a fork, or not a codebase at all,
and three of them hold no git repository.

**Same project, never list twice**

- `retail-rag` and `feedback-intelligence` are one project. The original local
  repo's history was replayed on publication: they share 45 commit subjects, and
  `retail-rag`'s last commit day is `feedback-intelligence`'s first. Call it
  **Feedback Intelligence**.
- `claude-audit-skill` is the pre-rename ancestor of `claude-skills`. Its
  `origin` already points at `claude-skills.git`.

**One project built twice, and deliberately listed twice**

- `Readlog-csharp` is a port of `ReadLog`, not a separate product. `projects.ts`
  carries both anyway, with `readlog-dotnet` as a moon of `readlog`, and both
  count toward the 13. Both are deployed, which is the point worth making about
  them.

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
collection defined in `src/content.config.ts`. `public/mikko-numminen-cv.pdf` is
served by four surfaces: the hero pill (`Hero.astro`), the site-wide footer link
(`BaseLayout.astro`), the mobile contact card (`MobileContactCard.astro`) and
the terminal's `download cv`. The first three are held to deriving the filename
from `src/data/papers.ts` by `src/components/home/cvSurfaces.test.ts`, so read
that test before renaming the file.

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
- The measurement habit is the through-line, and every claim below has a file
  behind it. A blind 30-round Finnish model comparison, Poro first in 26 of 30
  with Friedman p < 0.0001, in `content/posts/rag-finnish-blind-test.md`. A
  skills estimate revised down from an editorial 67% to a measured 22%, in
  `docs/audits/spacepotatis-skills-calibration-2026-05-22.md`. A finding ruled
  1/3 and "do not generalize" rather than reported as a result, in
  `docs/audits/skills-suite-calibration-2026-06-02.md`. A calibration file
  carrying `N=0 ... placeholder` in its own caveats instead of a number, at
  `.claude/agent-verdicts/SKILL-CALIBRATION-BUILTINS-HAIKU-LATEST.json`. And a
  retracted containment ranking, pulled after a rate limiter contaminated the
  run at a sample size too small to rank on, in
  `content/posts/poro-findings.md`.
