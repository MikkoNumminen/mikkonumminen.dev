export interface TimelineEntry {
  /** Position along the climb, 0 (base) → 1 (summit). */
  altitude: number;
  /** Year or year range. */
  year: string;
  /** Short kicker shown above the title. */
  kind: 'foundation' | 'work' | 'project' | 'craft' | 'now';
  title: string;
  body: string;
  tags?: string[];
}

export const timeline: TimelineEntry[] = [
  {
    altitude: 0.08,
    year: '1998–2022',
    kind: 'foundation',
    title: 'Hardware retail',
    body:
      '24 years in hardware retail, mostly at the family business. Decor, renovation, tools, construction — every category, every kind of customer. The kind of job that teaches you what users actually need before you ever put a screen between you and them.',
    tags: ['Customer service', 'Family business', '24 years'],
  },
  {
    altitude: 0.30,
    year: '2022–2024',
    kind: 'work',
    title: 'Kasvu Labs Oy',
    body:
      'First paid programming role. Full-stack development, data work, PostgreSQL on Azure, UI design, and product maintenance. The work that proved the career change was real.',
    tags: ['Next.js', 'PostgreSQL', 'Azure', 'TypeScript'],
  },
  {
    altitude: 0.50,
    year: '2024 → now',
    kind: 'craft',
    title: 'Studying & building',
    body:
      'Started studying programming and usability while building personal projects in parallel. Figuring out what kind of developer I want to be — and what I want to build.',
    tags: ['Programming', 'Usability', 'Self-directed'],
  },
  {
    altitude: 0.68,
    year: '2026',
    kind: 'project',
    title: 'HRM',
    body:
      'Built an enterprise-grade HR system from scratch. 1100+ tests, 99.5% coverage. The backbone for what came next.',
    tags: ['Next.js', 'PostgreSQL', '99.5% coverage'],
  },
  {
    altitude: 0.80,
    year: '2026',
    kind: 'project',
    title: 'Platform',
    body:
      'Live community platform built on top of HRM as the backbone. Real users, real load, real responsibility.',
    tags: ['Production', 'Real users'],
  },
  {
    altitude: 0.90,
    year: '2026',
    kind: 'craft',
    title: 'AI-native workflows',
    body:
      'Pair-programming with AI as part of the toolchain. Shipping faster without lowering the bar.',
    tags: ['AI workflows', 'Velocity'],
  },
  {
    altitude: 0.97,
    year: 'Now',
    kind: 'now',
    title: 'Looking up',
    body:
      'Hardware career closed. Full focus on studies, code, and the next climb. Open to ambitious full-stack roles where craft and velocity matter equally.',
    tags: ['Available', 'Remote / Finland'],
  },
];
