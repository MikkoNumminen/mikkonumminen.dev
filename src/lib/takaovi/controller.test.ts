import { describe, expect, it, vi } from 'vitest';
import {
  ChatRequestError,
  type ChatFetchOpts,
  type ChatHandlers,
  type ChatSource,
  type HealthProbe,
} from '../chat/client';
import {
  createChatController,
  sourceLabels,
  type ChatEvent,
  type TurnStatus,
} from './controller';

/**
 * The controller is driven only through `createChatController`, with fakes for
 * `stream`, `probe` and `resetSession` — no DOM, no real transport. Fakes
 * honour the AbortSignal the same way the real `streamChat` does under a
 * cancelled fetch: they reject with a DOMException named `AbortError`.
 */

function abortError(): DOMException {
  return new DOMException('aborted', 'AbortError');
}

function fakeProbe(available = true) {
  return vi.fn(async (_baseUrl: string): Promise<HealthProbe> => ({
    available,
    model: available ? 'poro' : null,
  }));
}

/** Resolves immediately after running `script` against the handlers. */
function resolvedStream(script: (handlers: ChatHandlers) => void) {
  return vi.fn(
    async (
      _baseUrl: string,
      _message: string,
      handlers: ChatHandlers,
      _opts?: ChatFetchOpts,
    ): Promise<void> => {
      script(handlers);
    },
  );
}

/** Rejects immediately with `err`, as a broken stream or failed request would. */
function throwingStream(err: unknown) {
  return vi.fn(
    async (
      _baseUrl: string,
      _message: string,
      _handlers: ChatHandlers,
      _opts?: ChatFetchOpts,
    ): Promise<void> => {
      throw err;
    },
  );
}

/** Never sends a token and never resolves on its own — only the abort settles it. */
function neverStream() {
  return vi.fn(
    (
      _baseUrl: string,
      _message: string,
      _handlers: ChatHandlers,
      opts?: ChatFetchOpts,
    ): Promise<void> =>
      new Promise<void>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(abortError()));
      }),
  );
}

/** Emits `tokens` one at a time, `intervalMs` apart, then resolves. */
function dripStream(tokens: string[], intervalMs: number) {
  return vi.fn(
    (
      _baseUrl: string,
      _message: string,
      handlers: ChatHandlers,
      opts?: ChatFetchOpts,
    ): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        let i = 0;
        const onAbort = (): void => reject(abortError());
        opts?.signal?.addEventListener('abort', onAbort);
        const step = (): void => {
          const text = tokens[i];
          if (text !== undefined) {
            handlers.onToken(text);
            i++;
            setTimeout(step, intervalMs);
          } else {
            opts?.signal?.removeEventListener('abort', onAbort);
            resolve();
          }
        };
        setTimeout(step, intervalMs);
      }),
  );
}

/** A stream call that hangs until aborted or manually resolved from the test. */
function controllableStream() {
  let handlers: ChatHandlers | undefined;
  let signal: AbortSignal | undefined;
  const stream = vi.fn(
    (
      _baseUrl: string,
      _message: string,
      h: ChatHandlers,
      opts?: ChatFetchOpts,
    ): Promise<void> => {
      handlers = h;
      signal = opts?.signal;
      return new Promise<void>((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(abortError()));
      });
    },
  );
  return {
    stream,
    get handlers() {
      return handlers;
    },
    get signal() {
      return signal;
    },
  };
}

function collectEvents(controller: {
  subscribe: (l: (e: ChatEvent) => void) => () => void;
}) {
  const events: ChatEvent[] = [];
  controller.subscribe((e) => events.push(e));
  return events;
}

describe('ask()', () => {
  it('adds a turn and emits turn-added before any token, with busy already true', () => {
    const stream = neverStream();
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });
    let busyDuringAdd: boolean | undefined;
    const events = collectEvents(controller);
    controller.subscribe((e) => {
      if (e.type === 'turn-added') busyDuringAdd = controller.busy;
    });

    void controller.ask('what is HRM?');

    expect(events[0]).toMatchObject({ type: 'turn-added' });
    expect(events.some((e) => e.type === 'token')).toBe(false);
    expect(busyDuringAdd).toBe(true);
    expect(controller.turns[0]).toMatchObject({
      question: 'what is HRM?',
      status: 'thinking',
    });
  });

  it('streams tokens into the answer, thinking -> streaming -> done, and sets sources + availability', async () => {
    const stream = resolvedStream((handlers) => {
      const sources: ChatSource[] = [
        { source: 'projects/hrm.md', title: 'HRM Platform' },
      ];
      handlers.onSources?.(sources);
      handlers.onToken('Hello ');
      handlers.onToken('world.');
    });
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });
    const statuses: TurnStatus[] = [];
    const tokens: string[] = [];
    controller.subscribe((e) => {
      if (e.type === 'turn-changed') statuses.push(e.turn.status);
      if (e.type === 'token') tokens.push(e.text);
    });

    await controller.ask('what is HRM?');

    expect(tokens).toEqual(['Hello ', 'world.']);
    expect(statuses).toEqual(['streaming', 'done']);
    expect(controller.turns[0]?.answer).toBe('Hello world.');
    expect(controller.turns[0]?.status).toBe('done');
    expect(controller.turns[0]?.sources).toEqual(['HRM Platform']);
    expect(controller.availability).toBe('up');
  });

  it('ignores a blank question and a second ask while one is in flight', async () => {
    const stream = neverStream();
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });

    await controller.ask('   ');
    expect(controller.turns.length).toBe(0);
    expect(stream).not.toHaveBeenCalled();

    void controller.ask('first question');
    await controller.ask('second question');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(controller.turns.length).toBe(1);
    expect(controller.turns[0]?.question).toBe('first question');
  });

  it('sends the trimmed question as the request message, unchanged otherwise', async () => {
    const stream = resolvedStream(() => {});
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });

    await controller.ask('  what is HRM?  ');

    expect(stream.mock.calls[0]?.[1]).toBe('what is HRM?');
  });

  it('classifies errors by cause and always leaves busy false', async () => {
    const cases = [
      { stream: throwingStream(new ChatRequestError(429)), error: 'rate-limited' },
      {
        stream: throwingStream(new ChatRequestError(502)),
        error: 'unavailable',
        availability: 'down',
      },
      { stream: throwingStream(new ChatRequestError(400)), error: 'failed' },
      { stream: throwingStream(new TypeError('Failed to fetch')), error: 'unavailable' },
      {
        stream: resolvedStream((handlers) => handlers.onError?.('boom')),
        error: 'failed',
      },
      { stream: resolvedStream(() => {}), error: 'failed' },
    ] as const;

    for (const c of cases) {
      const controller = createChatController({
        baseUrl: '/api/rag',
        stream: c.stream,
        probe: fakeProbe(),
        resetSession: vi.fn(async () => {}),
      });
      await controller.ask('question');
      expect(controller.turns[0]?.status).toBe('error');
      expect(controller.turns[0]?.error).toBe(c.error);
      if ('availability' in c) expect(controller.availability).toBe(c.availability);
      expect(controller.busy).toBe(false);
    }
  });

  it('keeps a partial answer on error, and retry() clears it and re-sends the same question', async () => {
    let attempt = 0;
    const stream = vi.fn(
      async (
        _baseUrl: string,
        message: string,
        handlers: ChatHandlers,
        _opts?: ChatFetchOpts,
      ): Promise<void> => {
        attempt++;
        if (attempt === 1) {
          handlers.onToken('partial ');
          throw new Error('boom');
        }
        expect(message).toBe('why');
        handlers.onToken('full answer');
      },
    );
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });

    await controller.ask('why');
    expect(controller.turns[0]?.status).toBe('error');
    expect(controller.turns[0]?.answer).toBe('partial ');

    await controller.retry();
    expect(controller.turns.length).toBe(1);
    expect(controller.turns[0]?.status).toBe('done');
    expect(controller.turns[0]?.answer).toBe('full answer');
    expect(controller.turns[0]?.sources).toEqual([]);
    expect(stream).toHaveBeenCalledTimes(2);

    const callsBefore = stream.mock.calls.length;
    await controller.retry(); // last turn is 'done', not 'error' -> no-op
    expect(stream.mock.calls.length).toBe(callsBefore);
  });

  it('idle timeout aborts a silent stream as a timeout, and each token re-arms it', async () => {
    vi.useFakeTimers();
    try {
      const stream = neverStream();
      const controller = createChatController({
        baseUrl: '/api/rag',
        stream,
        probe: fakeProbe(),
        resetSession: vi.fn(async () => {}),
        idleTimeoutMs: 1000,
      });
      const asked = controller.ask('silence');
      await vi.advanceTimersByTimeAsync(1000);
      await asked;
      expect(controller.turns[0]?.status).toBe('error');
      expect(controller.turns[0]?.error).toBe('timeout');
      expect(controller.busy).toBe(false);
    } finally {
      vi.useRealTimers();
    }

    vi.useFakeTimers();
    try {
      // Three tokens 600ms apart total more than the 1000ms timeout, but each
      // gap is under it, so the timer must be re-armed per token, not just once.
      const stream = dripStream(['a', 'b', 'c'], 600);
      const controller = createChatController({
        baseUrl: '/api/rag',
        stream,
        probe: fakeProbe(),
        resetSession: vi.fn(async () => {}),
        idleTimeoutMs: 1000,
      });
      const asked = controller.ask('keepalive');
      await vi.advanceTimersByTimeAsync(3000);
      await asked;
      expect(controller.turns[0]?.status).toBe('done');
      expect(controller.turns[0]?.answer).toBe('abc');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('checkHealth()', () => {
  it('reflects the probe, skips an unconfigured backend, and never blocks ask()', async () => {
    const up = createChatController({
      baseUrl: '/api/rag',
      stream: resolvedStream(() => {}),
      probe: fakeProbe(true),
      resetSession: vi.fn(async () => {}),
    });
    await up.checkHealth();
    expect(up.availability).toBe('up');

    const down = createChatController({
      baseUrl: '/api/rag',
      stream: resolvedStream(() => {}),
      probe: fakeProbe(false),
      resetSession: vi.fn(async () => {}),
    });
    await down.checkHealth();
    expect(down.availability).toBe('down');

    const probeForUnconfigured = fakeProbe(true);
    const unconfigured = createChatController({
      baseUrl: null,
      stream: resolvedStream(() => {}),
      probe: probeForUnconfigured,
      resetSession: vi.fn(async () => {}),
    });
    expect(unconfigured.availability).toBe('unconfigured');
    await unconfigured.checkHealth();
    expect(unconfigured.availability).toBe('unconfigured');
    expect(probeForUnconfigured).not.toHaveBeenCalled();

    // A down probe is only a notice: asking still works.
    const stream = resolvedStream((handlers) => handlers.onToken('answer'));
    const stillAsks = createChatController({
      baseUrl: '/api/rag',
      stream,
      probe: fakeProbe(false),
      resetSession: vi.fn(async () => {}),
    });
    await stillAsks.checkHealth();
    expect(stillAsks.availability).toBe('down');
    await stillAsks.ask('question');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stillAsks.turns[0]?.status).toBe('done');
  });
});

describe('checkHealth() racing a turn', () => {
  it('drops a probe result that started before a turn settled', async () => {
    // A cold model can make the load-time probe slower than the first
    // question. Its late "down" is older news than the answer that arrived.
    let resolveProbe: (p: HealthProbe) => void = () => {};
    const probe = vi.fn(
      (_baseUrl: string) =>
        new Promise<HealthProbe>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream: resolvedStream((handlers) => handlers.onToken('vastaus')),
      probe,
      resetSession: vi.fn(async () => {}),
    });

    const health = controller.checkHealth();
    await controller.ask('kysymys');
    expect(controller.availability).toBe('up');

    resolveProbe({ available: false, model: null });
    await health;
    expect(controller.availability).toBe('up');
  });
});

describe('checkHealth() alongside a turn that fails for another reason', () => {
  it('keeps the probe result when the turn ends rate-limited', async () => {
    let resolveProbe: (p: HealthProbe) => void = () => {};
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream: throwingStream(new ChatRequestError(429)),
      probe: vi.fn(
        (_baseUrl: string) =>
          new Promise<HealthProbe>((resolve) => {
            resolveProbe = resolve;
          }),
      ),
      resetSession: vi.fn(async () => {}),
    });

    const health = controller.checkHealth();
    await controller.ask('kysymys');
    expect(controller.turns[0]?.error).toBe('rate-limited');

    resolveProbe({ available: true, model: 'poro' });
    await health;
    expect(controller.availability).toBe('up');
  });
});

describe('ask() with no backend configured', () => {
  it('ends the turn unavailable without calling stream, and busy returns to false', async () => {
    const stream = vi.fn(
      async (
        _baseUrl: string,
        _message: string,
        _handlers: ChatHandlers,
        _opts?: ChatFetchOpts,
      ): Promise<void> => {},
    );
    const controller = createChatController({
      baseUrl: null,
      stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });

    await controller.ask('hello');

    expect(stream).not.toHaveBeenCalled();
    expect(controller.turns[0]?.status).toBe('error');
    expect(controller.turns[0]?.error).toBe('unavailable');
    expect(controller.busy).toBe(false);
  });
});

describe('restart()', () => {
  it('aborts the in-flight turn, clears the conversation, and ignores late events from it', async () => {
    const c = controllableStream();
    const resetSession = vi.fn(async () => {});
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream: c.stream,
      probe: fakeProbe(),
      resetSession,
    });

    const firstAsk = controller.ask('first question');
    const events = collectEvents(controller);

    await controller.restart();

    expect(c.signal?.aborted).toBe(true);
    expect(controller.turns.length).toBe(0);
    expect(events.some((e) => e.type === 'cleared')).toBe(true);
    expect(resetSession).toHaveBeenCalledTimes(1);

    // firstAsk's run() must settle quietly: the stream rejected with AbortError,
    // and restart() bumped the generation before that, so the catch branch's
    // `live()` guard returns without emitting or touching state.
    await firstAsk;
    expect(controller.turns.length).toBe(0);

    // A token arriving from the aborted call after restart must not resurrect it.
    const eventsBefore = events.length;
    c.handlers?.onToken('late token');
    expect(events.length).toBe(eventsBefore);
    expect(controller.turns.length).toBe(0);

    // The same controller keeps working for a fresh turn.
    void controller.ask('second question');
    expect(c.stream).toHaveBeenCalledTimes(2);
    expect(controller.turns.length).toBe(1);
    expect(controller.turns[0]?.question).toBe('second question');
    expect(controller.busy).toBe(true);
  });

  it('ignores a health probe that resolves after the restart', async () => {
    let resolveProbe: (p: HealthProbe) => void = () => {};
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream: resolvedStream(() => {}),
      probe: vi.fn(
        (_baseUrl: string) =>
          new Promise<HealthProbe>((resolve) => {
            resolveProbe = resolve;
          }),
      ),
      resetSession: vi.fn(async () => {}),
    });

    const health = controller.checkHealth();
    await controller.restart();
    resolveProbe({ available: false, model: null });
    await health;

    expect(controller.availability).toBe('unknown');
  });
});

describe('dispose()', () => {
  it('aborts in-flight, makes later ask() a no-op, and stops emitting to listeners', async () => {
    const c = controllableStream();
    const controller = createChatController({
      baseUrl: '/api/rag',
      stream: c.stream,
      probe: fakeProbe(),
      resetSession: vi.fn(async () => {}),
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    const asked = controller.ask('question');
    controller.dispose();

    expect(c.signal?.aborted).toBe(true);
    await asked;

    // dispose() aborts the in-flight call but does not clear the conversation
    // (unlike restart()) — only the first turn from `asked` is on record.
    expect(controller.turns.length).toBe(1);

    listener.mockClear();
    await controller.ask('another question');
    expect(controller.turns.length).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('sourceLabels()', () => {
  it('labels cv.md as CV, trims titles, falls back to the filename, cuts long titles, dedupes, and caps at 4', () => {
    const longTitle = 'A'.repeat(50);
    const sources: ChatSource[] = [
      { source: 'cv.md', title: 'Ignored title' },
      { source: 'projects/hrm.md', title: '  HRM Platform  ' },
      { source: 'projects/no-title.md' },
      { source: 'projects/hrm.md', title: '  HRM Platform  ' }, // duplicate, collapses
      { source: 'projects/very-long-title.md', title: longTitle },
      { source: 'projects/extra.md', title: 'Extra' }, // beyond the 4-label cap
    ];

    expect(sourceLabels(sources)).toEqual([
      'CV',
      'HRM Platform',
      'no title',
      `${'A'.repeat(39)}…`,
    ]);
  });
});
