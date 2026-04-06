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
    tagline: 'Enterprise-grade HR system',
    description:
      'Production HR management system. 1100+ tests with 99.5% code coverage. The backbone for several other products in the ecosystem.',
    liveUrl: 'https://hr-manager-pearl.vercel.app',
    tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Vitest', 'Tailwind'],
    highlights: ['1100+ tests', '99.5% coverage', 'Production-ready'],
    status: 'live',
  },
  {
    id: 'platform',
    name: 'Platform',
    scale: 1.2,
    orbitRadius: 11,
    orbitSpeed: 0.09,
    phase: 2.1,
    tilt: -0.05,
    color: '#f5a25b',
    tagline: 'Community platform built on HRM',
    description:
      'Live community platform serving real users, built on top of HRM as a backbone. Demonstrates how the HRM core scales beyond its original use case.',
    liveUrl: 'https://vuohiliitto.com',
    tech: ['Next.js', 'TypeScript', 'PostgreSQL', 'Tailwind'],
    highlights: ['Real users', 'Built on HRM'],
    status: 'live',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    scale: 0.9,
    orbitRadius: 14.5,
    orbitSpeed: 0.07,
    phase: 4.2,
    tilt: 0.08,
    color: '#4ade80',
    tagline: 'This site',
    description:
      'The site you are looking at. Fully static, built with Astro, Three.js and GSAP. A visual showcase of motion craft, intentionally separate from the production stack.',
    liveUrl: 'https://mikkonumminen.dev',
    tech: ['Astro', 'Three.js', 'GSAP', 'TypeScript', 'Tailwind'],
    status: 'wip',
  },
  {
    id: 'readlog',
    name: 'ReadLog',
    scale: 0.7,
    orbitRadius: 18,
    orbitSpeed: 0.05,
    phase: 5.6,
    tilt: -0.03,
    color: '#a78bfa',
    tagline: 'Personal reading tracker',
    description:
      'A focused reading-tracking app for personal use. Small, sharp, and built to scratch a specific itch.',
    liveUrl: 'https://read-log-psi.vercel.app',
    tech: ['Next.js', 'TypeScript', 'Tailwind'],
    status: 'live',
  },
];

export const projectMap = new Map(projects.map((p) => [p.id, p]));
