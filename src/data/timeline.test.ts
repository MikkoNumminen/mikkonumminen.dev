import { describe, it, expect } from 'vitest';
import {
  timeline,
  localizeTimeline,
  NOW_YEAR_SENTINEL,
  type TimelineKind,
} from './timeline';
import { getTranslations, LOCALES } from '../i18n';

// Mirrors projects.test.ts: the structural backstop the open-`Record` typing
// of `t.timelineData[id]` doesn't give at compile time. A misspelled id, a
// missing per-locale translation, or an out-of-order altitude would all slip
// past `astro check` and only surface as an empty card at runtime — pinned here.

const VALID_KINDS: ReadonlySet<TimelineKind> = new Set<TimelineKind>([
  'foundation',
  'work',
  'life',
  'project',
  'craft',
  'now',
]);

describe('timeline (structural data)', () => {
  it('every entry has a non-empty id, a year, and a known kind', () => {
    for (const e of timeline) {
      expect(e.id, `${e.id}.id`).toBeTruthy();
      expect(e.year, `${e.id}.year`).toBeTruthy();
      expect(VALID_KINDS.has(e.kind), `${e.id}.kind=${e.kind}`).toBe(true);
    }
  });

  it('altitudes are within [0, 1]', () => {
    for (const e of timeline) {
      expect(e.altitude, `${e.id}.altitude`).toBeGreaterThanOrEqual(0);
      expect(e.altitude, `${e.id}.altitude`).toBeLessThanOrEqual(1);
    }
  });

  it('entries are in strictly ascending altitude order (source order == climb order)', () => {
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1];
      const cur = timeline[i];
      expect(cur && prev && cur.altitude > prev.altitude, `entry ${i} (${cur?.id})`).toBe(
        true,
      );
    }
  });

  it('all entry ids are unique', () => {
    const ids = timeline.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('localizeTimeline', () => {
  it('returns one localized entry per structural entry for every locale', () => {
    for (const locale of LOCALES) {
      const result = localizeTimeline(getTranslations(locale));
      expect(result.length, `locale=${locale} count`).toBe(timeline.length);
    }
  });

  it('fills a non-empty title and body for every entry in every locale', () => {
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      for (const e of localizeTimeline(t)) {
        expect(e.title, `locale=${locale} ${e.id}.title`).toBeTruthy();
        expect(e.body, `locale=${locale} ${e.id}.body`).toBeTruthy();
      }
    }
  });

  it('substitutes the NOW sentinel with the localized present-tense word', () => {
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      const now = localizeTimeline(t).find((e) => e.id === 'now');
      expect(now, `locale=${locale} now entry`).toBeDefined();
      expect(now?.year, `locale=${locale} now.year`).toBe(t.experiencePage.yearNow);
      expect(now?.year).not.toBe(NOW_YEAR_SENTINEL);
    }
  });
});
