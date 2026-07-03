# Voice profile — mikkonumminen.dev README

**Extracted:** 2026-05-26 | **Based on:** `README.md` at commit 1b2fa55295f89f28e486e8a1fcb48e58c6a63b64

## Tone register

Technical + earnest, slightly verbose on explaining *why*, conversational but not casual. Assumes the reader is a developer interested in implementation details and architectural reasoning.

Example: "This is intentionally not a typical web app. It's a visual showcase, with each page built as its own concept and animation."

## Humor style

Minimal; occasional dry observation ("the craft side of the brain"). No jokes; deadpan understatement when present.

Example: "Astro's inline hoists for small island bootstrap code" (technical, no charm)

## Pronoun choice

Imperative voice dominates (code blocks: "Requires Node 20+", "Run it whenever..."). Passive and impersonal in prose ("The build output is fully static"). First person avoided except in specific contexts (project motivation: "This repo is the craft side of the brain" — personal ownership of design choice).

Example: "Requires Node 20+ (see `.nvmrc`)." (imperative)

## Sentence rhythm

Varied. Short punchy headers ("The four pages", "Tech stack", "Deployment") followed by longer explanatory clauses. Complex sentences with semicolons to chain related thoughts. Code blocks and lists break up prose.

Example: "A looping music bed plays across every page, dual-decked and crossfaded so the loop join is inaudible."

## Vocabulary tells

- **Technical precision:** "WebGL", "island architecture", "nonce-based CSP", "SSRF", "content-aware wrapper"
- **Why-forward framing:** "zero npm install — no puppeteer or Chromium download (~150MB avoided)" (states the problem before the solution)
- **Specific tool names:** "ScrollTrigger", "Sentry", "Vercel", "CloudFront", "Cloudflare Pages"
- **Acronym comfort:** Assumes reader knows "CSP", "LCP", "CLS", "INP", "FCP", "TTFB", "ADR"
- **Prefers short forms:** "env var" not "environment variable", "CSP" not "Content Security Policy" (after first mention), "SSR" not "server-side rendering"

## Structural patterns

- Headers as statements, not questions: "The four pages" not "What are the four pages?"
- Code blocks with commentary above/below, not interspersed in prose
- Nested lists for structure (sub-bullets for token economics, rationale)
- Indented directory tree (not bullet list) for project structure
- Emphasis via **bold** for terminology, `monospace` for code/paths
- Linked references to decision docs in parentheses: "(Rationale in [`docs/decisions/...`]())"
- Tables for CSP directives, verifiable claims, etc.

Example of structure: "The four pages" header → 4 bullets with page name, function, key tech. Consistent throughout.

## Reference style

- **Educational but not patronizing.** Explains *why* ("no SSR ... so it can move from Vercel to any static host") without hand-holding.
- **Specific evidence.** "~140K Sonnet input", "2 runs", "15 factually wrong copy fixes" — precise counts, not vague "many" or "several".
- **Rationale-first.** Decision docs are cited for non-obvious choices: CSP hardening, observability, skill design, PDF surface. Implies the reader can dig deeper if interested.
- **Acronym-aware.** Uses full forms on first mention (e.g. "Permissions-Policy" initially, then shorthand if no second mention) or assumes familiarity if the README is for an audience that knows the domain.

Example: "Rationale in [`docs/decisions/0005-skill-registry-pdf-surface.md`](docs/decisions/0005-skill-registry-pdf-surface.md)." (links to external authority, assumes reader wants to understand deeper reasoning)

## Unintended voice pitfalls to avoid

- **Not loquacious.** Avoid flourish; be direct. "A looping music bed plays ... so the loop join is inaudible" is concise explanation, not rambling.
- **Not platform-agnostic.** This README is *about* a specific portfolio piece; it names Astro, Three.js, Tailwind, Sentry, Vercel. No vague "a static site generator" — say Astro.
- **Not clickable or marketing.** "This is intentionally not a typical web app" is positioning, not hype. "It's a visual showcase" is factual, not "stunning" or "beautiful".
- **Not editorializing on correctness.** The voice is honest about trade-offs ("Moving to a nonce-based CSP would require...") but doesn't apologize for choices or oversell them.
