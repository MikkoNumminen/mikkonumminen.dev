import type { Translations } from '../i18n/types';

/**
 * The downloadable documents, in one place.
 *
 * WHY THIS IS ITS OWN MODULE. The list used to live inside the `buildCommands`
 * closure in `src/lib/terminal/commands.ts`, which was fine while the terminal
 * was the only way to reach a paper. It is not any more: `/research` lists the
 * same documents, and two copies of a list like this drift the first time one is
 * edited and the other is not.
 *
 * The CI guard that watches this list used to GREP `commands.ts` for the array,
 * and had to be re-anchored the one time the array moved a few lines. It imports
 * this module instead now, which is why the extraction was worth doing at all.
 *
 * Structure only. Every translatable string is an i18n key resolved by
 * `localizePapers`, and the import of `Translations` is type-only so this module
 * stays free of the i18n bundle and can be read by tests and `.astro`
 * frontmatter alike.
 */
export interface Paper {
  /** What a visitor types: `download blindtest`. The flag is `--${id}`. */
  id: string;
  /**
   * `primary` is the CV, which belongs on the contact terminal rather than with
   * the research. `/research` renders the `research` tier only.
   */
  tier: 'primary' | 'research';
  /**
   * NOT translated, the same decision `Project.name` makes. The documents
   * themselves are English, so a Finnish title would promise a Finnish paper
   * that does not exist. Taken verbatim from the corpus post where there is one.
   */
  title: string;
  /** Bare filename; the served URL is derived, never written twice. */
  filename: string;
  /**
   * `YYYY-MM`, from the source document's own front matter rather than from
   * anybody's memory. `catalog` takes its month from the `generated_at` stamp
   * inside `public/data/skills-registry.json`, and `papers.test.ts` asserts that
   * agreement, because that file is regenerated and a hand-copied date there
   * would go stale silently.
   */
  date: string;
  labelKey: keyof Translations['terminal'];
  notAvailableKey: keyof Translations['terminal'];
}

/**
 * Ascending by date, and the order is load-bearing in two directions.
 *
 * The terminal renders this order as-is, which is what makes
 * `cmdDownloadResearchIntro`'s promise of "oldest to newest" true rather than
 * hopeful, and `papers.test.ts` asserts it. The `/research` page reverses it:
 * a trail reads forwards, a listing of current work reads backwards.
 */
export const PAPERS: readonly Paper[] = [
  {
    id: 'cv',
    tier: 'primary',
    // Last revised 2026-08, from the commit that rewrote `content/cv.md`, which
    // is now the PDF's source. The CV is not listed on /research, so this date
    // is carried for completeness rather than displayed.
    title: 'Curriculum vitae',
    filename: 'mikko-numminen-cv.pdf',
    date: '2026-08',
    labelKey: 'cmdDownloadOptionCv',
    notAvailableKey: 'cmdDownloadNotAvailable',
  },
  {
    id: 'catalog',
    tier: 'research',
    title: 'The skill catalog: every skill across four repositories',
    filename: 'skills-registry.pdf',
    date: '2026-05',
    labelKey: 'cmdDownloadOptionCatalog',
    notAvailableKey: 'cmdDownloadCatalogNotAvailable',
  },
  {
    id: 'study',
    tier: 'research',
    title: 'Why "read each SKILL.md" costs tokens: five rounds of before/after testing',
    filename: 'skills-optim-study.pdf',
    date: '2026-05',
    labelKey: 'cmdDownloadOptionStudy',
    notAvailableKey: 'cmdDownloadStudyNotAvailable',
  },
  {
    id: 'replicates',
    tier: 'research',
    title:
      'Round 6 of the skills optimization study: re-measuring the six noisiest cells',
    filename: 'skills-optim-study-replicates.pdf',
    date: '2026-06',
    labelKey: 'cmdDownloadOptionReplicates',
    notAvailableKey: 'cmdDownloadReplicatesNotAvailable',
  },
  {
    id: 'results',
    tier: 'research',
    title: 'The two skill-auditors: what they cost, and what they fixed',
    filename: 'skills-results.pdf',
    date: '2026-06',
    labelKey: 'cmdDownloadOptionResults',
    notAvailableKey: 'cmdDownloadResultsNotAvailable',
  },
  {
    id: 'calibration',
    tier: 'research',
    title: 'Skill-suite calibration: 96 A/B arms across three codebases and three models',
    filename: 'skills-suite-calibration.pdf',
    date: '2026-06',
    labelKey: 'cmdDownloadOptionSkills',
    notAvailableKey: 'cmdDownloadSkillsNotAvailable',
  },
  {
    id: 'finnish',
    tier: 'research',
    title: 'Does the portfolio RAG need Finnish, and does it need a Finnish-built model?',
    filename: 'rag-finnish-experiment.pdf',
    date: '2026-06',
    labelKey: 'cmdDownloadOptionFinnish',
    notAvailableKey: 'cmdDownloadFinnishNotAvailable',
  },
  {
    id: 'methodology',
    tier: 'research',
    title: 'How a Finnish-RAG experiment caught and corrected its own mistake',
    filename: 'rag-finnish-methodology.pdf',
    date: '2026-06',
    labelKey: 'cmdDownloadOptionMethodology',
    notAvailableKey: 'cmdDownloadMethodologyNotAvailable',
  },
  {
    id: 'blindtest',
    tier: 'research',
    title: 'Which local model writes the best Finnish? A blind test settles it',
    filename: 'rag-finnish-blind-test.pdf',
    date: '2026-07',
    labelKey: 'cmdDownloadOptionBlindTest',
    notAvailableKey: 'cmdDownloadBlindTestNotAvailable',
  },
  {
    id: 'poro',
    tier: 'research',
    title:
      'Poro-2-8B in production: what we measured, what broke, what we built around it',
    filename: 'poro-findings.pdf',
    date: '2026-07',
    labelKey: 'cmdDownloadOptionPoro',
    notAvailableKey: 'cmdDownloadPoroNotAvailable',
  },
  {
    id: 'translations',
    tier: 'research',
    title: 'The translation audit: a local model re-reads my Finnish',
    filename: 'poro-finnish-review.pdf',
    date: '2026-07',
    labelKey: 'cmdDownloadOptionTranslations',
    notAvailableKey: 'cmdDownloadTranslationsNotAvailable',
  },
  {
    id: 'delegation',
    tier: 'research',
    title: 'Do the cheap agents pay for themselves? Seven delegations, measured',
    filename: 'agent-delegation.pdf',
    date: '2026-07',
    labelKey: 'cmdDownloadOptionDelegation',
    notAvailableKey: 'cmdDownloadDelegationNotAvailable',
  },
];

/** Served path. Derived so the filename is written once. */
export const paperUrl = (paper: Paper): string => `/${paper.filename}`;

/**
 * The CV, resolved by id.
 *
 * Several surfaces link it now (the hero, the footer, the terminal) and none of
 * them may hardcode `mikko-numminen-cv.pdf`: the filename is written once, at
 * `filename` above, and everything else derives it. A function rather than a
 * module-level constant because this module is bundled into the browser for the
 * terminal, and a top-level throw there would take the page down for a
 * condition that can only be a build-time mistake.
 */
export function cvPaper(): Paper {
  const cv = PAPERS.find((paper) => paper.id === 'cv');
  if (!cv) throw new Error('papers: the cv entry is missing');
  return cv;
}

/**
 * The month prefix the terminal labels carry ("jul 2026 · the blind test…").
 *
 * Exported because two callers need the SAME regex: `papers.test.ts` asserts the
 * prose agrees with `date`, and the research page strips it before displaying
 * the summary, since the page shows the date in its own column. A second copy of
 * this pattern is how the two would come to disagree about what a date looks
 * like.
 */
export const LABEL_DATE_PREFIX = /^([a-zA-ZäöåÄÖÅ]+) (\d{4}) · /;

/**
 * Month names as each locale's labels actually spell them. English abbreviates
 * ("jul 2026"), Finnish does not ("heinäkuu 2026"), which is why the prefix
 * pattern above cannot be three letters and why this table is per-locale rather
 * than one list with a formatter.
 */
const MONTHS: Record<'en' | 'fi', readonly string[]> = {
  en: [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ],
  fi: [
    'tammikuu',
    'helmikuu',
    'maaliskuu',
    'huhtikuu',
    'toukokuu',
    'kesäkuu',
    'heinäkuu',
    'elokuu',
    'syyskuu',
    'lokakuu',
    'marraskuu',
    'joulukuu',
  ],
};

/** `'2026-07'` to the spelling that locale's labels use. */
export function monthLabel(date: string, locale: 'en' | 'fi'): string {
  const [year, month] = date.split('-');
  return `${MONTHS[locale][Number(month) - 1] ?? '???'} ${year}`;
}

export interface LocalizedPaper extends Paper {
  /** The one-line description, already translated for the terminal. */
  label: string;
  /** The same description with the date prefix removed, for the page. */
  summary: string;
  url: string;
  notAvailableMsg: string;
}

/** Resolve every i18n key against one locale's dictionary. */
export function localizePapers(t: Translations): LocalizedPaper[] {
  return PAPERS.map((paper) => {
    const label = t.terminal[paper.labelKey];
    return {
      ...paper,
      label,
      summary: label.replace(LABEL_DATE_PREFIX, ''),
      url: paperUrl(paper),
      notAvailableMsg: t.terminal[paper.notAvailableKey],
    };
  });
}
