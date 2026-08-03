// One rule for every script that writes the served skills registry:
// you may only overwrite it if you SAID you meant to.
//
// WHY THIS EXISTS. `public/data/skills-registry.json` is the file the /contact
// terminal fetches at runtime and the PDF renders from. Three scripts write it —
// sync-skill-registry, apply-measurement-overlay, build-review-stats — each
// layering something the next one needs, all in place, on the same path. Run any
// one of them alone and it strips what the others added: sync replaces measured
// receipts with the raw scan, the overlay drops the review-stats fields, and so
// on. `npm run sync:skills-registry` did exactly that once, discarding 367
// measurement fields, and its only output was "copied X → Y".
//
// The chain is fine when it runs end to end, and it is SUPPOSED to change these
// numbers when the portfolio is re-measured. The failure mode is the partial
// run — a single step invoked to check something, or out of order.
//
// So the served path is opt-in. Without `--publish` a script writes its result
// to a scratch copy and says where it went; the real artifact is untouched and a
// partial run costs nothing. The documented refresh chain passes `--publish` and
// behaves exactly as before.
//
// This is deliberately NOT a confirmation prompt or a backup file. A prompt gets
// muscle-memoried through, and git already backs the file up — it is committed,
// which is how the 367 fields came back. What was missing was the ability to run
// a step without gambling the artifact.

import path from 'node:path';

/** The one path all three writers converge on. */
export const SERVED_REGISTRY = path.join('public', 'data', 'skills-registry.json');

/** True when the caller explicitly asked to write the real artifact. */
export function wantsPublish(argv) {
  return argv.includes('--publish');
}

/**
 * Decide where a registry-writing script should actually write.
 *
 * Returns the requested path when publishing is intended, and a sibling
 * `.staged.json` scratch path when it is not. `published` lets the caller word
 * its own output honestly instead of claiming it updated something it did not.
 *
 * @param {string} requested absolute path the script would write unguarded
 * @param {string[]} argv    process.argv.slice(2)
 * @returns {{ target: string, published: boolean, notice: string | null }}
 */
export function resolveWriteTarget(requested, argv) {
  const isServed = path.normalize(requested).endsWith(path.normalize(SERVED_REGISTRY));
  if (!isServed || wantsPublish(argv)) {
    return { target: requested, published: true, notice: null };
  }

  const staged = requested.replace(/\.json$/, '.staged.json');
  return {
    target: staged,
    published: false,
    notice:
      `not publishing: wrote ${staged} instead of the served registry.\n` +
      `  ${SERVED_REGISTRY} is written by three scripts in sequence, so running\n` +
      `  one alone would strip what the others added. Re-run with --publish once\n` +
      `  the full refresh chain has run (see the skill-localUpdate skill).`,
  };
}
