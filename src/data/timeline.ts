export interface TimelineEntry {
  /** Position along the climb, 0 (base) → 1 (summit). */
  altitude: number;
  /** Year or year range. */
  year: string;
  /** Short kicker shown above the title. */
  kind: 'foundation' | 'work' | 'life' | 'project' | 'craft' | 'now';
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
      'First paid programming role. Node.js backend, React frontend, working with large sets of open data. Full-stack development, UI design, database management on Azure, product maintenance.',
    tags: ['Node.js', 'React', 'Open data', 'PostgreSQL', 'Azure'],
  },
  {
    altitude: 0.50,
    year: '2024–2025',
    kind: 'life',
    title: 'Becoming a father',
    body:
      'Stepped back from full-time work for family. Personal projects kept moving in the background.',
  },
  {
    altitude: 0.68,
    year: '2026',
    kind: 'project',
    title: 'HRM',
    body:
      'Built a full-stack HR management system to portfolio standards. 1828+ tests, 91.9% coverage, two databases (PostgreSQL + MongoDB), TOTP 2FA, hash-chained audit log, OpenTelemetry. The architectural backbone for Platform.',
    tags: ['Next.js', 'PostgreSQL', 'MongoDB', '1828+ tests', '91.9% coverage'],
  },
  {
    altitude: 0.80,
    year: '2026',
    kind: 'project',
    title: 'Platform',
    body:
      'Live community platform serving a real WoW guild at vuohiliitto.com. Built as a Turborepo monorepo with HRM as a submodule. Multi-tenant, with gamification, real-time chat, and a Mythic+ team tracker.',
    tags: ['Real users', 'Multi-tenant', 'Turborepo'],
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
