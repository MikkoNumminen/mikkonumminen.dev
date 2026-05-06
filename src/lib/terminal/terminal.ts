import { buildCommands } from './commands';
import { asLocale, getTranslations } from '../../i18n';
import type { TerminalElements } from './dom';
import { disposeMeasureSpan, echoPromptLine, makeContext, updateCursor } from './dom';
import { runBoot } from './typing';
import { History } from './history';
import { handleCommand, tabComplete } from './dispatch';

// Allow-list for values that may be sent to the clipboard via copy buttons.
// Only email addresses and https:// URLs are permitted; anything else is silently
// dropped to prevent a rogue data-copy attribute from exfiltrating arbitrary text.
const CLIPBOARD_EMAIL_RE = /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i;

function isAllowedCopyValue(value: string): boolean {
  return CLIPBOARD_EMAIL_RE.test(value) || value.startsWith('https://');
}

/**
 * Mount the interactive terminal inside `root`. The function is the only
 * public surface — the rest of `src/lib/terminal/` is implementation detail
 * split across `dom.ts`, `typing.ts`, `history.ts`, and `dispatch.ts`.
 *
 * Returns a `dispose` function that tears down all listeners and timers.
 */
export async function initTerminal(
  root: ParentNode = document,
): Promise<{ dispose: () => void }> {
  const output = root.querySelector<HTMLElement>('#terminal-output');
  const form = root.querySelector<HTMLFormElement>('#terminal-form');
  const input = root.querySelector<HTMLInputElement>('#terminal-input');
  const cursor = root.querySelector<HTMLElement>('.terminal__cursor');

  const noop = { dispose: () => undefined };
  if (!output || !form || !input || !cursor) return noop;

  // Single AbortController for all listener registrations in this instance.
  const controller = new AbortController();
  const { signal } = controller;

  const dispose = (): void => {
    controller.abort();
    disposeMeasureSpan();
  };

  // Auto-dispose on page unload so we don't leak on bfcache navigations.
  window.addEventListener('pagehide', () => dispose(), { once: true, signal });

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
  terminalRoot?.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON') return;
      input.focus();
    },
    { signal },
  );

  // Copy buttons inside output
  output.addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' && target.classList.contains('copy')) {
        const value = target.getAttribute('data-copy') ?? '';
        // Only write to clipboard if the value is an email or an https:// URL.
        // This prevents a malicious or stale data-copy value from silently
        // exfiltrating arbitrary strings via the Clipboard API.
        if (!isAllowedCopyValue(value)) return;
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
    },
    { signal },
  );

  input.addEventListener('input', () => updateCursor(input, cursor), { signal });
  input.addEventListener('keyup', () => updateCursor(input, cursor), { signal });
  input.addEventListener('click', () => updateCursor(input, cursor), { signal });
  input.addEventListener('focus', () => updateCursor(input, cursor), { signal });

  input.addEventListener(
    'keydown',
    (e) => {
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
    },
    { signal },
  );

  form.addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const value = input.value;
      input.value = '';
      // history.push() already resets idx to -1 internally, so no second
      // history.reset() call is needed here (Minor 32).
      history.push(value);
      updateCursor(input, cursor);
      await handleCommand(value, ctx, output, commandMap, t);
    },
    { signal },
  );

  // Boot sequence then focus
  await runBoot(ctx, elements, t);
  input.focus();
  updateCursor(input, cursor);

  return { dispose };
}
