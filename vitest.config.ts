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
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'scripts/**/*.test.mjs',
        // WebGL / 2d-canvas / font-loader / scene-orchestration code that cannot
        // run in jsdom (no WebGL or canvas-2d context). These are verified by the
        // Playwright scene smoke tests instead; excluded here so the unit-coverage
        // threshold reflects the jsdom-testable surface rather than being dragged
        // toward ~12% by code the gates structurally can't exercise. Their pure
        // logic is extracted into tested helpers (planetNoise, responsiveLayout,
        // resolvePixelRatio, easing, …).
        'src/lib/three/homeScene.ts',
        'src/lib/three/projectsScene.ts',
        'src/lib/three/createRenderer.ts',
        'src/lib/three/textures.ts',
        'src/lib/three/field/buildParticleField.ts',
        'src/lib/three/field/nameTargets.ts',
        'src/lib/three/field/wordmarkTargets.ts',
        'src/lib/three/createGlowMaterial.ts',
        'src/lib/three/projects/buildPlanet.ts',
        'src/lib/three/projects/buildPlanetTexture.ts',
        'src/lib/three/projects/buildSun.ts',
      ],
      // Ratchet floor, re-anchored 2026-08-03. Not a vanity number — a
      // regression gate: it fails CI if the tested surface shrinks.
      //
      // Keep it CLOSE to measured. The floor had been left at 34 while actual
      // coverage reached 51.7%, which meant a third of the tested surface could
      // be deleted before CI noticed — a gate with that much slack reports
      // "passing" for a codebase that has quietly lost its tests. Measured now
      // is 60.66% statements / 60.58% lines / 61.89% branches / 64% functions
      // (after covering lifecycle.ts, the terminal command handlers, and the
      // skills renderer), so the floor sits ~2 points under each — enough to
      // absorb ordinary file-add churn without absorbing a real regression.
      //
      // Re-anchor whenever you add meaningful coverage — a stale floor is the
      // failure mode, not a strict one. Run via `npm run test:coverage`.
      thresholds: {
        lines: 58,
        statements: 58,
        functions: 62,
        branches: 59,
      },
    },
  },
});
