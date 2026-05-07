/**
 * Structural timeline data — altitude, year, kind.
 *
 * Translatable text (title, body, tags) lives in the i18n dictionaries
 * under `t.timelineData[id]`. Use `localizeTimeline(t)` to merge structure
 * + text into a `LocalizedTimelineEntry` for rendering.
 */

import type { Translations } from '../i18n';

export type TimelineKind = 'foundation' | 'work' | 'life' | 'project' | 'craft' | 'now';

export interface TimelineEntry {
  id: string;
  /** Position along the climb, 0 (base) → 1 (summit). */
  altitude: number;
  /** Year or year range — never translated. */
  year: string;
  /** Short kicker shown above the title. */
  kind: TimelineKind;
}

export interface LocalizedTimelineEntry extends TimelineEntry {
  title: string;
  body: string;
  tags?: string[];
}

export const timeline: TimelineEntry[] = [
  { id: 'hardware-retail', altitude: 0.08, year: '1998–2022', kind: 'foundation' },
  { id: 'kasvulabs', altitude: 0.28, year: '2022–2024', kind: 'work' },
  { id: 'father', altitude: 0.48, year: '2024–2025', kind: 'life' },
  // ai-workflows now precedes the 2026 build because it's the working
  // method that enabled the year's output, not a parallel craft track.
  { id: 'ai-workflows', altitude: 0.66, year: '2025–2026', kind: 'craft' },
  // Single 2026 entry consolidating HRM and Platform — they ship together
  // (Platform consumes HRM as a submodule), so they read better as one
  // beat on the timeline than as two adjacent ones.
  { id: '2026-build', altitude: 0.86, year: '2026', kind: 'project' },
  { id: 'now', altitude: 0.97, year: 'Now', kind: 'now' },
];

/**
 * Merge structural timeline data with localized text. Returns one
 * `LocalizedTimelineEntry` per entry, in source order.
 *
 * In dev we log a warning whenever the dictionary is missing a translation
 * for a given entry id so translators see the gap immediately instead of
 * shipping an empty string to production.
 */
export function localizeTimeline(t: Translations): LocalizedTimelineEntry[] {
  return timeline.map((entry) => {
    const text = t.timelineData[entry.id];
    if (import.meta.env.DEV && !text) {
      console.warn(`[i18n] missing timelineData.${entry.id} for current locale`);
    }
    return {
      ...entry,
      title: text?.title ?? '',
      body: text?.body ?? '',
      tags: text?.tags,
    };
  });
}
