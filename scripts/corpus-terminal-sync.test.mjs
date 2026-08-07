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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
 * Download flags as the terminal actually defines them. Scoped to the block that
 * carries a `filename`, so `--research` (a menu row, not a download) and flags
 * belonging to other commands are not swept in.
 */
function downloadFlags(source) {
  const start = source.indexOf("name: 'download'");
  expect(start, 'commands.ts no longer defines a `download` command').toBeGreaterThan(-1);
  const end = source.indexOf("name: 'skills'", start);
  const block = source.slice(start, end === -1 ? undefined : end);
  const entries = [...block.matchAll(/flag: '(--[a-z]+)',[\s\S]{0,200}?filename: '([^']+)'/g)];
  return entries.map(([, flag, filename]) => ({ flag, filename }));
}

/** Every `download --x` the corpus doc tells a visitor to type. */
function documentedFlags(doc) {
  return [...doc.matchAll(/`download (--[a-z]+)`/g)].map((m) => m[1]);
}

describe('content/site-terminal.md ↔ terminal commands', () => {
  const real = downloadFlags(commands);
  const documented = new Set(documentedFlags(corpusDoc));

  it('finds the real download targets', () => {
    // Guards the guard: a regex that silently matches nothing would make every
    // assertion below vacuously pass.
    expect(real.length).toBeGreaterThanOrEqual(10);
  });

  it('documents every download flag the terminal offers', () => {
    for (const { flag } of real) {
      expect(
        documented.has(flag),
        `content/site-terminal.md does not mention \`download ${flag}\` — the chat cannot tell a visitor about a document it has never heard of`,
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

    const realFlags = new Set([...real.map((r) => r.flag), MENU_ONLY]);
    for (const flag of documented) {
      expect(
        realFlags.has(flag),
        `content/site-terminal.md tells visitors to type \`download ${flag}\`, which commands.ts no longer defines`,
      ).toBe(true);
    }
  });

  it('every documented download resolves to a file in public/', () => {
    for (const { flag, filename } of real) {
      const served = path.join(root, 'public', filename);
      expect(
        readFileSync(served).length,
        `\`download ${flag}\` points at public/${filename}, which is missing or empty`,
      ).toBeGreaterThan(0);
    }
  });
});
