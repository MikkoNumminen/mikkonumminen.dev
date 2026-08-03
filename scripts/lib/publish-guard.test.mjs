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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveWriteTarget,
  wantsPublish,
  isServedRegistry,
  SERVED_REGISTRY,
} from './publish-guard.mjs';

const served = path.resolve('/repo', SERVED_REGISTRY);
const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

describe('served-path recognition', () => {
  it('is case-insensitive on Windows, where the filesystem is', () => {
    // NTFS opens `Public\Data\Skills-Registry.json` as the same file. A
    // case-sensitive guard would wave through the one write it exists to stop.
    const shouted = path.resolve('/repo/Public/Data/Skills-Registry.json');
    const expected = process.platform === 'win32';
    expect(isServedRegistry(shouted)).toBe(expected);
  });

  it('does not match a different directory that merely ends the same way', () => {
    // A string-suffix check called this the served registry.
    const elsewhere = path.resolve('/repo/other-public/data/skills-registry.json');
    expect(isServedRegistry(elsewhere)).toBe(false);
    expect(resolveWriteTarget(elsewhere, []).published).toBe(true);
  });

  it('still matches the real path from a deeper root', () => {
    expect(
      isServedRegistry(path.resolve('/a/b/c/public/data/skills-registry.json')),
    ).toBe(true);
  });
});

describe('every registry writer is actually wired to the guard', () => {
  // This exists because the wiring broke twice: a scripted edit matched the
  // import line and silently failed on the write site, leaving a script that
  // imported the guard and never called it — and the PR claimed all three were
  // covered. A static check is crude, but it fails loudly the next time a write
  // site is added or a patch half-applies.
  const writers = [
    'sync-skill-registry.mjs',
    'apply-measurement-overlay.mjs',
    'build-review-stats.mjs',
  ];

  for (const file of writers) {
    it(`${file} both imports and calls resolveWriteTarget`, () => {
      const src = readFileSync(path.join(scriptsDir, file), 'utf8');
      expect(src).toMatch(/import \{[^}]*resolveWriteTarget[^}]*\} from/);
      expect(src).toMatch(/resolveWriteTarget\(/);
      // and the write must use the resolved target, not the original constant
      expect(src).toMatch(/writeFileSync\(\s*write\.target/);
    });
  }
});

describe('wantsPublish', () => {
  it('is false for an empty argv and true only on the explicit flag', () => {
    expect(wantsPublish([])).toBe(false);
    expect(wantsPublish(['--dry-run'])).toBe(false);
    expect(wantsPublish(['--publish'])).toBe(true);
  });
});
