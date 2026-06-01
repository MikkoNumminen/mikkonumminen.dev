import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom gives us a browser-like environment for tests that touch DOM APIs.
    // Pure-logic tests (i18n, data) don't need it, but it's cheap to have and
    // saves per-file environment overrides when we add component tests later.
    environment: 'jsdom',

    // No globals — always import { describe, it, expect } from 'vitest'.
    // Explicit imports keep the surface clear and avoid name collisions with
    // Vitest's own internal symbols.
    globals: false,

    include: ['src/**/*.test.ts', 'src/**/*.test.mts', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules', 'dist', '.astro'],

    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/lib/**/*.mjs'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'scripts/**/*.test.mjs'],
    },
  },
});
