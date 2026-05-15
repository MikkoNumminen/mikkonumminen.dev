import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  // `.claude/` holds local agent scratch (worktrees, etc.) — gitignored,
  // never reaches CI. Listing it here keeps `npm run lint` locally honest
  // about what the codebase actually contains.
  { ignores: ['dist/', '.astro/', 'node_modules/', '.vercel/', '.claude/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
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
