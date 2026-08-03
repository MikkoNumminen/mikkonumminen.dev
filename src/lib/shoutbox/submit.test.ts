import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitShout } from './submit';

/**
 * The write path's whole job is to turn four very different failures into one
 * thing a visitor can act on, and to pass the gate's own refusals through
 * untouched. These pin that split.
 *
 * `getChatBaseUrl` reads PUBLIC_CHAT_API_URL, which is unset in the test env, so
 * every test stubs it — otherwise `submitShout` short-circuits to `failed`
 * before touching fetch and every assertion below would pass for the wrong
 * reason.
 */

vi.mock('../terminal/chat', () => ({
  getChatBaseUrl: () => '/api/rag',
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let seen: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  seen = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stub(response: Response | (() => never)): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen = { url, init };
    if (typeof response === 'function') response();
    return response;
  }) as unknown as typeof fetch;
}

describe('submitShout', () => {
  it('reports queued when the backend accepts', async () => {
    const out = await submitShout('hello there', stub(jsonResponse({ accepted: true })));
    expect(out).toEqual({ kind: 'queued' });
  });

  it('passes the gate refusal through verbatim', async () => {
    // Paraphrasing here would put the same rule in two places, and the backend's
    // wording is the actionable one ("that is over 500 characters").
    const out = await submitShout(
      'x',
      stub(jsonResponse({ accepted: false, detail: 'Links are not accepted here.' })),
    );
    expect(out).toEqual({ kind: 'refused', detail: 'Links are not accepted here.' });
  });

  it('treats a 404 as failed, which is the box being switched off', async () => {
    // SHOUTBOX_ENABLED=false returns 404. To a visitor that is indistinguishable
    // from the machine being asleep, and the same line covers both.
    const out = await submitShout('hello', stub(jsonResponse({ detail: 'closed' }, 404)));
    expect(out).toEqual({ kind: 'failed' });
  });

  it('treats a 500 as failed', async () => {
    const out = await submitShout('hello', stub(jsonResponse({}, 500)));
    expect(out).toEqual({ kind: 'failed' });
  });

  it('treats a network throw as failed rather than propagating', async () => {
    const out = await submitShout(
      'hello',
      stub(() => {
        throw new Error('offline');
      }),
    );
    expect(out).toEqual({ kind: 'failed' });
  });

  it('treats a non-JSON body as failed', async () => {
    const bad = (async () =>
      new Response('not json', { status: 200 })) as unknown as typeof fetch;
    expect(await submitShout('hello', bad)).toEqual({ kind: 'failed' });
  });

  it('treats accepted:false with no detail as failed, not as a silent refusal', async () => {
    // A refusal with nothing to show the visitor is a broken response, not a
    // reason. Rendering an empty status line would read as the box hanging.
    const out = await submitShout('hello', stub(jsonResponse({ accepted: false })));
    expect(out).toEqual({ kind: 'failed' });
  });

  it('treats a whitespace-only detail as failed', async () => {
    const out = await submitShout(
      'hello',
      stub(jsonResponse({ accepted: false, detail: '   ' })),
    );
    expect(out).toEqual({ kind: 'failed' });
  });

  it('posts JSON to the same-origin rewrite, not the funnel host', async () => {
    // ADR 0012: the browser only ever talks to its own origin, or content
    // blockers silently eat the request and the failure is invisible.
    await submitShout('hello there', stub(jsonResponse({ accepted: true })));
    expect(seen?.url).toBe('/api/rag/shout');
    expect(seen?.init.method).toBe('POST');
    expect(seen?.init.body).toBe(JSON.stringify({ body: 'hello there' }));
    expect(seen?.init.cache).toBe('no-store');
  });

  it('sends the raw text and lets the backend normalise it', async () => {
    // The gate normalises and stores; doing it here too would mean two
    // implementations of the same rule drifting apart.
    await submitShout('  padded\n\n\n text  ', stub(jsonResponse({ accepted: true })));
    expect(seen?.init.body).toBe(JSON.stringify({ body: '  padded\n\n\n text  ' }));
  });
});
