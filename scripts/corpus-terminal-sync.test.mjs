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
 * So every download flag in `commands.ts` must appear in the corpus doc, and the
 * doc must not advertise a flag that no longer exists.
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = readFileSync(
  path.join(root, 'src/lib/terminal/commands.ts'),
  'utf8',
);
const corpusDoc = readFileSync(
  path.join(root, 'content/site-terminal.md'),
  'utf8',
);

/**
 * Download flags as the terminal actually defines them.
 *
 * Anchored on the `targets` declaration rather than on `name: 'download'`. It
 * used to slice between the download and skills command specs, which broke the
 * moment the array was hoisted out of the handler to expose the ids for tab
 * completion: the slice came back empty and every downstream assertion would
 * have passed on zero targets. The `finds the real download targets` case caught
 * exactly that, which is what it is for.
 *
 * Scoped to the array so `--research` (a menu row, not a download) and flags
 * belonging to other commands are not swept in.
 */
function downloadFlags(source) {
  const start = source.indexOf('const targets: {');
  expect(start, 'commands.ts no longer declares a download `targets` array').toBeGreaterThan(
    -1,
  );
  const end = source.indexOf('\n  ];', start);
  const block = source.slice(start, end === -1 ? undefined : end);
  const entries = [...block.matchAll(/flag: '(--[a-z]+)',[\s\S]{0,200}?filename: '([^']+)'/g)];
  return entries.map(([, flag, filename]) => ({ flag, filename }));
}

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
  const real = downloadFlags(commands).map((r) => ({ ...r, id: r.flag.replace(/^--/, '') }));
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
    // `--research` lists rather than downloads, so commands.ts deliberately keeps
    // it out of the targets array (a flag with no url would 404 through the
    // download branch) and appends it as a menu row. It is still a real thing to
    // type, and the corpus doc should say so, so it is accepted here by name.
    const MENU_ONLY = '--research';
    // Assert what the comment claims, not merely that the string appears
    // somewhere in the file. A raw `commands.includes('--research')` passes on
    // the unrelated `args.includes('--research')` branch, so it would keep
    // passing if --research were promoted into `targets` and became a real
    // download, which is the one change that should force this exemption to be
    // revisited.
    expect(
      real.some((r) => r.flag === MENU_ONLY),
      '--research is now a real download target; drop this exemption so it is checked like any other flag',
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
