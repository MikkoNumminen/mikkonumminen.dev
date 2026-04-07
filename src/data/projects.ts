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
  liveUrl?: string;
  githubUrl?: string;
  /** Tech names — never translated. */
  tech: string[];
  status?: 'live' | 'wip' | 'archived';
}

export interface LocalizedProject extends Project {
  tagline: string;
  description: string;
  highlights?: string[];
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
    liveUrl: 'https://mikkonumminen-dev.vercel.app',
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
    liveUrl: 'https://read-log-pi.vercel.app',
    githubUrl: 'https://github.com/MikkoNumminen/ReadLog',
    tech: ['Next.js', 'React', 'TypeScript', 'Prisma', 'PostgreSQL', 'NextAuth', 'MUI'],
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
    githubUrl: 'https://github.com/MikkoNumminen/AudiobookMaker',
    tech: ['Python', 'PyMuPDF', 'edge-tts', 'pydub', 'ffmpeg', 'Tkinter', 'PyInstaller'],
    status: 'wip',
  },
];

export const projectMap = new Map(projects.map((p) => [p.id, p]));

/**
 * Merge structural project data with the localized text from a translations
 * dictionary. Returns one `LocalizedProject` per `Project` in `projects`.
 */
export function localizeProjects(t: Translations): LocalizedProject[] {
  return projects.map((p) => {
    const text = t.projectsData[p.id];
    return {
      ...p,
      tagline: text?.tagline ?? '',
      description: text?.description ?? '',
      highlights: text?.highlights,
    };
  });
}
