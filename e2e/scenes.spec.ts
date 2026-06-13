import { test, expect } from '@playwright/test';

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
  {
    path: '/contact',
    name: 'contact',
    primary: '.terminal, [class*="terminal"]',
    expectCanvas: false,
  },
];

for (const p of PAGES) {
  test(`${p.name} (${p.path}) boots without console/page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Network resource errors aren't scene-boot failures. The notable one is
      // `astro preview`'s strict trailing-slash 404 on the prefetched /fi//sv/
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
