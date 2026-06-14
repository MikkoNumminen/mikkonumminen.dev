import { describe, it, expect, afterEach } from 'vitest';
import {
  appendLine,
  echoPromptLine,
  makeContext,
  disposeMeasureSpan,
  updateCursor,
  PROMPT_HTML,
  type TerminalElements,
} from './dom';

// dom.ts is the terminal's output sink — the DOM-touching half that runs in
// jsdom. The point of these tests is less the markup shape and more the
// SECURITY INVARIANT documented in the file: every untrusted string that
// reaches an innerHTML sink must be escaped first. We pin that with payloads
// that would execute if escaping ever regressed.

const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

function makeOutput(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  disposeMeasureSpan();
});

describe('appendLine', () => {
  it('creates a line span with the kind modifier class and a trailing newline', () => {
    const out = makeOutput();
    appendLine(out, 'hello', 'accent');
    const span = out.querySelector('span');
    expect(span?.className).toBe('line line--accent');
    expect(span?.innerHTML).toBe('hello');
    // A literal newline text node follows each line so copy-paste keeps breaks.
    expect(out.lastChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(out.lastChild?.textContent).toBe('\n');
  });

  it('defaults to the plain kind', () => {
    const out = makeOutput();
    appendLine(out, 'x');
    expect(out.querySelector('span')?.className).toBe('line line--plain');
  });
});

describe('echoPromptLine', () => {
  it('escapes the echoed value (innerHTML sink — boundary 1)', () => {
    const out = makeOutput();
    echoPromptLine(out, XSS);
    const span = out.querySelector('span');
    expect(span?.innerHTML).toContain(XSS_ESCAPED);
    // No live <img> element should have been parsed into the DOM.
    expect(out.querySelector('img')).toBeNull();
  });

  it('prepends the prompt markup and appends an optional suffix (Ctrl+C echo)', () => {
    const out = makeOutput();
    echoPromptLine(out, 'whoami', '^C');
    const html = out.querySelector('span')?.innerHTML ?? '';
    expect(html.startsWith(PROMPT_HTML)).toBe(true);
    expect(html).toContain('whoami^C');
  });
});

describe('makeContext', () => {
  function ctxWithOutput() {
    const output = makeOutput();
    const elements = { output } as TerminalElements;
    return { output, ctx: makeContext(elements) };
  }

  it('print escapes untrusted text before it reaches innerHTML', () => {
    const { output, ctx } = ctxWithOutput();
    ctx.print(XSS, 'err');
    const span = output.querySelector('span');
    expect(span?.className).toBe('line line--err');
    expect(span?.innerHTML).toBe(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });

  it('printHTML passes pre-built markup through as an html-kind line', () => {
    const { output, ctx } = ctxWithOutput();
    ctx.printHTML('<a href="#">link</a>');
    const span = output.querySelector('span');
    expect(span?.className).toBe('line line--html');
    expect(span?.querySelector('a')?.textContent).toBe('link');
  });

  it('clear empties the output', () => {
    const { output, ctx } = ctxWithOutput();
    ctx.print('one');
    ctx.print('two');
    ctx.clear();
    expect(output.innerHTML).toBe('');
  });

  it('navigate sets the window location', () => {
    const original = window.location;
    // jsdom's real location throws on assignment; swap in a plain stand-in.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
    try {
      const { ctx } = ctxWithOutput();
      ctx.navigate('/projects');
      expect(window.location.href).toBe('/projects');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });
});

describe('measurement span lifecycle', () => {
  it('updateCursor lazily attaches a single hidden span, disposeMeasureSpan removes it', () => {
    const input = document.createElement('input');
    input.value = 'abc';
    document.body.appendChild(input);
    const cursor = document.createElement('div');

    expect(() => updateCursor(input, cursor)).not.toThrow();
    const hidden = [...document.body.querySelectorAll('span')].filter(
      (s) => s.style.visibility === 'hidden',
    );
    expect(hidden.length).toBe(1);
    // The cursor offset variable is written (0px in jsdom, but the property exists).
    expect(cursor.style.getPropertyValue('--cursor-x')).toMatch(/px$/);

    disposeMeasureSpan();
    const after = [...document.body.querySelectorAll('span')].filter(
      (s) => s.style.visibility === 'hidden',
    );
    expect(after.length).toBe(0);
  });

  it('disposeMeasureSpan is a safe no-op when nothing was allocated', () => {
    expect(() => disposeMeasureSpan()).not.toThrow();
  });
});
