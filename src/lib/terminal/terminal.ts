import { commandMap, commands } from './commands';
import type { CommandContext, LineKind } from './types';

interface TerminalElements {
  output: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  cursor: HTMLElement;
}

const PROMPT_HTML = `<span class="line line--prompt"><span style="color:var(--color-term-green)">guest@mikkonumminen</span><span style="color:rgba(181,245,200,0.5)">:</span><span style="color:var(--color-term-cyan)">~</span><span style="color:var(--color-term-green)">$</span> `;

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sleep = (ms: number) =>
  reducedMotion ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

const escapeHTML = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function appendLine(output: HTMLElement, html: string, kind: LineKind = 'plain') {
  const line = document.createElement('span');
  line.className = `line line--${kind}`;
  line.innerHTML = html;
  output.appendChild(line);
  output.appendChild(document.createTextNode('\n'));
  output.scrollTop = output.scrollHeight;
}

function makeContext(elements: TerminalElements): CommandContext {
  return {
    print: (text, kind = 'plain') => appendLine(elements.output, escapeHTML(text), kind),
    printHTML: (html) => {
      const wrap = document.createElement('span');
      wrap.innerHTML = html;
      elements.output.appendChild(wrap);
      elements.output.appendChild(document.createTextNode('\n'));
      elements.output.scrollTop = elements.output.scrollHeight;
    },
    clear: () => {
      elements.output.innerHTML = '';
    },
    navigate: (path) => {
      window.location.href = path;
    },
  };
}

async function typeLine(
  output: HTMLElement,
  text: string,
  kind: LineKind = 'plain',
  charDelay = 18,
) {
  const line = document.createElement('span');
  line.className = `line line--${kind}`;
  output.appendChild(line);
  output.appendChild(document.createTextNode('\n'));

  if (reducedMotion) {
    line.textContent = text;
    output.scrollTop = output.scrollHeight;
    return;
  }

  for (let i = 0; i < text.length; i++) {
    line.textContent += text[i];
    output.scrollTop = output.scrollHeight;
    if (text[i] !== ' ') await sleep(charDelay);
  }
}

async function runBoot(ctx: CommandContext, elements: TerminalElements) {
  const lines: Array<[string, LineKind, number]> = [
    ['booting mikkOS v1.0.0 ...', 'dim', 14],
    ['[ ok ] mounting /portfolio', 'dim', 8],
    ['[ ok ] loading projects, experience, contact', 'dim', 8],
    ['[ ok ] establishing comms link', 'dim', 8],
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

  await typeLine(
    elements.output,
    'welcome to mikko numminen — full-stack developer.',
    'accent',
    22,
  );
  await sleep(150);
  ctx.print('type `help` to see what i can do.', 'dim');
  ctx.print('hint: i answer to `sudo` commands too.', 'dim');
  ctx.print('');
}

function tokenize(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

async function handleCommand(input: string, ctx: CommandContext) {
  const echoLine = document.createElement('span');
  echoLine.className = 'line line--prompt';
  echoLine.innerHTML = PROMPT_HTML + escapeHTML(input) + '</span>';
  document.getElementById('terminal-output')!.appendChild(echoLine);
  document
    .getElementById('terminal-output')!
    .appendChild(document.createTextNode('\n'));

  const tokens = tokenize(input);
  if (tokens.length === 0) return;

  const [name, ...args] = tokens;
  const cmd = commandMap.get(name!);
  if (!cmd) {
    ctx.print(`command not found: ${name}`, 'err');
    ctx.print(`type \`help\` to see available commands.`, 'dim');
    return;
  }
  try {
    await cmd.handler(args, ctx);
  } catch (err) {
    ctx.print(`error: ${(err as Error).message}`, 'err');
  }
}

class History {
  private items: string[] = [];
  private idx = -1;
  private draft = '';

  push(line: string) {
    if (!line.trim()) return;
    if (this.items[this.items.length - 1] === line) {
      this.idx = -1;
      return;
    }
    this.items.push(line);
    if (this.items.length > 100) this.items.shift();
    this.idx = -1;
  }

  prev(currentDraft: string): string | null {
    if (this.items.length === 0) return null;
    if (this.idx === -1) {
      this.draft = currentDraft;
      this.idx = this.items.length - 1;
    } else if (this.idx > 0) {
      this.idx -= 1;
    }
    return this.items[this.idx] ?? null;
  }

  next(): string | null {
    if (this.idx === -1) return null;
    if (this.idx >= this.items.length - 1) {
      this.idx = -1;
      return this.draft;
    }
    this.idx += 1;
    return this.items[this.idx] ?? null;
  }

  reset() {
    this.idx = -1;
    this.draft = '';
  }
}

function tabComplete(value: string): string {
  const tokens = tokenize(value);
  if (tokens.length <= 1) {
    const partial = tokens[0] ?? '';
    const candidates = commands
      .filter((c) => !c.hidden && c.name.startsWith(partial))
      .map((c) => c.name);
    if (candidates.length === 1) return candidates[0]! + ' ';
    return value;
  }
  return value;
}

function updateCursor(input: HTMLInputElement, cursor: HTMLElement) {
  // Use a hidden span to measure text width up to caret.
  const measure = document.createElement('span');
  const cs = window.getComputedStyle(input);
  measure.style.font = cs.font;
  measure.style.letterSpacing = cs.letterSpacing;
  measure.style.position = 'absolute';
  measure.style.visibility = 'hidden';
  measure.style.whiteSpace = 'pre';
  measure.textContent = input.value.slice(0, input.selectionStart ?? input.value.length);
  document.body.appendChild(measure);
  const width = measure.getBoundingClientRect().width;
  measure.remove();
  cursor.style.setProperty('--cursor-x', `${width}px`);
}

export async function initTerminal(root: ParentNode = document) {
  const output = root.querySelector<HTMLElement>('#terminal-output');
  const form = root.querySelector<HTMLFormElement>('#terminal-form');
  const input = root.querySelector<HTMLInputElement>('#terminal-input');
  const cursor = root.querySelector<HTMLElement>('.terminal__cursor');

  if (!output || !form || !input || !cursor) return;

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
        target.textContent = 'copied!';
        setTimeout(() => {
          target.textContent = original;
        }, 1400);
      } catch {
        target.textContent = 'press ctrl+c';
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
      input.value = tabComplete(input.value);
      requestAnimationFrame(() => {
        input.setSelectionRange(input.value.length, input.value.length);
        updateCursor(input, cursor);
      });
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      ctx.clear();
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      const echo = document.createElement('span');
      echo.className = 'line line--prompt';
      echo.innerHTML = PROMPT_HTML + escapeHTML(input.value) + '^C</span>';
      output.appendChild(echo);
      output.appendChild(document.createTextNode('\n'));
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
    await handleCommand(value, ctx);
  });

  // Boot sequence then focus
  await runBoot(ctx, elements);
  input.focus();
  updateCursor(input, cursor);
}
