import type { CommandContext, LineKind } from './types';
import type { TerminalElements } from './dom';
import { appendLine } from './dom';
import type { getTranslations } from '../../i18n';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const sleep = (ms: number): Promise<void> =>
  prefersReducedMotion() ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

const PUNCTUATION_PAUSE = new Set(['.', '!', '?', ',']);

export async function typeLine(
  output: HTMLElement,
  text: string,
  kind: LineKind = 'plain',
  charDelay = 18,
): Promise<void> {
  const line = document.createElement('span');
  line.className = `line line--${kind}`;
  output.appendChild(line);
  output.appendChild(document.createTextNode('\n'));

  if (prefersReducedMotion()) {
    line.textContent = text;
    output.scrollTop = output.scrollHeight;
    return;
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    line.textContent += ch;
    output.scrollTop = output.scrollHeight;
    if (ch !== ' ') {
      // ±30% jitter so the typing rhythm feels human rather than metronomic.
      await sleep(charDelay * (0.7 + Math.random() * 0.6));
      if (PUNCTUATION_PAUSE.has(ch)) {
        await sleep(charDelay * 4);
      }
    }
  }
}

export async function runBoot(
  ctx: CommandContext,
  elements: TerminalElements,
  t: ReturnType<typeof getTranslations>,
): Promise<void> {
  const tt = t.terminal;
  const lines: Array<[string, LineKind, number]> = [
    [tt.bootBooting, 'dim', 14],
    [tt.bootMounting, 'dim', 8],
    [tt.bootLoading, 'dim', 8],
    [tt.bootComms, 'dim', 8],
    ['', 'plain', 0],
  ];

  for (const [text, kind, delay] of lines) {
    if (text === '') {
      appendLine(elements.output, '', 'plain');
      continue;
    }
    await typeLine(elements.output, text, kind, delay);
    await sleep(60);
  }

  ctx.print(tt.bootWelcome, 'accent');
  await sleep(150);
  ctx.print(tt.bootTypeHelp, 'dim');
  ctx.print('');
}
