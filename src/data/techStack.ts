/**
 * The technology stack shown at the end of `/experience`.
 *
 * Two levels, never three. A primary is something worth naming on its own; a
 * secondary only makes sense underneath its primary, and stays hidden until
 * the primary is opened.
 *
 * `context` records where a technology was actually used. `own` is the default
 * and is omitted, because self-built production is the norm here; `work` and
 * `both` are marked. The badge carries that distinction, not colour, so it
 * survives a colourblind reader, a screen reader and a printout.
 *
 * Every name is sourced from the project's own repository — its package.json,
 * requirements.txt, pyproject, .csproj or Cargo.toml — read from disk rather
 * than from this site's description of it. Supplementary sources, for what a
 * manifest cannot say: the Kasvu Labs card in `src/i18n/locales/en.ts` for the
 * `work` marks, `content/cv.md` for capabilities named in prose, and
 * AudiobookMaker's `engine_installer.py`, because the TTS engines install into
 * per-engine venvs and never appear in the top-level requirements.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BAR FOR INCLUSION
 *
 * This list is curated, not exhaustive, and the curation is the point. A
 * hiring surface is judged by its weakest entry: a reader who finds `tmux` or
 * `Husky` here discounts the `XChaCha20-Poly1305` two rows up, because both
 * now look like they were transcribed from a lockfile.
 *
 * So a name earns its place only if it names a capability someone could
 * evaluate. Four things are excluded on principle, and the exclusions matter
 * more than the inclusions:
 *
 *   1. Model names. `Claude Opus`, `qwen2.5`, `bge-small-en-v1.5` — which
 *      model got called is not a skill, it dates instantly, and it reads as a
 *      subscription rather than an engineering decision. What was *built*
 *      around the models is listed instead.
 *   2. Commodity libraries every practitioner in that language already uses:
 *      serde and clap in Rust, PyYAML and Pillow in Python, a linter, a
 *      formatter, a git-hook runner.
 *   3. Implementation details of something already listed: uvicorn under
 *      FastAPI, tower under axum, dagre under ReactFlow.
 *   4. OS utilities and managed-hosting vendors. Scheduling a task and
 *      clicking a provisioning button are not differentiators. Shipping the
 *      installer that does the scheduling is one — which is why launchd and
 *      Task Scheduler sit under Packaging while tmux stays out.
 *
 * `src/data/techStack.test.ts` carries the list of technologies deliberately
 * omitted from `projects.ts`, so a genuinely new one still fails the test
 * while these stay out on purpose.
 * ─────────────────────────────────────────────────────────────────────────
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
      // One entry, not two. A separate `JavaScript` primary beside TypeScript
      // claims a second skill for the same one, but the bare word still has to
      // be findable by anyone scanning for it.
      {
        name: 'TypeScript / JavaScript',
        context: 'both',
        secondaries: [{ name: 'Zod' }],
      },
      {
        name: 'Python',
        secondaries: [
          { name: 'PyTorch' },
          { name: 'Demucs' },
          { name: 'librosa' },
          { name: 'WORLD' },
          { name: 'PyMuPDF' },
          { name: 'ebooklib' },
          { name: 'Tesseract' },
          { name: 'ffmpeg' },
          { name: 'CustomTkinter' },
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
        ],
      },
      // Trimmed to the crates that carry the security argument. A Cargo.toml
      // dump would bury Argon2id and XChaCha20-Poly1305 among nine utilities.
      {
        name: 'Rust',
        secondaries: [
          { name: 'Tokio' },
          { name: 'axum' },
          { name: 'Dioxus' },
          { name: 'zbus' },
          { name: 'WebAssembly' },
          { name: 'Argon2id' },
          { name: 'XChaCha20-Poly1305' },
          { name: 'zeroize' },
        ],
      },
      { name: 'Bash' },
      // Not a dotfile: claude-continue *generates* AppleScript — session
      // matching, string escaping, a busy guard on iTerm2's `is processing`
      // so a resume never types into a mid-flight turn — and runs it through
      // osascript. The language is the capability; the terminal being driven
      // is the secondary.
      {
        name: 'AppleScript',
        secondaries: [{ name: 'iTerm2 automation' }],
      },
    ],
  },
  {
    id: 'frontend',
    primaries: [
      // The framework behind five of the twelve projects and the paid client
      // work. It spent one release hidden as React's first child.
      {
        name: 'Next.js',
        context: 'both',
        secondaries: [{ name: 'NextAuth' }, { name: 'next-intl' }],
      },
      {
        name: 'React',
        context: 'both',
        secondaries: [
          { name: 'MUI', context: 'both' },
          { name: 'Recharts', context: 'work' },
          { name: 'ReactFlow' },
          { name: 'framer-motion' },
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
      { name: 'Tailwind CSS' },
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
          { name: 'pgvector' },
          { name: 'pg-boss' },
        ],
      },
      {
        name: 'Node.js',
        context: 'both',
        secondaries: [{ name: 'Pino' }],
      },
      { name: 'MongoDB' },
      { name: 'SQLite' },
      {
        name: 'FastAPI',
        secondaries: [{ name: 'asyncpg' }],
      },
    ],
  },
  {
    id: 'ai',
    primaries: [
      // The secondaries are the surface area actually built against, not the
      // models called. The counts behind them are real: 14 subagents in the
      // published claude-agents repo, 16 skills in claude-skills plus 7 scoped
      // to this repo, and 69 global permission rules.
      {
        name: 'Claude Code',
        secondaries: [
          { name: 'Subagents' },
          { name: 'Skills' },
          { name: 'Hooks' },
          { name: 'MCP' },
          { name: 'Plugins' },
          { name: 'Permission allowlists' },
          { name: 'Skill calibration' },
        ],
      },
      { name: 'Anthropic API' },
      { name: 'Ollama' },
      // Covers two separate systems, which is why it gathers items that also
      // live in their own categories. One is Python: pgvector and fastembed
      // behind FastAPI, hybrid dense + BM25 retrieval, a local GPU serving it
      // through a Tailscale funnel to a static site. The other is .NET, in the
      // retail feedback work sample, where grounding is enforced by validation
      // rather than by a vector store.
      //
      // Scattered across Backend, AI and Platform these read as unrelated
      // rows and nobody would assemble the architecture from them. A reader
      // scanning Backend should still find FastAPI there; a reader asking
      // "has he built RAG?" should get the whole answer in one place.
      {
        name: 'RAG',
        secondaries: [
          { name: 'pgvector' },
          { name: 'fastembed' },
          { name: 'BM25' },
          { name: 'lingua' },
          { name: 'FastAPI' },
          { name: 'Ollama' },
          { name: 'Tailscale Funnel' },
          { name: 'Microsoft.Extensions.AI' },
        ],
      },
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
      { name: 'Microsoft.Extensions.AI' },
    ],
  },
  {
    id: 'platform',
    primaries: [
      {
        name: 'Docker',
        // Compose is the orchestration surface, not a Docker flag: the RAG
        // stack is four services with a GPU device reservation and a one-shot
        // model pull the backend is healthcheck-gated behind.
        secondaries: [{ name: 'Docker Compose' }],
      },
      {
        name: 'Kubernetes',
        context: 'work',
        // The `work` badge is the client clusters. The Helm chart is HRM's
        // own — HPA, PDB, an existingSecret indirection — and claims chart
        // authoring, not a production deployment.
        secondaries: [{ name: 'Helm' }],
      },
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
        name: 'Observability',
        secondaries: [{ name: 'OpenTelemetry' }, { name: 'Sentry' }],
      },
      // Both halves of shipping a desktop tool, on both desktops: the build
      // (PyInstaller into a versioned .app bundle on macOS, an Inno Setup
      // installer on Windows) and the install (a launchd KeepAlive agent
      // whose baked PATH survives node upgrades, a schtasks registration
      // quoted for cmd.exe and CommandLineToArgvW in series). launchd and
      // Task Scheduler spent a release in the omitted list as OS utilities;
      // shipping their installers is what earned them back in.
      {
        name: 'Packaging',
        secondaries: [
          { name: 'PyInstaller' },
          { name: 'macOS .app bundle' },
          { name: 'launchd' },
          { name: 'Inno Setup' },
          { name: 'Task Scheduler' },
        ],
      },
      { name: 'Turborepo' },
      { name: 'Tailscale Funnel' },
    ],
  },
];
