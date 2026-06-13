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
    reducedMotion: 'no-preference', // exercise the full animated/WebGL path
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
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
