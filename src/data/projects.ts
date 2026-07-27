/**
 * Structural project data — visual layout, links, tech stack.
 *
 * Translatable text (tagline, description, highlights) lives in the i18n
 * dictionaries under `t.projectsData[id]`. Use `localizeProjects(t)` to
 * merge structure + text into a `LocalizedProject` for rendering.
 */

import type { Translations } from '../i18n';

export interface Project {
  id: string;
  /** Brand name — never translated. */
  name: string;
  /**
   * Visual rank among the planets. Tier 1 rides the inner orbits and renders
   * larger and brighter; tier 2 sits further out, smaller and dimmer. Absent
   * for the star and for moons, which are ranked by what they orbit.
   */
  tier?: 1 | 2;
  /**
   * Renders as the system's star rather than a planet. Still a first-class
   * project everywhere else — the terminal, the fallback grid and the timeline
   * linkifier all read this list, so the star is not allowed to leave it.
   */
  isSun?: boolean;
  /**
   * Renders as a moon of the named project instead of claiming its own orbit,
   * for the case where two entries are one piece of work built twice. The
   * entry stays in this list for the same reason `isSun` does.
   */
  moonOf?: string;
  /** Visual scale on the solar system. Larger = more important. */
  scale: number;
  /** Orbit radius in scene units. For a moon, the radius around its parent. */
  orbitRadius: number;
  /** Orbit angular speed (radians per second). */
  orbitSpeed: number;
  /** Initial angular phase (radians). */
  phase: number;
  /** Tilt of the orbit plane in radians. */
  tilt: number;
  /** Hex color of the planet body. */
  color: string;
  /** Optional ring (Saturn-style). */
  hasRing?: boolean;
  ringColor?: string;
  liveUrl?: string;
  githubUrl?: string;
  /** Tech names — never translated. */
  tech: string[];
  status?: 'live' | 'wip' | 'archived';
  /**
   * Names of external APIs / services this project connects to. Surfaced
   * visually in the galaxy view as an orbiting "satellite + broadcast
   * pulses" indicator. Names here are also displayed in the integrations
   * section on the home page (sourced via the i18n dictionaries).
   */
  externalApis?: string[];
}

export interface LocalizedProject extends Project {
  tagline: string;
  description: string;
  highlights?: string[];
}

/**
 * A semantic relationship between two projects, rendered as a glowing arc
 * in the galaxy view. Direction is informational (source → target reflects
 * "feeds into" semantics) — visually the arc is symmetric.
 */
export interface Connection {
  sourceId: string;
  targetId: string;
  /** Kind of relationship — currently unused at render time but useful for
   * future hover labels. */
  kind: 'submodule' | 'voice' | 'music' | 'port';
  /** Hex color of the line. Picked to read against the dark backdrop and
   * to convey the relationship's semantic flavor. */
  color: string;
}

export const connections: Connection[] = [
  // HRM is a git submodule inside Platform — same auth, same audit log.
  { sourceId: 'hrm', targetId: 'platform', kind: 'submodule', color: '#9bb8ff' },
  // AudiobookMaker generates the in-game voice for Spacepotatis.
  {
    sourceId: 'audiobookmaker',
    targetId: 'spacepotatis',
    kind: 'voice',
    color: '#fbbf24',
  },
  // strudel-patterns scores Spacepotatis (galaxy + mission themes).
  {
    sourceId: 'strudel-patterns',
    targetId: 'spacepotatis',
    kind: 'music',
    color: '#ec4899',
  },
  // This site's music bed is a strudel-patterns piece.
  {
    sourceId: 'strudel-patterns',
    targetId: 'portfolio',
    kind: 'music',
    color: '#ec4899',
  },
  // And its voiceover layers are AudiobookMaker output.
  {
    sourceId: 'audiobookmaker',
    targetId: 'portfolio',
    kind: 'voice',
    color: '#fbbf24',
  },
];

export const projects: Project[] = [
  {
    id: 'hrm',
    name: 'HRM',
    tier: 1,
    scale: 1.3,
    orbitRadius: 6.8,
    orbitSpeed: 0.061,
    phase: 0.2,
    tilt: 0.04,
    color: '#5b8def',
    hasRing: true,
    ringColor: '#9bb8ff',
    liveUrl: 'https://hr-manager-pearl.vercel.app',
    githubUrl: 'https://github.com/MikkoNumminen/HRManager',
    tech: [
      'Next.js',
      'React',
      'TypeScript',
      'PostgreSQL',
      'MongoDB',
      'Prisma',
      'MUI',
      'Jest',
      'Playwright',
      'Docker',
      'GitHub Actions',
      'Zod',
      'NextAuth',
      'next-intl',
      'ReactFlow',
      'Pino',
      'pg-boss',
    ],
    status: 'live',
    externalApis: ['Google OAuth', 'GitHub OAuth', 'Sentry', 'OpenTelemetry'],
  },
  {
    id: 'platform',
    name: 'Platform',
    tier: 1,
    scale: 1.25,
    orbitRadius: 4.9,
    orbitSpeed: 0.1,
    phase: 1.5,
    tilt: -0.05,
    color: '#f5a25b',
    liveUrl: 'https://vuohiliitto.com',
    githubUrl: 'https://github.com/MikkoNumminen/Platform',
    tech: [
      'Turborepo',
      'Next.js',
      'React',
      'TypeScript',
      'PostgreSQL',
      'Prisma',
      'NextAuth',
      'MUI',
      'Playwright',
      'Jest',
      'next-intl',
    ],
    status: 'live',
    externalApis: ['Raider.IO API', 'Google OAuth', 'GitHub OAuth', 'GitHub API'],
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    isSun: true,
    scale: 1.0,
    orbitRadius: 0.0,
    orbitSpeed: 0.0,
    phase: 0,
    tilt: 0,
    color: '#4ade80',
    liveUrl: 'https://mikkonumminen.dev',
    githubUrl: 'https://github.com/MikkoNumminen/mikkonumminen.dev',
    tech: ['Astro', 'Three.js', 'GSAP', 'TypeScript', 'Tailwind CSS'],
    status: 'wip',
  },
  {
    id: 'readlog',
    name: 'ReadLog',
    tier: 2,
    scale: 0.7,
    orbitRadius: 14.6,
    orbitSpeed: 0.019,
    phase: 4.5,
    tilt: -0.03,
    color: '#a78bfa',
    liveUrl: 'https://read-log-pi.vercel.app',
    githubUrl: 'https://github.com/MikkoNumminen/ReadLog',
    tech: [
      'Next.js',
      'React',
      'TypeScript',
      'Prisma',
      'PostgreSQL',
      'NextAuth',
      'MUI',
      'Jest',
    ],
    status: 'live',
    externalApis: ['Open Library', 'Google Books', 'Google OAuth'],
  },
  {
    id: 'readlog-dotnet',
    name: 'ReadLog .NET',
    moonOf: 'readlog',
    scale: 0.34,
    orbitRadius: 1.7,
    orbitSpeed: 0.85,
    phase: 10.6,
    tilt: 0.03,
    color: '#7c5cff',
    liveUrl: 'https://readlog-a2feef.azurewebsites.net/',
    githubUrl: 'https://github.com/MikkoNumminen/Readlog-c-.net',
    tech: [
      '.NET 8',
      'ASP.NET Core',
      'Razor Pages',
      'EF Core',
      'SQLite',
      'ASP.NET Identity',
      'Bootstrap 5',
      'xUnit',
      'Docker',
      'GitHub Actions',
      'Azure App Service',
    ],
    status: 'live',
    externalApis: ['Open Library', 'Google Books', 'Google OAuth'],
  },
  {
    id: 'audiobookmaker',
    name: 'AudiobookMaker',
    tier: 1,
    scale: 1.1,
    orbitRadius: 8.7,
    orbitSpeed: 0.042,
    phase: 6.0,
    tilt: 0.06,
    color: '#22d3ee',
    githubUrl: 'https://github.com/MikkoNumminen/AudiobookMaker',
    // Desktop app — `liveUrl` points to releases (closest equivalent of a
    // "live demo" for a packaged executable, vs. the web demos elsewhere).
    liveUrl: 'https://github.com/MikkoNumminen/AudiobookMaker/releases',
    tech: [
      'Python',
      'PyMuPDF',
      'ebooklib',
      'ocrmypdf',
      'Tesseract',
      'num2words',
      'edge-tts',
      'Piper',
      'Chatterbox',
      'VoxCPM2',
      'PyTorch',
      'CustomTkinter',
      'pydub',
      'pygame',
      'ffmpeg',
      'PyInstaller',
      'Inno Setup',
      'GitHub Actions',
    ],
    status: 'wip',
    externalApis: ['Microsoft Edge-TTS'],
  },
  {
    id: 'spacepotatis',
    name: 'Spacepotatis',
    tier: 2,
    scale: 0.68,
    orbitRadius: 17.2,
    orbitSpeed: 0.015,
    phase: 7.5,
    tilt: -0.07,
    color: '#ef4444',
    hasRing: true,
    ringColor: '#fca5a5',
    liveUrl: 'https://spacepotatis.vercel.app',
    githubUrl: 'https://github.com/MikkoNumminen/Spacepotatis',
    tech: [
      'Next.js',
      'React',
      'TypeScript',
      'Phaser 4',
      'Three.js',
      'GSAP',
      'PostgreSQL',
      'Kysely',
      'NextAuth',
      'Tailwind CSS',
    ],
    status: 'live',
    externalApis: ['Google OAuth'],
  },
  {
    id: 'strudel-patterns',
    name: 'Strudel Patterns',
    tier: 2,
    scale: 0.58,
    orbitRadius: 18.6,
    orbitSpeed: 0.014,
    phase: 9.0,
    tilt: 0.05,
    color: '#ec4899',
    githubUrl: 'https://github.com/MikkoNumminen/strudel-patterns',
    tech: ['Strudel', 'JavaScript', 'Web Audio API', 'Claude Code'],
    status: 'live',
  },
  {
    id: 'claude-continue',
    name: 'claude-continue',
    tier: 2,
    scale: 0.6,
    orbitRadius: 20.0,
    orbitSpeed: 0.012,
    phase: 12.1,
    tilt: -0.04,
    color: '#e07a5f',
    githubUrl: 'https://github.com/MikkoNumminen/claude-continue',
    // CLI + GUI tool — `liveUrl` points to releases, the closest thing to a
    // "live demo" for a packaged executable (same pattern as AudiobookMaker).
    liveUrl: 'https://github.com/MikkoNumminen/claude-continue/releases',
    tech: [
      'Python',
      'Tkinter',
      'ccusage',
      'PyInstaller',
      'launchd',
      'Task Scheduler',
      'tmux',
      'GitHub Actions',
    ],
    status: 'wip',
  },
  {
    id: 'passwordmanager',
    name: 'PasswordManager',
    tier: 1,
    scale: 1.15,
    orbitRadius: 10.6,
    orbitSpeed: 0.031,
    phase: 13.6,
    tilt: 0.05,
    color: '#eab308',
    hasRing: true,
    ringColor: '#fde68a',
    githubUrl: 'https://github.com/MikkoNumminen/PasswordManager',
    tech: [
      'Rust',
      'WebAssembly',
      'Tokio',
      'SQLite',
      'Argon2id',
      'XChaCha20-Poly1305',
      'wasm-bindgen',
      'Chrome Extension (MV3)',
      'JavaScript',
      'GitHub Actions',
    ],
    status: 'wip',
    externalApis: ['Google OAuth', 'Tailscale Funnel', 'Cloudflare Tunnel'],
  },
  {
    id: 'claude-agents',
    name: 'claude-agents',
    tier: 2,
    scale: 0.62,
    orbitRadius: 21.4,
    orbitSpeed: 0.011,
    phase: 15.1,
    tilt: -0.06,
    color: '#cc785c',
    githubUrl: 'https://github.com/MikkoNumminen/claude-agents',
    tech: [
      'Claude Code',
      'Claude Haiku',
      'Claude Sonnet',
      'Claude Opus',
      'Bash',
      'Markdown',
    ],
    status: 'live',
  },
  {
    id: 'feedback-intelligence',
    name: 'Feedback Intelligence',
    tier: 1,
    scale: 1.05,
    orbitRadius: 12.5,
    orbitSpeed: 0.025,
    phase: 16.6,
    tilt: 0.04,
    color: '#2dd4bf',
    liveUrl: 'https://red-ground-0bacf9c03.7.azurestaticapps.net/',
    githubUrl: 'https://github.com/MikkoNumminen/feedback-intelligence',
    tech: [
      '.NET 8',
      'C#',
      'SQLite',
      'Ollama',
      'Poro 2 8B',
      'Microsoft.Extensions.AI',
      'xUnit',
      'Docker',
      'Node.js',
      'Azure Static Web Apps',
      'Azure Functions',
      'GitHub Actions',
      'CodeQL',
    ],
    status: 'live',
    externalApis: ['Tailscale Funnel'],
  },
];

/**
 * Merge structural project data with the localized text from a translations
 * dictionary. Returns one `LocalizedProject` per `Project` in `projects`.
 *
 * In dev we log a warning whenever the dictionary is missing a translation
 * for a given project id so translators see the gap immediately instead of
 * shipping an empty string to production.
 */
export function localizeProjects(t: Translations): LocalizedProject[] {
  return projects.map((p) => {
    const text = t.projectsData[p.id];
    if (import.meta.env.DEV && !text) {
      console.warn(`[i18n] missing projectsData.${p.id} for current locale`);
    }
    return {
      ...p,
      tagline: text?.tagline ?? '',
      description: text?.description ?? '',
      highlights: text?.highlights,
    };
  });
}
