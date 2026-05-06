/**
 * Locale-aware path helpers, split out from `./index.ts` so they can be
 * imported by runtime modules (notably the page-transition runtime, which
 * loads on every page) without dragging in the en / fi / sv translation
 * dictionaries. Bundling those dictionaries onto every page just to do
 * pure path manipulation costs ~6 KB gzipped per route — meaningful for a
 * static site whose first byte is the only metric that matters.
 *
 * Module-level imports here are limited to `./types`, which itself
 * imports nothing else, so this file has zero bundle dependencies
 * beyond the locale name list.
 *
 * `i18n/index.ts` re-exports `localizePath` and `stripLocale` from this
 * file so existing call sites that import from the barrel module
 * (Astro frontmatter, components, etc.) keep working unchanged.
 */

import { LOCALES, DEFAULT_LOCALE, type Locale } from './types';

// Derived from LOCALES so adding a new locale automatically updates both
// localizePath and stripLocale without touching the regex manually.
const NON_DEFAULT_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
const LOCALE_PREFIX_REGEX = new RegExp(`^/(${NON_DEFAULT_LOCALES.join('|')})(/|$)`);

/**
 * Split a path into `{ pathname, suffix }` where `suffix` is the query
 * string and/or hash — everything from the first `?` or `#` onward. Both
 * `localizePath` and `stripLocale` normalize the pathname half and then
 * reassemble with the suffix untouched.
 */
function splitPath(path: string): { pathname: string; suffix: string } {
  const qIdx = path.indexOf('?');
  const hIdx = path.indexOf('#');
  // Whichever delimiter comes first (and actually exists) is the start
  // of the suffix.
  let cut = -1;
  if (qIdx >= 0 && hIdx >= 0) cut = Math.min(qIdx, hIdx);
  else if (qIdx >= 0) cut = qIdx;
  else if (hIdx >= 0) cut = hIdx;

  if (cut < 0) return { pathname: path, suffix: '' };
  return { pathname: path.slice(0, cut), suffix: path.slice(cut) };
}

/**
 * Build a localized URL path. The default locale (English) gets no prefix,
 * other locales are prefixed with /<locale>/.
 *
 * Accepts either a pathname-only input (`/projects`) or a full path with
 * query/hash (`/projects?id=1#top`). The locale prefix is applied to the
 * pathname portion only and the suffix is passed through verbatim.
 *
 *   localizePath('/projects', 'en')       -> '/projects'
 *   localizePath('/projects', 'fi')       -> '/fi/projects'
 *   localizePath('/',         'sv')       -> '/sv/'
 *   localizePath('/projects?id=1', 'fi')  -> '/fi/projects?id=1'
 *   localizePath('/#top',      'fi')      -> '/fi/#top'
 */
export function localizePath(path: string, locale: Locale): string {
  const { pathname, suffix } = splitPath(path);

  // Normalize: ensure leading slash, strip any existing locale prefix.
  let p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  p = p.replace(LOCALE_PREFIX_REGEX, '/');

  let localized: string;
  if (locale === DEFAULT_LOCALE) localized = p;
  else if (p === '/') localized = `/${locale}/`;
  else localized = `/${locale}${p}`;

  return `${localized}${suffix}`;
}

/**
 * Strip the locale prefix from a path so it can be re-localized. Mirrors
 * `localizePath`'s input contract — pathname-only or full path with query
 * and/or hash both work. Input without a leading slash is normalized.
 *
 *   stripLocale('/fi/projects')         -> '/projects'
 *   stripLocale('/projects')            -> '/projects'
 *   stripLocale('/sv/')                 -> '/'
 *   stripLocale('fi/projects')          -> '/projects'
 *   stripLocale('/fi/projects?id=1')    -> '/projects?id=1'
 *   stripLocale('/fi#top')              -> '/#top'
 */
export function stripLocale(path: string): string {
  const { pathname, suffix } = splitPath(path);
  // After normalisation `p` always starts with `/`, and the regex only
  // ever replaces a `/locale[/...]` prefix with `/`, so the result can
  // never be the empty string — minimum output is `/`.
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const stripped = p.replace(LOCALE_PREFIX_REGEX, '/');
  return `${stripped}${suffix}`;
}
