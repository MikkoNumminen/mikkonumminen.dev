/**
 * Integration tests for initTerminal — specifically the clear button that
 * fires the same three-step reset (output.clear + clearContextBar + chat.reset)
 * as the `clear` command and Ctrl+L.
 *
 * The boot animation is made synchronous by stubbing matchMedia to report
 * prefers-reduced-motion: reduce, which short-circuits all the sleep() calls
 * in typing.ts to Promise.resolve(). No fake timers needed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initTerminal } from './terminal';
import { getSessionId, resetChatStateForTests } from './chat';
import { disposeMeasureSpan } from './dom';

// --- helpers ----------------------------------------------------------------

/**
 * Stub matchMedia so:
 *   - prefers-reduced-motion: reduce → matches: true (boot runs synchronously)
 *   - everything else           → matches: false
 */
function stubReducedMotion(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      // legacy API aliases — some code paths use these
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

/**
 * Build a minimal DOM tree that satisfies all of initTerminal's querySelector
 * calls. Appended to document.body so event listeners that target document
 * still work; callers must remove it in afterEach.
 */
function buildTerminalDOM(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <section class="terminal" data-prompt="guest@mikkonumminen:~$">
      <header class="terminal__chrome">
        <div class="terminal__dots" aria-hidden="true"></div>
        <div class="terminal__title" aria-hidden="true">terminal</div>
        <div class="terminal__chrome-right">
          <div id="terminal-ctx" hidden aria-hidden="true">
            <svg>
              <circle id="terminal-ctx-arc"></circle>
            </svg>
            <span id="terminal-ctx-label"></span>
          </div>
          <button
            type="button"
            id="terminal-clear-btn"
            class="terminal__clear"
            aria-label="Clear conversation"
          >&#x232B;</button>
        </div>
      </header>
      <div class="terminal__screen">
        <div id="terminal-output" role="log" aria-live="polite"></div>
        <form id="terminal-form" autocomplete="off">
          <label for="terminal-input" class="terminal__prompt">$</label>
          <span class="terminal__input-wrap">
            <input id="terminal-input" type="text" />
            <span class="terminal__cursor"></span>
          </span>
        </form>
        <div class="terminal__hints"></div>
        <div class="terminal__starters" aria-live="polite"></div>
      </div>
    </section>
  `;
  document.body.appendChild(root);
  return root;
}

// --- setup / teardown -------------------------------------------------------

beforeEach(() => {
  document.documentElement.lang = 'en';
  resetChatStateForTests();
  stubReducedMotion();
});

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  disposeMeasureSpan();
});

// --- tests ------------------------------------------------------------------

describe('clear button — wiring and effects', () => {
  it('clears terminal output when clicked', async () => {
    const root = buildTerminalDOM();
    const { dispose } = await initTerminal(root);

    const output = root.querySelector<HTMLElement>('#terminal-output')!;
    // Boot lines are present after init; verify something is there.
    expect(output.childElementCount).toBeGreaterThan(0);

    root.querySelector<HTMLButtonElement>('#terminal-clear-btn')!.click();

    expect(output.innerHTML).toBe('');
    dispose();
  });

  it('hides the context bar when clicked', async () => {
    const root = buildTerminalDOM();
    const { dispose } = await initTerminal(root);

    // Simulate a backend having sent a context frame by making the donut visible.
    const ctx = root.querySelector<HTMLElement>('#terminal-ctx')!;
    ctx.removeAttribute('hidden');
    const label = root.querySelector<HTMLElement>('#terminal-ctx-label')!;
    label.textContent = '42%';
    expect(ctx.hasAttribute('hidden')).toBe(false);

    root.querySelector<HTMLButtonElement>('#terminal-clear-btn')!.click();

    // clearContextBar should have set container.hidden = true.
    expect(ctx.hasAttribute('hidden')).toBe(true);
    expect(label.textContent).toBe('');
    dispose();
  });

  it('rolls the chat session id when clicked', async () => {
    const root = buildTerminalDOM();
    const { dispose } = await initTerminal(root);

    const idBefore = getSessionId();

    root.querySelector<HTMLButtonElement>('#terminal-clear-btn')!.click();

    // resetChatSession regenerates the session id synchronously before any await,
    // so the new id is visible immediately after the click.
    expect(getSessionId()).not.toBe(idBefore);
    dispose();
  });

  it('is a no-op while the terminal is busy (boot in progress)', async () => {
    // We can observe the busy guard by checking that clicking while busy
    // does NOT clear the output. Boot sets busy=true and disables input;
    // we trigger the click before awaiting initTerminal.
    const root = buildTerminalDOM();
    const promise = initTerminal(root);

    const idBefore = getSessionId();

    // Terminal is mid-boot (busy=true). Clicking should be a no-op.
    root.querySelector<HTMLButtonElement>('#terminal-clear-btn')!.click();

    // Session id unchanged — reset was NOT called.
    expect(getSessionId()).toBe(idBefore);

    const { dispose } = await promise;
    dispose();
  });

  it('is absent on pages that do not render Terminal.astro (null guard)', async () => {
    // A root with no #terminal-clear-btn — initTerminal should not throw.
    const minimalRoot = document.createElement('div');
    minimalRoot.innerHTML = `
      <section class="terminal">
        <div id="terminal-output" role="log"></div>
        <form id="terminal-form">
          <input id="terminal-input" type="text" />
          <span class="terminal__cursor"></span>
        </form>
        <div class="terminal__hints"></div>
        <div class="terminal__starters"></div>
      </section>
    `;
    document.body.appendChild(minimalRoot);

    await expect(initTerminal(minimalRoot)).resolves.toHaveProperty('dispose');
    document.body.removeChild(minimalRoot);
  });
});
