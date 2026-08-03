/**
 * Cover the promotion gate in scripts/sync-skill-registry.mjs: a source verdict
 * must validate against skills-registry.schema.json BEFORE it is written to
 * public/data/skills-registry.json, and a successful sync stamps distinct
 * `synced_from` / `synced_at` provenance without disturbing `generated_at`.
 * Exercises `syncBuffer` directly (no process.exit, no real filesystem writes)
 * in the same spirit as validate-registry.test.mjs testing the real committed data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { syncBuffer, findLatestSource } from './sync-skill-registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(
  readFileSync(path.join(root, 'public/data/skills-registry.schema.json'), 'utf8'),
);

const validSource = {
  generated_at: '2026-05-21T00:00:00.000Z',
  repos: [
    {
      name: 'example-repo',
      skills: [
        {
          name: 'example-skill',
          description: 'does a thing',
          redirect: false,
          receipt: null,
        },
      ],
    },
  ],
  totals: {
    skills: 1,
    redirects: 0,
    with_receipts: 0,
    annual_tokens_saved: 0,
  },
};

const malformedSource = {
  generated_at: '2026-05-21T00:00:00.000Z',
  // missing "repos" and "totals" entirely
};

function tmpDest() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sync-skill-registry-')),
    'dest.json',
  );
}

describe('syncBuffer', () => {
  it('promotes a valid source and stamps synced_from / synced_at without disturbing generated_at', () => {
    const dest = tmpDest();
    const result = syncBuffer({
      srcBuf: Buffer.from(JSON.stringify(validSource)),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.data.synced_from).toBe('SKILL-REGISTRY-2026-05-21.json');
    expect(typeof result.data.synced_at).toBe('string');
    expect(() => new Date(result.data.synced_at).toISOString()).not.toThrow();
    expect(result.data.generated_at).toBe(validSource.generated_at);

    const written = JSON.parse(fs.readFileSync(dest, 'utf8'));
    expect(written.synced_from).toBe('SKILL-REGISTRY-2026-05-21.json');
    expect(written.repos).toEqual(validSource.repos);
  });

  it('rejects a malformed source and does not write the destination', () => {
    const dest = tmpDest();
    const result = syncBuffer({
      srcBuf: Buffer.from(JSON.stringify(malformedSource)),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('rejects invalid JSON and does not write the destination', () => {
    const dest = tmpDest();
    const result = syncBuffer({
      srcBuf: Buffer.from('{ not json'),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest,
    });

    expect(result.ok).toBe(false);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('skips re-writing when the source content is unchanged (ignoring provenance fields)', () => {
    const dest = tmpDest();
    const first = syncBuffer({
      srcBuf: Buffer.from(JSON.stringify(validSource)),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest,
    });
    expect(first.skipped).toBe(false);

    const second = syncBuffer({
      srcBuf: Buffer.from(JSON.stringify(validSource)),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest,
    });
    expect(second.ok).toBe(true);
    expect(second.skipped).toBe(true);
  });
});

describe('findLatestSource', () => {
  it('picks the newest SKILL-REGISTRY-<date>.json by filename', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-skill-registry-verdicts-'));
    fs.writeFileSync(path.join(dir, 'SKILL-REGISTRY-2026-05-19.json'), '{}');
    fs.writeFileSync(path.join(dir, 'SKILL-REGISTRY-2026-05-21.json'), '{}');
    fs.writeFileSync(path.join(dir, 'SKILL-REGISTRY-2026-05-20.json'), '{}');
    fs.writeFileSync(path.join(dir, 'SKILL-REGISTRY-LATEST.json'), '{}'); // doesn't match FILE_RE

    expect(findLatestSource(dir)).toBe(path.join(dir, 'SKILL-REGISTRY-2026-05-21.json'));
  });

  it('returns null when the directory does not exist', () => {
    expect(findLatestSource(path.join(os.tmpdir(), 'does-not-exist-xyz'))).toBeNull();
  });
});

describe('the served registry is only written on purpose', () => {
  // The incident, replayed end to end: a lone sync run pointed at the real
  // served path. It must leave that file alone and put its output elsewhere.
  it('writes a scratch copy, not the served file, without --publish', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-publish-guard-'));
    const served = path.join(dir, 'public', 'data', 'skills-registry.json');
    fs.mkdirSync(path.dirname(served), { recursive: true });
    fs.writeFileSync(served, JSON.stringify({ enriched: 'do not lose me' }, null, 2));

    const result = syncBuffer({
      srcBuf: Buffer.from(JSON.stringify(validSource)),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest: served,
      publishArgv: [],
    });

    expect(result.ok).toBe(true);
    expect(result.wrote.endsWith('.staged.json')).toBe(true);
    expect(JSON.parse(fs.readFileSync(served, 'utf8'))).toEqual({
      enriched: 'do not lose me',
    });
  });

  it('writes the served file when --publish is given', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-publish-guard-'));
    const served = path.join(dir, 'public', 'data', 'skills-registry.json');
    fs.mkdirSync(path.dirname(served), { recursive: true });
    fs.writeFileSync(served, JSON.stringify({ enriched: 'replace me' }, null, 2));

    const result = syncBuffer({
      srcBuf: Buffer.from(JSON.stringify(validSource)),
      srcName: 'SKILL-REGISTRY-2026-05-21.json',
      schema,
      dest: served,
      publishArgv: ['--publish'],
    });

    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(served);
    expect(JSON.parse(fs.readFileSync(served, 'utf8')).repos).toBeDefined();
  });
});
