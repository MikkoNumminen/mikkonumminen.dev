/**
 * Actions that must move together, checked in the repo rather than hoped for.
 *
 * `github/codeql-action/init` and `github/codeql-action/analyze` are separate
 * action paths sharing one runtime. Pinned to different SHAs, the analyze step
 * fails with "Loaded a configuration file for version X, but running version Y"
 * and CodeQL reports nothing.
 *
 * Dependabot treats each PATH as its own dependency, so it opened one PR per
 * half (#555, #556). Both were red on arrival and neither was wrong, and merging
 * either one alone would have broken CodeQL on master. Grouping the
 * github-actions ecosystem in `.github/dependabot.yml` stops it raising split
 * PRs; this test is the half that does not depend on dependabot behaving, and
 * catches a hand-edit just as well.
 *
 * Every pinned action is also checked for the `# vX.Y.Z` comment beside its SHA,
 * because a bare 40-character hash tells a reader nothing about what moved.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const WORKFLOWS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'workflows',
);

/**
 * Every `uses:` line across the workflows, as {file, action, ref, comment}.
 *
 * `ref` is null for a step pinned to nothing. The first version of this parser
 * required an `@` to match at all, so `uses: actions/checkout` with no ref was
 * invisible to every assertion below — the one shape most worth catching walked
 * straight past the thing built to catch it.
 */
function pinnedUses() {
  const out = [];
  for (const name of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const text = readFileSync(path.join(WORKFLOWS, name), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*-?\s*uses:\s*(\S+)\s*(?:#\s*(.*))?$/.exec(line);
      if (!m) continue;
      const spec = m[1];
      const at = spec.lastIndexOf('@');
      out.push({
        file: name,
        action: at === -1 ? spec : spec.slice(0, at),
        ref: at === -1 ? null : spec.slice(at + 1),
        comment: (m[2] ?? '').trim(),
      });
    }
  }
  return out;
}

/** A step calling an action from this repo, which has no version to pin. */
const isLocal = (action) => action.startsWith('./');

const USES = pinnedUses();

describe('workflow action pins', () => {
  it('finds the uses: lines at all', () => {
    // Guards the guard: a parser that matched nothing would make every
    // assertion below vacuously true, which is the failure mode of a lint test.
    expect(USES.length).toBeGreaterThanOrEqual(5);
  });

  it('pins every third-party action to a full commit SHA', () => {
    // `actions/*` is checked too, despite being GitHub's own: a tag is a moving
    // target whoever publishes it. An earlier comment here claimed first-party
    // actions were exempt while the code checked them anyway, which is the kind
    // of drift that makes a reader trust the wrong thing.
    for (const { file, action, ref } of USES) {
      if (isLocal(action)) continue;
      expect(ref, `${file}: ${action} is used with no ref at all`).not.toBeNull();
      expect(ref, `${file}: ${action}@${ref} is not a 40-char SHA`).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('labels every pin with the version it points at', () => {
    for (const { file, action, comment } of USES) {
      if (isLocal(action)) continue;
      expect(comment, `${file}: ${action} has no # vX.Y.Z comment beside its SHA`).toMatch(
        /v\d+\.\d+/,
      );
    }
  });

  it('keeps every github/codeql-action step on one version', () => {
    const codeql = USES.filter((u) => u.action.startsWith('github/codeql-action'));
    // Guards the guard again: this repo runs CodeQL, so finding none means the
    // parser or the workflow moved, not that the rule is satisfied.
    expect(codeql.length, 'no codeql-action steps found').toBeGreaterThanOrEqual(2);

    const refs = [...new Set(codeql.map((u) => u.ref))];
    expect(
      refs.length,
      `codeql-action steps are on ${refs.length} different SHAs (${codeql
        .map((u) => `${u.action}@${u.ref.slice(0, 7)}`)
        .join(', ')}). init and analyze share a runtime: mismatched, analyze fails with ` +
        '"Loaded a configuration file for version X, but running version Y".',
    ).toBe(1);

    const comments = [...new Set(codeql.map((u) => u.comment))];
    expect(comments.length, `codeql-action version comments disagree: ${comments}`).toBe(1);
  });
});

describe('dependabot keeps coupled actions in one PR', () => {
  // The other half of the fix, and the half that was unguarded. Grouping is what
  // stops dependabot raising #555 and #556 again next release; removing it is a
  // one-line edit whose consequence only shows up weeks later as two red PRs
  // that each look like somebody else's problem.
  const config = readFileSync(path.join(WORKFLOWS, '..', 'dependabot.yml'), 'utf8');

  it('groups the github-actions ecosystem', () => {
    const block = /- package-ecosystem: github-actions[\s\S]*?(?=\n {2}- package-ecosystem:|$)/.exec(
      config,
    );
    expect(block, 'no github-actions entry in dependabot.yml').not.toBeNull();
    expect(
      block[0],
      'the github-actions ecosystem lost its `groups:` key, so coupled actions ' +
        'like codeql-action/init and /analyze will arrive as separate PRs again, ' +
        'each red and neither wrong',
    ).toMatch(/^\s+groups:/m);
  });
});
