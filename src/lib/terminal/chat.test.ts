import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from '../../i18n';
import { makeContext } from './dom';
import {
  askChat,
  createSSEParser,
  disableChatForSession,
  formatSourceRef,
  getChatBaseUrl,
  isChatAvailable,
  probeAvailability,
  resetChatStateForTests,
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

describe('probeAvailability', () => {
  it('is true only when the LLM check passes', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(true, { status: 'ok', checks: { db: true, llm: true } }),
    );
    await expect(
      probeAvailability('https://x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://x/health', expect.anything());
  });

  it('is false when the LLM is down even if the request succeeds', async () => {
    const fetchImpl = async () =>
      jsonResponse(true, { checks: { db: true, llm: false } });
    await expect(
      probeAvailability('https://x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });

  it('is false on a non-2xx response', async () => {
    const fetchImpl = async () => jsonResponse(false, { checks: { llm: true } });
    await expect(
      probeAvailability('https://x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });

  it('is false (never throws) on a network error', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    await expect(
      probeAvailability('https://x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(false);
  });

  it('is false on a malformed body', async () => {
    const fetchImpl = async () => jsonResponse(true, { nope: 1 });
    await expect(
      probeAvailability('https://x', { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe(false);
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
});
