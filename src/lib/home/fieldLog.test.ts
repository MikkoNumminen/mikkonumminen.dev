import { describe, expect, it } from 'vitest';
import { createFieldLog, formatLogLine, shortenForPopup } from './fieldLog';
import { LOG_COPY, SHAPE_LABELS } from './fieldLogMessages';
import { SHAPES } from '../three/field/tuning';

describe('formatLogLine', () => {
  it('names each shape from the cycle index', () => {
    expect(formatLogLine({ kind: 'shape', shape: 0 })).toBe(
      `${LOG_COPY.shapePrefix}MIKKO NUMMINEN`,
    );
    expect(formatLogLine({ kind: 'shape', shape: 3 })).toBe(
      `${LOG_COPY.shapePrefix}sparse field`,
    );
  });

  it('does not crash on a shape index it does not know', () => {
    // The cycle's shape list and this label list are separate arrays; if
    // one grows the log should degrade, not throw inside a tick.
    expect(formatLogLine({ kind: 'shape', shape: 99 })).toContain('unknown');
  });

  it('carries a label for every shape the field can hold', () => {
    // Checked against SHAPES rather than a hardcoded count, because the
    // graceful degradation above is what HID this: adding the CV lane left
    // the labels at four, and the log printed "shape · unknown" for a
    // quarter of every lap without failing anything.
    expect(SHAPE_LABELS.length).toBe(SHAPES.length);
    SHAPES.forEach((_shape, index) => {
      expect(
        formatLogLine({ kind: 'shape', shape: index }),
        `lane ${index}`,
      ).not.toContain('unknown');
    });
  });

  it('rounds impulse coordinates — the log is not a debugger', () => {
    expect(formatLogLine({ kind: 'impulse', x: 511.7, y: 318.2 })).toBe(
      'impulse @ 512,318',
    );
  });

  it('omits the repo segment when there is only one repo', () => {
    expect(formatLogLine({ kind: 'ripple', hash: 'a1b2c3', message: 'fix: thing' })).toBe(
      'ripple · @a1b2c3 fix: thing',
    );
    expect(
      formatLogLine({
        kind: 'ripple',
        repo: 'vuohiliitto',
        hash: 'a1b2c3',
        message: 'fix: thing',
      }),
    ).toBe('ripple · vuohiliitto @a1b2c3 fix: thing');
  });
});

describe('createFieldLog rate discipline', () => {
  it('releases at most one line per interval', () => {
    const log = createFieldLog({ minIntervalMs: 300 });
    log.push({ kind: 'gate', phase: 'compiling' });
    log.push({ kind: 'gate', phase: 'reveal' });
    log.push({ kind: 'formation', phase: 'start' });

    expect(log.pump(0)?.text).toBe(LOG_COPY.gate.compiling);
    expect(log.pump(100)).toBeNull();
    expect(log.pump(299)).toBeNull();
    expect(log.pump(300)?.text).toBe(LOG_COPY.gate.reveal);
    expect(log.pump(600)?.text).toBe(LOG_COPY.formation.start);
    expect(log.pump(900)).toBeNull();
  });

  it('loses nothing to the interval — a burst plays out, it is not dropped', () => {
    const log = createFieldLog({ minIntervalMs: 300 });
    for (let i = 0; i < 4; i++) log.push({ kind: 'section', name: `s${i}` });
    const seen: string[] = [];
    for (let t = 0; t <= 1200; t += 300) {
      const line = log.pump(t);
      if (line) seen.push(line.text);
    }
    expect(seen).toEqual([
      LOG_COPY.section('s0'),
      LOG_COPY.section('s1'),
      LOG_COPY.section('s2'),
      LOG_COPY.section('s3'),
    ]);
  });

  it('collapses an immediate repeat rather than printing it twice', () => {
    // A scroll oscillating across one threshold fires the same crossing
    // repeatedly; the log must not become a stutter.
    const log = createFieldLog({ minIntervalMs: 0 });
    log.push({ kind: 'dissolve', direction: 'out' });
    log.push({ kind: 'dissolve', direction: 'out' });
    expect(log.pump(0)).not.toBeNull();
    expect(log.pump(1)).toBeNull();
    expect(log.pendingCount()).toBe(0);
  });

  it('collapses a repeat against what is already on screen, not just the queue', () => {
    const log = createFieldLog({ minIntervalMs: 0 });
    log.push({ kind: 'dissolve', direction: 'out' });
    log.pump(0);
    log.push({ kind: 'dissolve', direction: 'out' });
    expect(log.pump(1)).toBeNull();
  });

  it('drops the OLDEST pending events when a burst overruns the queue', () => {
    // Keeping the oldest would make the log narrate a minute of stale
    // state while something else is happening on screen.
    const log = createFieldLog({ minIntervalMs: 300, maxPending: 3 });
    for (let i = 0; i < 6; i++) log.push({ kind: 'section', name: `s${i}` });
    expect(log.pendingCount()).toBe(3);
    expect(log.pump(0)?.text).toBe(LOG_COPY.section('s3'));
  });

  it('caps history and keeps the newest', () => {
    const log = createFieldLog({ minIntervalMs: 0, maxLines: 5, maxPending: 100 });
    for (let i = 0; i < 20; i++) log.push({ kind: 'section', name: `s${i}` });
    for (let t = 0; t < 20; t++) log.pump(t);
    const history = log.history();
    expect(history.length).toBe(5);
    expect(history[history.length - 1]?.text).toBe(LOG_COPY.section('s19'));
  });

  it('gives every line a distinct id', () => {
    const log = createFieldLog({ minIntervalMs: 0 });
    log.push({ kind: 'section', name: 'a' });
    log.push({ kind: 'section', name: 'b' });
    const ids = [log.pump(0)?.id, log.pump(1)?.id];
    expect(new Set(ids).size).toBe(2);
  });

  it('pumps null when nothing has happened — silence is a valid state', () => {
    const log = createFieldLog();
    expect(log.pump(10_000)).toBeNull();
    expect(log.history()).toEqual([]);
  });
});

describe('shortenForPopup', () => {
  it('leaves a short subject alone', () => {
    expect(shortenForPopup('fix: thing')).toBe('fix: thing');
  });

  it('breaks on a word boundary rather than mid-word', () => {
    const out = shortenForPopup(
      'feat(home): reshape the field continuously through four shapes',
    );
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
    expect(out.slice(0, -1).split(' ').pop()).not.toBe('');
  });

  it('still truncates when there is no usable word boundary', () => {
    const out = shortenForPopup(`${'x'.repeat(80)}`, 20);
    expect(out).toBe(`${'x'.repeat(20)}…`);
  });
});
