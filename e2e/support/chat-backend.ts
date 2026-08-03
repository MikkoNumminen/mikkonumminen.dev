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
