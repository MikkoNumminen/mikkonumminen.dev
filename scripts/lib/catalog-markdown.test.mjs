/**
 * The catalog page is generated, so its failure mode is different from the
 * other ten.
 *
 * A prose paper goes wrong by being the wrong text, which a human notices on
 * sight. A generated one goes wrong by QUIETLY DROPPING ROWS: a filter that
 * skips redirect stubs, a repo loop that misses the last entry, a receipt field
 * that renamed. The page still looks like a catalog, and the only way to know it
 * is short is to count against the source.
 *
 * So everything here counts against the registry's own numbers rather than
 * against constants written down here. A constant would go stale the next time
 * a skill is added and would then be asserting the past.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT } from './paper-sources.mjs';
import { catalogMarkdown, REGISTRY_PATH } from './catalog-markdown.mjs';
import { readPaperBody } from './paper-body.mjs';

const registry = JSON.parse(
  readFileSync(path.join(ROOT, REGISTRY_PATH), 'utf8'),
);
const md = catalogMarkdown();

describe('the catalog is built from the registry', () => {
  it('has a registry to build from', () => {
    // Guards the guard: an empty registry would satisfy every count below.
    expect(registry.repos.length).toBeGreaterThanOrEqual(3);
    expect(registry.totals.skills).toBeGreaterThanOrEqual(20);
  });

  it('lists every skill the registry contains', () => {
    const listed = registry.repos.flatMap((r) => r.skills);
    expect(listed.length, 'registry totals disagree with its own repos').toBe(
      registry.totals.skills,
    );
    for (const skill of listed) {
      expect(md, `${skill.name} is in the registry but not on the page`).toContain(
        skill.name,
      );
    }
  });

  it('gives every repository its own section', () => {
    for (const repo of registry.repos) {
      expect(md).toContain(`## ${repo.name}`);
    }
  });

  it('keeps redirect stubs visible rather than filtering them out', () => {
    // A stub is why a name someone remembers stops resolving. Dropping them
    // would also make the skill count in the summary wrong.
    const stubs = registry.repos.flatMap((r) => r.skills).filter((s) => s.redirect);
    expect(stubs.length, 'no redirect stubs in the registry to check').toBeGreaterThan(0);
    for (const stub of stubs) expect(md).toContain(stub.name);
    expect(md).toContain('*(redirect)*');
  });

  it('headlines the same skill count the PDF headlines', () => {
    // THE FINDING THIS EXISTS FOR. The first version quoted `totals.skills`,
    // so the page said 34 where the PDF said 33 — same file, same day. The PDF
    // derives ACTIVE skills from the per-skill redirect flags and says why: a
    // redirect is a tombstone with no receipt, and a stale `totals.redirects`
    // in a hand-edited registry would desync the headline from the tables.
    //
    // "Built from the same source" does not imply "shows the same number". It
    // only holds if both sides derive it the same way, which is what this pins.
    const all = registry.repos.flatMap((r) => r.skills);
    const active = all.filter((skill) => !skill.redirect).length;
    const n = (x) => Number(x).toLocaleString('en-US');

    expect(active, 'no redirects in the registry, so this proves nothing').toBeLessThan(
      all.length,
    );
    expect(md).toContain(`${n(active)} skills across`);
    expect(md).toContain(`| Active skills | ${n(active)} |`);
    expect(md, 'the page is headlining the raw total again').not.toContain(
      `${n(all.length)} skills across`,
    );
  });

  it('derives it the way build-skills-pdf still derives it', () => {
    // A source check, because the number above only agrees while the PDF keeps
    // computing it this way. If that script changes its headline, this fails and
    // names the file to look at rather than leaving two documents quietly
    // disagreeing about how many skills exist.
    const builder = readFileSync(path.join(ROOT, 'scripts/build-skills-pdf.mjs'), 'utf8');
    expect(
      builder,
      'build-skills-pdf.mjs no longer derives activeSkills from the redirect flags; ' +
        'the catalog page copies that derivation and will now disagree with the PDF',
    ).toMatch(/const activeSkills[\s\S]{0,200}filter\(\(s\) => !s\.redirect\)/);
  });

  it('quotes the registry totals it does not derive', () => {
    const n = (x) => Number(x).toLocaleString('en-US');
    expect(md).toContain(n(registry.totals.annual_tokens_saved));
    expect(md).toContain(n(registry.totals.with_receipts));
  });

  it('gives every table a non-empty header row', () => {
    // The summary table shipped as `| | |`, which renders two empty <th> cells:
    // a blank header row on screen and nothing at all for a screen reader
    // announcing the column. Every table's first row must name its columns.
    let tables = 0;
    let expectHeader = true;
    for (const line of md.split('\n')) {
      if (!line.startsWith('|')) {
        expectHeader = true;
        continue;
      }
      if (!expectHeader) continue;
      expectHeader = false;
      tables += 1;
      const cells = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((c) => c.trim());
      for (const c of cells) {
        expect(c, `a table header cell is empty: ${line}`).not.toBe('');
      }
    }
    expect(tables, 'no tables found').toBeGreaterThanOrEqual(registry.repos.length + 1);
  });

  it('stamps the date the registry was generated', () => {
    // The listing already asserts `papers.ts` carries this same date; this is
    // the page saying it out loud, so a stale registry is visible on the page
    // rather than only in a test.
    expect(md).toContain(String(registry.generated_at).slice(0, 10));
  });

  it('escapes pipes so a description cannot break a table', () => {
    // A description containing a raw pipe adds a phantom column and shifts every
    // cell after it. Checked per TABLE rather than against one number: the
    // summary is two columns and the repo tables are three, so a fixed count is
    // wrong for one of them, as the first version of this case was.
    const columns = (line) => [...line.matchAll(/(?<!\\)\|/g)].length;
    let header = null;
    let checked = 0;
    for (const line of md.split('\n')) {
      if (!line.startsWith('|')) {
        header = null;
        continue;
      }
      if (header === null) {
        header = columns(line);
        continue;
      }
      checked += 1;
      expect(
        columns(line),
        `row has ${columns(line)} pipes where its header has ${header}: ${line.slice(0, 70)}`,
      ).toBe(header);
    }
    expect(checked, 'no table rows were checked').toBeGreaterThan(registry.totals.skills);
  });
});

describe('the catalog reaches the reader through the same pipeline', () => {
  it('renders as a page, labelled generated', () => {
    const body = readPaperBody('skills-registry.pdf');
    expect(body, 'the catalog has no page').not.toBeNull();
    expect(body.kind).toBe('generated');
    expect(body.source).toBe(REGISTRY_PATH);
    // One table per repo plus the summary: rendered by `render-audit-doc.mjs`,
    // the same renderer the ten markdown papers use.
    expect((body.html.match(/<table/g) ?? []).length).toBe(registry.repos.length + 1);
  });
});
