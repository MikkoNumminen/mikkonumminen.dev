import { describe, it, expect } from 'vitest';
import { techStack, type TechContext } from './techStack';
import { projects } from './projects';
import { getTranslations, LOCALES } from '../i18n';

// Mirrors projects.test.ts and timeline.test.ts: the structural backstop the
// types can't give. The two-level rule and the per-locale category strings are
// invariants a reader of the rendered box would assume, and both would fail
// silently — a third level as an ignored field, a missing string as a blank
// heading.

const VALID_CONTEXTS: ReadonlySet<TechContext> = new Set<TechContext>([
  'work',
  'own',
  'both',
]);

/** Every item in the box, primaries and secondaries alike. */
const allItems = techStack.flatMap((c) =>
  c.primaries.flatMap((p) => [p, ...(p.secondaries ?? [])]),
);

describe('techStack (structural data)', () => {
  it('every category has an id and at least one primary', () => {
    for (const c of techStack) {
      expect(c.id, 'category id').toBeTruthy();
      expect(c.primaries.length, `${c.id}.primaries`).toBeGreaterThan(0);
    }
  });

  it('category ids are unique', () => {
    const ids = techStack.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item has a non-empty name', () => {
    for (const item of allItems) {
      expect(item.name.trim(), `name of ${JSON.stringify(item)}`).toBeTruthy();
    }
  });

  it('every declared context is one of work/own/both', () => {
    for (const item of allItems) {
      if (item.context === undefined) continue;
      expect(VALID_CONTEXTS.has(item.context), `${item.name}.context`).toBe(true);
    }
  });

  // The spec is two levels, never three. `TechItem` has no `secondaries` field,
  // so a third level can only arrive as an excess property — which object
  // literals reject at compile time but a spread or a cast would slip past.
  it('secondaries never carry their own secondaries', () => {
    for (const c of techStack) {
      for (const p of c.primaries) {
        for (const s of p.secondaries ?? []) {
          expect(s, `${c.id}/${p.name}/${s.name}`).not.toHaveProperty('secondaries');
        }
      }
    }
  });

  it('no technology is listed twice anywhere in the box', () => {
    const seen = new Map<string, string>();
    for (const c of techStack) {
      for (const p of c.primaries) {
        for (const item of [p, ...(p.secondaries ?? [])]) {
          const key = item.name.toLowerCase();
          expect(seen.has(key), `${item.name} also appears in ${seen.get(key)}`).toBe(
            false,
          );
          seen.set(key, c.id);
        }
      }
    }
  });

  it('every category has a heading string in every locale', () => {
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      for (const c of techStack) {
        const name = t.techStack.categories[c.id];
        expect(name, `${locale}.techStack.categories.${c.id}`).toBeTruthy();
      }
    }
  });

  it('the legend and work badge are translated in every locale', () => {
    for (const locale of LOCALES) {
      const { legend, workBadge, title, lede } = getTranslations(locale).techStack;
      for (const [key, value] of Object.entries({ legend, workBadge, title, lede })) {
        expect(value.trim(), `${locale}.techStack.${key}`).toBeTruthy();
      }
    }
  });
});

/**
 * Technologies a project declares that the box deliberately does not show.
 *
 * The box is curated, not a mirror — see the bar for inclusion in
 * `techStack.ts`. Each entry here is a decision, so it is written down with
 * its reason rather than silently filtered. The test below still fails on any
 * *new* project technology, which is the drift that would matter.
 */
const DELIBERATELY_OMITTED: Readonly<Record<string, string>> = {
  Markdown: 'a file format, not a skill',
  'Claude Opus': 'model name — which model was called is not a capability',
  'Claude Sonnet': 'model name',
  'Claude Haiku': 'model name',
  'Poro 2 8B': 'model name',
  ccusage: 'third-party usage dashboard',
  launchd: 'OS utility',
  'Task Scheduler': 'OS utility',
  tmux: 'OS utility',
  num2words: 'commodity library — a number-to-words helper',
  pydub: 'thin wrapper over ffmpeg, which is listed',
  pygame: 'used only as an audio backend; implies a game that is not in Python',
  ocrmypdf: 'Tesseract orchestration; listing both double-counts one capability',
  'Bootstrap 5': 'a Tailwind competitor, not a sub-technology, and dated',
  'wasm-bindgen': 'implementation detail of WebAssembly + Rust, both listed',
};

describe('techStack curation', () => {
  it('shows every project technology except the ones deliberately omitted', () => {
    const listed = new Set(allItems.map((i) => i.name.toLowerCase()));
    const covered = (tech: string): boolean => {
      const t = tech.toLowerCase();
      return listed.has(t) || [...listed].some((n) => n.includes(t) || t.includes(n));
    };
    const unexplained = [...new Set(projects.flatMap((p) => p.tech))]
      .filter((t) => !covered(t) && !(t in DELIBERATELY_OMITTED))
      .sort();
    expect(
      unexplained,
      'project technologies neither shown nor listed as a deliberate omission',
    ).toEqual([]);
  });

  // Guards the other direction: an omission that stops being true — because the
  // technology got added to the box, or dropped from every project — should be
  // deleted from the list rather than left to rot as a stale justification.
  it('has no stale omissions', () => {
    const listed = new Set(allItems.map((i) => i.name.toLowerCase()));
    const declared = new Set(projects.flatMap((p) => p.tech));
    for (const name of Object.keys(DELIBERATELY_OMITTED)) {
      expect(declared.has(name), `${name} is omitted but no project declares it`).toBe(
        true,
      );
      expect(listed.has(name.toLowerCase()), `${name} is both omitted and shown`).toBe(
        false,
      );
    }
  });
});
