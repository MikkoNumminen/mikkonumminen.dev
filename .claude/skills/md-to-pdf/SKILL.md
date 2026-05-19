---
name: md-to-pdf
description: Render a markdown report (or any HTML) to a styled PDF using the local Chrome's `--print-to-pdf` flag. Zero npm install — no puppeteer / Chromium download. Claude assembles a tuned HTML file in-context (markdown → HTML conversion + per-document CSS), then invokes `scripts/build-pdf.mjs` to land the PDF. Used by the contact-page terminal's `download --skills` (registry PDF) and any one-off "I need this report as a PDF" moment.
---

# md-to-pdf

Convert a markdown report or a structured data file (JSON, etc.) into a downloadable PDF, using the system Chrome that's already on the developer's machine. No `puppeteer` / `playwright`; no ~150MB Chromium bundle in `node_modules`.

The skill is a **two-layer primitive**:

1. **`scripts/lib/chrome-pdf.mjs`** — `printHtmlToPdf({ htmlPath, pdfPath })`. Finds Chrome, invokes `--print-to-pdf`. Page layout (orientation, size, margins) comes from `@page` CSS inside the HTML, not from CLI flags, so the caller controls the document fully.
2. **`scripts/build-pdf.mjs`** — generic CLI: `node scripts/build-pdf.mjs --input some.html --output some.pdf`.

Content-aware wrappers (e.g. `scripts/build-skills-pdf.mjs` for the skill-registry JSON) live alongside and call the shared lib.

## When to use

- `/md-to-pdf`, "produce a PDF of this audit", "make this report downloadable", "I want X as a PDF"
- After running a content-producing skill that emits a markdown / JSON artifact, when a portable artifact is needed (audit reports, skill registry snapshots, project briefs)
- Any time a recruiter, stakeholder, or future-you would prefer a single self-contained file over a markdown render

NOT for: continuous integration builds (the static site doesn't need PDFs at build time), generating PDFs from live URLs (a different recipe — Chrome can do that too, but the contract here is local file in / local file out), or producing print-perfect typesetting (this is a "good enough" Chrome render, not LaTeX).

## What this skill does

Given a source document and a target PDF path:

1. **Convert to HTML in-context.** Claude reads the source markdown / JSON / whatever, decides on appropriate styling (typography, tables, page setup), and writes a complete HTML file to a temp path. The HTML includes a `<style>` block with `@page { size: A4 landscape; margin: 18mm 12mm; }` (or whatever fits the content).
2. **Run the script.** `node scripts/build-pdf.mjs --input <tmp.html> --output <out.pdf>`. The script invokes the locally-installed Chrome with `--headless=new --print-to-pdf=<out.pdf>` and exits.
3. **Clean up the temp HTML** (or leave it for inspection if the PDF needs tweaking).

End-to-end with no user pauses once Claude has the source. The PDF lands at the requested path; the user verifies by opening it.

## Procedure

### 1. Read the source

If the source is a markdown file, read it. If it's JSON, read it. If it's an audit doc with multiple sections, read everything once — partial reads produce inconsistent styling decisions.

### 2. Decide page setup

Most reports want landscape A4 with 18mm/12mm margins for wide tables, or portrait A4 with 25mm margins for narrative documents. Pick one based on the content shape:

- **Tables wider than ~80 chars**: landscape
- **Narrative / single-column body**: portrait
- **Mixed**: landscape (tables win — narrative wraps fine on a wide page; tables clip on a narrow one)

### 3. Write the HTML

Construct a self-contained HTML document. Required parts:

- `<!doctype html>` + `<html>` + `<head>` with charset
- A `<style>` block with `@page` rules + content styling
- A `<body>` with the rendered content

Pattern (skill-registry style — table-heavy report):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  @page { size: A4 landscape; margin: 18mm 12mm; }
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; font-size: 9.5pt; color: #1a1a1a; line-height: 1.4; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; font-size: 8.5pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #ddd; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; font-weight: 600; }
  a { color: #0a66c2; text-decoration: none; }
  footer { color: #888; font-size: 8pt; margin-top: 18pt; }
</style>
</head>
<body>
  <!-- content -->
</body>
</html>
```

### 4. Render markdown to HTML in-context

Claude writes the HTML body directly. For most reports, the markdown→HTML mapping is mechanical:

- `# Heading` → `<h1>` (one per document; use `<h2>`/`<h3>` for subsections)
- `**bold**` → `<strong>` ; `*italic*` → `<em>`
- `` `code` `` → `<code>`
- `[text](url)` → `<a href="url">text</a>`
- Tables with `|` syntax → `<table><thead>…</thead><tbody>…</tbody></table>`
- `---` → `<hr>`

Do not pull in a markdown library. The conversion is fast in-context (one pass over the source) and lets Claude tune styling per element (e.g. numeric table columns get `text-align: right`).

### 5. Save HTML to a temp path

Write the HTML to `os.tmpdir()` or `node_modules/.cache/` — anywhere that isn't tracked. The script reads from disk so the file must exist when Chrome starts.

### 6. Invoke the script

```bash
node scripts/build-pdf.mjs --input <tmp-html-path> --output <out-pdf-path>
```

The script:
- Locates Chrome (checks `CHROME_PATH`, then platform-specific defaults)
- Runs `chrome --headless=new --disable-gpu --print-to-pdf=<out>`
- Inherits stdio so progress / errors surface to the caller
- Exits 0 on success

### 7. Verify + clean up

Stat the PDF (`fs.statSync` — confirm non-zero bytes). Optionally open it to spot-check page breaks and table clipping. Remove the temp HTML.

## Examples

**Skill-registry PDF (today's primary consumer):**

`scripts/build-skills-pdf.mjs` is a content-aware wrapper: reads `public/data/skills-registry.json`, builds a bespoke HTML template (aggregate table + per-repo tables), calls `printHtmlToPdf` from the shared lib. Run via `npm run build:skills-pdf`. The skill-registry case is "wrapper script that lives in `scripts/`"; one-off uses don't need a wrapper — Claude builds the HTML inline and calls `scripts/build-pdf.mjs` directly.

**One-off audit PDF (future use):**

```
Source: docs/audits/MOBILE-AUDIT-2026-05-15.md
Steps:
  1. Read the markdown
  2. Write HTML to /tmp/audit.html (portrait A4, narrative styling)
  3. node scripts/build-pdf.mjs --input /tmp/audit.html --output docs/audits/MOBILE-AUDIT-2026-05-15.pdf
  4. Verify, clean up /tmp/audit.html
```

## Failure modes

- **Chrome not found.** Set `CHROME_PATH` env var, or install Chrome / Chromium. The skill is a thin wrapper around the system browser; it does not download one.
- **Headless Chrome hangs on remote fonts.** The script sets `--virtual-time-budget=2000` (2s) to let webfonts finish. Heavier remote dependencies will time out — prefer system fonts (`-apple-system, system-ui, ...`).
- **Tables clip off the page.** Either switch to landscape (`@page { size: A4 landscape; }`) or reduce `font-size` on the table. Chrome respects `page-break-inside: avoid` on rows; use `thead { display: table-header-group; }` to repeat headers across pages.
- **Wide URLs break layout.** Chrome will overflow the cell. Wrap long URLs in `<span style="word-break: break-all">` or shorten the visible text and keep the href.
- **PDF is 0 bytes.** Chrome failed silently. Check that the temp HTML actually exists, that the path is absolute, and that `file://` URLs work on the platform (Windows needs three slashes after `file://`).

## Token expectations

For a typical report (~500 lines of markdown, ~10 tables):

- 1 × `Read` of the source (~10K tokens input)
- 1 × HTML composition in-context (~10–15K tokens output)
- 1 × `Bash` to invoke the script (~1K)
- 1 × `Read` to verify (~1K)

Wall-clock: ~15s for the model work + ~3s for Chrome to render. Under 30s end-to-end.

- ~10 uses/year — occasional one-off when a markdown artefact needs to ship as PDF; run total ~10 × 25K ≈ 250K tokens/year. Author estimate pending the in-flight skill-usage measurement tool.

For very large reports (thousands of lines, dozens of tables), consider splitting the HTML composition into a Sonnet sub-agent and only verifying the result in the main thread — same pattern as `sync-readmes` / `skill-registry`.

## Limitations (good enough, not LaTeX-perfect)

- **Typography is browser-grade**, not print-grade. Tracking, hyphenation, widow/orphan control are whatever Chrome's print engine does — generally fine for portfolio reports, not for academic papers.
- **No bookmarks / outline.** Chrome's `--print-to-pdf` doesn't emit a PDF outline. Tables of contents in the HTML render as hyperlinked text inside the document but don't appear in the PDF reader's sidebar.
- **Page numbers / headers / footers.** Disabled here (`--no-pdf-header-footer`) because Chrome's default page footer (URL + page number) is ugly. To add custom page numbers, use `@page :first` / `@page` `@bottom-center` CSS rules (Chrome supports a subset).
- **Embedded fonts.** System fonts are loaded by the OS; the PDF references them by name. Open the PDF on a machine that lacks those fonts and substitution may shift the layout. Prefer the `-apple-system, system-ui, "Segoe UI", sans-serif` stack — present on all targets.
- **No image processing.** Embed images via `<img src="data:...">` (base64-encoded) if portability matters; otherwise file paths work as long as they're absolute or relative to the temp HTML's directory.

These trade-offs are deliberate. A skill that depended on puppeteer + Chromium + headless-stable would be an order of magnitude heavier to install and maintain; for portfolio-grade artifacts the local-Chrome route is enough.
