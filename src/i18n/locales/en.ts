import type { Translations } from '../types';

export const en: Translations = {
  common: {
    opensInNewTab: '(opens in a new tab)',
  },
  meta: {
    jobTitle: 'Full-Stack Developer',
    home: {
      title: 'Mikko Numminen — full-stack developer',
      description:
        'Full-stack developer in Finland. Working notes and selected projects, shipped solo and AI-native by default.',
    },
    contact: {
      title: 'Contact — Mikko Numminen',
      description:
        'Reach Mikko Numminen — interactive terminal with email, links, and CV download.',
    },
    projects: {
      title: 'Projects — Mikko Numminen',
      description: 'Interactive solar system of selected projects by Mikko Numminen.',
    },
    experience: {
      title: 'Experience — Mikko Numminen',
      description:
        "Climb the mountain — Mikko Numminen's experience, skills, and milestones from base camp to today.",
    },
    blog: {
      title: 'Blog — Mikko Numminen',
      description:
        'Working notes from the projects of Mikko Numminen. Entries written from the commit history are labelled as machine-generated.',
    },
  },
  nav: {
    home: 'home',
    projects: 'projects',
    experience: 'experience',
    blog: 'blog',
    contact: 'contact',
    primaryAria: 'Primary',
    languageSwitcherAria: 'Language',
    skipToContent: 'Skip to content',
  },
  hero: {
    sectionAria: 'Mikko Numminen — full-stack developer',
    eyebrow: 'portfolio · 2026',
    titleSrOnly: 'Mikko Numminen',
    titleFallbackTop: 'MIKKO',
    titleFallbackBottom: 'NUMMINEN',
    subtitle: 'full-stack developer · finland',
    scrollHint: 'scroll',
  },
  intro: {
    sectionAria: 'About',
    eyebrow: 'about',
    heading: 'A short introduction.',
    body: "I'm a full-stack developer, and lately most of my work has been around language models, where I spend most of my time babysitting them, because a model that's wrong and sure of it is a special kind of problem. I got here in 2022 after 24 years selling hardware, so I'm the guy who reads the manual and still expects the thing to break. I build the whole thing, from the database to the screen, and I measure what I build. Sometimes I measure it, publish it, and then find out the measurement was the broken part, which is a humbling way to learn that the instrument needs checking too.",
  },
  latestEntries: {
    sectionAria: 'Latest blog entries',
    eyebrow: 'writing',
    heading: 'Latest entries.',
    viewAll: 'All entries',
    empty: 'No entries published yet.',
  },
  navCards: {
    sectionAria: 'Explore the rest of the site',
    eyebrow: 'continue',
    heading: 'Elsewhere on the site.',
    projects: {
      label: 'Projects',
      description: 'Explore an interactive solar system of things I have built.',
    },
    experience: {
      label: 'Experience',
      description: 'Climb a parallax mountain through skills, tools, and milestones.',
    },
    blog: {
      label: 'Blog',
      description:
        'Working notes on what I have been building, some drafted from the commit history.',
    },
    contact: {
      label: 'Contact',
      description: 'Drop into a terminal and reach me directly.',
    },
    footerCopyright: '© 2026 Mikko Numminen',
    footerBuiltWith: 'built with astro · three.js · gsap',
  },
  blog: {
    eyebrow: 'writing',
    title: 'Blog',
    lede: 'Working notes on what I have been building. Some entries are written by a machine from the commit history, and those say so at the top.',
    aiBadge: 'AI-generated',
    aiNotice:
      'This entry was generated from commit history by a language model. I have not rewritten it. Treat it as a summary of what changed, not as something I sat down and wrote.',
    backToIndex: 'All entries',
    empty: 'No entries yet.',
  },
  projectsPage: {
    eyebrow: 'Selected work',
    title: 'Projects',
    lede: 'A small solar system of things I have built. Hover a planet for the elevator pitch, click to zoom in.',
    legendHover: 'to inspect',
    legendClick: 'a planet to focus',
    legendDrag: 'to rotate the view',
    legendZoom: 'to zoom in / out',
    detailAria: 'Project details',
    closeAria: 'Close project details',
    techLabel: 'Tech',
    externalApisLabel: 'Integrations',
    liveDemo: 'live demo →',
    githubLink: 'github',
    gridAria: 'Projects',
    gridLede:
      'Things I have built. The desktop view shows them as an interactive solar system — here is the readable list.',
    listAriaLabel: 'Project list',
    listToggleShow: 'Projects',
    listToggleHide: 'Hide',
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack HR management system',
      description:
        'An HR system with the boring parts done properly. Every change is written to an append-only log, and each entry is signed against the one before it. If someone edits the history, an admin endpoint walks the chain and tells you the exact entry where it broke. Two databases, because people data and audit data want different things. Rate limiting runs on Postgres, so there is no Redis to keep alive.',
      highlights: ['2910 tests', '92.2% coverage', 'Tamper-evident audit log'],
    },
    platform: {
      tagline: 'Community platform built on HRM',
      description:
        'A live community site for a World of Warcraft guild, running at vuohiliitto.com. HRM sits inside it as a git submodule, so accounts, permissions and auditing came for free and the rest got built on top. Members earn XP and levels, chat in tabs with proper whispers, and put together Mythic+ teams by pulling character stats from Raider.IO. New members get a guided tour instead of a wall of buttons.',
      highlights: ['Real users', '1388 tests', 'HRM as a submodule'],
    },
    portfolio: {
      tagline: 'This site',
      description:
        'The site you are reading. The pages themselves are static, with nothing running behind them, but the terminal on the contact page is wired to a language model on a machine in my house. Ask it something and a FastAPI service answers from my own repositories, retrieving over pgvector with a Finnish language router in front, reached through a Tailscale funnel. The projects page is a solar system you can drag around and the landing page is one particle field that keeps rearranging itself. It is where the motion work happens, so the production apps do not have to carry it.',
      highlights: [
        'Self-hosted LLM on a home GPU',
        'Answers only from my own corpus',
        'Static build, no SSR',
      ],
    },
    readlog: {
      tagline: "Track every book you've read",
      description:
        'A reading log. Search for a book, say whether you read it on paper, as an e-book or listened to it, give it a rating, done. It asks Open Library and Google Books at the same time and merges the answers, because neither of them has everything. There is a public feed of what people finished recently, with no names attached.',
      highlights: ['90 tests', 'Searches two book APIs at once'],
    },
    'readlog-dotnet': {
      tagline: 'ReadLog, rebuilt in .NET',
      description:
        'The same reading log, written again from scratch in ASP.NET Core to find out what a port actually costs. Razor Pages instead of React, EF Core and SQLite instead of Prisma and Postgres. It runs on Azure free tier, which means it falls asleep after twenty minutes and the first visit is slow. The repo keeps notes on every decision where the .NET way and the Next.js way disagreed.',
      highlights: [
        'Same app, second stack',
        'Free Azure tier',
        'Porting notes for every decision',
      ],
    },
    audiobookmaker: {
      tagline: 'Turns books into audiobooks',
      description:
        'A desktop app that reads a PDF, EPUB or Word file out loud and saves it as an audiobook. Scanned books go through OCR first. Four voice engines to pick from, depending on whether you want it free, offline, or cloned from a short clip of someone speaking. Finnish is the hard part, so it gets its own nineteen-pass cleanup before a word is spoken: Finnish text-to-speech mangles numbers and abbreviations in very predictable ways. Ships as a Windows installer with everything bundled.',
      highlights: [
        '3000+ tests',
        'Nineteen-pass Finnish text cleanup',
        'Voices the story in Spacepotatis',
      ],
    },
    spacepotatis: {
      tagline: 'Browser shooter: your potato vs the galaxy',
      description:
        'A browser game where a potato in a shield bubble shoots bugs. It boots like an old terminal, opens into a 3D solar system you can drag around, then drops you into a top-down fight. All the music comes from strudel-patterns and all the voice from AudiobookMaker, narrated by Grandmom. In May a player lost their save, because the anti-cheat checked that numbers had not grown too fast but never that they had shrunk. That one is written up as an incident runbook.',
      highlights: ['~1170 tests', 'Original music and voice', 'Has an incident runbook'],
    },
    'strudel-patterns': {
      tagline: 'Algorithmic music, written as code',
      description:
        'Music written in Strudel, where a whole track is one JavaScript expression you edit while it is playing. Drums, bass, synth layers and effects live as separate pieces you can stack into new tracks. Nine are written up, and some of those ended up as the Spacepotatis soundtrack and the music on this landing page. Every session is logged next to the git history, so you can see how a track got where it did.',
      highlights: ['Nine finished tracks', 'Scores Spacepotatis and this site'],
    },
    'claude-continue': {
      tagline: 'Keeps Claude Code running back to back',
      description:
        'Claude Code works in five-hour windows. This waits for one to roll over and starts the next, so there is no dead time while you are asleep. Python with no dependencies at all, running unattended through launchd or Task Scheduler, and it checks whether a session is mid-thought before it types anything. The README is honest that working this way grows the pile of code nobody has reviewed yet.',
      highlights: [
        'No runtime dependencies',
        'macOS, Windows, WSL, Linux',
        'Runs unattended',
      ],
    },
    passwordmanager: {
      tagline: 'Zero-knowledge password manager in Rust',
      description:
        'All the crypto lives in one Rust crate. The CLI, the browser client, the sync server and the Chrome extension all use that same crate, compiled either natively or to WebAssembly, so there is only ever one place to get it wrong. The server only ever sees ciphertext. Unlocking takes about 430 milliseconds on purpose, because the key derivation is tuned well above the library defaults. The README also lists five things it will not protect you from, which seemed more useful than pretending.',
      highlights: [
        'One crypto crate, four clients',
        'Server sees only ciphertext',
        '~430ms unlock, on purpose',
      ],
    },
    'claude-agents': {
      tagline: 'Cheaper models for the boring work',
      description:
        'Fourteen Claude Code subagents, each pinned to the cheapest model that can do its job. Reading and reporting goes to Haiku, mechanical edits go to Sonnet, and only design work gets the expensive model. Each one works out what a repo uses on its own, so the same set covers JavaScript, C# and Python without configuration. Two of them exist because a review workflow quietly spent 3.8 million tokens at the wrong price.',
      highlights: [
        '14 model-pinned agents',
        'Model and effort both pinned',
        'MIT licensed',
      ],
    },
    'feedback-intelligence': {
      tagline: 'Reads customer feedback without making things up',
      description:
        'Takes messy free-text feedback and turns it into something a manager can act on. The interesting part is how little of it is AI: the model tidies up what people typed and finds themes across a pile of it, and the rest is ordinary code. Alerts are keyword scans. Sentiment is arithmetic. It runs a Finnish model on a machine at home, so hosting costs nothing. Every decision about where AI was allowed is written down, including the four rounds of arguing it back out.',
      highlights: [
        'AI in exactly two places',
        'Finnish-first, runs locally',
        'Costs nothing to host',
      ],
    },
  },
  experiencePage: {
    eyebrow: 'the climb',
    title: 'Experience',
    lede: 'Scroll up the mountain. Each marker is a step from base camp to where I stand today.',
    scrollHint: 'scroll up',
    skipToTech: 'skip to the tech stack',
    kindFoundation: 'foundation',
    kindWork: 'work',
    kindLife: 'life',
    kindProject: 'project',
    kindCraft: 'craft',
    kindNow: 'now',
    summitBlogLink: 'read the blog',
    summitContactLink: 'get in touch',
    lessonsAriaLabel: 'Lessons from this chapter',
    yearNow: 'Now',
  },
  techStack: {
    categories: {
      languages: 'Languages',
      frontend: 'Frontend',
      backend: 'Backend & data',
      ai: 'AI & LLM',
      platform: 'Platform',
    },
    viewOverall: 'by technology',
    viewByProject: 'by project',
    workBadge: 'work',
    legend:
      'work = used in client work. Everything else is from my own production projects. Open a row to see what sits underneath it.',
  },
  timelineData: {
    'hardware-retail': {
      title: 'Hardware retail',
      body: '24 years in hardware retail, mostly at the family business. Decor, renovation, tools, construction — every category, every kind of customer. The kind of job that teaches you what users actually need before you ever put a screen between you and them.',
      tags: ['Customer service', 'Family business', '24 years'],
    },
    kasvulabs: {
      title: 'Kasvu Labs Oy',
      body: 'Two years of full-stack work, in three phases.\n\nFirst, open data. I built a TypeScript tool that pulls public statistics and reshapes them, and it stayed in use at the company after I left. It fed a kiosk-network app: sales per kiosk and per product, who was responsible for what, and a map of Finland with every kiosk laid over municipal age, income and employment data. The question it answered was where there should be more kiosks, and where fewer.\n\nThen the client project, taking full-stack tickets off a kanban board. Mostly frontend: React components, MUI customised well past its defaults, and tailored solutions where nothing off the shelf fitted. Often the whole path as well, a PgTyped query, the REST endpoint for it, the wiring, and the view on top, with tests.\n\nI owned the monthly data updates as well. There was no direct database access, so I went in through the Kubernetes cluster and ran psql in a pod against production.\n\nThe last phase was a medical research project. Same stack, same end-to-end shape.',
      tags: [
        'TypeScript',
        'React',
        'Next.js',
        'Node.js',
        'PostgreSQL',
        'PgTyped',
        'Recharts',
        'Kubernetes',
        'Azure',
        'Open data',
      ],
    },
    father: {
      title: 'Becoming a father',
      body: 'Stepped back from full-time work for family. Personal projects kept moving in the background.',
    },
    'ai-workflows': {
      title: 'AI-native workflows',
      body: "Agentic, AI-assisted development as a versioned discipline. Custom Claude Code skills check into the repo as production artifacts — each one teaches the agent a project-specific recipe (add an enemy, ship a database migration, audit the save pipeline) so it goes straight to the work instead of grepping around at $X/token. Pair-programming with parallel subagents on independent slices, then synthesizing the results.\n\nThe skills are version-controlled, audited (drift between a skill and the code it references is a real category of bug — drift gets caught and corrected), and treated as production artifacts. Estimated saving: ~3.13M tokens/year on Spacepotatis alone. Shipping faster without lowering the bar.\n\nThe workflow has its own tooling: claude-continue keeps Claude Code's 5-hour usage windows back-to-back, reading the active window's reset time and resuming paused sessions the moment the next one opens — so a long autonomous run doesn't stall in the gap between windows.",
      tags: [
        'Agentic dev',
        'Custom skills',
        'Subagents',
        'claude-continue',
        'Versioned workflow',
        'Velocity',
      ],
    },
    '2026-build': {
      title: 'The 2026 build',
      body: 'As of June 2026: nine projects shipped solo in twelve months — full-stack web apps, a desktop tool, and a ReadLog port running live on Azure. Real users, real ops, full ownership from schema to deploy.',
      tags: [
        '9 repos',
        'Real users',
        'Next.js',
        'Astro',
        'Three.js',
        'Phaser 4',
        'Python',
        'C#/.NET',
        'Azure',
        'Turborepo',
      ],
      lessons: [
        {
          title: 'Triage before redesign',
          body: 'When save-corruption hit Spacepotatis in May 2026: server-side guard same day, audit table next day, architectural fix only after a week of real data. Mitigate → observe → architect.',
        },
        {
          title: 'AI workflow as checked-in code',
          body: 'Spacepotatis ships a catalog of Claude Code skills inside the repo — code-reviewed and audited. ~3.13M tokens saved in their first year.',
          link: {
            href: 'https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md',
            label: 'Methodology',
          },
        },
        {
          title: 'No tool lock-in',
          body: 'AudiobookMaker runs three TTS engines under one pipeline — Edge-TTS, Piper, Chatterbox. User picks per book.',
        },
        {
          title: 'Mutation testing > coverage',
          body: 'HRM runs Stryker on every PR. 91.9% line coverage means the lines ran; the mutation score means the assertions actually catch bugs.',
        },
        {
          title: 'Fix upstream, not locally',
          body: "Diagnosed a memory leak deep in Chatterbox's inference path; sent two PRs upstream to resemble-ai/chatterbox (#505, #510), both open and bumped by other contributors.",
        },
        {
          title: 'Solo full-stack, no queues',
          body: 'SQL, app code, CI, Vercel and Azure deploys, signed Windows installers via GitHub Releases, OpenTelemetry — owned end to end across all nine projects.',
        },
      ],
    },
    'skill-receipts': {
      title: 'Measured the AI workflow',
      body: "After a year of claiming the workflow paid off, I ran the A/B. Every custom Claude Code skill measured against itself going cold — same task, sub-agent on, sub-agent off — across Sonnet, Opus, and Haiku. 34 skills, 33 calibrated. Aggregate save: +17%, ~327K tokens across the portfolio.\n\nThe published registry includes the skills that cost MORE than going cold. Those aren't failures — they encode rigor the cold arm skipped (audit thoroughness, protocol discipline, spec depth). The value is completeness, not compression. The PDF is downloadable from the contact terminal; every number is traceable to a real transcript.",
      tags: [
        'A/B calibrated',
        '34 skills',
        'Published PDF',
        'Honest accounting',
        'Sonnet · Opus · Haiku',
      ],
    },
    'rust-crypto': {
      title: 'Rust, and checking my own work',
      body: 'A new language and a harder standard of evidence, arriving together. The language is Rust, picked up for a password manager where the entire cryptographic surface lives in one crate that compiles both natively and to WebAssembly. The command-line vault, the sync server, the in-browser client and the Chrome extension all run that same code, rather than four copies quietly drifting apart.\n\nThe habit was declining to take my own word for anything. The key-derivation parameters, the nonce strategy, what the authenticated ciphertext is bound to: each one is a written decision with a threat model attached, including a plain list of what the design does not protect against. The repository carries auditors of its own for that last part: one walks the decision records against the code, another holds the stated security claims up against what the cryptography actually does. A claim nobody re-checks is just a comment.',
      tags: [
        'Rust',
        'WebAssembly',
        'Argon2id',
        'XChaCha20-Poly1305',
        'Zero-knowledge',
        'Threat model in the repo',
      ],
      lessons: [
        {
          title: 'One crate, four clients',
          body: 'Argon2id at 256 MiB and three passes, XChaCha20-Poly1305 with a fresh nonce per entry, and every record bound to its own id and timestamp so two entries cannot be swapped underneath you. The master password never leaves the client and the sync server only ever holds ciphertext. Unlocking costs about 430 ms, which is the feature rather than the regression.',
        },
        {
          title: 'Thirty rounds, blind',
          body: 'Choosing the Finnish language model for the local stack was settled by ranking thirty Finnish answers blind, scored by a native speaker who could not see which model wrote which. Poro-2-8B placed first in 26 of 30 and went to production on that result. A second project ran the same numbers and passed on it, because the right call depends on how the output gets consumed. Picking either way by feel would have been faster and would have proved nothing.',
          link: {
            href: '/poro-findings.pdf',
            label: 'Read the study',
          },
        },
        {
          title: 'Usually the bug is mine',
          body: 'When answers started attaching the wrong dates to my own research, the comfortable story was that a small model was confabulating. It was not. The date was being dropped at the prompt boundary before the model ever saw it. Three earlier attempts to fix it on the model side are written down as dead ends, so the next person to look does not spend the week I did.',
        },
        {
          title: 'A measurement that changed nothing',
          body: 'A multilingual embedder looked like the obvious upgrade for Finnish retrieval. Measured head to head, the setup already deployed scored .810 against the candidate’s .762, so nothing shipped. The experiment that argues against your plan is worth as much as the one that confirms it, provided you write it down either way.',
        },
      ],
    },
    now: {
      title: 'Building with these',
      body: 'Available now, and open to ambitious full-stack roles where craft and velocity both matter.',
      tags: ['Available', 'Remote / Finland'],
    },
  },
  contactPage: {
    h1: 'Contact',
    interactiveAria: 'Interactive terminal',
    windowTitle: 'mikko@portfolio — zsh — 96×30',
    inputAria: 'Terminal command input',
    hintType: 'type',
    hintHistory: 'history',
    hintComplete: 'complete',
    noscriptIntro: 'This page is an interactive terminal that requires JavaScript.',
    noscriptReachMe: 'You can still reach me directly:',
    noscriptEmailLabel: 'Email:',
    noscriptGithubLabel: 'GitHub:',
  },
  mobileContact: {
    typedWhoamiOutputName: 'Mikko Numminen — full-stack developer · finland',
    typedWhoamiOutputBio: 'ships full-stack production apps end to end. sql to ops.',
    typedContactLabelEmail: 'email',
    typedContactLabelLinkedin: 'linkedin',
    typedContactLabelGithub: 'github',
    typedContactLabelLocation: 'location',
    typedContactValueLocation: 'finland · remote-friendly',
    typedDownloadOutput: 'ready.',
    btnEmail: 'Email me',
    btnLinkedin: 'LinkedIn',
    btnDownloadCv: 'Download CV',
    cardAria: 'Mobile contact card with auto-played terminal session',
    ariaLinkedIn: 'LinkedIn (opens in a new tab)',
  },
  terminal: {
    bootBooting: 'booting mikkOS v1.0.0 ...',
    bootMounting: '[ ok ] mounting /portfolio',
    bootLoading: '[ ok ] loading projects, experience, contact',
    bootComms: '[ ok ] establishing comms link',
    bootWelcome: 'welcome to Mikko Numminen — full-stack developer.',
    bootTypeHelp: 'type `help` to see what i can do.',
    commandNotFound: 'command not found:',
    typeHelpHint: 'type `help` to see available commands.',
    errorPrefix: 'error:',
    copyButton: 'copy',
    copyDone: 'copied!',
    copyFallback: 'press ctrl+c',
    cmdHelpDesc: 'list available commands',
    cmdHelpAvailable: 'available commands:',
    cmdHelpTip:
      'tip: try `whoami`, `contact --email`, `skills`, or `download --research`.',
    cmdWhoamiDesc: 'short bio',
    cmdWhoamiName: 'Mikko Numminen',
    cmdWhoamiTitle: 'full-stack developer · finland',
    cmdWhoamiIntro: 'ships full-stack production apps end to end. sql to ops.',
    cmdWhoamiLargest: 'largest:',
    cmdWhoamiLargestStats: '{tests}+ tests, {coverage} coverage.',
    cmdWhoamiAlso: 'also:',
    cmdWhoamiYear: 'this year:',
    cmdWhoamiYearStats:
      '{projects} projects shipped solo · ~{tokens} tokens saved · {prs} PRs upstream to',
    cmdWhoamiCommunity: 'community',
    cmdWhoamiDesktop: 'desktop',
    cmdWhoamiGame: 'game',
    cmdWhoamiCurrently: 'available now for ambitious full-stack roles.',
    cmdContactDesc: 'show contact info',
    cmdContactUsage: 'usage: contact [--email]',
    cmdContactUnknownFlag: 'unknown flag:',
    cmdContactEmailLabel: 'email:',
    cmdLinksDesc: 'show online profiles',
    cmdLinksUsage: 'usage: links [--github|--linkedin|--all]',
    cmdLinksUnknownFlag: 'unknown flag:',
    cmdDownloadDesc:
      'my cv, or the research — catalog, skills studies, calibration, and a rag finnish study (pdf)',
    cmdDownloadUsage:
      'download [--cv|--research]; --research lists [--catalog|--study|--replicates|--results|--calibration|--finnish]',
    cmdDownloadIntro: "pick what you'd like to grab:",
    cmdDownloadOptionCv: 'my cv — pdf, full résumé',
    cmdDownloadOptionSkills:
      'jun 2026 · latest + broadest — 16 skills, cold-vs-skill A/B across 3 models; the current snapshot',
    cmdDownloadOptionResearch:
      'the research — 11 pdfs: the skills suite + the rag finnish study + the poro findings + the translation audit + the agent delegation measurement (not a download)',
    cmdDownloadResearchIntro: 'the catalog + the studies, oldest → newest:',
    cmdDownloadOptionCatalog:
      'every skill across all 4 repos — the inventory, with measured (not guessed) costs',
    cmdDownloadOptionStudy:
      'may 2026 · the optimization — 5 rounds of before/after on a SKILL.md; 3 cost-traps found + fixed',
    cmdDownloadOptionReplicates:
      'round 6 · the noisiest cells re-measured at depth — an N=1 fluke overturned, ~+76% confirmed',
    cmdDownloadOptionResults:
      'the synthesis — what the two skill-auditors cost (~36% cheaper to run) and the traps they exposed',
    cmdDownloadOptionFinnish:
      'jun 2026 · the rag finnish experiment — 3 local 8B models on Finnish synthesis vs containment, single-variable, €0',
    cmdDownloadOptionMethodology:
      'jun 2026 · finnish rag, the methodology — how the experiment caught and corrected its own mistake; the process, not the findings',
    cmdDownloadOptionBlindTest:
      'jul 2026 · the blind test — a native speaker ranks 3 local models blind on Finnish naturalness; Poro wins 26/30',
    cmdDownloadOptionPoro:
      'jul 2026 · Poro-2-8B in production — what two projects measured, why one adopted it and one passed, and the deterministic layer built around it',
    cmdDownloadOptionTranslations:
      "jul 2026 · the translation audit — a local Finnish model re-reads all 396 of the site's Finnish strings against their English source; only 2 of its 276 proposed rewrites held up",
    cmdDownloadOptionDelegation:
      'jul 2026 · do the cheap agents pay for themselves — seven instrumented delegations from one session; 3 of 7 caught something I had missed, 1 was a false finding, and no saving is claimed because the counterfactual is not measurable',
    cmdDownloadResearchHint: 'grab any directly, e.g. `download --catalog`.',
    cmdDownloadTryHint:
      'try `download --cv`, `download --catalog`, `download --study`, `download --replicates`, `download --results`, `download --calibration`, or `download --finnish`.',
    cmdDownloadAmbiguous:
      'specify only one of --cv, --catalog, --study, --replicates, --results, --calibration, or --finnish.',
    cmdDownloadPreparing: 'preparing download...',
    cmdDownloadNotAvailable: 'cv not available yet — still being polished.',
    cmdDownloadSkillsNotAvailable:
      'skills calibration pdf not available right now — reach out and I will send it.',
    cmdDownloadCatalogNotAvailable:
      'skill registry pdf not available yet — run `npm run build:skills-pdf` to generate it.',
    cmdDownloadStudyNotAvailable:
      'optimization study pdf not available right now — reach out and I will send it.',
    cmdDownloadReplicatesNotAvailable:
      'replicates pdf not available right now — reach out and I will send it.',
    cmdDownloadResultsNotAvailable:
      'skill-auditor results pdf not available right now — reach out and I will send it.',
    cmdDownloadFinnishNotAvailable:
      'rag finnish study pdf not available right now — reach out and I will send it.',
    cmdDownloadMethodologyNotAvailable:
      'rag finnish methodology pdf not available right now — reach out and I will send it.',
    cmdDownloadBlindTestNotAvailable:
      'rag blind test pdf not available right now — reach out and I will send it.',
    cmdDownloadPoroNotAvailable:
      'poro findings pdf not available right now — reach out and I will send it.',
    cmdDownloadTranslationsNotAvailable:
      'translation audit pdf not available right now — reach out and I will send it.',
    cmdDownloadDelegationNotAvailable:
      'agent delegation measurement pdf not available right now — reach out and I will send it.',
    cmdDownloadMeantime: 'in the meantime, reach out:',
    cmdDownloadStarted: 'download started.',
    cmdClearDesc: 'clear the screen',
    cmdManDesc: 'show usage for a command',
    cmdManUsage: 'man <command>',
    cmdManNoEntry: 'no manual entry for',
    cmdManNameLabel: 'NAME',
    cmdManUsageLabel: 'USAGE',
    cmdSkillsDesc: 'list claude code skills across all repos',
    cmdSkillsUsage: 'usage: skills [--repo <name>|--all|--json]',
    cmdSkillsUnknownFlag: 'unknown flag:',
    cmdSkillsLoading: 'loading skill registry...',
    cmdSkillsNotGenerated: 'skill registry not generated yet.',
    cmdSkillsNotGeneratedHint:
      'run the `skill-registry` skill locally, then drop the json at public/data/skills-registry.json.',
    cmdSkillsGeneratedLabel: 'generated:',
    cmdSkillsAggregateTip: 'tip: `skills --repo <name>` or `skills --all` for details.',
    cmdSkillsRepoNotFound: 'repo not found:',
    cmdSkillsJsonOpened: 'opened skills-registry.json in new tab.',
    cmdSkillsColRepo: 'Repo',
    cmdSkillsColSkills: 'Skills',
    cmdSkillsColRedirects: 'Redirects',
    cmdSkillsColReceipts: 'Receipts',
    cmdSkillsColTokensYr: 'Tokens/yr',
    cmdSkillsTotal:
      'total: {skills} skills · {redirects} redirects · {receipts} with receipts · ~{tokens} tokens/yr',
    cmdSkillsNoSkills: '(no skills)',
    cmdSkillsKnownRepos: 'known repos:',
    cmdSkillsReceiptLabel: '[receipt]',
    cmdSkillsPerYear: '/yr',
    cmdLsDesc: 'list projects (try `ls projects`)',
    cmdLsNoSuch: 'No such file or directory',
    cmdCatDesc: 'print a project or the cv (e.g. `cat projects/hrm`)',
    cmdCatUsage: 'usage: cat <path> — try `cat projects/hrm` or `cat cv`',
    cmdCatNoSuch: 'No such file or directory',
    cmdCvDesc: 'short cv summary',
    cmdCvDownloadHint: 'run `download --cv` for the full résumé (pdf).',
    cmdSudoDesc: 'execute a command as another user',
    cmdSudoHire:
      'access granted. drafting the offer letter — reach me at the email above.',
    cmdSudoDenied: 'nice try. this incident will (not) be reported.',
    cmdRmDesc: 'remove files',
    cmdRmRefusal: "i'm afraid i can't let you do that. nothing here is yours to delete.",
    chatIntroReady: 'conversation mode online.',
    chatIntroHow: 'ask about the projects in your own words, no command needed.',
    chatThinking: '...thinking',
    chatError: 'connection lost — back to scripted mode.',
    chatAskUsage: 'usage: ask "your question about the projects"',
    chatHint: '…or just ask about the projects',
  },
  langSwitcher: {
    label: 'Language',
    en: 'EN',
    fi: 'FI',
    sv: 'SV',
  },
  notFound: {
    title: 'Page not found · mikkonumminen.dev',
    description: "The page you're looking for doesn't exist.",
    heading: 'Page not found',
    message: "This route doesn't exist on this site.",
    navAria: 'Return to a page',
    linkHome: 'Home',
    linkProjects: 'Projects',
    linkExperience: 'Experience',
    linkContact: 'Contact',
  },
  bgAudio: {
    soundOn: 'sound on',
    soundOff: 'sound off',
  },
};
