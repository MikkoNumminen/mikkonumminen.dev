import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from '../../i18n';
import { makeContext } from './dom';
import {
  askChat,
  createSSEParser,
  disableChatForSession,
  displayModelName,
  formatSourceRef,
  getChatBaseUrl,
  getSessionId,
  isChatAvailable,
  resetChatSession,
  resetChatStateForTests,
  safeParseContext,
  startChatAvailabilityPolling,
  streamChat,
  type ChatHandlers,
} from './chat';

const t = getTranslations('en');

/** A Response-like whose `json()` resolves `body`. */
function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/** A streaming Response whose body emits the given SSE text chunks. */
function sseResponse(chunks: string[], ok = true): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
  return { ok, body } as unknown as Response;
}

beforeEach(() => {
  resetChatStateForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('displayModelName', () => {
  it('shortens a registry-style GGUF tag to the bare model name', () => {
    expect(
      displayModelName('hf.co/mradermacher/Llama-Poro-2-8B-Instruct-GGUF:Q4_K_M'),
    ).toBe('Llama-Poro-2-8B-Instruct');
  });

  it('keeps short size-tagged names untouched', () => {
    expect(displayModelName('qwen2.5:7b')).toBe('qwen2.5:7b');
    expect(displayModelName('llama3.1:8b')).toBe('llama3.1:8b');
  });

  it('drops quant tags but keeps size tags', () => {
    expect(displayModelName('some/model:IQ4_XS')).toBe('model');
    expect(displayModelName('some/model:F16')).toBe('model');
    expect(displayModelName('some/model:70b')).toBe('model:70b');
  });

  it('passes plain untagged names through', () => {
    expect(displayModelName('gemma4')).toBe('gemma4');
  });
});

describe('getChatBaseUrl', () => {
  it('is null when the env var is unset (the default / CI state)', () => {
    expect(getChatBaseUrl()).toBeNull();
  });

  it('trims a trailing slash when configured', () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://chat.example.com/');
    expect(getChatBaseUrl()).toBe('https://chat.example.com');
  });

  it('treats whitespace-only as unset', () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', '   ');
    expect(getChatBaseUrl()).toBeNull();
  });
});

describe('isChatAvailable', () => {
  it('is false when no backend is configured', async () => {
    await expect(isChatAvailable()).resolves.toBe(false);
  });

  it('stays false after a mid-session disable', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    disableChatForSession();
    await expect(isChatAvailable()).resolves.toBe(false);
  });
});

describe('createSSEParser', () => {
  it('parses a single complete frame', () => {
    const feed = createSSEParser();
    expect(feed('event: token\ndata: {"text":"hi"}\n\n')).toEqual([
      { event: 'token', data: '{"text":"hi"}' },
    ]);
  });

  it('buffers a frame split across chunks', () => {
    const feed = createSSEParser();
    expect(feed('event: token\nda')).toEqual([]);
    expect(feed('ta: {"text":"x"}\n\n')).toEqual([
      { event: 'token', data: '{"text":"x"}' },
    ]);
  });

  it('normalizes CRLF and ignores comment lines', () => {
    const feed = createSSEParser();
    expect(feed(':keep-alive\r\nevent: done\r\ndata: {}\r\n\r\n')).toEqual([
      { event: 'done', data: '{}' },
    ]);
  });

  it('joins multiple data lines with a newline', () => {
    const feed = createSSEParser();
    expect(feed('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('keeps the event name when a CRLF separator straddles a chunk boundary', () => {
    // The \r and \n of a line separator arrive in separate reads. A naive
    // per-chunk normalize would turn the lone \r into \n, forge a \n\n, and
    // split the frame (losing the `sources` event name -> dropped citations).
    const feed = createSSEParser();
    expect(feed('event: sources\r')).toEqual([]);
    expect(feed('\ndata: {"sources":[]}\r\n\r\n')).toEqual([
      { event: 'sources', data: '{"sources":[]}' },
    ]);
  });
});

describe('streamChat', () => {
  it('drives handlers from the SSE stream', async () => {
    const fetchImpl = async () =>
      sseResponse([
        'event: sources\ndata: {"sources":[{"source":"projects/hrm.md","title":"HRM"}]}\n\n',
        'event: token\ndata: {"text":"Hello "}\n\n',
        'event: token\ndata: {"text":"world."}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    const tokens: string[] = [];
    let sources: string[] = [];
    let done = false;
    const handlers: ChatHandlers = {
      onSources: (s) => {
        sources = s.map((x) => x.source);
      },
      onToken: (text) => tokens.push(text),
      onDone: () => {
        done = true;
      },
    };
    await streamChat('https://x', 'hi', [], handlers, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(tokens.join('')).toBe('Hello world.');
    expect(sources).toEqual(['projects/hrm.md']);
    expect(done).toBe(true);
  });

  it('throws when the response is not ok', async () => {
    const fetchImpl = async () => sseResponse([], false);
    await expect(
      streamChat(
        'https://x',
        'hi',
        [],
        { onToken: () => {} },
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      ),
    ).rejects.toThrow();
  });

  it('routes an error frame to onError', async () => {
    const fetchImpl = async () =>
      sseResponse(['event: error\ndata: {"message":"boom"}\n\n']);
    let errMsg = '';
    await streamChat(
      'https://x',
      'hi',
      [],
      {
        onToken: () => {},
        onError: (m) => {
          errMsg = m;
        },
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(errMsg).toBe('boom');
  });
});

describe('formatSourceRef', () => {
  it('strips the .md extension and prefixes an arrow', () => {
    expect(formatSourceRef('projects/audiobookmaker.md')).toBe(
      '→ projects/audiobookmaker',
    );
    expect(formatSourceRef('cv.md')).toBe('→ cv');
  });
});

describe('askChat', () => {
  function freshCtx() {
    const output = document.createElement('div');
    const ctx = makeContext({
      output,
      form: document.createElement('form'),
      input: document.createElement('input'),
      cursor: document.createElement('span'),
    });
    return { output, ctx };
  }

  it('streams the answer into the terminal and renders source refs', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = async () =>
      sseResponse([
        'event: sources\ndata: {"sources":[{"source":"projects/hrm.md"}]}\n\n',
        'event: token\ndata: {"text":"HRM is "}\n\n',
        'event: token\ndata: {"text":"a platform."}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    const { output, ctx } = freshCtx();
    await askChat('what is hrm', ctx, output, t, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(output.textContent).toContain('HRM is a platform.');
    expect(output.textContent).toContain('→ projects/hrm');
    expect(output.textContent).not.toContain(t.terminal.chatThinking);
  });

  it('prints a clean error line and disables chat when the turn fails', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = async () => {
      throw new Error('network');
    };
    const { output, ctx } = freshCtx();
    await askChat('boom', ctx, output, t, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(output.textContent).toContain(t.terminal.chatError);
    // Degraded for the rest of the session.
    await expect(isChatAvailable()).resolves.toBe(false);
  });

  it('threads prior turns as history into the next question', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: { body?: unknown }) => {
      bodies.push(String(init.body));
      return sseResponse([
        'event: token\ndata: {"text":"answer."}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    }) as unknown as typeof fetch;
    const { output, ctx } = freshCtx();
    await askChat('first question', ctx, output, t, { fetchImpl });
    await askChat('follow up', ctx, output, t, { fetchImpl });
    expect(JSON.parse(bodies[0] ?? 'null').history).toEqual([]);
    expect(JSON.parse(bodies[1] ?? 'null').history).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'answer.' },
    ]);
  });

  it('renders a project-mapped source as on-site + repo links', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = async () =>
      sseResponse([
        'event: sources\ndata: {"sources":[{"source":"projects/hrm.md","project":"hrm"}]}\n\n',
        'event: token\ndata: {"text":"HRM."}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    const { output, ctx } = freshCtx();
    await askChat('what is hrm', ctx, output, t, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const onsite = output.querySelector<HTMLAnchorElement>('a.chat-cite');
    const repo = output.querySelector<HTMLAnchorElement>('a.chat-cite-ext');
    expect(onsite?.textContent).toBe('→ projects/hrm');
    expect(onsite?.getAttribute('href')).toContain('/projects?id=hrm');
    expect(repo?.getAttribute('href')).toBe('https://github.com/MikkoNumminen/HRManager');
    expect(repo?.target).toBe('_blank');
  });

  it('leaves an unmapped source (no project) as plain text', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = async () =>
      sseResponse([
        'event: sources\ndata: {"sources":[{"source":"cv.md"}]}\n\n',
        'event: token\ndata: {"text":"hi."}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    const { output, ctx } = freshCtx();
    await askChat('who is mikko', ctx, output, t, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(output.querySelector('a.chat-cite')).toBeNull();
    expect(output.textContent).toContain('→ cv');
  });
});

describe('startChatAvailabilityPolling', () => {
  let ac: AbortController;

  beforeEach(() => {
    vi.useFakeTimers();
    ac = new AbortController();
  });
  afterEach(() => {
    ac.abort();
    // Reset visibility so a test that hid the tab can't leak into the next one.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    vi.useRealTimers();
  });

  function setVisibility(state: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  /** A fetch stub whose `/health` `llm` flag + model name are read live. */
  function healthFetch(
    getLlm: () => boolean,
    getModel: () => string = () => 'qwen2.5:7b',
  ) {
    return vi.fn(async () =>
      jsonResponse(true, {
        status: 'ok',
        checks: { db: true, llm: getLlm() },
        model: getModel(),
      }),
    );
  }

  it('is inert and never probes when no backend is configured', async () => {
    const fetchImpl = healthFetch(() => true);
    const onChange = vi.fn();
    startChatAvailabilityPolling(onChange, {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reveals (true) on the first probe when the backend is up', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const onChange = vi.fn();
    startChatAvailabilityPolling(onChange, {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: healthFetch(() => true) as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true, 'qwen2.5:7b');
  });

  it('fires onChange only on a transition, not on every poll', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const onChange = vi.fn();
    startChatAvailabilityPolling(onChange, {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: healthFetch(() => true) as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(2500); // initial + two interval polls, all up
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true, 'qwen2.5:7b');
  });

  it('stops probing while the tab is hidden and resumes when visible again', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = healthFetch(() => true);
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0); // initial probe while visible
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(5000); // five intervals elapse while hidden
    expect(fetchImpl).toHaveBeenCalledTimes(1); // …and not one extra probe fires

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0); // becoming visible probes immediately
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000); // and the interval loop is running again
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not keep polling when the tab hides while a probe is in flight', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    let resolveProbe: ((r: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((res) => {
          resolveProbe = res;
        }),
    );
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0); // initial probe is now in flight
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    setVisibility('hidden'); // hide BEFORE the probe resolves
    resolveProbe?.(
      jsonResponse(true, { status: 'ok', checks: { db: true, llm: true }, model: 'm' }),
    );
    await vi.advanceTimersByTimeAsync(5000); // the finally must not re-arm a timer
    expect(fetchImpl).toHaveBeenCalledTimes(1); // …so no further probe fires
  });

  it('hides (false) when the backend goes away', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    let up = true;
    const onChange = vi.fn();
    startChatAvailabilityPolling(onChange, {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: healthFetch(() => up) as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith(true, 'qwen2.5:7b');
    up = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenLastCalledWith(false, null);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('fires onChange when only the model changes while available', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    let model = 'qwen2.5:7b';
    const onChange = vi.fn();
    startChatAvailabilityPolling(onChange, {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: healthFetch(
        () => true,
        () => model,
      ) as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenLastCalledWith(true, 'qwen2.5:7b');
    model = 'gemma4:e4b';
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenLastCalledWith(true, 'gemma4:e4b');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('stops probing after the signal aborts', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = healthFetch(() => true);
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0);
    const callsBefore = fetchImpl.mock.calls.length;
    ac.abort();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
  });

  it('re-probes when the tab regains focus', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = healthFetch(() => true);
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 100_000, // long, so only the focus event drives the extra probe
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0);
    const before = fetchImpl.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl.mock.calls.length).toBe(before + 1);
  });

  it('does nothing when the signal is already aborted at entry', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = healthFetch(() => true);
    const aborted = new AbortController();
    aborted.abort();
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 1000,
      signal: aborted.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('backs off the probe interval while the backend stays down', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const fetchImpl = healthFetch(() => false); // always unreachable
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0); // probe #1 (down) -> next at t=2000 (1000*2)
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // t=1000: backed off, no probe yet
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // t=2000: probe #2 -> next at t=6000 (+1000*4)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999); // t≈5999: still backed off
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // t=6000: probe #3
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('resets the backoff to the base interval once the backend returns', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    let up = false;
    const fetchImpl = healthFetch(() => up);
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 1000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0); // #1 down -> next +2000
    await vi.advanceTimersByTimeAsync(2000); // #2 down -> next +4000 (t=6000)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    up = true;
    await vi.advanceTimersByTimeAsync(4000); // t=6000: #3 up -> failures reset -> next +1000
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000); // base interval again -> #4
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not double-probe when a tab-focus races an in-flight probe', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(() => new Promise<Response>((res) => (resolveFetch = res)));
    startChatAvailabilityPolling(vi.fn(), {
      intervalMs: 100_000,
      signal: ac.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(0); // first probe is in flight (unresolved)
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // A tab refocus mid-probe must be swallowed by the re-entrancy guard.
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Letting the probe finish reschedules the next one normally (no leak).
    resolveFetch(
      jsonResponse(true, {
        status: 'ok',
        checks: { db: true, llm: true },
        model: 'm',
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: context frame, session id, resetChatSession
// ---------------------------------------------------------------------------

describe('safeParseContext', () => {
  it('parses a well-formed context frame', () => {
    expect(safeParseContext('{"used":1024,"limit":4096}')).toEqual({
      used: 1024,
      limit: 4096,
    });
  });

  it('allows used === 0', () => {
    expect(safeParseContext('{"used":0,"limit":4096}')).toEqual({ used: 0, limit: 4096 });
  });

  it('returns null when limit is zero (not positive)', () => {
    expect(safeParseContext('{"used":0,"limit":0}')).toBeNull();
  });

  it('returns null when limit is negative', () => {
    expect(safeParseContext('{"used":100,"limit":-1}')).toBeNull();
  });

  it('returns null when used is negative', () => {
    expect(safeParseContext('{"used":-1,"limit":4096}')).toBeNull();
  });

  it('returns null when limit is missing', () => {
    expect(safeParseContext('{"used":100}')).toBeNull();
  });

  it('returns null when used is missing', () => {
    expect(safeParseContext('{"limit":4096}')).toBeNull();
  });

  it('returns null when fields are not numbers', () => {
    expect(safeParseContext('{"used":"100","limit":4096}')).toBeNull();
  });

  it('returns null for non-JSON input', () => {
    expect(safeParseContext('not json')).toBeNull();
  });

  it('returns null when limit is Infinity', () => {
    // JSON.parse('{"used":0,"limit":Infinity}') fails (Infinity is not valid
    // JSON), but the guard also catches non-finite numbers from other paths.
    expect(safeParseContext('{"used":0,"limit":null}')).toBeNull();
  });
});

describe('streamChat — context frame routing', () => {
  it('routes a well-formed context frame to onContext', async () => {
    const fetchImpl = async () =>
      sseResponse([
        'event: context\ndata: {"used":1024,"limit":4096}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    let contextResult: { used: number; limit: number } | undefined;
    const handlers: ChatHandlers = {
      onToken: () => {},
      onContext: (used, limit) => {
        contextResult = { used, limit };
      },
    };
    await streamChat('https://x', 'hi', [], handlers, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(contextResult).toEqual({ used: 1024, limit: 4096 });
  });

  it('ignores a malformed context frame (negative limit) — onContext not called', async () => {
    const fetchImpl = async () =>
      sseResponse([
        'event: context\ndata: {"used":100,"limit":-1}\n\n',
        'event: done\ndata: {}\n\n',
      ]);
    const onContext = vi.fn();
    await streamChat(
      'https://x',
      'hi',
      [],
      { onToken: () => {}, onContext },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(onContext).not.toHaveBeenCalled();
  });

  it('includes a session_id in the /chat POST body', async () => {
    let capturedBody = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body);
      return sseResponse(['event: done\ndata: {}\n\n']);
    }) as unknown as typeof fetch;
    await streamChat('https://x', 'question', [], { onToken: () => {} }, { fetchImpl });
    const body = JSON.parse(capturedBody) as Record<string, unknown>;
    expect(typeof body['session_id']).toBe('string');
    expect((body['session_id'] as string).length).toBeGreaterThan(0);
  });
});

describe('resetChatSession', () => {
  it('posts to /session/reset with the current session id, then regenerates it', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const idBefore = getSessionId();
    let postedUrl = '';
    let postedBody = '';
    const fetchImpl = (async (url: string, init: RequestInit) => {
      postedUrl = String(url);
      postedBody = String(init.body);
      return jsonResponse(true, { ok: true });
    }) as unknown as typeof fetch;
    await resetChatSession({ fetchImpl });
    expect(postedUrl).toBe('https://x/session/reset');
    expect((JSON.parse(postedBody) as Record<string, unknown>)['session_id']).toBe(
      idBefore,
    );
    // Session id must be regenerated.
    expect(getSessionId()).not.toBe(idBefore);
  });

  it('does not fetch and does not throw when no backend is configured', async () => {
    // PUBLIC_CHAT_API_URL is unset (reset in beforeEach).
    const fetchImpl = vi.fn();
    await expect(
      resetChatSession({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('swallows a network error from /session/reset and still regenerates the session id', async () => {
    vi.stubEnv('PUBLIC_CHAT_API_URL', 'https://x');
    const idBefore = getSessionId();
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    await expect(
      resetChatSession({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
    // Session id is still regenerated even when the POST failed.
    expect(getSessionId()).not.toBe(idBefore);
  });
});
