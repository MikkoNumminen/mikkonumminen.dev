import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatRequestError, getSessionId, rotateSessionId, streamChat } from './client';

/**
 * The transport is mostly exercised through `terminal/chat.test.ts`, which
 * imports it via the terminal's re-exports. This file covers what the split
 * added: a status-carrying error, local session rotation, and the dependency
 * boundary that justifies the split in the first place.
 */

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('streamChat failure statuses', () => {
  it('throws ChatRequestError carrying the status, with the message the terminal always saw', async () => {
    const fetchImpl = async () => new Response('rate limited', { status: 429 });
    const err = await streamChat(
      '/api/rag',
      'hei',
      { onToken: () => {} },
      { fetchImpl },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatRequestError);
    expect((err as ChatRequestError).status).toBe(429);
    expect((err as Error).message).toBe('chat request failed (429)');
  });

  it('lets a network failure through as the fetch error, not a ChatRequestError', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    };
    const err = await streamChat(
      '/api/rag',
      'hei',
      { onToken: () => {} },
      { fetchImpl },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ChatRequestError);
  });
});

describe('session identity', () => {
  it('rotateSessionId gives the next /chat POST a new id', async () => {
    const bodies: string[] = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return sseResponse('event: done\ndata: {}\n\n');
    };
    await streamChat('/api/rag', 'yksi', { onToken: () => {} }, { fetchImpl });
    const before = getSessionId();
    rotateSessionId();
    await streamChat('/api/rag', 'kaksi', { onToken: () => {} }, { fetchImpl });

    const [first, second] = bodies.map((b) => JSON.parse(b) as { session_id: string });
    expect(first?.session_id).toBe(before);
    expect(second?.session_id).toBe(getSessionId());
    expect(second?.session_id).not.toBe(before);
  });

  it('sends only message and session_id, never a language hint or history', async () => {
    let body = '';
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = String(init?.body);
      return sseResponse('event: done\ndata: {}\n\n');
    };
    await streamChat(
      '/api/rag',
      'Mitä Mikko tekee?',
      { onToken: () => {} },
      { fetchImpl },
    );
    expect(Object.keys(JSON.parse(body) as object).sort()).toEqual([
      'message',
      'session_id',
    ]);
  });
});

describe('dependency boundary', () => {
  it('imports nothing from site data or the terminal', () => {
    // A chat surface that imports this module should not pay for the projects
    // catalogue or the terminal's rendering code in its bundle.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, 'client.ts'), 'utf8');
    // Any `from '...'` or side-effect `import '...'`, on however many lines
    // prettier wraps an import over.
    const imports = [...source.matchAll(/(?:from|^import)\s+'([^']+)'/gm)].map(
      (m) => m[1],
    );
    expect(imports).toEqual([]);
  });
});
