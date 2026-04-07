import { en } from './locales/en';
import { fi } from './locales/fi';
import { sv } from './locales/sv';
import type { Locale, Translations } from './types';

export { LOCALES, DEFAULT_LOCALE } from './types';
export type { Locale, Translations };

const dictionaries: Record<Locale, Translations> = { en, fi, sv };

/**
 * Get translations for a given locale. Falls back to English if the locale
 * is undefined or unknown (e.g. when called from a layout that doesn't
 * receive Astro.currentLocale because the request was for a non-i18n route).
 */
export function getTranslations(locale: string | undefined): Translations {
  if (!locale) return dictionaries.en;
  if (locale in dictionaries) return dictionaries[locale as Locale];
  return dictionaries.en;
}

/**
 * Coerce an arbitrary string to a valid Locale, falling back to English.
 */
export function asLocale(locale: string | undefined): Locale {
  if (locale === 'fi' || locale === 'sv') return locale;
  return 'en';
}

/**
 * Build a localized URL path. The default locale (English) gets no prefix,
 * other locales are prefixed with /<locale>/.
 *
 *   localizePath('/projects', 'en') -> '/projects'
 *   localizePath('/projects', 'fi') -> '/fi/projects'
 *   localizePath('/',         'sv') -> '/sv/'
 */
export function localizePath(path: string, locale: Locale): string {
  // Normalize: ensure leading slash, strip any existing locale prefix.
  let p = path.startsWith('/') ? path : `/${path}`;
  p = p.replace(/^\/(fi|sv)(\/|$)/, '/');
  if (locale === 'en') return p;
  if (p === '/') return `/${locale}/`;
  return `/${locale}${p}`;
}

/**
 * Strip the locale prefix from a path so it can be re-localized.
 *
 *   stripLocale('/fi/projects') -> '/projects'
 *   stripLocale('/projects')    -> '/projects'
 *   stripLocale('/sv/')         -> '/'
 */
export function stripLocale(path: string): string {
  const stripped = path.replace(/^\/(fi|sv)(\/|$)/, '/');
  return stripped === '' ? '/' : stripped;
}
