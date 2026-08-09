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

  it('quotes the registry totals verbatim, not a recomputation', () => {
    const n = (x) => Number(x).toLocaleString('en-US');
    expect(md).toContain(n(registry.totals.skills));
    expect(md).toContain(n(registry.totals.annual_tokens_saved));
    expect(md).toContain(n(registry.totals.with_receipts));
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
