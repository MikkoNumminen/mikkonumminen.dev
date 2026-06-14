/**
 * Gate the COMMITTED skills registry against its schema on every `npm test`,
 * not just at build time (scripts/validate-registry.mjs runs in prebuild).
 * The registry is a canonical committed artifact (ADR 0006) that the contact
 * terminal fetches at runtime, so a bad edit should fail the fast unit gate —
 * the one an agent runs to verify a change — rather than only surfacing in a
 * full build. Complements validate-json-schema.test.mjs (which tests the
 * validator) by testing the real data the site ships.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateAgainst } from './lib/validate-json-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(
  readFileSync(path.join(root, 'public/data/skills-registry.schema.json'), 'utf8'),
);
const registry = JSON.parse(
  readFileSync(path.join(root, 'public/data/skills-registry.json'), 'utf8'),
);

describe('committed skills-registry.json', () => {
  it('conforms to skills-registry.schema.json', () => {
    expect(validateAgainst(registry, schema)).toEqual([]);
  });

  it('the schema gate has teeth (a broken registry is rejected)', () => {
    // Drop a required top-level key on a deep copy; the validator must complain.
    const broken = JSON.parse(JSON.stringify(registry));
    delete broken.repos;
    expect(validateAgainst(broken, schema).length).toBeGreaterThan(0);
  });
});
