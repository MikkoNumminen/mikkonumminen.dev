/**
 * Corpus drift guard for the terminal's own commands.
 *
 * `content/site-terminal.md` is the only thing that tells the RAG chat what the
 * terminal it runs inside can do. It exists because a visitor asked how to
 * download the research documents and the chat recommended a build script from
 * an unrelated project: it had no knowledge of the `download` command at all.
 *
 * A hand-written description of another file's contents goes stale the first
 * time someone adds a download target and forgets. That is worse than having no
 * document, because a confidently wrong answer reads exactly like a right one.
 * So every paper must appear in the corpus doc, and the doc must not advertise
 * one that no longer exists.
 *
 * IT IMPORTS THE LIST NOW RATHER THAN GREPPING FOR IT. Two earlier versions
 * scraped `commands.ts` source: the first sliced between two command specs and
 * broke when the array was hoisted, the second anchored on the array
 * declaration and broke when the array moved to `src/data/papers.ts`. Both
 * failed loudly, which is the only reason neither shipped silently, but a guard
 * that parses source is a guard with its own bugs. `src/data/papers.ts` exists
 * partly so this file can read data instead.
 *
 * WHAT THIS GUARD DOES NOT COVER, found in review. The "does not advertise"
 * check asks `resolveDownload` whether each documented command resolves, so it
 * inherits that function's correctness: a resolver broken in the accept-anything
 * direction would make this check pass on a doc full of nonsense. That is a
 * deliberate trade for not re-implementing the matching rules here, where they
 * could drift. `download.test.ts` is what keeps the resolver honest, and it
 * fails hard (17 of 23 cases) on exactly that mutation. Neither file is
 * sufficient alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveDownload } from '../src/lib/terminal/download.ts';
import { PAPERS } from '../src/data/papers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusDoc = readFileSync(
  path.join(root, 'content/site-terminal.md'),
  'utf8',
);

/**
 * Every download the corpus doc tells a visitor to type, as an id.
 *
 * Both spellings are accepted because the command accepts both: the bare id
 * (`download blindtest`) is what the doc teaches now, and the dashed form is
 * kept working for the site copy that still uses it. Matching only one spelling
 * would let the doc drift to the other and still pass.
 */
function documentedIds(doc) {
  return [...doc.matchAll(/`download (?:--)?([a-z]+)`/g)].map((m) => m[1]);
}

describe('content/site-terminal.md ↔ terminal commands', () => {
  const real = PAPERS.map((p) => ({ id: p.id, filename: p.filename }));
  const documented = new Set(documentedIds(corpusDoc));

  it('finds the real download targets', () => {
    // Guards the guard: a regex that silently matches nothing would make every
    // assertion below vacuously pass.
    expect(real.length).toBeGreaterThanOrEqual(10);
  });

  it('documents every download flag the terminal offers', () => {
    for (const { id } of real) {
      expect(
        documented.has(id),
        `content/site-terminal.md does not mention \`download ${id}\` — the chat cannot tell a visitor about a document it has never heard of`,
      ).toBe(true);
    }
  });

  it('does not advertise a flag the terminal no longer has', () => {
    // `research` lists rather than downloads, so it is deliberately not a paper
    // (an entry with no file would 404 through the download branch); the command
    // treats it as a listing token. It is still a real thing to type, and the
    // corpus doc should say so, so it is accepted here by name.
    //
    // Asserted rather than assumed: if `research` ever became a real paper this
    // exemption would be hiding it from every check below, which is the one
    // change that should force it to be revisited.
    const MENU_ONLY = 'research';
    expect(
      real.some((r) => r.id === MENU_ONLY),
      'research is now a real paper; drop this exemption so it is checked like any other id',
    ).toBe(false);

    // Checked through the REAL resolver rather than against a set of ids, so the
    // doc may teach anything the command actually accepts: an exact id, a unique
    // prefix (`download blind`), or the listing word. Re-implementing those rules
    // here would let the guard and the command disagree, which is the exact class
    // of drift this file exists to prevent.
    const ids = real.map((r) => r.id);
    for (const token of documented) {
      const kind = resolveDownload([token], ids).kind;
      expect(
        kind === 'target' || kind === 'list',
        `content/site-terminal.md tells visitors to type \`download ${token}\`, which resolves to "${kind}" instead of a document`,
      ).toBe(true);
    }
  });

  it('tells visitors the research page exists, in both locales', () => {
    // The command is no longer the only route, and the chat is the surface most
    // likely to be asked "where is your research?". If this doc only names the
    // terminal, the chat keeps sending people to a command when a page would do.
    //
    // Checked against the BODY, not the whole file. The first version of this
    // case read the raw document and stayed green when both mentions were
    // deleted, because the title still contained the path — a guard satisfied
    // by the sentence describing the guard.
    const body = corpusDoc
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .replace(/^#[^\n]*\n/, '');
    for (const path of ['/research', '/fi/research']) {
      expect(
        body,
        `content/site-terminal.md never names ${path} in its body — the chat cannot point at a page it has not been told about`,
      ).toContain(path);
    }
  });

  it('every documented download resolves to a file in public/', () => {
    for (const { id, filename } of real) {
      const served = path.join(root, 'public', filename);
      expect(
        readFileSync(served).length,
        `\`download ${id}\` points at public/${filename}, which is missing or empty`,
      ).toBeGreaterThan(0);
    }
  });
});
