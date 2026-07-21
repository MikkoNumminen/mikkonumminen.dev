import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
 * collapses all three onto a single id and keeps only whichever loaded last.
 * That failure is near-silent: one WARN line, a build that still exits 0, and
 * two thirds of the entries simply absent from the site.
 *
 * `aiGenerated` is deliberately required with no default. An entry has to say
 * out loud whether a machine wrote it — an omitted flag silently defaulting to
 * `false` is exactly the failure this field exists to prevent.
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
    locale: z.enum(['en', 'fi', 'sv']),
    /** Shared across every locale of the same entry; drives the URL. */
    slug: z.string(),
    aiGenerated: z.boolean(),
    /** Set by the draft generator. Draft entries never reach a built page. */
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
