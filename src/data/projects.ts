export interface Project {
  id: string;
  name: string;
  /** Visual scale on the solar system. Larger = more important. */
  scale: number;
  /** Orbit radius in scene units. */
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
  /** One-line tagline shown on hover. */
  tagline: string;
  /** Longer description shown in the detail panel. */
  description: string;
  liveUrl?: string;
  githubUrl?: string;
  tech: string[];
  highlights?: string[];
  status?: 'live' | 'wip' | 'archived';
}

export const projects: Project[] = [
  {
    id: 'hrm',
    name: 'HRM',
    scale: 1.6,
    orbitRadius: 7.5,
    orbitSpeed: 0.14,
    phase: 0.2,
    tilt: 0.04,
    color: '#5b8def',
    hasRing: true,
    ringColor: '#9bb8ff',
    tagline: 'Full-stack HR management system',
    description:
      'Production-ready HR system built to portfolio standards. Two databases (PostgreSQL for structured data, MongoDB for an immutable, hash-chained audit log), 34 granular permissions with per-user overrides, TOTP 2FA, server-side rate limiting, OpenTelemetry tracing, 18 languages, and real-time activity notifications over SSE (with polling fallback).',
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
    ],
    highlights: ['1828+ tests', '91.9% coverage', 'PostgreSQL + MongoDB'],
    status: 'live',
  },
  {
    id: 'platform',
    name: 'Platform',
    scale: 1.3,
    orbitRadius: 11,
    orbitSpeed: 0.09,
    phase: 1.5,
    tilt: -0.05,
    color: '#f5a25b',
    tagline: 'Community platform built on HRM',
    description:
      'Live community platform serving a real WoW guild at vuohiliitto.com. Turborepo monorepo with HRM as a git submodule. Multi-tenant, with WoW-themed gamification (XP, levels, achievements, quests), tabbed chat with whispers and slash commands, a Mythic+ team tracker via the Raider.IO API, and a guided tour for new members.',
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
    ],
    highlights: ['Real users', 'Multi-tenant', '1388+ tests'],
    status: 'live',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    scale: 0.9,
    orbitRadius: 14.5,
    orbitSpeed: 0.07,
    phase: 3.0,
    tilt: 0.08,
    color: '#4ade80',
    tagline: 'This site',
    description:
      'The site you are looking at. Fully static, built with Astro, Three.js and GSAP. A visual showcase of motion craft, intentionally separate from the production stack used in HRM and Platform.',
    liveUrl: 'https://mikkonumminen.dev',
    githubUrl: 'https://github.com/MikkoNumminen/mikkonumminen.dev',
    tech: ['Astro', 'Three.js', 'GSAP', 'TypeScript', 'Tailwind CSS'],
    status: 'wip',
  },
  {
    id: 'readlog',
    name: 'ReadLog',
    scale: 0.7,
    orbitRadius: 18,
    orbitSpeed: 0.05,
    phase: 4.5,
    tilt: -0.03,
    color: '#a78bfa',
    tagline: "Track every book you've read",
    description:
      'Personal reading tracker. Searches Open Library and Google Books in parallel and deduplicates results, then lets you log books with format (paper / e-book / audiobook) and finish date. Public anonymous feed of recently logged books on the homepage.',
    liveUrl: 'https://read-log-psi.vercel.app',
    githubUrl: 'https://github.com/MikkoNumminen/ReadLog',
    tech: ['Next.js', 'React', 'TypeScript', 'Prisma', 'PostgreSQL', 'NextAuth', 'MUI'],
    highlights: ['68 tests', 'Multi-source search'],
    status: 'live',
  },
  {
    id: 'audiobookmaker',
    name: 'AudiobookMaker',
    scale: 0.85,
    orbitRadius: 21.5,
    orbitSpeed: 0.04,
    phase: 6.0,
    tilt: 0.06,
    color: '#22d3ee',
    tagline: 'PDF → audiobook',
    description:
      'Desktop app that converts PDFs into MP3 audiobooks. Automatic chapter detection, page-number / header / footer cleanup, Finnish and English text-to-speech via edge-tts. Distributed as a Windows installer with no Python dependency for end users. Next steps: voice recognition and deepfake voice features.',
    githubUrl: 'https://github.com/MikkoNumminen/AudiobookMaker',
    tech: [
      'Python',
      'PyMuPDF',
      'edge-tts',
      'pydub',
      'ffmpeg',
      'Tkinter',
      'PyInstaller',
    ],
    highlights: ['Windows installer', 'FI + EN voices'],
    status: 'wip',
  },
];

export const projectMap = new Map(projects.map((p) => [p.id, p]));
