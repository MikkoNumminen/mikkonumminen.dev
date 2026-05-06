import { escapeHtml } from '../utils/escapeHtml';
import type { CommandContext, LineKind } from './types';

export interface TerminalElements {
  output: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  cursor: HTMLElement;
}

export const PROMPT_HTML = `<span class="line line--prompt"><span style="color:var(--color-term-green)">guest@mikkonumminen</span><span style="color:rgba(181,245,200,0.5)">:</span><span style="color:var(--color-term-cyan)">~</span><span style="color:var(--color-term-green)">$</span> `;

export function appendLine(
  output: HTMLElement,
  html: string,
  kind: LineKind = 'plain',
): void {
  const line = document.createElement('span');
  line.className = `line line--${kind}`;
  line.innerHTML = html;
  output.appendChild(line);
  output.appendChild(document.createTextNode('\n'));
  output.scrollTop = output.scrollHeight;
}

/**
 * Append a prompt-style echo line to the output. Used both when echoing the
 * submitted command and when handling Ctrl+C (with `^C` as the suffix).
 */
export function echoPromptLine(output: HTMLElement, value: string, suffix = ''): void {
  const echo = document.createElement('span');
  echo.className = 'line line--prompt';
  echo.innerHTML = PROMPT_HTML + escapeHtml(value) + suffix + '</span>';
  output.appendChild(echo);
  output.appendChild(document.createTextNode('\n'));
  output.scrollTop = output.scrollHeight;
}

export function makeContext(elements: TerminalElements): CommandContext {
  return {
    print: (text, kind = 'plain') => appendLine(elements.output, escapeHtml(text), kind),
    // Route printHTML through appendLine with kind 'html' so both code paths
    // produce the same span shape: <span class="line line--html">…</span>.
    printHTML: (html) => appendLine(elements.output, html, 'html'),
    clear: () => {
      elements.output.innerHTML = '';
    },
    navigate: (path) => {
      window.location.href = path;
    },
  };
}

// Cached measurement span — allocating a fresh span on every keystroke caused
// avoidable layout thrashing. We keep one hidden node attached to <body> and
// only mutate its text content.
let measureSpan: HTMLSpanElement | null = null;

function getMeasureSpan(input: HTMLInputElement): HTMLSpanElement {
  if (measureSpan && measureSpan.isConnected) return measureSpan;
  const span = document.createElement('span');
  span.style.position = 'absolute';
  span.style.visibility = 'hidden';
  span.style.whiteSpace = 'pre';
  span.style.pointerEvents = 'none';
  span.style.top = '-9999px';
  span.style.left = '-9999px';
  const cs = window.getComputedStyle(input);
  span.style.font = cs.font;
  span.style.letterSpacing = cs.letterSpacing;
  document.body.appendChild(span);
  measureSpan = span;
  return span;
}

/** Remove the cached measurement span from the DOM and null the reference. */
export function disposeMeasureSpan(): void {
  if (measureSpan) {
    measureSpan.remove();
    measureSpan = null;
  }
}

export function updateCursor(input: HTMLInputElement, cursor: HTMLElement): void {
  const span = getMeasureSpan(input);
  span.textContent = input.value.slice(0, input.selectionStart ?? input.value.length);
  const width = span.getBoundingClientRect().width;
  cursor.style.setProperty('--cursor-x', `${width}px`);
}
