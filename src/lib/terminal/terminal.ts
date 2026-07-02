import { buildCommands } from './commands';
import { asLocale, getTranslations } from '../../i18n';
import type { TerminalElements } from './dom';
import { disposeMeasureSpan, echoPromptLine, makeContext, updateCursor } from './dom';
import { runBoot } from './typing';
import { History } from './history';
import { handleCommand, tabComplete } from './dispatch';
import { createChatRouter, displayModelName, startChatAvailabilityPolling } from './chat';

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
  const commands = buildCommands(t, {
    onAfterClear: () => clearContextBar(root),
  });
  // Key the lookup map by lowercased name so the CLI is case-insensitive on the
  // Enter path, matching tab-completion (which lowercases the partial). Command
  // names are already lowercase, but lowercasing here keeps both paths aligned
  // if that ever changes.
  const commandMap = new Map(commands.map((c) => [c.name.toLowerCase(), c]));

  // The chat router is the progressive-enhancement seam. It is inert unless a
  // backend is configured AND its LLM responds (see chat.ts) — so creating it
  // unconditionally is safe and changes nothing when chat is unavailable.
  const chat = createChatRouter();

  // Wire the context-window donut. The router stores this callback and passes
  // it to askChat on every turn; the donut updates only from real `context`
  // SSE frames, never from client-side guesses.
  chat.setContextCallback((used, limit) => {
    if (signal.aborted) return;
    updateContextBar(root, used, limit);
  });

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
        performClear(ctx, root, chat);
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

  // Clear button — fires the same three-step reset as Ctrl+L.
  // querySelector may return null on pages that don't render Terminal.astro
  // (e.g. non-contact pages that import terminal.ts), so the guard is required.
  const clearBtn = root.querySelector<HTMLButtonElement>('#terminal-clear-btn');
  clearBtn?.addEventListener(
    'click',
    () => {
      if (busy) return;
      performClear(ctx, root, chat);
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
  // Clicking a starter chip fills the prompt and submits it like a typed question.
  const submitStarter = (question: string): void => {
    input.value = question;
    updateCursor(input, cursor);
    form.requestSubmit();
  };

  // Only poll on wide viewports: at ≤640px this terminal is hidden and the
  // MobileContactCard owns the chat poll, so the page doesn't double-probe
  // /health (and double the console noise while the backend is down). If
  // matchMedia is unavailable, default to polling. Evaluated once at init —
  // crossing 640px at runtime needs a reload to swap which component owns the
  // chat (same reload-to-apply limitation as prefers-reduced-motion).
  const narrowViewport =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 640px)').matches;
  if (!narrowViewport) {
    startChatAvailabilityPolling(
      (available, model) => {
        if (signal.aborted) return;
        if (available) {
          revealChatHint(root, t);
          revealStarters(root, submitStarter, signal);
        } else {
          hideChatHint(root);
          hideStarters(root);
        }
        setAiIndicator(root, available, model);
      },
      { signal },
    );
  }

  return { dispose };
}

/**
 * Show a live "● ai · <model>" badge in the prompt while the backend is
 * answering, and clear it when chat is off. The span lives in Terminal.astro,
 * hidden by default, so when no backend is configured nothing ever appears.
 */
function setAiIndicator(
  root: ParentNode,
  available: boolean,
  model: string | null,
): void {
  const el = root.querySelector<HTMLElement>('.terminal__ai');
  if (!el) return;
  if (available) {
    // textContent only — the model name is a backend string, never an HTML sink.
    // Badge shows the shortened name; the title keeps the full backend tag.
    el.textContent = model ? `● ai · ${displayModelName(model)}` : '● ai';
    el.title = model ?? '';
    el.hidden = false;
  } else {
    el.textContent = '';
    el.title = '';
    el.hidden = true;
  }
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

// A few example questions shown as clickable chips when chat is available, so
// visitors aren't staring at a blank prompt. English-only on purpose: the chat
// itself answers only in English (see chat-backend prompt), so the starters that
// seed it are not translated.
const STARTER_QUESTIONS = [
  'Which project is the most complex?',
  'How did Spacepotatis bridge Phaser and Three.js?',
  "What is ReadLog .NET's stack?",
  'How does claude-continue know when a usage window resets?',
];

/**
 * Reveal the starter-question chips once chat is available. Idempotent. Clicking
 * a chip submits that question via `onPick`. Listeners are bound to the terminal
 * `signal` so they're torn down with the instance. When no backend is configured
 * this never runs, so the terminal stays pixel-identical to today.
 */
function revealStarters(
  root: ParentNode,
  onPick: (question: string) => void,
  signal: AbortSignal,
): void {
  const box = root.querySelector<HTMLElement>('.terminal__starters');
  if (!box || box.childElementCount > 0) return;
  for (const question of STARTER_QUESTIONS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'terminal__starter';
    // textContent (not innerHTML): static strings, never an HTML sink.
    chip.textContent = question;
    chip.addEventListener('click', () => onPick(question), { signal });
    box.appendChild(chip);
  }
}

/** Remove the starter chips when the backend goes away mid-session. */
function hideStarters(root: ParentNode): void {
  const box = root.querySelector<HTMLElement>('.terminal__starters');
  if (box) box.replaceChildren();
}

// Context-window donut ---------------------------------------------------

// The SVG circle has r=7; 2π×7 ≈ 43.98. We keep this as a constant so the
// JS update and the SVG markup share one source of truth.
const CTX_CIRCUMFERENCE = 2 * Math.PI * 7;

/**
 * Update the context-window donut with new usage numbers from the backend's
 * `context` SSE frame. The fraction is clamped to [0,1] so a used>limit value
 * (which the backend should never emit, but defensive) shows 100%, not overflow.
 * Color steps: green (< 80%), amber (80–95%), red (> 95%) to match terminal tone.
 */
function updateContextBar(root: ParentNode, used: number, limit: number): void {
  const container = root.querySelector<HTMLElement>('#terminal-ctx');
  const arc = root.querySelector<SVGCircleElement>('#terminal-ctx-arc');
  const label = root.querySelector<HTMLElement>('#terminal-ctx-label');
  if (!container || !arc || !label) return;

  const fraction = Math.min(1, used / limit);
  arc.style.strokeDasharray = `${(fraction * CTX_CIRCUMFERENCE).toFixed(2)} ${CTX_CIRCUMFERENCE.toFixed(2)}`;

  // Amber and red are literals here — CSS variables for those CRT tones are not
  // defined globally, so we inline them to match the dot colors in the chrome.
  if (fraction > 0.95) {
    arc.style.stroke = '#ff5f57'; // red — matches .terminal__dot--red
  } else if (fraction > 0.8) {
    arc.style.stroke = '#febc2e'; // amber — matches .terminal__dot--amber
  } else {
    arc.style.stroke = 'var(--color-term-green)';
  }

  // textContent only — `used` and `limit` are integers from the backend, never
  // an HTML sink. Percentage is shown rounded so 4095/4096 shows as 100%, not 99%.
  label.textContent = `${Math.round(fraction * 100)}%`;
  container.hidden = false;
}

/**
 * Hide the donut and reset its arc to empty. Called by `clear` and Ctrl+L so
 * the donut doesn't show stale numbers after a session reset.
 */
function clearContextBar(root: ParentNode): void {
  const container = root.querySelector<HTMLElement>('#terminal-ctx');
  const arc = root.querySelector<SVGCircleElement>('#terminal-ctx-arc');
  const label = root.querySelector<HTMLElement>('#terminal-ctx-label');
  if (!container || !arc || !label) return;

  arc.style.strokeDasharray = `0 ${CTX_CIRCUMFERENCE.toFixed(2)}`;
  arc.style.stroke = 'var(--color-term-green)';
  label.textContent = '';
  container.hidden = true;
}

/**
 * The three-step clear sequence shared by Ctrl+L and the clear button:
 * wipe the output, hide/reset the context donut, and fire a best-effort
 * session reset so the next turn starts with a blank backend context.
 *
 * `void chat.reset()` is fire-and-forget — the session ID rolls synchronously
 * before the POST so the next turn always uses the new ID even if the caller
 * submits immediately after clicking the button.
 */
function performClear(
  ctx: { clear: () => void },
  root: ParentNode,
  chat: { reset: () => Promise<void> },
): void {
  ctx.clear();
  clearContextBar(root);
  void chat.reset();
}
