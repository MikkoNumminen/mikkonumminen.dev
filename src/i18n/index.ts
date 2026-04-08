import { en } from './locales/en';
import { fi } from './locales/fi';
import { sv } from './locales/sv';
import { LOCALES, DEFAULT_LOCALE, type Locale, type Translations } from './types';

export { LOCALES, DEFAULT_LOCALE } from './types';
export type { Locale, Translations };

const dictionaries: Record<Locale, Translations> = { en, fi, sv };

// Validated set of known locales. Using a Set<Locale> lets us narrow a raw
// `string` input to the `Locale` union without an unchecked cast — `has`
// acts as a type guard via the isKnownLocale wrapper below.
const KNOWN_LOCALES: ReadonlySet<Locale> = new Set<Locale>(LOCALES);

function isKnownLocale(value: string): value is Locale {
  return (KNOWN_LOCALES as ReadonlySet<string>).has(value);
}

/**
 * Get translations for a given locale. Falls back to English if the locale
 * is undefined or unknown (e.g. when called from a layout that doesn't
 * receive Astro.currentLocale because the request was for a non-i18n route).
 */
export function getTranslations(locale: string | undefined): Translations {
  if (!locale) return dictionaries[DEFAULT_LOCALE];
  if (isKnownLocale(locale)) return dictionaries[locale];
  return dictionaries[DEFAULT_LOCALE];
}

/**
 * Coerce an arbitrary string to a valid Locale, falling back to English.
 */
export function asLocale(locale: string | undefined): Locale {
  if (locale && isKnownLocale(locale)) return locale;
  return DEFAULT_LOCALE;
}

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
  p = p.replace(/^\/(fi|sv)(\/|$)/, '/');

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
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const stripped = p.replace(/^\/(fi|sv)(\/|$)/, '/');
  const normalized = stripped === '' ? '/' : stripped;
  return `${normalized}${suffix}`;
}
