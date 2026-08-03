/**
 * CSP drift guard.
 *
 * `docs/security/threat-model.md` carries a copy of the Content-Security-Policy
 * and used to label it "the canonical copy". It was not canonical — it was a
 * transcription, and it drifted: the funnel `connect-src` origin arrived with
 * ADR 0012 and `manifest-src` was tightened to `'none'`, neither of which
 * reached the document. For weeks the security doc described a policy the site
 * did not serve, while the same document's boundary 4 asserted an invariant
 * ("the Sentry hosts are the only non-'self' connect-src entries") that the
 * real header already violated.
 *
 * That is the dangerous shape of doc drift: not a stale sentence, but a
 * security invariant that reads as verified when nothing checks it. This test
 * makes the two copies agree or fail CI.
 *
 * Compared as a SET of directives, not as a string: the doc wraps one directive
 * per line for readability, and requiring byte-identical text would make the
 * guard fail on formatting and get deleted the first time it cried wolf.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const threatModel = readFileSync(
  path.join(root, 'docs/security/threat-model.md'),
  'utf8',
);

/** The CSP the site actually serves, from the deployed header config. */
function liveCsp() {
  for (const rule of vercel.headers ?? []) {
    for (const header of rule.headers ?? []) {
      if (header.key === 'Content-Security-Policy') return header.value;
    }
  }
  throw new Error('no Content-Security-Policy header found in vercel.json');
}

/**
 * The CSP block from the threat model — the first fenced block that starts with
 * a `default-src` directive, so unrelated code fences in the document can never
 * be picked up by accident.
 */
function documentedCsp() {
  const blocks = [...threatModel.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
  const block = blocks.find((b) => b.trimStart().startsWith('default-src'));
  if (!block) throw new Error('no CSP block found in docs/security/threat-model.md');
  return block;
}

/** Split a policy into normalised `name value value` directives. */
function directives(policy) {
  return policy
    .split(';')
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort();
}

describe('CSP ↔ threat-model sync', () => {
  it('documents exactly the directives the site serves', () => {
    expect(directives(documentedCsp())).toEqual(directives(liveCsp()));
  });

  it('keeps the funnel origin the only non-Sentry third-party connect-src', () => {
    // Boundary 4's invariant, asserted rather than asked for politely. If a new
    // origin is added to the live policy, this fails and the threat model has to
    // be updated in the same change — which is the whole point of the invariant.
    const connect = directives(liveCsp()).find((d) => d.startsWith('connect-src'));
    const origins = connect.split(' ').slice(1);
    const thirdParty = origins.filter((o) => o !== "'self'");
    const unexpected = thirdParty.filter(
      (o) => !/\.sentry\.io$/.test(o) && !/^https:\/\/paskamyrsky\./.test(o),
    );
    expect(unexpected).toEqual([]);
  });
});
