import type { Page } from '@playwright/test';

/**
 * One place to fake the chat backend for the e2e suite.
 *
 * The suite builds the site with `PUBLIC_CHAT_API_URL=/api/rag` — the same value
 * production is built with (ADR 0012, LAUNCH.md) — so what CI loads is the page
 * visitors actually get, not a config nobody ships. The cost of that fidelity is
 * that EVERY contact-page load now probes `GET /api/rag/health` on mount
 * (src/lib/terminal/chat.ts), and `astro preview` serves no such route: left
 * alone the probe 404s, which is console noise for scenes.spec's
 * nothing-logged-an-error assertion and makes the chat/shoutbox reveal depend on
 * how fast a 404 comes back.
 *
 * So availability is never left to chance here — each spec declares the backend
 * it wants before navigating. `llm: false` reproduces the machine-at-home-asleep
 * state (the shipped default a visitor most often meets); `llm: true` is the
 * awake backend that reveals the shoutbox write form and the chat affordance.
 *
 * Routing must be installed BEFORE `page.goto`, since the probe fires on mount.
 */

/** The health probe every page issues on mount once a backend URL is baked in. */
export const HEALTH_PATTERN = '**/api/rag/health';

/** The shoutbox write endpoint (`submitShout`). */
export const SHOUT_PATTERN = '**/api/rag/shout';

/** The streaming chat endpoint (`streamChat`, `src/lib/chat/client.ts`). */
export const CHAT_PATTERN = '**/api/rag/chat';

/** The session-reset endpoint (`resetChatSession`, `src/lib/chat/client.ts`). */
export const RESET_PATTERN = '**/api/rag/session/reset';

/**
 * Answer `/health` with a fixed verdict.
 *
 * Availability is decided by `checks.llm` alone (see `probeHealth`), so a 200
 * with `llm: false` is the *reachable but not answering* state — deliberately
 * not a network failure, which would still log a console error and reintroduce
 * exactly the noise this stub exists to remove.
 */
export async function stubChatHealth(
  page: Page,
  { llm, model = 'e2e-model' }: { llm: boolean; model?: string },
): Promise<void> {
  await page.route(HEALTH_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: llm ? 'ok' : 'degraded',
        checks: { db: true, llm },
        model: llm ? model : null,
      }),
    }),
  );
}

/** A `/chat` request the browser actually sent, captured verbatim. */
export interface CapturedChatRequest {
  method: string;
  contentType: string | null;
  json: unknown;
}

export interface StubChatAnswerOptions {
  answer: string;
  sources?: Array<{ source: string; title?: string; project?: string | null }>;
  /** A non-200 status short-circuits to an empty error response, no SSE body. */
  status?: number;
}

/**
 * Fulfil `/chat` with a Server-Sent-Events body shaped exactly as
 * `src/lib/chat/client.ts` documents and parses it: an optional `sources`
 * frame, one `token` frame carrying the whole answer (the parser does not
 * care how many token frames an answer arrives in), then `done`.
 *
 * `status` other than 200 skips the SSE body entirely and returns an empty
 * response at that status, reproducing what `streamChat` throws
 * `ChatRequestError` on (e.g. 429 from the backend's rate limiter).
 *
 * Returns every request the browser actually sent to `/chat`, so a test can
 * assert the real POST body shape rather than what `streamChat` is assumed
 * to build.
 */
export async function stubChatAnswer(
  page: Page,
  opts: StubChatAnswerOptions,
): Promise<{ requests: CapturedChatRequest[] }> {
  const requests: CapturedChatRequest[] = [];
  const status = opts.status ?? 200;

  await page.route(CHAT_PATTERN, (route) => {
    const req = route.request();
    requests.push({
      method: req.method(),
      contentType: req.headers()['content-type'] ?? null,
      json: req.postDataJSON(),
    });

    if (status !== 200) {
      return route.fulfill({ status, contentType: 'application/json', body: '{}' });
    }

    const frames: string[] = [];
    if (opts.sources) {
      frames.push(
        `event: sources\ndata: ${JSON.stringify({ sources: opts.sources })}\n\n`,
      );
    }
    frames.push(`event: token\ndata: ${JSON.stringify({ text: opts.answer })}\n\n`);
    frames.push('event: done\ndata: {}\n\n');

    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: frames.join(''),
    });
  });

  return { requests };
}

/**
 * Fulfil `/session/reset` with `{ ok: true }` and record every request it
 * received, so a restart flow can be asserted to have posted exactly once.
 */
export async function stubSessionReset(
  page: Page,
): Promise<{ requests: CapturedChatRequest[] }> {
  const requests: CapturedChatRequest[] = [];

  await page.route(RESET_PATTERN, (route) => {
    const req = route.request();
    requests.push({
      method: req.method(),
      contentType: req.headers()['content-type'] ?? null,
      json: req.postDataJSON(),
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  return { requests };
}
