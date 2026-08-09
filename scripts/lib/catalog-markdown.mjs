/**
 * The skill catalog as markdown, built from the JSON the PDF is built from.
 *
 * WHY GENERATE MARKDOWN rather than render HTML directly. Every other research
 * page goes through `render-audit-doc.mjs`, so they share heading levels, table
 * styling and escaping. A second HTML path for one page would drift from the
 * other ten the first time either changed. This produces the same input shape
 * the markdown papers produce and hands it to the same renderer.
 *
 * WHY IT IS A COMPANION, not a reproduction. `build-skills-pdf.mjs` is a
 * ~900-line designed report: a hero, a calibration chart, a findings section, an
 * appendix. This page carries the inventory — which is the part a visitor came
 * for — and names the PDF as the document for the rest. Reproducing the charts
 * would mean a second copy of that rendering logic, and a second copy is how the
 * page and the download come to disagree.
 *
 * The one thing it must not do is invent numbers. Every figure below is read
 * from the registry; nothing is derived except sums that the file already
 * carries its own totals for, and `catalog-markdown.test.mjs` checks those sums
 * against the file's own `totals` block rather than against a constant.
 */
import fs from 'node:fs';
import path from 'node:path';

import { ROOT } from './paper-sources.mjs';

export const REGISTRY_PATH = 'public/data/skills-registry.json';

/** Thousands separators, so 31180138 reads as a number rather than a smear. */
const num = (n) => Number(n).toLocaleString('en-US');

/** A pipe inside a cell ends the cell, so it has to go. */
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/**
 * First sentence of a description, capped.
 *
 * The registry's descriptions are trigger-phrase paragraphs written for a model
 * to match on, several hundred characters long. Whole, they turn a 34-row table
 * into a wall; the first sentence is what a human reading the inventory wants.
 */
function summarise(text) {
  const first = String(text ?? '').split(/(?<=[.!?])\s+/)[0] ?? '';
  return first.length > 180 ? `${first.slice(0, 177).trimEnd()}...` : first;
}

export function catalogMarkdown() {
  const abs = path.join(ROOT, REGISTRY_PATH);
  if (!fs.existsSync(abs)) {
    throw new Error(`catalog-markdown: ${REGISTRY_PATH} is missing under ${ROOT}`);
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const out = [];

  const t = data.totals ?? {};
  out.push(
    `${num(t.skills)} skills across ${data.repos.length} repositories, ` +
      `${num(t.with_receipts)} of them with a measured token receipt. ` +
      `Generated from \`${REGISTRY_PATH}\` on ${String(data.generated_at).slice(0, 10)}.`,
    '',
    '| | |',
    '| --- | --- |',
    `| Skills | ${num(t.skills)} |`,
    `| With receipts | ${num(t.with_receipts)} |`,
    `| Redirect stubs | ${num(t.redirects)} |`,
    `| Annual tokens saved | ${num(t.annual_tokens_saved)} |`,
    '',
  );

  for (const repo of data.repos) {
    out.push(`## ${repo.name}`, '');
    if (repo.github_url) out.push(`[${repo.github_url}](${repo.github_url})`, '');
    out.push('| Skill | What it does | Saved / use |', '| --- | --- | --- |');
    for (const skill of repo.skills) {
      // A redirect stub is a real row: it is why a name a reader remembers no
      // longer resolves, and hiding it makes the count in the summary wrong.
      const saved = skill.receipt?.tokens_saved_per_use;
      out.push(
        `| ${cell(skill.name)}${skill.redirect ? ' *(redirect)*' : ''} ` +
          `| ${cell(summarise(skill.description))} ` +
          `| ${saved ? num(saved) : '—'} |`,
      );
    }
    out.push('');
  }

  for (const ref of data.built_in_references ?? []) {
    out.push(
      `## Reference: ${ref.label ?? ref.name}`,
      '',
      `${cell(ref.description)} Measured over ${ref.measurement_window_days} days: ` +
        `${num(ref.invocations_in_window)} invocations, ` +
        `${num(ref.tokens_per_use_avg)} tokens per use on average, ` +
        `${num(ref.annual_total)} a year at that rate.`,
      '',
    );
  }

  return out.join('\n');
}
