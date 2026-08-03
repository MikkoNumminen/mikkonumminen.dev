/**
 * The guard that stops a partial refresh run from overwriting the served
 * skills registry.
 *
 * These assert the property that matters — a script run WITHOUT `--publish`
 * writes somewhere else — rather than the shape of the helper. The incident
 * this exists for was `npm run sync:skills-registry`, run alone, replacing the
 * enriched artifact with the raw scan and reporting "copied X → Y".
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveWriteTarget, wantsPublish, SERVED_REGISTRY } from './publish-guard.mjs';

const served = path.resolve('/repo', SERVED_REGISTRY);

describe('resolveWriteTarget', () => {
  it('diverts a write to the served registry when --publish is absent', () => {
    const { target, published, notice } = resolveWriteTarget(served, []);
    expect(published).toBe(false);
    expect(target).not.toBe(served);
    expect(target.endsWith('.staged.json')).toBe(true);
    expect(notice).toContain('--publish');
  });

  it('allows the write when --publish is given', () => {
    const { target, published, notice } = resolveWriteTarget(served, ['--publish']);
    expect(published).toBe(true);
    expect(target).toBe(served);
    expect(notice).toBeNull();
  });

  it('leaves any other destination alone', () => {
    // A scratch path is already harmless; the guard must not make scripts
    // undebuggable by diverting output nobody was worried about.
    const scratch = path.resolve('/tmp/whatever.json');
    const { target, published } = resolveWriteTarget(scratch, []);
    expect(target).toBe(scratch);
    expect(published).toBe(true);
  });

  it('recognises the served path regardless of how it was joined', () => {
    // The three callers build this path independently; a guard that only
    // matched one spelling would silently pass the other two through.
    const viaJoin = path.join('/repo', 'public', 'data', 'skills-registry.json');
    expect(resolveWriteTarget(viaJoin, []).published).toBe(false);
  });

  it('does not treat a similarly-named sibling as the served file', () => {
    const sibling = path.resolve('/repo/public/data/skills-registry.backup.json');
    expect(resolveWriteTarget(sibling, []).published).toBe(true);
  });
});

describe('wantsPublish', () => {
  it('is false for an empty argv and true only on the explicit flag', () => {
    expect(wantsPublish([])).toBe(false);
    expect(wantsPublish(['--dry-run'])).toBe(false);
    expect(wantsPublish(['--publish'])).toBe(true);
  });
});
