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
  { id: 'kasvulabs', altitude: 0.3, year: '2022–2024', kind: 'work' },
  { id: 'father', altitude: 0.5, year: '2024–2025', kind: 'life' },
  { id: 'hrm', altitude: 0.68, year: '2026', kind: 'project' },
  { id: 'platform', altitude: 0.8, year: '2026', kind: 'project' },
  { id: 'ai-workflows', altitude: 0.9, year: '2026', kind: 'craft' },
  { id: 'now', altitude: 0.97, year: 'Now', kind: 'now' },
];

/**
 * Merge structural timeline data with localized text. Returns one
 * `LocalizedTimelineEntry` per entry, in source order.
 */
export function localizeTimeline(t: Translations): LocalizedTimelineEntry[] {
  return timeline.map((entry) => {
    const text = t.timelineData[entry.id];
    return {
      ...entry,
      title: text?.title ?? '',
      body: text?.body ?? '',
      tags: text?.tags,
    };
  });
}
