import { test, expect, type Page } from '@playwright/test';
import { HEALTH_PATTERN, SHOUT_PATTERN, stubChatHealth } from './support/chat-backend';

// Interaction-level coverage for the two things scenes.spec.ts never exercises:
// the terminal actually running a scripted command, and the shoutbox actually
// posting through the request a real browser constructs. Both surfaces are
// unit-tested with `fetch` stubbed already; this file is the browser-level
// check that the real DOM wiring (submit handlers, selectors, rendered output)
// still matches what the unit tests assume.
//
// Locale is pinned explicitly (see BaseLayout's navigator.languages redirect —
// documented in e2e/scenes.spec.ts's neighbourhood) even though /contact is
// already the English default route, so a future locale-detection change can't
// silently start measuring the wrong page here.
test.use({ locale: 'en-US' });

// The boot sequence types character-by-character (src/lib/terminal/typing.ts)
// unless prefers-reduced-motion is honoured, in which case it renders instantly.
// The component already supports this mode; enabling it here just makes the
// terminal tests fast and deterministic without touching any product code.
// `reducedMotion` is a browser-CONTEXT option, not a top-level test option, in
// the pinned Playwright version — passing it directly to `test.use` type-checks
// as an unknown property and fails `npm run typecheck` (ts(2353)) while the
// tests themselves still pass, so only the repo gate catches it.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('terminal: scripted commands', () => {
  // Scripted-only is the state these two measure, so the backend answers
  // "reachable, model not up" for both. That is the same verdict the old
  // no-URL-in-the-bundle build produced, reached through the gate that actually
  // runs in production rather than through dead-code elimination.
  test.beforeEach(async ({ page }) => {
    await stubChatHealth(page, { llm: false });
  });

  test('typing "whoami" and submitting renders the scripted output', async ({ page }) => {
    await page.goto('/contact');

    const input = page.getByLabel('Terminal command input');
    await expect(input).toBeEnabled();

    await input.fill('whoami');
    await input.press('Enter');

    const outputEl = page.locator('#terminal-output');

    // The command echoes back at the prompt — this is the real submit path
    // (form submit -> handleCommand -> echoPromptLine), not a stub. `.first()`
    // because echoPromptLine's PROMPT_HTML is an unclosed `<span class="line
    // line--prompt">` reused as a prefix (src/lib/terminal/dom.ts), so the echo
    // is a `.line--prompt` span nested inside another `.line--prompt` span —
    // both real and both visible, not a bug in this test.
    await expect(
      outputEl.locator('.line--prompt').filter({ hasText: 'whoami' }).first(),
    ).toBeVisible();

    // whoami's handler (src/lib/terminal/commands.ts) prints the name in an
    // accent line and the title in a dim line right after it — asserting the
    // specific text is what would actually fail if the command's output broke.
    // Exact match: the boot welcome line ("welcome to Mikko Numminen — ...")
    // is also `.line--accent` and would otherwise make this ambiguous.
    await expect(
      outputEl.locator('.line--accent', { hasText: /^Mikko Numminen$/ }),
    ).toBeVisible();
    await expect(outputEl).toContainText('full-stack developer · finland');

    // The input is cleared and ready for the next command.
    await expect(input).toHaveValue('');
  });

  test('an unrecognized command falls through to the scripted "not found" line', async ({
    page,
  }) => {
    // The backend is configured but reports its model down, so `isChatAvailable()`
    // resolves false and unrecognized input cannot route to the model — it hits
    // the "command not found" path in src/lib/terminal/dispatch.ts. That gate is
    // exactly what this test pins.
    await page.goto('/contact');

    const input = page.getByLabel('Terminal command input');
    await expect(input).toBeEnabled();

    await input.fill('zzznotarealcommand');
    await input.press('Enter');

    const outputEl = page.locator('#terminal-output');
    await expect(
      outputEl
        .locator('.line--err')
        .filter({ hasText: 'command not found: zzznotarealcommand' }),
    ).toBeVisible();
    await expect(outputEl).toContainText('type `help` to see available commands.');
  });
});

// --- shoutbox -------------------------------------------------------------
//
// The write half of Shoutbox.astro is gated on `isChatAvailable()`
// (src/lib/terminal/chat.ts), which is gated in turn on the build-time
// `PUBLIC_CHAT_API_URL` env var (src/env.d.ts). With that var unset,
// `getChatBaseUrl()` compiles down to a hard `null` and `isChatAvailable()`
// resolves false WITHOUT EVER CALLING FETCH — no request to mock, no way to
// reach the form. These two tests were therefore written to detect the missing
// form and `test.skip` with a reason, which meant the site's only public write
// endpoint had no CI coverage at all: the tests announced their own absence and
// the run stayed green.
//
// The build is now made with the var set (playwright.config.ts), which is also
// how production is built (ADR 0012 / LAUNCH.md) — so the skip is gone and the
// form's appearance is a hard assertion. If the var ever falls out of the e2e
// build again these fail loudly instead of quietly excusing themselves.
interface CapturedRequest {
  method: string;
  contentType: string | null;
  json: unknown;
}

/**
 * Fake the backend `/health` (awake) and `/shout` (fixed response), then wait
 * for the write form to unhide. Returns every `/shout` request the browser
 * actually sent — real method/headers/body, not what the test *assumes*
 * `submitShout` builds.
 *
 * The wait is an assertion, not a probe: an awake backend MUST reveal the form,
 * so failing to is a product or build-config regression and belongs in the
 * report as a failure.
 */
async function primeShoutboxBackend(
  page: Page,
  shoutBody: unknown,
): Promise<{ requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];

  await stubChatHealth(page, { llm: true });

  await page.route(SHOUT_PATTERN, (route) => {
    const req = route.request();
    requests.push({
      method: req.method(),
      contentType: req.headers()['content-type'] ?? null,
      json: req.postDataJSON(),
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(shoutBody),
    });
  });

  await page.goto('/contact');

  await expect(
    page.locator('[data-shoutbox-form]'),
    'the write form must unhide when /health reports the backend awake — a ' +
      'hidden form here means either the reveal broke or the e2e build lost ' +
      'PUBLIC_CHAT_API_URL (playwright.config.ts)',
  ).toBeVisible();

  return { requests };
}

test.describe('shoutbox: submit', () => {
  test('a queued submit sends the real request shape and renders the queued state', async ({
    page,
  }) => {
    const { requests } = await primeShoutboxBackend(page, {
      accepted: true,
    });

    const form = page.locator('[data-shoutbox-form]');
    await form.scrollIntoViewIfNeeded();
    const textarea = page.locator('[data-shoutbox-input]');
    await textarea.fill('A message from the interaction e2e suite.');
    await page.locator('[data-shoutbox-send]').click();

    // The status line is the one aria-live region here (deliberately — see
    // Shoutbox.astro's doc comment), and it must show the exact queued copy.
    const status = page.locator('[data-shoutbox-status]');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('waiting for approval');

    // The textarea is cleared on a queued outcome.
    await expect(textarea).toHaveValue('');

    // Assert the actual request the browser sent, both directions of the
    // contract: method/shape out, rendered state in.
    expect(requests).toHaveLength(1);
    const [sent] = requests;
    expect(sent?.method).toBe('POST');
    expect(sent?.contentType).toBe('application/json');
    expect(sent?.json).toEqual({ body: 'A message from the interaction e2e suite.' });
  });

  test('a refusal renders the backend detail verbatim', async ({ page }) => {
    await primeShoutboxBackend(page, {
      accepted: false,
      detail: 'that is over 500 characters',
    });

    const form = page.locator('[data-shoutbox-form]');
    await form.scrollIntoViewIfNeeded();
    const longMessage = 'x'.repeat(600);
    const textarea = page.locator('[data-shoutbox-input]');
    await textarea.fill(longMessage);
    await page.locator('[data-shoutbox-send]').click();

    // The gate's own wording is passed through verbatim (submitShout's
    // contract) — not paraphrased, not the generic "failed" copy.
    const status = page.locator('[data-shoutbox-status]');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('that is over 500 characters');

    // A refusal is NOT a queued success: the textarea keeps the visitor's text
    // so they can edit and resend rather than having to retype it.
    await expect(textarea).toHaveValue(longMessage);
  });
});

// The gate, from the other side: the machine at home is asleep.
//
// This used to assert the same thing about a build with no backend URL in it at
// all, which is really a claim about dead-code elimination — and one the unit
// suite already makes (chat.test.ts: `getChatBaseUrl` returns null when the var
// is unset). Pointed at a configured-but-down backend it now covers the state a
// visitor actually meets, and it exercises the runtime gate rather than the
// compiler.
test.describe('shoutbox: gated when the backend is down', () => {
  test('the write form never appears and never issues a request', async ({ page }) => {
    await stubChatHealth(page, { llm: false });

    let shoutRequestSeen = false;
    await page.route(SHOUT_PATTERN, (route) => {
      shoutRequestSeen = true;
      return route.abort();
    });

    await page.goto('/contact');
    // Give any (unexpected) async probe a beat to fire before asserting.
    await page.waitForTimeout(1000);

    const form = page.locator('[data-shoutbox-form]');
    await expect(form).toBeHidden();
    expect(shoutRequestSeen).toBe(false);

    // The empty-state / offline line is what a visitor sees instead of a form.
    const status = page.locator('[data-shoutbox-status]');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('sending messages is off for a moment');
  });

  // The case above is "reachable, model not answering" — a 200 with
  // `checks.llm: false`. This one is the other way the backend goes away: the
  // host is unreachable and `fetch` REJECTS, taking `probeHealth`'s catch path
  // rather than its response path. The unit suite covers that catch directly,
  // but nothing proved end to end that a thrown fetch degrades the page the
  // same way a degraded response does — and it is the likelier production
  // state, since the backend is a home machine that is usually off.
  test('an unreachable backend degrades the same way a degraded one does', async ({
    page,
  }) => {
    await page.route(HEALTH_PATTERN, (route) => route.abort('connectionrefused'));

    let shoutRequestSeen = false;
    await page.route(SHOUT_PATTERN, (route) => {
      shoutRequestSeen = true;
      return route.abort();
    });

    await page.goto('/contact');
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-shoutbox-form]')).toBeHidden();
    expect(shoutRequestSeen).toBe(false);

    const status = page.locator('[data-shoutbox-status]');
    await expect(status).toBeVisible();
    await expect(status).toHaveText('sending messages is off for a moment');
  });
});
