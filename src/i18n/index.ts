import { en } from './locales/en';
import { fi } from './locales/fi';
import { sv } from './locales/sv';
import { LOCALES, DEFAULT_LOCALE, type Locale, type Translations } from './types';

export { LOCALES, DEFAULT_LOCALE } from './types';
export type { Locale, Translations, TimelineLesson } from './types';

// Path helpers live in `./routing` so runtime modules that only need
// path manipulation (notably the page-transition runtime, which loads on
// every page) can import from there directly without pulling in the
// locale dictionaries below. We re-export them here for the build-time
// callers (Astro frontmatter, components) that import from the barrel.
export { localizePath, stripLocale } from './routing';

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
