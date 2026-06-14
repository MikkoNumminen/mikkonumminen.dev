/**
 * Onboarding drift guard.
 *
 * The README is the first thing an agent (or human) reads, and the most-cited
 * source of truth for "what does `npm run build` actually do". Twice now the
 * `prebuild` chain gained a step (the skills-PDF renderer, then the
 * `validate:registry` schema gate) without the README being updated, leaving
 * the docs quietly describing a build that no longer exists. This test makes
 * that class of drift a red CI check instead of something a re-read has to
 * catch: every command in the real `prebuild` chain must be named in the
 * README, and the scripts cheatsheet must not advertise npm scripts that no
 * longer exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const readme = readFileSync(path.join(root, 'README.md'), 'utf8');

/** Pull the `name` out of each `npm run <name>` in a script string. */
function scriptNames(scriptBody) {
  return [...scriptBody.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
}

describe('README ↔ package.json sync', () => {
  it('names every command in the prebuild chain', () => {
    const chain = scriptNames(pkg.scripts.prebuild ?? '');
    expect(chain.length).toBeGreaterThan(0);
    for (const name of chain) {
      expect(
        readme.includes(name),
        `README.md does not mention prebuild step "${name}" — update the prebuild section when the chain changes`,
      ).toBe(true);
    }
  });

  it('does not document npm scripts that no longer exist', () => {
    // Anything written as `npm run <name>` in the README must be a real script.
    const documented = scriptNames(readme);
    for (const name of documented) {
      expect(
        Object.prototype.hasOwnProperty.call(pkg.scripts, name),
        `README.md references "npm run ${name}", which is not a script in package.json`,
      ).toBe(true);
    }
  });
});
