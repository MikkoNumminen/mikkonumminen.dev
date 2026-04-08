import { buildCommands } from './commands';
import { asLocale, getTranslations } from '../../i18n';
import type { TerminalElements } from './dom';
import { echoPromptLine, makeContext, updateCursor } from './dom';
import { runBoot } from './typing';
import { History } from './history';
import { handleCommand, tabComplete } from './dispatch';

/**
 * Mount the interactive terminal inside `root`. The function is the only
 * public surface — the rest of `src/lib/terminal/` is implementation detail
 * split across `dom.ts`, `typing.ts`, `history.ts`, and `dispatch.ts`.
 */
export async function initTerminal(root: ParentNode = document): Promise<void> {
  const output = root.querySelector<HTMLElement>('#terminal-output');
  const form = root.querySelector<HTMLFormElement>('#terminal-form');
  const input = root.querySelector<HTMLInputElement>('#terminal-input');
  const cursor = root.querySelector<HTMLElement>('.terminal__cursor');

  if (!output || !form || !input || !cursor) return;

  // Read the active locale from <html lang="..."> set by BaseLayout.
  const locale = asLocale(document.documentElement.lang);
  const t = getTranslations(locale);
  const commands = buildCommands(t, locale);
  const commandMap = new Map(commands.map((c) => [c.name, c]));

  const elements: TerminalElements = { output, form, input, cursor };
  const ctx = makeContext(elements);
  const history = new History();

  // Click anywhere on the terminal focuses the input (mobile + desktop convenience)
  const terminalRoot = root.querySelector<HTMLElement>('.terminal');
  terminalRoot?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' || target.tagName === 'BUTTON') return;
    input.focus();
  });

  // Copy buttons inside output
  output.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' && target.classList.contains('copy')) {
      const value = target.getAttribute('data-copy') ?? '';
      try {
        await navigator.clipboard.writeText(value);
        const original = target.textContent;
        target.textContent = t.terminal.copyDone;
        setTimeout(() => {
          target.textContent = original;
        }, 1400);
      } catch {
        target.textContent = t.terminal.copyFallback;
      }
    }
  });

  input.addEventListener('input', () => updateCursor(input, cursor));
  input.addEventListener('keyup', () => updateCursor(input, cursor));
  input.addEventListener('click', () => updateCursor(input, cursor));
  input.addEventListener('focus', () => updateCursor(input, cursor));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = history.prev(input.value);
      if (prev !== null) {
        input.value = prev;
        requestAnimationFrame(() => {
          input.setSelectionRange(input.value.length, input.value.length);
          updateCursor(input, cursor);
        });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = history.next();
      if (next !== null) {
        input.value = next;
        requestAnimationFrame(() => {
          input.setSelectionRange(input.value.length, input.value.length);
          updateCursor(input, cursor);
        });
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      input.value = tabComplete(input.value, commands);
      requestAnimationFrame(() => {
        input.setSelectionRange(input.value.length, input.value.length);
        updateCursor(input, cursor);
      });
    } else if (e.key === 'l' && e.ctrlKey) {
      // Ctrl+L only — Cmd+L on macOS is the browser's "focus address bar"
      // shortcut and we shouldn't shadow it.
      e.preventDefault();
      ctx.clear();
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      echoPromptLine(output, input.value, '^C');
      input.value = '';
      history.reset();
      updateCursor(input, cursor);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = '';
    history.push(value);
    history.reset();
    updateCursor(input, cursor);
    await handleCommand(value, ctx, output, commandMap, t);
  });

  // Boot sequence then focus
  await runBoot(ctx, elements, t);
  input.focus();
  updateCursor(input, cursor);
}
