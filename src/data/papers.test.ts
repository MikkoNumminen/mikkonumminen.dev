import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  LABEL_DATE_PREFIX,
  PAPERS,
  localizePapers,
  monthLabel,
  paperUrl,
} from './papers';
import { getTranslations, LOCALES } from '../i18n';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('papers', () => {
  it('has papers at all', () => {
    // Guards the guard. A broken import would make every case below vacuous.
    expect(PAPERS.length).toBeGreaterThanOrEqual(10);
  });

  it('serves a real file for every paper', () => {
    // The failure this prevents is a renamed or deleted PDF leaving a download
    // that 404s. The command checks availability at click time and reports it,
    // but a visitor should never get that far.
    for (const paper of PAPERS) {
      const served = path.join(root, 'public', paper.filename);
      expect(
        statSync(served).size,
        `${paper.id} points at public/${paper.filename}, which is missing or empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('gives every paper a distinct, typeable id', () => {
    const ids = PAPERS.map((p) => p.id);
    expect(new Set(ids).size, 'duplicate paper id').toBe(ids.length);
    for (const id of ids) {
      // Typed at a prompt, so no dashes, spaces or capitals to get wrong.
      expect(id, `${id} is not typeable as-is`).toMatch(/^[a-z]+$/);
    }
  });

  it('keeps exactly one primary, the CV', () => {
    const primary = PAPERS.filter((p) => p.tier === 'primary');
    expect(primary.map((p) => p.id)).toEqual(['cv']);
  });

  it('stores the research oldest first', () => {
    // The terminal renders this order as-is, and `cmdDownloadResearchIntro`
    // promises "oldest → newest". That promise is only true if the array is
    // sorted, and nothing else was checking. The page reverses it for display.
    const dates = PAPERS.filter((p) => p.tier === 'research').map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('derives the url from the filename', () => {
    for (const paper of PAPERS) {
      expect(paperUrl(paper)).toBe(`/${paper.filename}`);
    }
  });
});

describe('paper dates agree with the prose that repeats them', () => {
  // Most labels open with their own month ("jul 2026 · the blind test…"). That
  // prose is translated and the corpus doc repeats it, so it is not going away,
  // which means it is a second copy of the date and can disagree with the first.
  it.each(LOCALES)('in %s', (locale) => {
    const t = getTranslations(locale);
    let checked = 0;
    for (const paper of localizePapers(t)) {
      const match = LABEL_DATE_PREFIX.exec(paper.label);
      if (!match) continue;
      checked += 1;
      expect(
        `${match[1]} ${match[2]}`,
        `${locale} label for ${paper.id} says "${match[1]} ${match[2]}", data says ${paper.date}`,
      ).toBe(monthLabel(paper.date, locale));
    }
    // Not every label carries a date, but if this ever read 0 the case would be
    // passing without comparing anything.
    expect(checked, `${locale}: no label carried a date prefix`).toBeGreaterThan(4);
  });

  it('strips the date prefix for the page summary', () => {
    const t = getTranslations('en');
    const dated = localizePapers(t).find((p) => LABEL_DATE_PREFIX.test(p.label));
    expect(dated, 'expected at least one dated label').toBeDefined();
    expect(dated!.summary).not.toMatch(LABEL_DATE_PREFIX);
    expect(dated!.summary.length).toBeGreaterThan(10);
  });
});

describe('the catalog date tracks the file it is generated from', () => {
  it('matches generated_at in the skills registry', () => {
    // `skills-registry.pdf` is built from this JSON rather than from a dated
    // post, so its date has no front matter to come from. Copying the stamp by
    // hand is exactly the drift this repo keeps finding, so the copy is checked
    // against the source instead.
    const registry = JSON.parse(
      readFileSync(path.join(root, 'public/data/skills-registry.json'), 'utf8'),
    );
    const catalog = PAPERS.find((p) => p.id === 'catalog');
    expect(catalog, 'no catalog paper').toBeDefined();
    expect(
      String(registry.generated_at).slice(0, 7),
      'the registry was regenerated; update the catalog date in papers.ts',
    ).toBe(catalog!.date);
  });
});

describe('the research page derives its list rather than keeping one', () => {
  // A source check, not a behaviour check, and deliberately so: asserting "the
  // page lists every paper" against rendered output would pass the moment
  // somebody pasted a second copy of the list into the page and kept it in sync
  // for one commit. Forbidding the literal filename makes the property true by
  // construction, and it is the construction that has to survive, not one render.
  const page = readFileSync(
    path.join(root, 'src/page-content/ResearchIndexPage.astro'),
    'utf8',
  );

  it('imports the shared list', () => {
    expect(page).toMatch(/from '\.\.\/data\/papers'/);
  });

  it('names no PDF of its own', () => {
    // The trailing lookahead is load-bearing: without it `t.researchPage.pdfLabel`
    // reads as a filename and the guard fails on a property access.
    const literals = page.match(/[\w-]+\.pdf(?![\w])/g) ?? [];
    expect(literals, `the page hardcodes ${literals.join(', ')}`).toEqual([]);
  });
});

describe('every locale resolves every paper', () => {
  it.each(LOCALES)('in %s', (locale) => {
    const t = getTranslations(locale);
    for (const paper of localizePapers(t)) {
      expect(paper.label, `${locale}: empty label for ${paper.id}`).toBeTruthy();
      expect(
        paper.notAvailableMsg,
        `${locale}: empty unavailable message for ${paper.id}`,
      ).toBeTruthy();
    }
  });
});
