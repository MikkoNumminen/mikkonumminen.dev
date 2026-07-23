import { describe, expect, it } from 'vitest';
import { formatEntryDate } from './entryDate';

describe('formatEntryDate', () => {
  // The whole reason the helper exists: a date-only frontmatter value must not
  // drift a day backwards when the build runs west of UTC.
  it('renders the calendar day from the frontmatter, not the host zone', () => {
    const utcMidnight = new Date('2026-07-21');
    expect(formatEntryDate(utcMidnight, 'en')).toBe('July 21, 2026');
  });

  it('localizes the month name', () => {
    const date = new Date('2026-07-21');
    expect(formatEntryDate(date, 'fi')).toContain('2026');
    expect(formatEntryDate(date, 'fi')).not.toBe(formatEntryDate(date, 'en'));
  });

  it('does not shift across a month boundary', () => {
    expect(formatEntryDate(new Date('2026-08-01'), 'en')).toBe('August 1, 2026');
  });
});
