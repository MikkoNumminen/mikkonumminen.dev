import { buildCommands } from './commands';
import { asLocale, getTranslations } from '../../i18n';
import type { TerminalElements } from './dom';
import { disposeMeasureSpan, echoPromptLine, makeContext, updateCursor } from './dom';
import { runBoot } from './typing';
import { History } from './history';
import { handleCommand, tabComplete } from './dispatch';
import { createChatRouter, startChatAvailabilityPolling } from './chat';

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
  const commands = buildCommands(t);
  // Key the lookup map by lowercased name so the CLI is case-insensitive on the
  // Enter path, matching tab-completion (which lowercases the partial). Command
  // names are already lowercase, but lowercasing here keeps both paths aligned
  // if that ever changes.
  const commandMap = new Map(commands.map((c) => [c.name.toLowerCase(), c]));

  // The chat router is the progressive-enhancement seam. It is inert unless a
  // backend is configured AND its LLM responds (see chat.ts) — so creating it
  // unconditionally is safe and changes nothing when chat is unavailable.
  const chat = createChatRouter();

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

  // `busy` is true while a command's async handler is in flight (and during the
  // boot sequence). The keydown handler closes over it so Ctrl+L / Ctrl+C can't
  // clear or interrupt output that an in-flight command is still mutating.
  // handleCommand is async (fetches, char-by-char typing); without this guard a
  // second Enter mid-command launches a concurrent handleCommand whose output
  // interleaves with the first in the same div.
  let busy = false;

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
        // shortcut and we shouldn't shadow it. Ignored while a command is in
        // flight: clearing the output mid-command would leave late prints from
        // the still-running handler mutating a screen the user thinks is empty.
        e.preventDefault();
        if (busy) return;
        ctx.clear();
      } else if (e.key === 'c' && e.ctrlKey) {
        // Ignored while busy for the same reason — an in-flight handler keeps
        // writing after the ^C echo, so the interrupt would be a visual lie.
        e.preventDefault();
        if (busy) return;
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
      if (busy) return;
      busy = true;
      const value = input.value;
      input.value = '';
      // history.push() already resets idx to -1 internally, so no second
      // history.reset() call is needed here (Minor 32).
      history.push(value);
      updateCursor(input, cursor);
      try {
        await handleCommand(value, ctx, output, commandMap, t, chat);
      } finally {
        busy = false;
      }
    },
    { signal },
  );

  // Gate input for the duration of the boot typing animation. Submitting a
  // command mid-boot would interleave its output with the boot lines; the
  // disabled input also gives a visible "not ready" cue. Mirror the state in
  // `busy` so the keydown shortcuts (Ctrl+L / Ctrl+C) are inert during boot too.
  busy = true;
  input.disabled = true;
  try {
    await runBoot(ctx, elements, t);
  } finally {
    input.disabled = false;
    busy = false;
  }
  input.focus();
  updateCursor(input, cursor);

  // Progressive enhancement: keep the "ask about the projects" affordance in sync
  // with the backend's live state. Probes once after boot, then on an interval and
  // on tab refocus, so the hint appears within one interval of the operator turning
  // the stack on and disappears when it goes off — no reload. When no backend is
  // configured nothing probes and nothing is added, so the terminal stays
  // pixel-identical to today (build brief constraint 5).
  startChatAvailabilityPolling(
    (available) => {
      if (signal.aborted) return;
      if (available) revealChatHint(root, t);
      else hideChatHint(root);
    },
    { signal },
  );

  return { dispose };
}

/** Append the "…or just ask about the projects" hint once chat is available. */
function revealChatHint(root: ParentNode, t: ReturnType<typeof getTranslations>): void {
  const hints = root.querySelector<HTMLElement>('.terminal__hints');
  if (!hints || hints.querySelector('.terminal__hint--chat')) return;
  const hint = document.createElement('span');
  hint.className = 'terminal__hint--chat';
  // textContent (not innerHTML): plain static i18n string, never an HTML sink.
  hint.textContent = t.terminal.chatHint;
  hints.appendChild(hint);
}

/** Remove the chat hint when the backend goes away mid-session. */
function hideChatHint(root: ParentNode): void {
  root.querySelector<HTMLElement>('.terminal__hint--chat')?.remove();
}
