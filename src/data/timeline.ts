export interface TimelineEntry {
  /** Position along the climb, 0 (base) → 1 (summit). */
  altitude: number;
  /** Year or year range. */
  year: string;
  /** Short kicker (Education / Job / Project / Skill / Now). */
  kind: 'foundation' | 'work' | 'project' | 'craft' | 'now';
  title: string;
  body: string;
  tags?: string[];
}

export const timeline: TimelineEntry[] = [
  {
    altitude: 0.05,
    year: '2014–2018',
    kind: 'foundation',
    title: 'Foundations',
    body: 'Computer science studies. Picked up the languages and ideas that everything else would build on.',
    tags: ['Java', 'Python', 'Linux', 'Algorithms'],
  },
  {
    altitude: 0.22,
    year: '2018',
    kind: 'work',
    title: 'First production code',
    body: 'Shipped the first features to real users. Learned that production is the only environment that matters.',
    tags: ['JavaScript', 'Node.js', 'PostgreSQL'],
  },
  {
    altitude: 0.40,
    year: '2020',
    kind: 'craft',
    title: 'Going full-stack',
    body: 'TypeScript everywhere, React on the front, Node on the back. Tests, CI, and the rituals that keep teams sane.',
    tags: ['TypeScript', 'React', 'Next.js', 'Vitest'],
  },
  {
    altitude: 0.58,
    year: '2023',
    kind: 'project',
    title: 'HRM',
    body: 'Built an enterprise-grade HR system from scratch. 1100+ tests, 99.5% coverage, the backbone for what came next.',
    tags: ['Next.js', 'PostgreSQL', '99.5% coverage'],
  },
  {
    altitude: 0.75,
    year: '2024',
    kind: 'project',
    title: 'Platform',
    body: 'Live community platform built on HRM as a backbone. Real users, real load, real responsibility.',
    tags: ['Production', 'Real users'],
  },
  {
    altitude: 0.88,
    year: '2025',
    kind: 'craft',
    title: 'AI-native workflows',
    body: 'Pair-programming with AI as part of the toolchain. Learning how to ship faster without lowering the bar.',
    tags: ['AI workflows', 'Velocity'],
  },
  {
    altitude: 0.97,
    year: 'Now',
    kind: 'now',
    title: 'Looking up',
    body: 'Open to ambitious projects where craft and velocity matter equally. If that sounds like your team, get in touch.',
    tags: ['Available', 'Remote / Finland'],
  },
];
