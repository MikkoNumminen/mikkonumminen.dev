/**
 * Every string the field log can print, in one place, so the copy can be
 * rewritten without touching a line of logic.
 *
 * Voice: the corner frame's — lower case, terse, mono, no punctuation
 * that reads as prose. These are machine annotations of what the page
 * actually did, not narration written for a reader.
 *
 * The one rule that matters: nothing here may describe something the
 * scene does not actually do. A line without a state change behind it
 * is a lie in a panel whose whole premise is that it is truthful.
 */

/** Shape names as the log says them, keyed by shapeCycle's index order. */
export const SHAPE_LABELS = [
  'MIKKO NUMMINEN',
  'galaxy variant',
  'wordmark',
  'sparse field',
] as const;

export const LOG_COPY = {
  /** Header, left of the channel marker. */
  header: 'data · ch-01',

  gate: {
    compiling: 'compiling field shaders',
    reveal: 'warm-up ok · reveal',
  },

  formation: {
    start: 'forming: MIKKO NUMMINEN',
    stable: 'formation stable',
  },

  /** `shape · <label>` — the cycle moving to a new shape. */
  shapePrefix: 'shape · ',

  dissolve: {
    out: 'dissolve → starfield',
    in: 'reform → field',
  },

  /** `section: about · hue shift` */
  section: (name: string): string => `section: ${name} · mood shift`,

  /** `impulse @ 512,318` */
  impulse: (x: number, y: number): string => `impulse @ ${x},${y}`,

  visibility: {
    hidden: 'paused',
    visible: 'resumed',
  },

  /**
   * `ripple · vuohiliitto @a1b2c3 fix: coverage gate on pre-push`
   * The repo segment is omitted when there is only one repo in play, so
   * the line does not carry a field that never varies.
   */
  ripple: (repo: string | undefined, hash: string, message: string): string =>
    `ripple · ${repo ? `${repo} ` : ''}@${hash} ${message}`,

  /** Shown instead of log lines where the scene never runs, so the panel
   *  is present in the frame without inventing activity it cannot see. */
  inert: 'field disabled · reduced motion',

  /** Accessible name for the control that expands the log. Visually
   *  hidden — the resting block is the visible affordance. */
  openHistory: 'Open field log history',
  /** Label for the expanded region, and its visible heading. */
  historyLabel: 'field log',
  /** The expanded view before anything has happened. Silence is a real
   *  state here, so it gets said rather than padded. */
  historyEmpty: 'nothing logged yet',
} as const;
