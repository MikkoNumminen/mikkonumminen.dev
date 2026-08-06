import { projects, type Project } from './projects';

/**
 * The language mix across the portfolio, derived from data already in the repo.
 *
 * WHAT IT COUNTS, and the label has to say so: PROJECTS PER LANGUAGE, not bytes
 * or lines. Those are different claims and the difference is not pedantry. A byte
 * share would rank verbose languages and generated files above everything else,
 * and getting it would mean asking GitHub's language endpoint for each repo,
 * which needs a token and a network call this site cannot make (static output
 * only, per the project constraints). A committed JSON refreshed by hand would go
 * stale silently, the way `skills-registry.json` is deliberately NOT generated at
 * build time.
 *
 * Counting projects needs none of that. It is derivable from `projects.ts`, it
 * cannot drift from the project list because it IS the project list, and it
 * answers the question a visitor is actually asking: what does he work in.
 *
 * A project counts once per language regardless of how much of it is written in
 * that language, so the numbers sum to more than the project count when a project
 * uses several.
 */

/**
 * Which `tech` entries are languages.
 *
 * An explicit allowlist rather than a heuristic. `tech` mixes languages with
 * frameworks, services and libraries ('ASP.NET Core', 'MUI', 'Zod', 'GitHub
 * Actions'), and no rule separates them: "is it a language" is knowledge, not a
 * pattern. Anything not listed here is simply not counted, so adding a language
 * to a project without adding it here shows up as a project with no language,
 * which `projectLanguages.test.ts` fails on.
 */
export const LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'C#',
  'Rust',
  'Bash',
  'Go',
  'Java',
  'Kotlin',
  'Swift',
  'PHP',
  'Ruby',
  'SQL',
  'GLSL',
  'Lua',
  'PowerShell',
] as const;

export type Language = (typeof LANGUAGES)[number];

const LANGUAGE_SET: ReadonlySet<string> = new Set(LANGUAGES);

export interface LanguageSlice {
  language: string;
  /** How many projects list it. */
  count: number;
  /** Share of the total slice count, 0 to 1. Rendering detail, kept here so the
   *  component does no arithmetic of its own. */
  share: number;
}

/** The languages one project declares, in the order `LANGUAGES` lists them. */
export function projectLanguages(project: Project): string[] {
  return LANGUAGES.filter((lang) => project.tech.includes(lang));
}

/**
 * Every language across the given projects, most-used first.
 *
 * Ties break alphabetically so the order is stable: without that, two languages
 * on the same count would swap places whenever the project list was reordered,
 * and the chart would appear to change when nothing had.
 */
export function languageMix(source: readonly Project[] = projects): LanguageSlice[] {
  const counts = new Map<string, number>();
  for (const project of source) {
    for (const tech of project.tech) {
      if (LANGUAGE_SET.has(tech)) {
        counts.set(tech, (counts.get(tech) ?? 0) + 1);
      }
    }
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return [...counts.entries()]
    .map(([language, count]) => ({
      language,
      count,
      share: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language));
}
