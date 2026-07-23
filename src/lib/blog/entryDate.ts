import type { Locale } from '../../i18n/types';

/**
 * Blog frontmatter dates are date-only (`2026-07-21`), which `z.coerce.date()`
 * parses as UTC midnight. Formatting that in the build host's zone renders the
 * previous day anywhere west of UTC, so the zone is pinned rather than left to
 * the machine that happens to run the build.
 */
export function formatEntryDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
