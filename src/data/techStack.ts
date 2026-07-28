/**
 * The technology stack shown at the end of `/experience`.
 *
 * Two levels, never three. A primary is something worth naming on its own; a
 * secondary only makes sense underneath its primary, and stays hidden until
 * the primary is opened. That hierarchy is what stops a stack list reading as
 * padding: `num2words` does not sit beside `TypeScript` competing for the same
 * attention, it sits under Python as evidence of what the Python work involved.
 *
 * `context` records where a technology was actually used. `own` is the default
 * and is omitted, because self-built production is the norm here; `work` and
 * `both` are marked. The badge carries that distinction, not colour, so it
 * survives a colourblind reader, a screen reader and a printout.
 *
 * Every name below is sourced, not remembered. The primary source is each
 * project's own repository — its package.json, requirements.txt, pyproject,
 * .csproj or Cargo.toml — read from disk rather than from this site's
 * description of it. That direction matters: `projects.ts` is a hand-maintained
 * summary and had drifted, so deriving the box from it alone made the box
 * inherit its gaps (Neon, framer-motion, axum, the Anthropic SDK in HRM).
 *
 * Supplementary sources, for what a manifest cannot say:
 *   - the Kasvu Labs card in `src/i18n/locales/en.ts`, for the `work` marks
 *   - `content/cv.md`, for capabilities named in prose rather than in a dep
 *   - AudiobookMaker's `engine_installer.py`, because the TTS engines install
 *     into per-engine venvs and never appear in the top-level requirements
 *
 * A few primaries are groupings rather than products — Text-to-speech,
 * Retrieval, Testing, Observability, Packaging, Unattended runs. Nothing real
 * sits above those secondaries, and inventing a parent beat promoting five leaf
 * tools to the same weight as PostgreSQL.
 *
 * Everything in the twelve projects' `tech` arrays appears here except
 * `Markdown`, which is a file format rather than a skill.
 */

import type { Translations } from '../i18n/types';

/**
 * Derived from the translation keys rather than restated, so a category here
 * with no string there (or the reverse) is a compile error, not a heading that
 * silently renders its own id.
 */
export type TechCategoryId = keyof Translations['techStack']['categories'];

/** Where a technology was used. Absent means `own`. */
export type TechContext = 'work' | 'own' | 'both';

export interface TechItem {
  /** Never translated. */
  name: string;
  /** Omitted for `own`, which is the default and renders without a badge. */
  context?: TechContext;
}

export interface PrimaryTech extends TechItem {
  /** Revealed by opening the primary. Secondaries never nest further. */
  secondaries?: TechItem[];
}

export interface TechCategory {
  id: TechCategoryId;
  primaries: PrimaryTech[];
}

export const techStack: TechCategory[] = [
  {
    id: 'languages',
    primaries: [
      { name: 'TypeScript', context: 'both', secondaries: [{ name: 'Zod' }] },
      {
        name: 'Python',
        secondaries: [
          { name: 'PyTorch' },
          { name: 'PyMuPDF' },
          { name: 'ebooklib' },
          { name: 'ocrmypdf' },
          { name: 'Tesseract' },
          { name: 'num2words' },
          { name: 'pydub' },
          { name: 'pygame' },
          { name: 'ffmpeg' },
          { name: 'CustomTkinter' },
          { name: 'Pillow' },
          { name: 'beautifulsoup4' },
          { name: 'PyYAML' },
        ],
      },
      {
        name: 'C#',
        secondaries: [
          { name: '.NET 8' },
          { name: 'ASP.NET Core' },
          { name: 'Razor Pages' },
          { name: 'ASP.NET Identity' },
          { name: 'EF Core' },
          { name: 'HtmlSanitizer' },
        ],
      },
      {
        name: 'Rust',
        secondaries: [
          { name: 'Tokio' },
          { name: 'axum' },
          { name: 'tower' },
          { name: 'serde' },
          { name: 'clap' },
          { name: 'WebAssembly' },
          { name: 'wasm-bindgen' },
          { name: 'Argon2id' },
          { name: 'XChaCha20-Poly1305' },
          { name: 'getrandom' },
          { name: 'sha2' },
          { name: 'reqwest' },
          { name: 'zeroize' },
          { name: 'secrecy' },
          { name: 'subtle' },
        ],
      },
      { name: 'JavaScript', context: 'both' },
      { name: 'Bash' },
    ],
  },
  {
    id: 'frontend',
    primaries: [
      {
        name: 'React',
        context: 'both',
        secondaries: [
          { name: 'Next.js', context: 'both' },
          { name: 'MUI', context: 'both' },
          { name: 'Recharts', context: 'work' },
          { name: 'ReactFlow' },
          { name: 'dagre' },
          { name: 'framer-motion' },
          { name: 'next-intl' },
        ],
      },
      { name: 'Astro' },
      {
        name: 'Three.js',
        secondaries: [{ name: 'GSAP' }, { name: 'postprocessing' }],
      },
      { name: 'Phaser 4' },
      {
        name: 'Web Audio API',
        secondaries: [{ name: 'Strudel' }],
      },
      {
        name: 'Tailwind CSS',
        secondaries: [{ name: 'Bootstrap 5' }],
      },
      { name: 'Chrome Extension (MV3)' },
    ],
  },
  {
    id: 'backend',
    primaries: [
      {
        name: 'PostgreSQL',
        context: 'both',
        secondaries: [
          { name: 'Prisma' },
          { name: 'PgTyped', context: 'work' },
          { name: 'Kysely' },
          { name: 'Neon' },
          { name: 'pgvector' },
          { name: 'pg-boss' },
        ],
      },
      {
        name: 'Node.js',
        context: 'both',
        secondaries: [{ name: 'Pino' }],
      },
      {
        name: 'Authentication',
        secondaries: [
          { name: 'NextAuth' },
          { name: 'Google OAuth' },
          { name: 'TOTP 2FA' },
        ],
      },
      { name: 'MongoDB' },
      { name: 'SQLite' },
      {
        name: 'FastAPI',
        secondaries: [{ name: 'uvicorn' }, { name: 'asyncpg' }, { name: 'httpx' }],
      },
    ],
  },
  {
    id: 'ai',
    primaries: [
      {
        name: 'Claude Code',
        secondaries: [
          { name: 'Claude Opus' },
          { name: 'Claude Sonnet' },
          { name: 'Claude Haiku' },
          { name: 'ccusage' },
        ],
      },
      {
        name: 'Ollama',
        secondaries: [
          { name: 'Poro 2 8B' },
          { name: 'qwen2.5' },
          { name: 'OllamaSharp' },
        ],
      },
      { name: 'Anthropic API' },
      {
        name: 'Text-to-speech',
        secondaries: [
          { name: 'Edge-TTS' },
          { name: 'Piper' },
          { name: 'Chatterbox' },
          { name: 'VoxCPM2' },
          { name: 'Qwen VoiceDesign' },
        ],
      },
      {
        name: 'Retrieval',
        secondaries: [
          { name: 'fastembed' },
          { name: 'bge-small-en-v1.5' },
          { name: 'lingua' },
        ],
      },
      { name: 'Microsoft.Extensions.AI' },
    ],
  },
  {
    id: 'platform',
    primaries: [
      { name: 'Docker' },
      { name: 'Kubernetes', context: 'work' },
      {
        name: 'Azure',
        context: 'both',
        secondaries: [
          { name: 'App Service' },
          { name: 'Static Web Apps' },
          { name: 'Functions' },
        ],
      },
      { name: 'Vercel' },
      {
        name: 'GitHub Actions',
        secondaries: [{ name: 'CodeQL' }],
      },
      {
        name: 'Testing',
        context: 'both',
        secondaries: [
          { name: 'Jest' },
          { name: 'Vitest' },
          { name: 'Playwright' },
          { name: 'pytest' },
          { name: 'xUnit' },
          { name: 'Stryker' },
          { name: 'jest-axe' },
        ],
      },
      {
        name: 'Linting & types',
        secondaries: [
          { name: 'ESLint' },
          { name: 'Prettier' },
          { name: 'ruff' },
          { name: 'mypy' },
          { name: 'Husky' },
        ],
      },
      {
        name: 'Observability',
        secondaries: [
          { name: 'OpenTelemetry' },
          { name: 'Sentry' },
          { name: 'web-vitals' },
        ],
      },
      {
        name: 'Packaging',
        secondaries: [{ name: 'PyInstaller' }, { name: 'Inno Setup' }],
      },
      {
        name: 'Unattended runs',
        secondaries: [{ name: 'launchd' }, { name: 'Task Scheduler' }, { name: 'tmux' }],
      },
      { name: 'Turborepo' },
      { name: 'Tailscale Funnel' },
    ],
  },
];
