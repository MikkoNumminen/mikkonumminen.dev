/**
 * The field log's pure half: event → line, rate discipline, history cap.
 *
 * Split from the DOM so the whole thing is unit-testable without a
 * browser, and so the rules that matter — one line per interval, no
 * duplicate line twice in a row, bounded history — are asserted rather
 * than eyeballed on a running page.
 *
 * Deliberately NOT a renderer and NOT a subscriber: it takes events and
 * a clock, and returns lines. The component owns the DOM, the scene
 * owns the events, and neither knows about the other.
 */
import { LOG_COPY, SHAPE_LABELS } from './fieldLogMessages';

export type FieldLogEvent =
  | { kind: 'gate'; phase: 'compiling' | 'reveal' }
  | { kind: 'formation'; phase: 'start' | 'stable' }
  | { kind: 'shape'; shape: number }
  | { kind: 'dissolve'; direction: 'out' | 'in' }
  | { kind: 'section'; name: string }
  | { kind: 'impulse'; x: number; y: number }
  | { kind: 'visibility'; hidden: boolean }
  | { kind: 'ripple'; repo?: string; hash: string; message: string };

export interface LogLine {
  /** Monotonic, so the renderer can key rows without comparing text. */
  id: number;
  text: string;
}

/** Turn an event into its line. Pure; the copy all lives in one module. */
export function formatLogLine(event: FieldLogEvent): string {
  switch (event.kind) {
    case 'gate':
      return LOG_COPY.gate[event.phase];
    case 'formation':
      return LOG_COPY.formation[event.phase];
    case 'shape':
      return LOG_COPY.shapePrefix + (SHAPE_LABELS[event.shape] ?? 'unknown');
    case 'dissolve':
      return LOG_COPY.dissolve[event.direction];
    case 'section':
      return LOG_COPY.section(event.name);
    case 'impulse':
      return LOG_COPY.impulse(Math.round(event.x), Math.round(event.y));
    case 'visibility':
      return event.hidden ? LOG_COPY.visibility.hidden : LOG_COPY.visibility.visible;
    case 'ripple':
      return LOG_COPY.ripple(event.repo, event.hash, event.message);
  }
}

export interface FieldLogOptions {
  /** Floor on the gap between two RENDERED lines. A burst still records
   *  every event; it just plays them out at a readable rate. */
  minIntervalMs?: number;
  /** Hard cap on retained history. */
  maxLines?: number;
  /** Cap on how many events may wait behind the interval. Beyond this
   *  the OLDEST pending events are dropped: during a burst the newest
   *  state is the true one, and replaying a stale queue for a minute
   *  afterwards would make the log lie about what is happening now. */
  maxPending?: number;
}

export interface FieldLog {
  /** Record an event. Cheap and allocation-light — safe from a tick. */
  push: (event: FieldLogEvent) => void;
  /** Release at most one line, if the interval has elapsed. Returns the
   *  line if one was released, else null. */
  pump: (nowMs: number) => LogLine | null;
  history: () => readonly LogLine[];
  /** Pending events not yet released. Exposed for tests only. */
  pendingCount: () => number;
}

export function createFieldLog(opts: FieldLogOptions = {}): FieldLog {
  const { minIntervalMs = 300, maxLines = 200, maxPending = 24 } = opts;

  const pending: string[] = [];
  const lines: LogLine[] = [];
  let nextId = 1;
  let lastReleasedAt = Number.NEGATIVE_INFINITY;

  return {
    push: (event): void => {
      const text = formatLogLine(event);
      // Collapse an immediate repeat against whichever line is newest —
      // the tail of the queue if something is waiting, otherwise what is
      // already on screen. Without this, a scroll that oscillates across
      // one threshold writes the same line forever.
      const newest =
        pending.length > 0 ? pending[pending.length - 1] : lines[lines.length - 1]?.text;
      if (newest === text) return;
      pending.push(text);
      if (pending.length > maxPending) pending.shift();
    },

    pump: (nowMs): LogLine | null => {
      if (pending.length === 0) return null;
      if (nowMs - lastReleasedAt < minIntervalMs) return null;
      lastReleasedAt = nowMs;
      // Non-null: length checked above.
      const line: LogLine = { id: nextId++, text: pending.shift()! };
      lines.push(line);
      if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
      return line;
    },

    history: () => lines,
    pendingCount: () => pending.length,
  };
}

/** Shorten a commit subject for the transient popup, which is a glimpse
 *  rather than something to read. Breaks on a word boundary where one is
 *  available so the tail is not a severed word. */
export function shortenForPopup(message: string, max = 40): string {
  if (message.length <= max) return message;
  const cut = message.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
