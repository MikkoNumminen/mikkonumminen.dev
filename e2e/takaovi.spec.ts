import { test, expect, type Page } from '@playwright/test';
import { stubChatHealth, stubChatAnswer, stubSessionReset } from './support/chat-backend';
import { takaoviCopy } from '../src/data/takaovi';

// /takaovi is shared by direct link to Asuntokanava staff on their phones, and
// the fi-FI locale is deliberate: it proves the page is NOT bounced by
// BaseLayout's pre-paint language-redirect script, which only runs on pages
// that import BaseLayout (StandaloneLayout does not). A default (English)
// context would never exercise that gate at all.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'fi-FI',
});

/** Collects browser console errors and uncaught page errors for a load. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('/takaovi on a phone', () => {
  test('renders in Finnish, five questions, no overflow, no console errors', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await stubChatHealth(page, { llm: true });

    await page.goto('/takaovi');

    // BaseLayout would have moved a fi-FI context off an unprefixed route
    // that has no /fi/ twin; StandaloneLayout must not.
    expect(page.url()).toMatch(/\/takaovi$/);

    await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', 'noindex, nofollow');

    await expect(page.locator('h1')).toBeVisible();

    const questions = page.locator('[data-question]');
    await expect(questions).toHaveCount(5);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(overflow, 'the page overflows horizontally on a 390px phone').toBe(true);

    expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('/takaovi: asking a question', () => {
  test('streams an answer with source labels, and posts the right body', async ({
    page,
  }) => {
    await stubChatHealth(page, { llm: true });
    const question = takaoviCopy.questions[0];
    if (!question) throw new Error('takaoviCopy.questions is empty');
    const { requests } = await stubChatAnswer(page, {
      answer: 'Mikko rakentaa tekoälyavusteisia web-sovelluksia.',
      sources: [
        { source: 'cv.md', title: 'CV' },
        { source: 'posts/a.md', title: 'Blogi A' },
      ],
    });

    await page.goto('/takaovi');
    await page.locator('[data-question]').first().click();

    const log = page.locator('[data-log]');
    await expect(log).toContainText('Mikko rakentaa tekoälyavusteisia web-sovelluksia.');
    await expect(log.locator('.tk-source')).toHaveText(['CV', 'Blogi A']);

    // The polite live region announces the finished answer once done.
    const live = page.locator('[data-live]');
    await expect(live).toContainText('Mikko rakentaa tekoälyavusteisia web-sovelluksia.');

    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0]?.json as object).sort()).toEqual([
      'message',
      'session_id',
    ]);
    expect((requests[0]?.json as { message: string }).message).toBe(question);
  });

  test('a 429 shows the Finnish rate-limit error with a working retry', async ({
    page,
  }) => {
    await stubChatHealth(page, { llm: true });
    await stubChatAnswer(page, { answer: '', status: 429 });

    await page.goto('/takaovi');
    await page.locator('[data-question]').first().click();

    const alert = page.locator('[role="alert"]');
    await expect(alert).toContainText(takaoviCopy.errors['rate-limited'].title);
    const retry = page.locator('[data-retry]');
    await expect(retry).toHaveText(takaoviCopy.retry);

    // The backend recovers before the visitor retries.
    await stubChatAnswer(page, { answer: 'Vastaus toisella yrityksellä.' });
    await retry.click();

    const log = page.locator('[data-log]');
    await expect(log).toContainText('Vastaus toisella yrityksellä.');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('shows the down notice on a dead LLM check, but asking still works', async ({
    page,
  }) => {
    await stubChatHealth(page, { llm: false });
    await stubChatAnswer(page, { answer: 'Vastaus siitä huolimatta.' });

    await page.goto('/takaovi');
    await expect(page.locator('[data-notice]')).toContainText(
      takaoviCopy.notices.down.title,
    );

    await page.locator('[data-question]').first().click();
    await expect(page.locator('[data-log]')).toContainText('Vastaus siitä huolimatta.');
  });

  test('"Aloita alusta" appears only after the first answer, and resets once', async ({
    page,
  }) => {
    await stubChatHealth(page, { llm: true });
    await stubChatAnswer(page, { answer: 'Ensimmäinen vastaus.' });
    const { requests } = await stubSessionReset(page);

    await page.goto('/takaovi');
    const restart = page.locator('[data-restart]');
    await expect(restart).toBeHidden();

    await page.locator('[data-question]').first().click();
    await expect(page.locator('[data-log]')).toContainText('Ensimmäinen vastaus.');
    await expect(restart).toBeVisible();

    await restart.click();
    await expect(page.locator('[data-log]')).toBeEmpty();
    // The reset POST leaves after the thread clears and is recorded by the
    // route handler asynchronously, so a single read can race a slow runner.
    await expect.poll(() => requests.length).toBe(1);
  });
});

test.describe('/takaovi: touch targets', () => {
  test('every visible button and the textarea clears the 44x44 CSS px floor', async ({
    page,
  }) => {
    await stubChatHealth(page, { llm: true });
    await page.goto('/takaovi');

    const controls = page.locator('button:visible, textarea:visible');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await controls.nth(i).boundingBox();
      expect(box, `control ${i} has no box`).not.toBeNull();
      expect(box!.width, `control ${i} is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `control ${i} is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('/takaovi: sitemap', () => {
  test('is excluded from the sitemap', async ({ page }) => {
    const res = await page.request.get('/sitemap-0.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    const locs = [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    const takaoviEntries = locs.filter((loc) => loc?.endsWith('/takaovi'));
    expect(
      takaoviEntries,
      // The blog post about working at Takaovi shares the company name in its
      // slug but is a different URL entirely and must stay listed.
      'the sitemap must not list /takaovi',
    ).toEqual([]);
    expect(locs.some((loc) => loc?.endsWith('/ai-product-engineer-at-takaovi'))).toBe(
      true,
    );
  });
});
