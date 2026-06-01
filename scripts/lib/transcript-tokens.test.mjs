import { describe, it, expect } from 'vitest';
import { accountTranscript } from './transcript-tokens.mjs';

const line = (o) => JSON.stringify(o);

describe('accountTranscript', () => {
  it('sums input+output+cache_creation and EXCLUDES cache_read', () => {
    const content = [
      line({
        type: 'assistant',
        requestId: 'r1',
        sessionId: 's1',
        message: {
          model: 'claude-opus-4-8',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 9999, // must be ignored
          },
        },
      }),
    ].join('\n');
    const r = accountTranscript(content);
    expect(r.total).toBe(160); // 100 + 50 + 10, cache_read excluded
    expect(r.nAsst).toBe(1);
    expect(r.model).toBe('opus');
  });

  it('dedupes by (sessionId, requestId) so a repeated line counts once', () => {
    const dup = {
      type: 'assistant',
      requestId: 'r1',
      sessionId: 's1',
      message: { usage: { input_tokens: 10, output_tokens: 5 } },
    };
    const content = [
      line(dup),
      line(dup), // same (sessionId,requestId) -> ignored
      line({
        type: 'assistant',
        requestId: 'r2',
        sessionId: 's1',
        message: { usage: { input_tokens: 1, output_tokens: 1 } },
      }),
    ].join('\n');
    const r = accountTranscript(content);
    expect(r.total).toBe(15 + 2);
    expect(r.nAsst).toBe(2);
  });

  it('the dedup key uses sessionId too: same requestId in different sessions both count', () => {
    const content = [
      line({
        type: 'assistant',
        requestId: 'r1',
        sessionId: 's1',
        message: { usage: { input_tokens: 10 } },
      }),
      line({
        type: 'assistant',
        requestId: 'r1', // same requestId...
        sessionId: 's2', // ...different session -> NOT a dup
        message: { usage: { input_tokens: 20 } },
      }),
    ].join('\n');
    const r = accountTranscript(content);
    expect(r.total).toBe(30);
    expect(r.nAsst).toBe(2);
  });

  it('extracts the DRAW_ID marker from the first user message', () => {
    const content = [
      line({
        type: 'user',
        message: { content: 'audit the skills DRAW_ID: q-opus-A-3 please' },
      }),
      line({
        type: 'assistant',
        requestId: 'r1',
        sessionId: 's1',
        message: { usage: { input_tokens: 1 } },
      }),
    ].join('\n');
    expect(accountTranscript(content).drawId).toBe('q-opus-A-3');
  });

  it('reads DRAW_ID from array-of-parts user content too', () => {
    const content = line({
      type: 'user',
      message: { content: [{ type: 'text', text: 'go DRAW_ID: f-haiku-B-1' }] },
    });
    expect(accountTranscript(content).drawId).toBe('f-haiku-B-1');
  });

  it('skips assistant messages with no usage or no requestId, and malformed lines', () => {
    const content = [
      'not json at all',
      line({
        type: 'assistant',
        sessionId: 's1',
        message: { usage: { input_tokens: 5 } },
      }), // no requestId
      line({ type: 'assistant', requestId: 'r1', sessionId: 's1', message: {} }), // no usage
      line({ type: 'attachment' }),
      line({
        type: 'assistant',
        requestId: 'r2',
        sessionId: 's1',
        message: { usage: { input_tokens: 7 } },
      }),
    ].join('\n');
    const r = accountTranscript(content);
    expect(r.total).toBe(7);
    expect(r.nAsst).toBe(1);
  });

  it('detects sonnet/haiku families; unknown model passes through; empty -> zeros/nulls', () => {
    expect(
      accountTranscript(
        line({
          type: 'assistant',
          requestId: 'r1',
          sessionId: 's1',
          message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 1 } },
        }),
      ).model,
    ).toBe('sonnet');
    expect(accountTranscript('')).toEqual({
      total: 0,
      nAsst: 0,
      model: null,
      drawId: null,
    });
  });
});
