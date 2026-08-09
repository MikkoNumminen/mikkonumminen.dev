import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

/**
 * The COMMITTED snapshot, read from disk rather than stubbed.
 *
 * NOT a malformed-file check. `scripts/validate-shoutbox.mjs` runs in prebuild
 * and already refuses a bad count, a wrong version and anything off-schema; I
 * tried all three here and the build fails before this test can run, which is
 * the right order.
 *
 * What it covers is the half the validator cannot see: that a file it approves
 * actually REACHES THE PAGE. Break the fetch path, rename the thread class, read
 * the wrong field in `renderThread`, and the JSON still validates while the box
 * quietly says "No messages yet." to everyone, with no error anywhere. Verified
 * by moving `SNAPSHOT_PATH`: the validator stayed green and this went red.
 */
/**
 * The scroll hint, which pointed at a box nobody could find.
 *
 * Reported twice as "there is no indicator to scroll down to viestit". The hint
 * was rendering the whole time and retiring itself on LOAD: the terminal above is
 * 100vh so the card starts exactly at the fold, an element whose top edge sits ON
 * the viewport boundary touches the root with ZERO area, and the spec still
 * reports that as intersecting. Measured against the live site at viewport
 * heights 800, 900, 1000 and 1200: card visible for 0 pixels, hint already
 * retired. One-way by design, so it never came back.
 */
/**
 * Which entries have narration, said on the card rather than found by opening it.
 *
 * Rendered in BOTH states on purpose. Nine of eleven entries have audio, so a
 * badge only on those would mark almost every card and leave the two exceptions
 * defined by an absence, which is the one thing a reader cannot see.
 */
test.describe('blog index: audio state', () => {
  test('every card says whether it has narration', async ({ page }) => {
    await page.goto('/blog');
    const cards = page.locator('.post-card');
    const chips = page.locator('.post-card__audio');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // One chip per card, no card left unmarked.
    await expect(chips).toHaveCount(count);

    // Both states present, so this is not passing because every entry happens
    // to be labelled the same way.
    const withAudio = page.locator("[data-has-audio='true']");
    const without = page.locator("[data-has-audio='false']");
    await expect(withAudio.first()).toBeVisible();
    await expect(without.first()).toBeVisible();

    // The TEXT has to differ, not just the attribute. Asserting the attribute
    // alone let a mutation that printed "audio" on every card pass: the states
    // were still distinct in the DOM and identical on screen, which is the only
    // place it matters.
    const yes = (await withAudio.first().innerText()).trim();
    const no = (await without.first().innerText()).trim();
    expect(yes).not.toBe(no);
    expect(yes.length).toBeGreaterThan(0);
    expect(no.length).toBeGreaterThan(0);
  });

  test('the chip agrees with whether the entry page offers audio', async ({ page }) => {
    // The card must not claim narration the entry does not have. Checks the
    // newest post, which is the one most likely to have been added without a
    // recording.
    await page.goto('/blog');
    const first = page.locator('.post-card').first();
    const says = await first.locator('.post-card__audio').getAttribute('data-has-audio');
    await first.locator('a').first().click();
    await page.waitForLoadState('domcontentloaded');
    // `#blog-voice` specifically, NOT any <audio>. BackgroundAudio puts two
    // music-bed decks on every page, so a bare `audio` locator is true
    // everywhere and this test passed nothing while looking like it checked
    // something. It failed on exactly that and is the reason the selector is
    // narrow.
    const hasPlayer = (await page.locator('#blog-voice').count()) > 0;
    expect(hasPlayer).toBe(says === 'true');
  });
});

test.describe('shoutbox: the scroll hint', () => {
  // VIEWPORT PINNED, and the number is measured rather than chosen. Against the
  // live site the hint retired on load at heights 800, 900, 1000 and 1200 and did
  // NOT at 700, because whether the zero-area edge touch is observed depends on
  // where the 100vh terminal leaves the card relative to the fold.
  //
  // Playwright defaults to 720, which sits in the band where the bug is
  // intermittent: with the fix reverted, three runs of this spec at the default
  // gave 2 passed, 2 passed, then 1 failed. A test that catches the regression
  // one time in three is not a guard, it is a coin toss that reads like one.
  test.use({ viewport: { width: 1280, height: 900 } });

  // Both routes. The bug was reported on the FINNISH page, and the whole point
  // of the failure was a layout geometry rather than any logic, so proving it on
  // /contact alone would be testing the locale nobody complained about. The
  // component is shared, which is the reason to check rather than to assume.
  for (const route of ['/contact', '/fi/contact']) {
    test(`${route}: survives load and retires only once the box is on screen`, async ({
      page,
    }) => {
      await page.goto(route);
      const hint = page.locator('[data-shoutbox-hint]');
      const card = page.locator('.shoutbox__card');

      // The card must genuinely start below the fold, or this proves nothing: a
      // card already on screen SHOULD retire the hint immediately.
      const visiblePx = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      });
      expect(visiblePx).toBeLessThanOrEqual(0);

      await expect(hint).not.toHaveClass(/shoutbox__scroll-hint--done/);
      await expect(hint).toHaveCSS('opacity', '1');

      // And it still does its one job: pointed at, then gone.
      await card.scrollIntoViewIfNeeded();
      await expect(hint).toHaveClass(/shoutbox__scroll-hint--done/);
    });
  }
});

test.describe('shoutbox: the published snapshot', () => {
  const snapshotPath = fileURLToPath(new URL('../public/data/shoutbox.json', import.meta.url));

  /**
   * An ABSENT file is the normal state until the first message is approved, and
   * it is how this repo shipped for months. Reading it unguarded would turn that
   * into an ENOENT crash rather than a skip, so this matches what
   * `scripts/validate-shoutbox.mjs` already does with the same missing file.
   */
  function committedThreads(): { body: string }[] | null {
    let raw: string;
    try {
      raw = readFileSync(snapshotPath, 'utf-8');
    } catch {
      return null;
    }
    const parsed = JSON.parse(raw) as { threads?: { body: string }[] };
    return parsed.threads ?? [];
  }

  test('every committed thread reaches the page', async ({ page }) => {
    const committed = committedThreads();
    test.skip(committed === null || committed.length === 0, 'nothing published yet');

    await page.goto('/contact');
    const threads = page.locator('.shoutbox__thread:not(.shoutbox__thread--pending)');
    await expect(threads).toHaveCount(committed?.length ?? 0);

    // Bodies too, not just the count: a file that parses while `renderThread`
    // reads the wrong field would still produce the right number of elements.
    // Asserted per position with exact text — `hasText` is a case-insensitive
    // SUBSTRING match, so a short message could be satisfied by a longer one and
    // the wrong-field bug would slip through the very check meant to catch it.
    for (const [index, thread] of (committed ?? []).entries()) {
      await expect(threads.nth(index).locator('.shoutbox__body').first()).toHaveText(thread.body);
    }
    await expect(page.locator('[data-shoutbox-empty]')).toBeHidden();
  });
});

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

  test('a queued message is echoed back, survives a reload, and is not published', async ({
    page,
  }) => {
    await primeShoutboxBackend(page, { accepted: true });

    const form = page.locator('[data-shoutbox-form]');
    await form.scrollIntoViewIfNeeded();
    const body = 'Pending echo e2e message.';
    await page.locator('[data-shoutbox-input]').fill(body);
    await page.locator('[data-shoutbox-send]').click();

    // The point of the feature: the visitor can still see WHAT they sent. The
    // status line alone said only that something worked.
    const pending = page.locator('.shoutbox__thread--pending');
    await expect(pending).toHaveCount(1);
    await expect(pending).toContainText(body);
    // Marked as unpublished, in the same words the status line uses.
    await expect(pending.locator('.shoutbox__pending-badge')).toHaveText('waiting for approval');

    // It is in THIS browser only. Nothing about accepting a submission may put
    // text on the published surface (ADR 0017), so the snapshot the CDN serves
    // must be untouched.
    const snapshot = await page.evaluate(async () => {
      const res = await fetch('/data/shoutbox.json');
      return res.ok ? await res.text() : null;
    });
    expect(snapshot === null || !snapshot.includes(body)).toBe(true);

    // Persisted: the moderation round takes days, so an echo that vanished on
    // reload would answer "did that send?" only for as long as nobody navigated.
    await page.reload();
    await page.locator('[data-shoutbox-threads]').scrollIntoViewIfNeeded();
    const afterReload = page.locator('.shoutbox__thread--pending');
    await expect(afterReload).toHaveCount(1);
    await expect(afterReload).toContainText(body);
  });

  test('the echo stops claiming to be pending once the message is published', async ({
    page,
  }) => {
    await primeShoutboxBackend(page, { accepted: true });

    const form = page.locator('[data-shoutbox-form]');
    await form.scrollIntoViewIfNeeded();
    // Trailing whitespace on purpose. The server publishes its own stripped
    // form and never tells the browser what it was, so comparing raw text would
    // leave this echo up beside the published copy of itself.
    const typed = 'A message that later gets published.  ';
    const published = 'A message that later gets published.';
    await page.locator('[data-shoutbox-input]').fill(typed);
    await page.locator('[data-shoutbox-send]').click();
    await expect(page.locator('.shoutbox__thread--pending')).toHaveCount(1);

    // Now the owner has approved, published and committed. The snapshot the CDN
    // serves contains the message, so the local echo has nothing left to say.
    await page.route('**/data/shoutbox.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          generated_at: '2026-08-06T00:00:00Z',
          // `count` is required and must equal threads.length: parseSnapshot
          // rejects the whole file otherwise, which is how a truncated write
          // degrades to the empty box.
          count: 1,
          threads: [{ id: 1, body: published, at: '2026-08-06T00:00:00Z', reply: null }],
        }),
      }),
    );
    await page.reload();
    await page.locator('[data-shoutbox-threads]').scrollIntoViewIfNeeded();

    await expect(page.locator('.shoutbox__thread')).toHaveCount(1);
    await expect(page.locator('.shoutbox__thread--pending')).toHaveCount(0);
    await expect(page.locator('.shoutbox__body')).toHaveText(published);
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

/**
 * The research listing, checked as a route rather than as a component.
 *
 * `papers.test.ts` already proves the data is sound and that the page derives
 * its list from it. What that cannot see is whether the page is actually
 * reachable and renders in both locales, which is the entire point of the page:
 * the papers were sound before too, they were just unreachable.
 */
test.describe('research index', () => {
  test('lists every paper with a working PDF link, newest first', async ({ page }) => {
    await page.goto('/research');

    const links = page.locator('a[href$=".pdf"]');
    const count = await links.count();
    // Ten research papers today; asserted as a floor so adding one does not
    // fail the suite, but a page that rendered an empty list would.
    expect(count).toBeGreaterThanOrEqual(10);

    // Every link resolves. A listing that 404s is worse than no listing: the
    // visitor now believes the document is gone rather than hidden.
    const first = links.first();
    const href = await first.getAttribute('href');
    expect(href).toBeTruthy();
    const res = await page.request.get(href!);
    expect(res.status(), `${href} did not serve`).toBe(200);

    // Descending. The dates are machine-readable exactly so this is checkable
    // rather than a claim in the lede.
    // Scoped to the listing's own class. `time[datetime]` page-wide happens to
    // match only these eleven today, so the assertion would have kept passing
    // while silently also ranking a footer or byline date.
    const dates = await page.locator('.research__date[datetime]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('datetime') ?? ''),
    );
    expect(dates.length).toBeGreaterThanOrEqual(10);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  // A DEFAULT CONTEXT CANNOT TEST A FINNISH ROUTE. BaseLayout redirects a
  // browser to the locale its `navigator.languages` asks for, and says so in a
  // comment that ends "Set the context locale instead". The first version of the
  // case below did not, so it opened /fi/research, was moved to /research, and
  // asserted that the ENGLISH page had a heading and a PDF link. It passed for
  // weeks while checking nothing about Finnish.
  test.describe('in a Finnish browser', () => {
    test.use({ locale: 'fi-FI' });

    test('renders the Finnish listing, and stays on it', async ({ page }) => {
      await page.goto('/fi/research');
      await expect(page).toHaveURL(/\/fi\/research$/);
      // Assert the CONTENT is Finnish, not merely that a heading exists: the
      // English page has a heading too, which is how the old case passed.
      await expect(page.locator('h1')).toHaveText(/Tutkimus/);
      await expect(page.locator('a[href$=".pdf"]').first()).toBeVisible();
    });
  });
});

/**
 * The reader routes exist and carry the document.
 *
 * `paper-body.test.mjs` proves the resolution and the HTML. What it cannot see
 * is whether Astro emitted the pages: the first build of this feature produced
 * zero reader routes, reported success, and only the page count in the log said
 * otherwise. This asserts the count from the outside.
 */
test.describe('research reader', () => {
  test('a paper page renders the document, not a summary of it', async ({ page }) => {
    await page.goto('/research/study');
    // The listing summary is one line; the document is thousands of words. A
    // length floor is the cheap way to catch a page that rendered the wrong one.
    const body = page.locator('.paper__body');
    await expect(body).toBeVisible();
    expect((await body.innerText()).length).toBeGreaterThan(3000);

    // Exactly one h1: the page's title. The document's own leading heading is
    // stripped, and a second one is both a duplicate and an a11y fault.
    await expect(page.locator('h1')).toHaveCount(1);

    // The measurement tables are the reason to read these at all.
    expect(await page.locator('.paper__body table').count()).toBeGreaterThan(0);
  });

  test('every Read link on the listing resolves', async ({ page }) => {
    await page.goto('/research');
    const reads = page.locator('.research__read');
    const count = await reads.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i += 1) {
      const href = await reads.nth(i).getAttribute('href');
      const res = await page.request.get(href!);
      expect(res.status(), `${href} did not serve`).toBe(200);
    }
  });

  test('the English route carries no Finnish notice', async ({ page }) => {
    await page.goto('/research/study');
    await expect(page.locator('.paper__notice')).toHaveCount(0);
  });

  test.describe('in a Finnish browser', () => {
    test.use({ locale: 'fi-FI' });

    test('the Finnish route serves the English body with Finnish chrome', async ({
      page,
    }) => {
      await page.goto('/fi/research/study');
      // Without the locale context above, BaseLayout moves the browser to the
      // English page and every assertion below silently measures that instead.
      await expect(page).toHaveURL(/\/fi\/research\/study$/);
      // The explanation must be there: an unexplained wall of English on a
      // Finnish route reads as a broken translation rather than a decision.
      await expect(page.locator('.paper__notice')).toBeVisible();
      await expect(page.locator('.paper__body')).toBeVisible();
      await expect(page.locator('.paper__back a')).toHaveText(/Kaikki tutkimukset/);
    });
  });

  test('a companion page says so, and a full one does not', async ({ page }) => {
    // The label is the whole difference between an introduction and a
    // misrepresentation, so it is asserted on both sides rather than just the
    // side that carries the notice.
    await page.goto('/research/blindtest');
    await expect(page.locator('.paper__notice--companion')).toBeVisible();
    await expect(page.locator('.paper__body')).toBeVisible();

    await page.goto('/research/study');
    await expect(page.locator('.paper__notice--companion')).toHaveCount(0);
  });

  test('the listing distinguishes Read from About before the click', async ({ page }) => {
    await page.goto('/research');
    // Whitespace-tolerant: the Astro template leaves newlines inside the anchor,
    // so an anchored /^Read$/ matches nothing.
    const read = page.locator('.research__read', { hasText: /^\s*Read\s*$/ });
    const about = page.locator('.research__read', { hasText: /^\s*About\s*$/ });
    expect(await read.count(), 'no full readers').toBeGreaterThanOrEqual(7);
    expect(await about.count(), 'no companion pages').toBeGreaterThanOrEqual(3);
    // The companion papers specifically must not be offered as full reads.
    for (const id of ['blindtest', 'translations', 'finnish']) {
      await expect(page.locator(`a[href$="/research/${id}"]`)).toHaveText('About');
    }
  });

  test('a paper with no in-repo source offers no reader link', async ({ page }) => {
    // blindtest and translations exist here only as condensed copies, so the
    // listing must not offer a Read link that would render a summary as the
    // document. Named rather than counted: `reads < total` also passes for the
    // wrong reasons and would FAIL the day the remaining papers get sources,
    // which is progress and should not read as a regression.
    // `catalog` is generated from JSON and has no prose at all, so it gets no
    // page. This case named blindtest and translations until they became
    // companion pages; the property is unchanged, the paper it applies to moved.
    await page.goto('/research');
    await expect(
      page.locator('a[href$="/research/catalog"]'),
      'the catalog is generated from JSON and has no prose to introduce',
    ).toHaveCount(0);
    // Guards the guard: if the listing stopped rendering links entirely, the
    // assertion above would pass while the feature was gone.
    expect(await page.locator('.research__read').count()).toBeGreaterThanOrEqual(10);
  });
});

/**
 * The nav bar on a narrow phone.
 *
 * Six links plus EN/FI do not fit a 360px viewport, and the plan that first
 * added `/research` left it out of the nav for exactly that reason. The CSS had
 * already solved it — the row scrolls under 600px — but "it scrolls" was an
 * assumption read off a stylesheet, not a measured fact, and the failure it
 * guards against (an item clipped out of reach) is invisible on a desktop run.
 */
test.describe('site nav: narrow phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('every link is reachable, none clipped out of reach', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('.site-nav > ul');
    await expect(row).toBeVisible();

    const links = page.locator('.site-nav__link');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(6);

    // The row must actually be scrollable, otherwise the overflow is clipped
    // rather than reachable and the last items are simply gone.
    const { scrollWidth, clientWidth } = await row.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // And the last one can be brought into view and clicked.
    const last = links.nth(count - 1);
    await last.scrollIntoViewIfNeeded();
    const box = await last.boundingBox();
    expect(box, 'the last nav link has no box').not.toBeNull();
    expect(box!.width, 'the last nav link is collapsed to nothing').toBeGreaterThan(20);
  });
});
