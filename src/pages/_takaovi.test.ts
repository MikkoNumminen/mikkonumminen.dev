import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `takaovi.astro` is source-read rather than rendered, matching
 * `CvPage.test.ts` and `SiteNav.test.ts`: `.astro` files are not exercised by
 * this test runner, so the property worth holding is what the source files
 * contain, not one render of them.
 *
 * The page's own doc comment states its contract (Finnish-only, no `/fi/`
 * twin, noindex, no page-specific prompt). This file pins that contract so a
 * later edit that quietly widens it fails a test rather than shipping.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '../..');

const takaoviAstro = readFileSync(path.join(here, 'takaovi.astro'), 'utf8');
const standaloneLayout = readFileSync(
  path.join(here, '../layouts/StandaloneLayout.astro'),
  'utf8',
);

/**
 * Comment stripping duplicated from `cvPage.test.ts` / `cvSurfaces.test.ts`
 * rather than imported: the repo's rule of three says wait for a third use
 * before extracting a shared helper, and this would be the fourth call site
 * but the third distinct test file to need it, so it stays inline here too.
 */
const HTML_OPEN = '<!--';
const HTML_CLOSE = '-->';

const stripHtmlComments = (source: string): string => {
  const kept: string[] = [];
  let cursor = 0;
  for (;;) {
    const open = source.indexOf(HTML_OPEN, cursor);
    if (open === -1) {
      kept.push(source.slice(cursor));
      break;
    }
    kept.push(source.slice(cursor, open));
    const close = source.indexOf(HTML_CLOSE, open + HTML_OPEN.length);
    if (close === -1) break;
    cursor = close + HTML_CLOSE.length;
  }
  return kept.join('');
};

const stripComments = (source: string): string =>
  stripHtmlComments(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('src/pages/takaovi.astro', () => {
  it('imports StandaloneLayout and never BaseLayout', () => {
    // BaseLayout's pre-paint language script would send a Finnish-first
    // browser away from this page (see StandaloneLayout's doc comment); the
    // page must import the standalone layout only.
    expect(takaoviAstro, 'must import StandaloneLayout').toMatch(
      /import\s+StandaloneLayout\s+from\s+['"].*layouts\/StandaloneLayout\.astro['"]/,
    );
    expect(takaoviAstro, 'must never import BaseLayout').not.toMatch(
      /from\s+['"].*layouts\/BaseLayout\.astro['"]/,
    );
  });

  it('passes lang="fi" and noindex to StandaloneLayout', () => {
    const opened = takaoviAstro.match(/<StandaloneLayout\b[\s\S]*?>/);
    expect(opened, 'no <StandaloneLayout ...> opening tag found').not.toBeNull();
    const tag = opened![0];
    expect(tag, 'must pass lang="fi"').toMatch(/lang="fi"/);
    expect(tag, 'must pass the noindex prop').toMatch(/\bnoindex\b/);
  });
});

describe('src/layouts/StandaloneLayout.astro', () => {
  it('emits the noindex robots meta tag under the noindex prop', () => {
    expect(standaloneLayout).toMatch(
      /noindex\s*&&\s*<meta\s+name="robots"\s+content="noindex, nofollow"/,
    );
  });

  it("does not contain BaseLayout's language-redirect script", () => {
    // These three strings are the redirect script's fingerprints (see
    // BaseLayout.astro's doc comment on the pre-paint language check). Their
    // absence here is what makes a Finnish-locale e2e context land on
    // /takaovi rather than being bounced by a script this layout never ships.
    for (const marker of ['navigator.languages', 'mn_lang_checked', 'location.replace']) {
      expect(
        standaloneLayout,
        `StandaloneLayout must not contain BaseLayout's redirect marker "${marker}"`,
      ).not.toContain(marker);
    }
  });

  it('does not mount ClientRouter, SiteNav or BackgroundAudio', () => {
    for (const marker of ['ClientRouter', 'SiteNav', 'BackgroundAudio']) {
      expect(
        standaloneLayout,
        `StandaloneLayout must not reference "${marker}"`,
      ).not.toContain(marker);
    }
  });
});

describe('no Finnish twin', () => {
  it('src/pages/fi/takaovi.astro does not exist', () => {
    // /takaovi IS the Finnish page; a /fi/takaovi twin would be a second URL
    // for the same content and the doc comment's whole point ("Finnish at
    // its only URL") would be false.
    const twin = path.join(here, 'fi/takaovi.astro');
    expect(existsSync(twin), `${twin} must not exist`).toBe(false);
  });
});

describe('vercel.json', () => {
  const vercelJson = JSON.parse(
    readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'),
  ) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };

  it('carries an X-Robots-Tag noindex, nofollow header for exactly "/takaovi"', () => {
    const entry = vercelJson.headers?.find((h) => h.source === '/takaovi');
    expect(entry, 'no headers entry with source exactly "/takaovi"').toBeTruthy();
    const robotsHeader = entry?.headers.find((h) => h.key === 'X-Robots-Tag');
    expect(robotsHeader?.value).toBe('noindex, nofollow');
  });
});

describe('astro.config.mjs', () => {
  const astroConfig = readFileSync(path.join(repoRoot, 'astro.config.mjs'), 'utf8');

  it('filters /takaovi out of the sitemap', () => {
    expect(astroConfig, 'sitemap() must configure a filter').toMatch(/filter\s*:/);
    expect(astroConfig).toContain('/takaovi');
  });
});

describe('src/data/takaovi.ts copy', () => {
  it('has exactly the five questions the page asks about', async () => {
    const { takaoviCopy } = await import('../data/takaovi');
    expect(takaoviCopy.questions).toEqual([
      'Mitä Mikko tekee Takaovella?',
      'Mitä teknologioita Mikko on käyttänyt?',
      'Mikä on Mikon tausta?',
      'Millaisia projekteja Mikko on tehnyt?',
      'Miten Mikko käyttää tekoälyä työssään?',
    ]);
  });

  it('has a heading and a lede', async () => {
    const { takaoviCopy } = await import('../data/takaovi');
    expect(takaoviCopy.heading.lead.length).toBeGreaterThan(0);
    expect(takaoviCopy.heading.accent.length).toBeGreaterThan(0);
    expect(takaoviCopy.lede.length).toBeGreaterThan(0);
  });

  it('carries no em dash anywhere in the copy object', async () => {
    // The site publishes under a real name and holds every user-facing
    // string to this rule (houseStyle.test.ts). This file sits outside
    // src/i18n/locales, so it needs its own guard rather than inheriting one.
    const { takaoviCopy } = await import('../data/takaovi');
    const offenders: string[] = [];
    const walk = (value: unknown, pathLabel: string): void => {
      if (typeof value === 'string') {
        if (value.includes('—')) offenders.push(`${pathLabel}: ${value}`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${pathLabel}[${i}]`));
        return;
      }
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, `${pathLabel}.${k}`);
      }
    };
    walk(takaoviCopy, 'takaoviCopy');
    expect(offenders).toEqual([]);
  });
});

describe('src/lib/takaovi request contract is not widened', () => {
  const dir = path.join(here, '../lib/takaovi');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => statSync(path.join(dir, f)).isFile());

  // Guard the guard: a typo in the glob above that matched nothing would
  // make every it.each case below vacuously pass.
  it('found the takaovi lib files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s never mentions language/audience/system_prompt', (file) => {
    const code = stripComments(readFileSync(path.join(dir, file), 'utf8'));
    for (const forbidden of ['language', 'lang:', 'audience', 'system_prompt']) {
      expect(
        code,
        `${file} must not contain "${forbidden}": the page asks the same backend the same way, with no page-specific prompt or parameters`,
      ).not.toContain(forbidden);
    }
  });

  it.each(files)('%s never calls fetch directly', (file) => {
    const code = stripComments(readFileSync(path.join(dir, file), 'utf8'));
    // Matches a bare `fetch(` call, not `fetchImpl` or `.fetch` on something
    // else; the controller and view must go through the shared chat client.
    expect(
      code,
      `${file} must call the backend only through the chat client, never fetch() directly`,
    ).not.toMatch(/(?<![.\w])fetch\s*\(/);
  });
});
