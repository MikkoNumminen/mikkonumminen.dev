import { test, expect } from '@playwright/test';
import { stubChatHealth } from './support/chat-backend';

// Boot smoke for the four visual worlds. The unit gates can't touch the WebGL
// layer (jsdom has no GL context), so this is the verification that the scenes
// actually mount in a real browser: each page loads, its primary surface
// appears, and — the highest-signal assertion — nothing throws or logs an
// error (a WebGL/init failure surfaces as a console error or a pageerror).

interface PageCase {
  path: string;
  name: string;
  /** A selector that must be present once the page is up. */
  primary: string;
  /** Whether a <canvas> (WebGL scene) is expected to mount. */
  expectCanvas: boolean;
}

const PAGES: PageCase[] = [
  { path: '/', name: 'home', primary: 'canvas', expectCanvas: true },
  { path: '/projects', name: 'projects', primary: 'canvas', expectCanvas: true },
  { path: '/experience', name: 'experience', primary: 'main', expectCanvas: false },
  { path: '/research', name: 'research', primary: 'main', expectCanvas: false },
  {
    path: '/contact',
    name: 'contact',
    primary: '.terminal, [class*="terminal"]',
    expectCanvas: false,
  },
];

// The suite's build bakes in a chat backend URL, so /contact probes `/health`
// the moment it mounts and `astro preview` has nothing to answer with. Pin the
// answer instead of letting a 404 decide it: `llm: false` is the state this
// smoke has always measured (no chat affordance, no shoutbox form), so the four
// assertions below keep meaning exactly what they meant before — they just no
// longer depend on an unserved route timing out. Applied to every page rather
// than only /contact because "which pages talk to the backend" is a detail this
// file shouldn't have to track.
test.beforeEach(async ({ page }) => {
  await stubChatHealth(page, { llm: false });
});

for (const p of PAGES) {
  test(`${p.name} (${p.path}) boots without console/page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Network resource errors aren't scene-boot failures. The notable one is
      // `astro preview`'s strict trailing-slash 404 on the prefetched /fi/
      // locale alternates (Vercel redirects these in prod). We only fail on
      // genuine JS errors; a WebGL/init failure surfaces as a pageerror below.
      if (text.includes('Failed to load resource')) return;
      errors.push(`console.error: ${text}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    const response = await page.goto(p.path, { waitUntil: 'load' });
    expect(response?.ok(), `${p.path} should respond 2xx`).toBe(true);

    // Several scenes defer their WebGL import until the first interaction; nudge
    // it, then give the dynamic import + scene construction a beat to land.
    await page.mouse.move(300, 300);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(3000);

    await expect(page.locator(p.primary).first()).toBeVisible();

    if (p.expectCanvas) {
      const box = await page.locator('canvas').first().boundingBox();
      expect(box?.width ?? 0, 'canvas should have a non-zero width').toBeGreaterThan(0);
      expect(box?.height ?? 0, 'canvas should have a non-zero height').toBeGreaterThan(0);
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
}

/**
 * The closing card must stay the first thing in the timeline.
 *
 * It is the page's top box: the anchor target of "skip to the tech stack", the
 * only entry without a slide-in reveal, and the element `scroll-margin-top`
 * is tuned against. Anything added to this view belongs BELOW it, and a
 * comment in the markup is not an enforcement — this is.
 *
 * Asserted on DOM order rather than a CSS `order` override on purpose: DOM
 * order is what also fixes reading order and focus order, so keeping the
 * three aligned is the property worth pinning. A future box inserted above
 * this card fails here, which is the signal to move it down.
 */
test('the technology card is the first timeline entry', async ({ page }) => {
  await page.goto('/experience');
  await page.waitForLoadState('load');

  const entries = page.locator('.timeline__list .timeline__entry');
  await expect(entries.first()).toHaveClass(/timeline__entry--tech/);

  // And it is the only one: a second copy would make "first" ambiguous.
  await expect(page.locator('.timeline__entry--tech')).toHaveCount(1);

  // It sits in the `now` slot, which is the top of the climb.
  await expect(entries.first()).toHaveAttribute('data-kind', 'now');
});
