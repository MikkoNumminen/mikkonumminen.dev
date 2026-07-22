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
    body: "I build software around language models and then spend most of my time babysitting them, because a model that's wrong and sure of it is a special kind of problem. I got here in 2022 after 24 years selling hardware, so I'm the guy who reads the manual and still expects the thing to break. I measure what I build. Sometimes I measure it, publish it, and then find out the measurement was the broken part, which is a humbling way to learn that the instrument needs checking too.",
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
    keyHeading: 'Key',
    keyConnectionsLabel: 'Connections',
    keyExternalDesc: 'orbiting satellite — connects to an outside service',
    listHeading: 'Jump to project',
    listAriaLabel: 'Project list',
    connectionKindLabels: {
      submodule: 'submodule',
      voice: 'voice',
      music: 'music',
      port: 'port',
    },
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack HR management system',
      description:
        'Production-ready HR system built to portfolio standards. Two databases (PostgreSQL for structured data, MongoDB for an immutable, hash-chained audit log), 38 granular permissions with per-user overrides, TOTP 2FA, server-side rate limiting, OpenTelemetry tracing, 18 languages, and real-time activity notifications over SSE (with polling fallback).',
      highlights: ['2906+ tests', '92.2% coverage', 'PostgreSQL + MongoDB'],
    },
    platform: {
      tagline: 'Community platform built on HRM',
      description:
        'Live community platform serving a real WoW guild at vuohiliitto.com. Turborepo monorepo with HRM as a git submodule. Multi-tenant, with WoW-themed gamification (XP, levels, achievements, quests), tabbed chat with whispers and slash commands, a Mythic+ team tracker via the Raider.IO API, and a guided tour for new members.',
      highlights: ['Real users', 'Multi-tenant', '1388+ tests'],
    },
    portfolio: {
      tagline: 'This site',
      description:
        'The site you are looking at. Fully static, built with Astro, Three.js and GSAP. A visual showcase of motion craft, intentionally separate from the production stack used in HRM and Platform.',
    },
    readlog: {
      tagline: "Track every book you've read",
      description:
        'Personal reading tracker. Searches Open Library and Google Books in parallel and deduplicates results, then lets you log books with format (paper / e-book / audiobook), a 0–5 star rating, and finish date. Public anonymous feed of recently logged books on the homepage.',
      highlights: ['90 tests', 'Multi-source search'],
    },
    'readlog-dotnet': {
      tagline: 'ReadLog, ported to ASP.NET Core',
      description:
        'An idiomatic ASP.NET Core port of ReadLog, running live and free on Azure App Service. The same reading-log app — search Open Library and Google Books, log books with format, finish date, and a 0–5 rating, then browse your library and a public "recently read" feed — re-expressed in .NET 8 Razor Pages, EF Core + SQLite, and ASP.NET Core Identity (local and Google sign-in). Containerized and shipped by a reviewer-gated GitHub Actions pipeline to GHCR, then on to Azure over OIDC; EF Core migrations apply on first run.',
      highlights: [
        'ASP.NET Core 8 port',
        'Live on Azure App Service',
        'EF Core · SQLite · OIDC deploy',
      ],
    },
    audiobookmaker: {
      tagline: 'PDF → audiobook',
      description:
        'Desktop app that turns PDF, EPUB, Word/DOCX, or plain text files into audiobooks; scanned PDFs are run through Tesseract OCR first. Four TTS engines: Edge-TTS (cloud, 30+ voices in 6 languages), Piper (offline, no GPU needed), Chatterbox with the "Grandmom" voice for voice cloning from a short reference clip, and VoxCPM2 for zero-shot voice cloning and voice design from text (NVIDIA GPU, developer setup only). The same Chatterbox engine voices the in-game story of Spacepotatis. English output quality is already strong; Finnish is harder to synthesize with available resources, so it gets a dedicated 19-pass text normalization pipeline that handles governor-word number inflection, abbreviation expansion, unit agreement, and loanword respelling — advancing with every release. Ships as a Windows installer with auto-updates and 3000+ tests.',
      highlights: [
        'Chatterbox voice cloning with the Grandmom voice',
        '19-pass Finnish text normalization, 3000+ tests',
        'Voices the in-game story of Spacepotatis',
      ],
    },
    spacepotatis: {
      tagline: 'Browser shooter — your potato vs the galaxy',
      description:
        'Live browser game where a potato in a shield bubble shoots bugs across a procedural galaxy. Boots like a vintage terminal, opens into a 3D solar system you drag and zoom, drops you into top-down vertical combat in the spirit of Tyrian 2000. Next.js 16 + React 19 wraps a Phaser 4 combat scene; Three.js + GSAP power the galaxy view and the camera transition into combat; PostgreSQL on Neon is talked to via Kysely (typed SQL builder, no ORM). All voice generated by AudiobookMaker; all music written in strudel-patterns. Ships a catalog of custom Claude Code skills under .claude/skills/ — version-controlled, audited, treated as production artifacts.',
      highlights: [
        'Next.js 16 + Phaser 4 + Three.js',
        '~1300 tests, CI on every push',
        'Custom Claude Code skills as production artifacts',
      ],
    },
    'strudel-patterns': {
      tagline: 'Algorithmic music in Strudel',
      description:
        'Live-coded electronic music written in Strudel — a JavaScript pattern engine, port of TidalCycles. Every track is a single composable expression: stacked synths, basslines, drum patterns, and effect chains. Composed through a structured AI workflow — natural-language direction → generation → listen → iterate, with decisions logged alongside the git history. Selected tracks score Spacepotatis (galaxy overworld, mission themes, story narration bed) and the mikkonumminen.dev landing page. Reusable component library, curated synth presets, session notes per iteration.',
      highlights: [
        'Live-coded in Strudel',
        'AI-directed iteration, logged in git',
        'Soundtrack to Spacepotatis and mikkonumminen.dev',
      ],
    },
    'claude-continue': {
      tagline: 'Keep Claude Code windows back-to-back',
      description:
        "A cross-platform Python tool — a CLI plus a one-button Tkinter GUI — that keeps Claude Code's 5-hour usage windows running back-to-back. It reads the active window's reset time from ccusage, waits for the rollover, then resumes paused sessions — broadcasting to iTerm2 on macOS, typing into tmux panes on macOS or Linux, or a headless run on Windows/WSL — and re-arms for the next window. Runs unattended via launchd (macOS) or Windows Task Scheduler. Built for long autonomous agent runs, and honest about the review debt that pattern creates.",
      highlights: [
        'Python · Tkinter GUI',
        'macOS · Windows · WSL · Linux (tmux)',
        'Unattended via launchd / Task Scheduler',
      ],
    },
    passwordmanager: {
      tagline: 'Zero-knowledge password manager in Rust',
      description:
        'Local-first password manager where a single Rust crate is the only place crypto exists — Argon2id key derivation and XChaCha20-Poly1305 authenticated encryption, compiled natively and to WebAssembly. Four clients share it: an offline-first CLI vault on SQLite, a sync server that stores ciphertext only, an in-browser WASM client, and a Chrome extension with autofill and save-on-login. Per-entry nonces and AEAD bound to entry id + timestamp block record swapping; keys are zeroized after use; the master password never leaves the client. Every security choice is recorded as an ADR against an explicit threat model, and CI guards secrets out of the repo while running format, clippy, the full workspace tests, and the wasm build.',
      highlights: [
        'One crypto crate, four clients',
        'Argon2id + XChaCha20-Poly1305',
        'Server stores ciphertext only',
      ],
    },
    'claude-agents': {
      tagline: 'Cost-routing subagents for Claude Code',
      description:
        'A small global set of Claude Code subagents that stops paying Opus prices for work a cheaper model does just as well. Twelve agents, each pinning both model tier and reasoning effort in its frontmatter: Haiku for read-only recon (scout, log-miner, scribe, dep-checker, tidy), Sonnet for spec-driven edits (mechanic, test-writer, locale-translator, doc-scribe, migrator, bisect), and an unpinned architect that inherits the session model for design work. Agents auto-detect each repo’s stack — test runner, linter, i18n layout — so one set covers JS, C#, and Python projects. Installs as a Claude Code plugin from a shared marketplace or via script. MIT-licensed.',
      highlights: [
        '12 model-pinned agents',
        'Decouples model tier from reasoning effort',
        'Plugin or script install',
      ],
    },
    'feedback-intelligence': {
      tagline: 'Grounded feedback analysis with a local LLM',
      description:
        'Feedback-intelligence engine that turns messy free-text feedback into situational signal without letting the LLM near the numbers: a deterministic, rule-coded alert layer computes every count and trend, and the LLM only structures input and synthesizes theme narratives — each claim cited back to feedback ids and dropped to a fallback if it fails validation. Domains are pluggable modules (first: Finnish hybrid grocery–hardware retail); a config flag swaps in another domain with zero core edits. .NET 8 over a local Poro 2 8B on Ollama — picked in a 30-round blind test — with a live demo on Azure Static Web Apps reaching the local GPU through a Tailscale Funnel at zero cloud-inference cost. GDPR-clean synthetic corpus, prompt-injection defense in depth, hermetic xUnit suite in CI.',
      highlights: [
        'Deterministic alerts — LLM never computes the numbers',
        'Pluggable domains, zero core edits',
        'Live demo on Azure, inference on a local GPU',
      ],
    },
  },
  experiencePage: {
    eyebrow: 'the climb',
    title: 'Experience',
    lede: 'Scroll up the mountain. Each marker is a step from base camp to where I stand today.',
    scrollHint: 'scroll',
    kindFoundation: 'foundation',
    kindWork: 'work',
    kindLife: 'life',
    kindProject: 'project',
    kindCraft: 'craft',
    kindNow: 'now',
    summit: 'You reached the summit.',
    cta: 'drop into the terminal →',
    lessonsAriaLabel: 'Lessons from this chapter',
    yearNow: 'Now',
  },
  timelineData: {
    'hardware-retail': {
      title: 'Hardware retail',
      body: '24 years in hardware retail, mostly at the family business. Decor, renovation, tools, construction — every category, every kind of customer. The kind of job that teaches you what users actually need before you ever put a screen between you and them.',
      tags: ['Customer service', 'Family business', '24 years'],
    },
    kasvulabs: {
      title: 'Kasvu Labs Oy',
      body: 'First paid programming role. Node.js backend, React frontend, working with large sets of open data. Full-stack development, UI design, database management on Azure, product maintenance.',
      tags: ['Node.js', 'React', 'Open data', 'PostgreSQL', 'Azure'],
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
      title: 'Looking up',
      body: 'Available now. Open to ambitious full-stack roles where craft and velocity both matter. Nine solo-shipped projects this year — proof of both.',
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
      'the research — 10 pdfs: the skills suite + the rag finnish study + the poro findings + the translation audit (not a download)',
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
