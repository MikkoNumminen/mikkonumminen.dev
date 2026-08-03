import { test, expect, type Page } from '@playwright/test';

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
test.use({ reducedMotion: 'reduce' });

test.describe('terminal: scripted commands', () => {
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
    // No chat backend is baked into this build (PUBLIC_CHAT_API_URL unset), so
    // unrecognized input can never route to the model — it always hits the
    // "command not found" path in src/lib/terminal/dispatch.ts. That gate is
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
// `PUBLIC_CHAT_API_URL` env var (src/env.d.ts). That var is unset in this
// repo's CI build (.github/workflows/e2e.yml runs a plain `npm run build`),
// so `getChatBaseUrl()` compiles down to a hard `null` and `isChatAvailable()`
// resolves `false` WITHOUT EVER CALLING FETCH — no request to mock, no way to
// reach the form. Verified directly: `npm run build` without the env var
// produces a bundle with no reference to PUBLIC_CHAT_API_URL at all (fully
// dead-code-eliminated), while `PUBLIC_CHAT_API_URL=/api/rag npm run build`
// bakes the literal `/api/rag` path into `dist/_astro/chat.*.js`.
//
// So in the CI/default build, the two tests below correctly detect the form
// never unhiding and skip with an explicit, visible reason — they do not
// silently pass. Built locally with `PUBLIC_CHAT_API_URL=/api/rag` set (the
// same relative path production uses per ADR 0012 / LAUNCH.md), the identical
// spec exercises the real request the browser sends and the real rendered
// outcome; that is how this file was verified before being left in its
// CI-default (skip-with-reason) state. See the task report for the verbatim
// proof run against that build.
const HEALTH_PATTERN = '**/api/rag/health';
const SHOUT_PATTERN = '**/api/rag/shout';

const NO_BACKEND_SKIP_REASON =
  'PUBLIC_CHAT_API_URL is not baked into this build, so getChatBaseUrl() ' +
  'returns null and isChatAvailable() never calls fetch — the shoutbox write ' +
  'form stays hidden by design (src/lib/terminal/chat.ts, Shoutbox.astro) and ' +
  '/shout is unreachable from this build. Verified real (not silent): the same ' +
  'test passes when built with PUBLIC_CHAT_API_URL=/api/rag, see the task report.';

interface CapturedRequest {
  method: string;
  contentType: string | null;
  json: unknown;
}

/**
 * Fake the backend `/health` (always available) and `/shout` (fixed response)
 * and wait for the write form to unhide. Returns whether it did, plus every
 * `/shout` request the browser actually sent — real method/headers/body, not
 * what the test *assumes* `submitShout` builds.
 */
async function primeShoutboxBackend(
  page: Page,
  shoutBody: unknown,
): Promise<{ becameVisible: boolean; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];

  await page.route(HEALTH_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        checks: { db: true, llm: true },
        model: 'test-model',
      }),
    }),
  );

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

  const form = page.locator('[data-shoutbox-form]');
  const becameVisible = await form
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  return { becameVisible, requests };
}

test.describe('shoutbox: submit', () => {
  test('a queued submit sends the real request shape and renders the queued state', async ({
    page,
  }) => {
    const { becameVisible, requests } = await primeShoutboxBackend(page, {
      accepted: true,
    });
    test.skip(!becameVisible, NO_BACKEND_SKIP_REASON);

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
    const { becameVisible } = await primeShoutboxBackend(page, {
      accepted: false,
      detail: 'that is over 500 characters',
    });
    test.skip(!becameVisible, NO_BACKEND_SKIP_REASON);

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

test.describe('shoutbox: gated when no backend is configured', () => {
  test('the write form never appears and never issues a request', async ({ page }) => {
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
});
