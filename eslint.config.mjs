import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  // `.claude/` and `.local/` are gitignored local scratch: agent worktrees in
  // one, TTS generation and eval bundles in the other. Neither reaches CI, and
  // their contents differ per machine, so linting them can only ever fail where
  // CI says green. That is the wrong way round — it trains you to read past the
  // word `error`. (`.local/blog-tts/generate.mjs` did exactly that for days: it
  // is a Node script living outside the `scripts/**` glob below, so `console`
  // was undefined and `npm run lint` exited 1 on every local run.)
  //
  // `content/code/` is curated third-party project source indexed by the RAG
  // backend — it is corpus data, not this site's code, so it is excluded from
  // lint/format/typecheck (it has its own repos' deps, styles, and rules).
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
    files: [
      'scripts/**/*.{js,mjs,cjs,ts}',
      'api/**/*.{js,mjs,cjs,ts}',
      '*.config.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
];
