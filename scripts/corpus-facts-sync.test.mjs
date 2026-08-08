/**
 * Drift guard for facts the corpus states and the repo already knows.
 *
 * WHY THIS EXISTS, and it is the second answer to the same question. The chat
 * kept stating things that were not true, and the first attempt at a fix looked
 * at the model's OUTPUT: catch a wrong claim as it is generated. That was
 * measured against 588 real answers and failed, because prose puts names next to
 * dates for ordinary reasons and no amount of tuning separates a real error from
 * a list. `chat-backend/evals/misbound_probe.py` and
 * `docs/audits/misbound-facts-2026-08-08.md` carry that result.
 *
 * This is the other end of the same problem, and it is tractable. When the
 * corpus says something the repository can independently verify, a wrong answer
 * is not the model hallucinating. It is the model reading a stale document and
 * repeating it, faithfully. No output-side guard can fix that, because from the
 * model's side nothing is wrong: it is grounded in exactly what it was given.
 *
 * FOUND BY THIS, IMMEDIATELY. Adding SongGenerator took the site to thirteen
 * projects and left `content/cv.md` saying "Twelve projects" in two places. The
 * chat would have answered "twelve", cited the CV, and been wrong in a way that
 * looks authoritative.
 *
 * SCOPE, deliberately narrow. Only documents that describe the CURRENT state.
 * The dated research posts under `content/posts/` freeze counts on purpose
 * ("13 skills" in a May 2026 study stays 13 forever), and asserting against
 * those would be asserting that history should change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { projects } from '../src/data/projects.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Corpus documents that describe how things are now, not how they were.
 *
 * Widened after review found a second stale count outside the original scope:
 * `portfolio-deepdive.md` said an unknown project id "fails the build with the
 * twelve valid ones printed". That sentence now states no number at all, because
 * the count was never what it was about and stating it only created a surface to
 * drift. Listed here anyway, so a future count added to it is checked.
 */
const LIVE_DOCS = ['content/cv.md', 'content/projects/portfolio-deepdive.md'];

/** Documents expected to make a count claim. Others are watched, not required. */
const MUST_CLAIM = new Set(['content/cv.md']);

const NUMBER_WORDS = {
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
};

/** Every "<count> projects" claim in a document, as a number. */
function claimedProjectCounts(text) {
  const words = Object.keys(NUMBER_WORDS).join('|');
  const re = new RegExp(`\\b(${words}|\\d{1,3})\\s+projects\\b`, 'gi');
  return [...text.matchAll(re)].map((m) => {
    const token = m[1].toLowerCase();
    return NUMBER_WORDS[token] ?? Number(token);
  });
}

describe('corpus facts the repo can check', () => {
  const real = projects.length;

  it('knows how many projects there are', () => {
    // Guards the guard: if this ever reads 0 the assertions below prove nothing.
    expect(real).toBeGreaterThan(5);
  });

  it('states the project count the site actually has', () => {
    for (const doc of LIVE_DOCS) {
      const text = readFileSync(path.join(root, doc), 'utf8');
      const claims = claimedProjectCounts(text);
      if (MUST_CLAIM.has(doc)) {
        expect(
          claims.length,
          `${doc} makes no project-count claim; if the sentence was removed, drop it from MUST_CLAIM`,
        ).toBeGreaterThan(0);
      }
      for (const claimed of claims) {
        expect(
          claimed,
          `${doc} tells the chat there are ${claimed} projects; src/data/projects.ts has ${real}. The chat will repeat the document, not the data.`,
        ).toBe(real);
      }
    }
  });

  it('reads a number word and a digit the same way', () => {
    // The corpus writes counts in words and the data holds a number, so the
    // parsing is load-bearing rather than incidental.
    expect(claimedProjectCounts('Thirteen projects carry it')).toEqual([13]);
    expect(claimedProjectCounts('13 projects shipped')).toEqual([13]);
    expect(claimedProjectCounts('a dozen applications')).toEqual([]);
  });
});
