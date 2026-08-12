import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { projects } from './data/projects';
import { BLOG_TAGS } from './data/blogTags';

const PROJECT_IDS = projects.map((p) => p.id);

/**
 * The site's first content collection. Everything else here is authored as
 * TypeScript data modules in `src/data/` merged with the i18n dictionaries,
 * but that split exists to keep *structure* separate from *translated copy*.
 * Blog entries are prose all the way down, so a markdown collection is the
 * honest fit rather than a fourth locale dictionary.
 *
 * Layout is `src/content/blog/<locale>/<slug>.md`. Locale and slug are ALSO
 * explicit frontmatter fields: the id is a build detail, whereas the language
 * switcher and the hreflang alternates have to pair the same entry across
 * locales, and they do that by querying the collection for `slug` and reading
 * `locale` off each match.
 *
 * `generateId` is explicit because the glob loader's default returns frontmatter
 * `slug` verbatim when the field is present, ignoring the file path entirely.
 * Since every locale of an entry deliberately shares one slug, the default
 * collapses every locale of an entry onto a single id and keeps only whichever
 * loaded last.
 * That failure is near-silent: one WARN line, a build that still exits 0, and
 * two thirds of the entries simply absent from the site.
 *
 * `aiGenerated` is deliberately required with no default. An entry has to say
 * out loud whether a machine wrote it — an omitted flag silently defaulting to
 * `false` is exactly the failure this field exists to prevent.
 *
 * `hasAudio` is required for the same reason, pointed at a different gap. An
 * entry is not finished when its English prose is: it also needs the other two
 * locales and a narration for each. A field that defaults to `false` lets an
 * author forget the recording ever existed as a step; a field they must type
 * makes the missing narration visible in the file itself. It is per locale
 * rather than per entry because a post can be narrated in English months
 * before anyone records the Finnish.
 *
 * Nothing derives `hasAudio` from the filesystem, so it can drift from the
 * files on disk in both directions: a `true` with no recording renders a
 * player that 404s, and a `false` beside a real file hides work already paid
 * for. `blogAudio.test.ts` asserts the two agree and fails the suite if they
 * do not.
 *
 * `project` names which project an entry is about, and is validated against
 * the ids in `src/data/projects.ts` rather than being a free string in `tags`.
 * A tag can be misspelled, capitalised two ways, or pluralised, and nothing
 * notices; `tags` already carries both `rag` and `ragctl` for two posts about
 * the same subsystem, which is exactly that failure. An id checked against the
 * project list cannot drift, and it means a post and the planet it belongs to
 * are joined by the same key everything else already uses.
 *
 * It is optional because not every entry is about one project. It is not part
 * of `tags` because tags describe subject matter, which is a different
 * question from which repository the work happened in.
 */
const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.md',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    locale: z.enum(['en', 'fi']),
    /** Shared across every locale of the same entry; drives the URL. */
    slug: z.string(),
    aiGenerated: z.boolean(),
    /**
     * Whether a narration exists for THIS locale, at
     * `public/audio/blog/<slug>-<locale>.mp3`. Required, no default.
     */
    hasAudio: z.boolean(),
    /**
     * Which project the entry is about, as an id from `src/data/projects.ts`.
     * Optional, but a value that is not a real project fails the build rather
     * than rendering a chip nothing can resolve.
     */
    project: z
      .string()
      .refine((id) => PROJECT_IDS.includes(id), {
        message: `must be one of: ${PROJECT_IDS.join(', ')}`,
      })
      .optional(),
    /** Set by the draft generator. Draft entries never reach a built page. */
    draft: z.boolean().default(false),
    /**
     * Subject tags, from the closed list in `src/data/blogTags.ts`. Closed
     * because the open version drifted: two posts about one subsystem ended up
     * tagged `rag` and `ragctl` with nothing in common.
     */
    tags: z.array(z.enum(BLOG_TAGS)).default([]),
  }),
});

/**
 * The CV, as one entry.
 *
 * `content/cv.md` is not new and is not authored for this site: it is the RAG
 * corpus copy, retrieved behind the contact terminal's answers, and
 * `houseStyle.test.ts` already holds it to the same prose rules as everything
 * else a reader sees. Rendering `/cv` from it means the page a visitor reads
 * and the text the terminal answers from cannot disagree, and it costs no
 * third copy of the CV.
 *
 * A collection rather than `readFileSync` plus a markdown renderer, because
 * the blog already renders prose this way and `render()` gives the same
 * pipeline for free. Based at the repo's `content/` rather than
 * `src/content/`: the corpus lives outside `src/` because other tooling reads
 * it from there, and the `pattern` deliberately names the one file rather than
 * globbing a directory that also holds the terminal's corpus, the narratives
 * and the per-project notes.
 *
 * The PDF at `public/mikko-numminen-cv.pdf` is still a hand-maintained binary
 * with no generator, so it and this markdown can drift. That is pre-existing
 * and out of scope here, but the page now makes the drift visible to a reader
 * rather than leaving it between two files nobody diffs.
 */
const cv = defineCollection({
  loader: glob({
    base: './content',
    pattern: 'cv.md',
    generateId: () => 'cv',
  }),
  schema: z.object({
    title: z.string(),
    /** The corpus's own document-type marker. Kept so the schema matches the file. */
    kind: z.literal('cv'),
  }),
});

export const collections = { blog, cv };
