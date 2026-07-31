/**
 * The tags a blog entry is allowed to carry.
 *
 * Tags were free strings until this list existed, and they drifted exactly the
 * way free strings do. Two posts about the same RAG subsystem ended up tagged
 * `rag` and `ragctl` with no tag in common, so the grouping the tags were for
 * never happened and nothing reported it. A closed list turns that into a
 * build error instead of a thing somebody notices a year later.
 *
 * THE BAR FOR A NEW TAG
 *
 * - It is a SUBJECT, not a place. Which repository the work happened in is
 *   answered by `project`, which is checked against `src/data/projects.ts`.
 *   A project name must not appear here, or the same fact gets two homes that
 *   can disagree.
 * - It groups at least two entries, or is clearly going to. A tag used once is
 *   a word in the title, not a category.
 * - lowercase, kebab-case. `Claude Code` was the one exception and it bought
 *   nothing except a second spelling to remember.
 * - It is not implied by the collection. Everything here is a blog post, so
 *   `blog` says nothing.
 *
 * Adding a tag is a one-line change, and that is on purpose: the list exists to
 * make the choice deliberate, not to make it hard.
 */
export const BLOG_TAGS = [
  'agents',
  'audio',
  'build',
  'claude-code',
  'cost-routing',
  'design',
  'frontend',
  'measurement',
  'ops',
  'rag',
  'ragctl',
  'skills-pdf',
  'text-to-speech',
  'three.js',
  'workflows',
] as const;

export type BlogTag = (typeof BLOG_TAGS)[number];
