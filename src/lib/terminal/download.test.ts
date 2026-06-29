import { describe, it, expect } from 'vitest';
import { buildCommands } from './commands';
import { getTranslations, LOCALES } from '../../i18n';
import type { CommandContext } from './types';

// The download menu was restructured (PR #312): the skills A/B PDF moved from a
// top-level `--skills` into `download --research` as `--calibration`, and the
// research list is ordered oldest -> newest. These tests pin that structure so a
// later edit can't silently drop a flag, reorder the trail, or resurrect
// `--skills`. Only the menu paths are exercised (print/printHTML, no DOM/fetch);
// the selection path that fetches a PDF is intentionally out of scope.

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

describe('download menu structure', () => {
  it('bare `download` offers only --cv and --research at the top level', async () => {
    const out = await runDownload([]);
    expect(out).toContain('--cv');
    expect(out).toContain('--research');
    // the A/B doc moved under --research; neither it nor its new flag lives here
    expect(out).not.toContain('--skills');
    expect(out).not.toContain('--calibration');
  });

  it('`download --research` lists the six research PDFs oldest -> newest', async () => {
    const out = await runDownload(['--research']);
    const order = [
      '--catalog',
      '--study',
      '--replicates',
      '--results',
      '--calibration',
      '--finnish',
    ];
    for (const flag of order) expect(out, flag).toContain(flag);
    const positions = order.map((flag) => out.indexOf(flag));
    expect(positions, 'oldest -> newest order').toEqual(
      [...positions].sort((a, b) => a - b),
    );
    // --skills was renamed to --calibration and must be gone from the menu
    expect(out).not.toContain('--skills');
  });

  it('the retired `download --skills` flag now reports as unknown', async () => {
    const out = await runDownload(['--skills']);
    expect(out).toContain(getTranslations('en').terminal.cmdLinksUnknownFlag);
    expect(out).toContain('--skills');
  });
});

describe('download flag references stay consistent across locales', () => {
  it('usage / try-hint / ambiguity strings name --calibration, never --skills', () => {
    for (const locale of LOCALES) {
      const tt = getTranslations(locale).terminal;
      for (const key of [
        'cmdDownloadUsage',
        'cmdDownloadTryHint',
        'cmdDownloadAmbiguous',
      ] as const) {
        expect(tt[key], `${locale}.${key}`).not.toContain('--skills');
      }
      expect(tt.cmdDownloadUsage, `${locale}.cmdDownloadUsage`).toContain(
        '--calibration',
      );
    }
  });
});
