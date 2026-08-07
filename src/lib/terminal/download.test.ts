import { describe, it, expect } from 'vitest';
import { buildCommands } from './commands';
import { normaliseToken, resolveDownload, suggestId } from './download';
import { getTranslations, LOCALES } from '../../i18n';
import type { CommandContext } from './types';

// The download menu was restructured twice. PR #312 moved the skills A/B PDF from
// a top-level `--skills` into `download --research` as `--calibration`. This
// round flattens the two levels into one list and accepts bare ids
// (`download blindtest`) alongside the `--flag` spelling.
//
// The reason for the flattening is worth keeping next to the tests: bare
// `download` used to print two rows, the cv and a pointer, so a visitor asking
// for the research saw neither the research nor an error. That is what sent
// people to the chat to ask where the documents were.
//
// These tests pin the structure so a later edit cannot silently drop a flag,
// reorder the trail, or resurrect `--skills`. Only the menu and resolution paths
// are exercised (print/printHTML, no DOM/fetch); the branch that actually fetches
// a PDF is intentionally out of scope.

function recordingCtx(): { ctx: CommandContext; lines: string[] } {
  const lines: string[] = [];
  const ctx: CommandContext = {
    print: (text) => lines.push(text),
    printHTML: (html) => lines.push(html),
    clear: () => {
      lines.length = 0;
    },
    navigate: () => undefined,
  };
  return { ctx, lines };
}

const download = buildCommands(getTranslations('en')).find((c) => c.name === 'download');

async function runDownload(args: string[]): Promise<string> {
  if (!download) throw new Error('download command not found');
  const { ctx, lines } = recordingCtx();
  await download.handler(args, ctx);
  return lines.join('\n');
}

const ORDER = [
  'catalog',
  'study',
  'replicates',
  'results',
  'calibration',
  'finnish',
  'methodology',
  'blindtest',
  'poro',
  'translations',
  'delegation',
];
const ALL_IDS = ['cv', ...ORDER];

describe('download menu structure', () => {
  it('bare `download` lists every document, not a two-row pointer', async () => {
    const out = await runDownload([]);
    for (const id of ALL_IDS) expect(out, id).toContain(id);
    // the flag spelling is gone from the LISTING (the ids are what you type now)
    expect(out).not.toContain('--catalog');
    // --skills was renamed to --calibration and must never come back. Matched as
    // the flag, not the bare word: the descriptions legitimately say "16 skills".
    expect(out).not.toContain('--skills');
  });

  it('exposes no id called skills', async () => {
    // the assertion above only sees the dashed spelling, so the id form is
    // checked here rather than left to a substring that the copy also matches
    const got = resolveDownload(['skills'], ALL_IDS);
    expect(got.kind).not.toBe('target');
  });

  it('keeps the research trail in oldest -> newest order', async () => {
    const out = await runDownload([]);
    const positions = ORDER.map((id) => out.indexOf(id));
    expect(positions, 'oldest -> newest order').toEqual(
      [...positions].sort((a, b) => a - b),
    );
  });

  it('`download research` still narrows to the research trail', async () => {
    const out = await runDownload(['research']);
    for (const id of ORDER) expect(out, id).toContain(id);
    expect(out).not.toContain('cv:');
  });

  it('the documented `--research` spelling keeps working', async () => {
    const out = await runDownload(['--research']);
    for (const id of ORDER) expect(out, id).toContain(id);
  });

  it('the retired `download --skills` flag reports as unknown, as typed', async () => {
    const out = await runDownload(['--skills']);
    expect(out).toContain(getTranslations('en').terminal.cmdLinksUnknownFlag);
    // echoed with its dashes, the way the visitor wrote it
    expect(out).toContain('--skills');
  });
});

describe('download accepts what a person actually types', () => {
  it('a bare id downloads without needing dashes', async () => {
    // the reported gap: this used to print the generic menu and drop the word
    const out = await runDownload(['blindtest']);
    expect(out).toContain(getTranslations('en').terminal.cmdDownloadPreparing);
  });

  it('the `--flag` spelling still resolves to the same document', async () => {
    const out = await runDownload(['--blindtest']);
    expect(out).toContain(getTranslations('en').terminal.cmdDownloadPreparing);
  });

  it('an unrecognised word is reported instead of silently ignored', async () => {
    const out = await runDownload(['nonsense']);
    expect(out).toContain(getTranslations('en').terminal.cmdLinksUnknownFlag);
    expect(out).toContain('nonsense');
  });
});

describe('resolveDownload', () => {
  it('no arguments lists everything', () => {
    expect(resolveDownload([], ALL_IDS)).toEqual({ kind: 'list', tier: 'all' });
  });

  it('resolves an exact id, with or without dashes', () => {
    expect(resolveDownload(['poro'], ALL_IDS)).toEqual({ kind: 'target', id: 'poro' });
    expect(resolveDownload(['--poro'], ALL_IDS)).toEqual({ kind: 'target', id: 'poro' });
  });

  it('resolves a unique prefix', () => {
    expect(resolveDownload(['blind'], ALL_IDS)).toEqual({
      kind: 'target',
      id: 'blindtest',
    });
    expect(resolveDownload(['deleg'], ALL_IDS)).toEqual({
      kind: 'target',
      id: 'delegation',
    });
  });

  it('refuses a prefix shorter than three characters', () => {
    // `s` would otherwise resolve to `study`, so one stray keystroke downloads a
    // document the visitor never asked for.
    const got = resolveDownload(['s'], ALL_IDS);
    expect(got.kind).toBe('unknown');
  });

  it('still matches a two-letter id exactly', () => {
    expect(resolveDownload(['cv'], ALL_IDS)).toEqual({ kind: 'target', id: 'cv' });
  });

  it('reports an ambiguous prefix with its candidates', () => {
    const got = resolveDownload(['re'], ['replicates', 'results']);
    expect(got.kind).toBe('unknown'); // under MIN_PREFIX
    const longer = resolveDownload(['res'], ['replicates', 'results', 'reserve']);
    expect(longer).toEqual({
      kind: 'ambiguous',
      token: 'res',
      candidates: ['results', 'reserve'],
    });
  });

  it('a named document beats a listing word in the same line', () => {
    expect(resolveDownload(['the', 'research', 'blindtest'], ALL_IDS)).toEqual({
      kind: 'target',
      id: 'blindtest',
    });
  });

  it('tolerates filler words around a listing request', () => {
    // "download the research documents" must list, not error on "the"
    expect(resolveDownload(['the', 'research', 'documents'], ALL_IDS)).toEqual({
      kind: 'list',
      tier: 'research',
    });
  });

  it('two named documents are ambiguous rather than a silent pick', () => {
    const got = resolveDownload(['cv', 'poro'], ALL_IDS);
    expect(got.kind).toBe('ambiguous');
  });

  it('suggests the nearest id for a near miss', () => {
    expect(suggestId('blindtst', ALL_IDS)).toBe('blindtest');
    expect(suggestId('calibraton', ALL_IDS)).toBe('calibration');
  });

  it('offers no suggestion when nothing is close', () => {
    // a confidently wrong "did you mean" is worse than none
    expect(suggestId('helicopter', ALL_IDS)).toBeNull();
  });

  it('normalises punctuation and case', () => {
    expect(normaliseToken('--Blindtest,')).toBe('blindtest');
    expect(normaliseToken('CV')).toBe('cv');
  });
});

describe('download copy stays consistent across locales', () => {
  it('never names the retired --skills flag', () => {
    for (const locale of LOCALES) {
      const tt = getTranslations(locale).terminal;
      for (const key of [
        'cmdDownloadUsage',
        'cmdDownloadTryHint',
        'cmdDownloadAmbiguous',
        'cmdDownloadResearchHint',
      ] as const) {
        expect(tt[key], `${locale}.${key}`).not.toContain('--skills');
      }
    }
  });

  it('teaches the bare-id form rather than the dashed one', () => {
    for (const locale of LOCALES) {
      const tt = getTranslations(locale).terminal;
      expect(tt.cmdDownloadUsage, `${locale}.cmdDownloadUsage`).not.toContain('--cv');
      expect(
        tt.cmdDownloadResearchHint,
        `${locale}.cmdDownloadResearchHint`,
      ).not.toContain('--catalog');
    }
  });
});
