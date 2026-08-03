import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end scene smoke tests. The product is WebGL/GSAP, which jsdom can't
 * run, so unit gates can't verify the visual layer boots — these do: load each
 * page in a real (headless) browser and assert it mounts without errors.
 *
 * The browser runs with SwiftShader so WebGL works headless in CI (no GPU).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    // The browser default is prefers-reduced-motion: no-preference, so the
    // scenes run their full animated/WebGL path (no explicit emulation needed).
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],
  // The suite BUILDS the site it serves, rather than serving whatever `dist/`
  // happens to hold, because one build-time variable decides how much of the
  // product exists at all.
  //
  // `PUBLIC_CHAT_API_URL` is read at build time (src/lib/terminal/chat.ts). With
  // it unset, `getChatBaseUrl()` is compiled to a hard `null`, the shoutbox's
  // write form can never unhide, and the two tests covering the site's only
  // public write endpoint had nothing to run against — they skipped on every CI
  // run while the suite reported green. Production is built with `/api/rag`
  // (ADR 0012 / LAUNCH.md), so an e2e build without it was also measuring a
  // configuration that is never shipped.
  //
  // It is set HERE rather than in the workflow so a local `npm run test:e2e`
  // and CI build the same artifact — an env var living only in the YAML would
  // put every local run back on the skipping build. `env` is also the portable
  // way to do it: `VAR=value cmd` in an npm script is not valid on Windows.
  //
  // Nothing here reaches the real backend: every spec stubs `/health` itself
  // (e2e/support/chat-backend.ts).
  webServer: {
    command: 'npm run build && npm run preview',
    env: { PUBLIC_CHAT_API_URL: '/api/rag' },
    url: 'http://localhost:4321',
    // Locally this means an already-running `npm run preview` is reused AS IS —
    // including a `dist/` built without the variable, which surfaces as the
    // shoutbox tests failing on a hidden form. Stop the stray server and re-run.
    reuseExistingServer: !process.env.CI,
    // Covers the build as well as the server start now, so it is the full
    // `prebuild` + `astro build` budget rather than just `astro preview`'s.
    timeout: 300_000,
  },
});
