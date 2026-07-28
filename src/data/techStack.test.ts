import { describe, it, expect } from 'vitest';
import { techStack, type TechContext } from './techStack';
import { projects } from './projects';
import { techProjects } from './techProjects';
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

  it('primary names are unique across the whole box', () => {
    const primaries = techStack.flatMap((c) => c.primaries.map((p) => p.name));
    const seen = new Set<string>();
    for (const name of primaries) {
      expect(seen.has(name.toLowerCase()), `${name} is a primary twice`).toBe(false);
      seen.add(name.toLowerCase());
    }
  });

  // A secondary may appear under more than one primary, because a secondary
  // answers "what sits under this heading" rather than claiming one true home
  // — pgvector genuinely belongs to both PostgreSQL and RAG. But an unintended
  // repeat looks identical to a deliberate one, so each is named here.
  it('every repeated secondary is a deliberate cross-listing', () => {
    const CROSS_LISTED: ReadonlySet<string> = new Set([
      'pgvector',
      'fastapi',
      'ollama',
      'tailscale funnel',
      'microsoft.extensions.ai',
    ]);
    const homes = new Map<string, string[]>();
    for (const c of techStack) {
      for (const p of c.primaries) {
        for (const s of p.secondaries ?? []) {
          const key = s.name.toLowerCase();
          homes.set(key, [...(homes.get(key) ?? []), `${c.id}/${p.name}`]);
        }
      }
    }
    const primaryNames = new Set(
      techStack.flatMap((c) => c.primaries.map((p) => p.name.toLowerCase())),
    );
    for (const [key, where] of homes) {
      const repeated = where.length > 1 || primaryNames.has(key);
      if (!repeated) continue;
      expect(CROSS_LISTED.has(key), `${key} appears in ${where.join(', ')}`).toBe(true);
    }
    // And the reverse: a cross-listing that stopped being one is stale.
    for (const key of CROSS_LISTED) {
      const where = homes.get(key) ?? [];
      expect(
        where.length > 1 || primaryNames.has(key),
        `${key} is marked cross-listed but appears once`,
      ).toBe(true);
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
  // launchd and Task Scheduler left this list when the box gained their
  // installers under Packaging — using a scheduler is an OS utility, shipping
  // the thing that registers with it is not. tmux stays: that path is
  // send-keys subprocess calls, with no engineered surface comparable to the
  // AppleScript layer, and the bare name reads as daily tooling.
  tmux: 'driven with send-keys; no evaluable surface, and the name reads as daily tooling',
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

describe('techProjects (attribution behind the by-project view)', () => {
  const projectIds = new Set(projects.map((p) => p.id));
  const techNames = new Set(allItems.map((i) => i.name));

  it('every technology in the box has an attribution entry', () => {
    const missing = [...techNames].filter((n) => !(n in techProjects)).sort();
    expect(missing, 'technologies with no entry in techProjects').toEqual([]);
  });

  it('has no entry for a technology the box does not show', () => {
    const orphans = Object.keys(techProjects)
      .filter((n) => !techNames.has(n))
      .sort();
    expect(orphans, 'attributions for technologies not in the box').toEqual([]);
  });

  it('only references real project ids', () => {
    for (const [tech, ids] of Object.entries(techProjects)) {
      for (const id of ids) {
        expect(projectIds.has(id), `${tech} -> unknown project "${id}"`).toBe(true);
      }
    }
  });

  it('lists no project twice for one technology', () => {
    for (const [tech, ids] of Object.entries(techProjects)) {
      expect(new Set(ids).size, `${tech} repeats a project`).toBe(ids.length);
    }
  });

  // The by-project view is a pivot of this map. A project that pivots to
  // nothing would render as an empty row, which reads as a mistake rather
  // than as information.
  it('every project pivots to at least one technology', () => {
    const empty = projects
      .filter((p) => !Object.values(techProjects).some((ids) => ids.includes(p.id)))
      .map((p) => p.id);
    expect(empty, 'projects that would render an empty row').toEqual([]);
  });

  // An unattributed technology is allowed, but only deliberately: it means
  // client work with no project behind it, or a repo that is not a listed
  // project. Anything else is a gap.
  it('only these technologies are deliberately unattributed', () => {
    const unattributed = Object.entries(techProjects)
      .filter(([, ids]) => ids.length === 0)
      .map(([name]) => name)
      .sort();
    expect(unattributed).toEqual(['Dioxus', 'Kubernetes', 'PgTyped', 'Recharts', 'zbus']);
  });
});
