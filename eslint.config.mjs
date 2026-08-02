import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  // `.claude/` holds local agent scratch (worktrees, etc.) — gitignored,
  // never reaches CI. Listing it here keeps `npm run lint` locally honest
  // about what the codebase actually contains.
  // `content/code/` is curated third-party project source indexed by the RAG
  // backend — it is corpus data, not this site's code, so it is excluded from
  // lint/format/typecheck (it has its own repos' deps, styles, and rules).
  //
  // `.local/` is gitignored scratch (TTS generation, eval bundles, study data).
  // It never reaches CI, so linting it could only ever fail on the developer's
  // machine and never on a PR — which is the wrong way round: it trains you to
  // ignore a red gate that CI says is green.
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      '.vercel/',
      '.claude/',
      '.local/',
      'content/code/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Error, not warn: the codebase already carries zero `any`, so this
      // enforces the discipline in CI (a warning would let one slip through a
      // green build). `unknown` + a narrowing guard is the intended escape
      // hatch — see parseRegistry in src/lib/terminal/skills.ts.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Node-side build/config files need Node globals (console, process, …).
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}', '*.config.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
