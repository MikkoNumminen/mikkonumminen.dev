import type { Translations } from '../types';

export const sv: Translations = {
  meta: {
    jobTitle: 'Fullstack-utvecklare',
    home: {
      title: 'Mikko Numminen — full-stack-utvecklare',
      description:
        'Portfolio för Mikko Numminen, en full-stack-utvecklare från Finland som bygger produktionsklara webbapplikationer med AI-assisterade arbetsflöden.',
    },
    contact: {
      title: 'Kontakt — Mikko Numminen',
      description:
        'Nå Mikko Numminen — interaktiv terminal med e-post, länkar och CV-nedladdning.',
    },
    projects: {
      title: 'Projekt — Mikko Numminen',
      description: 'Interaktivt solsystem av utvalda projekt av Mikko Numminen.',
    },
    experience: {
      title: 'Erfarenhet — Mikko Numminen',
      description:
        'Klättra uppför berget — Mikko Numminens erfarenhet, kompetenser och milstolpar från baslägret till idag.',
    },
  },
  nav: {
    home: 'hem',
    projects: 'projekt',
    experience: 'erfarenhet',
    contact: 'kontakt',
    primaryAria: 'Huvudmeny',
    languageSwitcherAria: 'Språk',
    skipToContent: 'Hoppa till innehåll',
  },
  hero: {
    sectionAria: 'Mikko Numminen — full-stack-utvecklare',
    eyebrow: 'portfolio · 2026',
    titleSrOnly: 'Mikko Numminen',
    titleFallbackTop: 'MIKKO',
    titleFallbackBottom: 'NUMMINEN',
    subtitle: 'full-stack-utvecklare · finland',
    scrollHint: 'scrolla',
  },
  intro: {
    sectionAria: 'Om',
    eyebrow: 'om',
    heading: 'Sju repon. De bygger på varandra.',
    body: 'Full-stack-utvecklare i Finland. HRM är den arkitektoniska ryggraden i Platform — live för ett riktigt WoW-gille på vuohiliitto.com. AudiobookMaker ger rösten åt Spacepotatis, ett webbläsarspel jag släppte i år; strudel-patterns skriver musiken. Varje repo står för sig själv — fogarna mellan dem är poängen.',
    statTests: 'tester i det största projektet',
    statCoverage: 'radtäckning',
    statProducts: 'levererade projekt',
  },
  focus: {
    sectionAria: 'Så hänger projekten ihop',
    eyebrow: 'kopplingar',
    heading: 'Så hänger projekten ihop.',
    items: [
      {
        title: 'Repon som matar varandra',
        body: 'HRM körs som git-undermodul inuti Platform — samma autentisering, samma granskningslogg, två produkter ur en kärna. AudiobookMaker ger rösten åt Spacepotatis; strudel-patterns skriver musiken. Varje replik och varje not spåras tillbaka till ett repo jag äger själv.',
      },
      {
        title: 'Testat eller det skeppas inte',
        body: 'Varje repo kör CI vid varje push. HRM har 1828+ tester med 91,9 % täckning, Spacepotatis ~1170, AudiobookMaker över 1800. Kvalitetsportar väger tyngre än den häftigaste stacken.',
      },
      {
        title: 'AI-nativt, dokumenterat',
        body: 'Spacepotatis levererar tio egna Claude Code-skills under .claude/skills/ — versionshanterade, granskade varje kvartal, behandlade som produktionsartefakter. Parprogrammering med AI är en del av verktygskedjan; granskningsspåret är kvittot.',
      },
    ],
  },
  integrations: {
    sectionAria: 'Externa integrationer',
    eyebrow: 'integrationer',
    heading: 'Kopplad till världen.',
    items: [
      {
        project: 'Platform',
        api: 'Raider.IO API',
        body: 'Live Mythic+-teamspårning för ett riktigt WoW-gille. Rosters, senaste runs och rio-poäng hämtas färska vid varje laddning — inga inaktuella skärmdumpar. Inloggning via Google- eller GitHub-OAuth, plus en lösenordsfri demo för besökare.',
      },
      {
        project: 'ReadLog',
        api: 'Open Library + Google Books',
        body: 'Två bok-API:er körs parallellt; den med renare data vinner. Dubletter slås ihop innan de når gränssnittet. Inloggning via Google-OAuth.',
      },
      {
        project: 'AudiobookMaker',
        api: 'Microsoft Edge-TTS',
        body: '30+ molnröster på sex språk, ovanpå två lokala motorer (Piper, Chatterbox). Välj rösten som passar boken.',
      },
      {
        project: 'Spacepotatis',
        api: 'Google OAuth',
        body: 'Inloggning är valfri. Spela offline för evigt, eller logga in för molnsparningar och en plats på topplistan.',
      },
    ],
  },
  velocity: {
    sectionAria: 'Utvecklingstempo',
    eyebrow: 'tempo',
    heading: 'Snabbt — på riktigt.',
    body: 'Spacepotatis gick från tomt repo till live webbläsarspel på 12 dagar: 387 commits, ~1170 tester, tio granskade Claude Code-skills, hela Next.js + Phaser 3 + Three.js-stacken. Sex av sju portföljrepor startade under de senaste sex veckorna. AI-nativt är inte snack — det är matematik.',
    stats: [
      { num: '12', label: 'dagar från tomt repo till live Spacepotatis' },
      { num: '387', label: 'Spacepotatis-commits' },
      { num: '~1170', label: 'Spacepotatis-tester som går igenom' },
    ],
  },
  navCards: {
    sectionAria: 'Utforska resten av sajten',
    eyebrow: 'fortsätt',
    heading: 'Välj en värld.',
    projects: {
      label: 'Projekt',
      description: 'Utforska ett interaktivt solsystem av saker jag har byggt.',
    },
    experience: {
      label: 'Erfarenhet',
      description:
        'Klättra uppför ett parallaxberg genom kompetenser, verktyg och milstolpar.',
    },
    contact: {
      label: 'Kontakt',
      description: 'Hoppa in i en terminal och nå mig direkt.',
    },
    footerCopyright: '© 2026 Mikko Numminen',
    footerBuiltWith: 'byggt med astro · three.js · gsap',
  },
  projectsPage: {
    eyebrow: 'Utvalt arbete',
    title: 'Projekt',
    lede: 'Ett litet solsystem av saker jag har byggt. Hovra över en planet för hisspresentationen, klicka för att zooma in.',
    legendHover: 'för att inspektera',
    legendClick: 'en planet för att fokusera',
    legendDrag: 'för att rotera vyn',
    legendZoom: 'för att zooma in / ut',
    detailAria: 'Projektdetaljer',
    closeAria: 'Stäng projektdetaljer',
    techLabel: 'Teknik',
    externalApisLabel: 'Integrationer',
    // "live demo" doesn't translate idiomatically; the Finnish/Swedish UI uses just "demo".
    liveDemo: 'demo →',
    githubLink: 'github',
    gridAria: 'Projekt',
    gridLede:
      'Saker jag har byggt. Skrivbordsvyn visar dem som ett interaktivt solsystem — här är den läsbara listan.',
    keyHeading: 'Förklaring',
    keyConnectionsLabel: 'Kopplingar',
    keyExternalDesc: 'satellit i bana — kopplar till en extern tjänst',
    listHeading: 'Hoppa till projekt',
    listAriaLabel: 'Projektlista',
    connectionKindLabels: {
      submodule: 'undermodul',
      voice: 'röst',
      music: 'musik',
    },
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack-system för personalhantering',
      description:
        'Produktionsklart HR-system byggt enligt portföljstandard. Två databaser (PostgreSQL för strukturerad data, MongoDB för en oföränderlig hash-kedjad granskningslogg), 34 finkorniga behörigheter med användarspecifika undantag, TOTP-tvåfaktorsautentisering, hastighetsbegränsning på serversidan, OpenTelemetry-spårning, 18 språk och realtidsaktivitetsnotiser via SSE (med pollning som reserv).',
      highlights: ['1828+ tester', '91,9 % radtäckning', 'PostgreSQL + MongoDB'],
    },
    platform: {
      tagline: 'Communityplattform byggd ovanpå HRM',
      description:
        'Live communityplattform som tjänar ett riktigt WoW-gille på vuohiliitto.com. Turborepo-monorepo med HRM som git-undermodul. Fleranvändarstöd med WoW-temad spelifiering (XP, nivåer, prestationer, uppdrag), flikbaserad chatt med viskningar och slash-kommandon, en Mythic+-teamspårare via Raider.IO API och en guidad rundtur för nya medlemmar.',
      highlights: ['Riktiga användare', 'Fleranvändarstöd', '1388+ tester'],
    },
    portfolio: {
      tagline: 'Den här sajten',
      description:
        'Sajten du tittar på just nu. Helt statisk, byggd med Astro, Three.js och GSAP. En visuell uppvisning av rörelsehantverk, medvetet skild från produktionsstacken som används i HRM och Platform.',
    },
    readlog: {
      tagline: 'Spåra varje bok du läst',
      description:
        'Personlig läsdagbok. Söker i Open Library och Google Books parallellt och avduplicerar resultat, sedan kan du logga böcker med format (papper / e-bok / ljudbok) och slutdatum. Publikt anonymt flöde av nyligen loggade böcker på startsidan.',
      highlights: ['68 tester', 'Sökning från flera källor'],
    },
    audiobookmaker: {
      tagline: 'PDF → ljudbok',
      description:
        'Skrivbordsapp som omvandlar PDF-, EPUB- och textfiler till ljudböcker; skannade PDF:er körs först genom Tesseract-OCR. Fyra TTS-motorer: Edge-TTS (moln, 30+ röster på sex språk), Piper (offline, ingen GPU krävs), Chatterbox med "Grandmom"-rösten för röstkloning från ett kort referensklipp och VoxCPM2 för zero-shot röstkloning och röstdesign från text (kräver NVIDIA-GPU, endast utvecklarinstallation). Samma Chatterbox-motor ger rösten åt berättelsen i Spacepotatis. Engelsk talsyntes fungerar redan bra; finska är svårare att syntetisera med tillgängliga resurser, så den har en dedikerad 16-stegs textnormaliseringspipeline som hanterar kontextbaserad nummerböjning, förkortningsexpansion, enhetsavtal och lånordsuttalskorrigeringar — kvaliteten förbättras med varje release. Levereras som en Windows-installerare med automatiska uppdateringar och 2400+ tester.',
      highlights: [
        'Chatterbox röstkloning med Grandmom-rösten',
        '16-stegs finsk textnormalisering, 2400+ tester',
        'Ger rösten åt berättelsen i Spacepotatis',
      ],
    },
    spacepotatis: {
      tagline: 'Webbläsarspel — din potatis mot galaxen',
      description:
        'Live webbläsarspel där en potatis i en sköldbubbla skjuter buggar tvärs över en procedurell galax. Bootar som en vintage-terminal, öppnar sig till ett 3D-solsystem du drar och zoomar, släpper sedan dig i top-down vertikal strid i andan av Tyrian 2000. Next.js 15 + React 19-skal runt en Phaser 3-stridsscen; Three.js + GSAP driver galaxvyn och kameraövergången in i strid; PostgreSQL på Neon talas till via Kysely (typad SQL-byggare, ingen ORM). All röst genererad av AudiobookMaker; all musik skriven i strudel-patterns. Levereras med tio egna Claude Code-skills under .claude/skills/ — versionshanterade, granskade kvartalsvis, behandlade som produktionsartefakter.',
      highlights: [
        'Next.js 15 + Phaser 3 + Three.js',
        '~1170 tester, CI vid varje push',
        '10 egna Claude Code-skills som produktionsartefakter',
      ],
    },
    'strudel-patterns': {
      tagline: 'Algoritmisk musik i Strudel',
      description:
        'Live-kodad elektronisk musik skriven i Strudel — en JavaScript-mönstermotor, port av TidalCycles. Varje spår är ett enda komponerbart uttryck: staplade synthar, baslinjer, trumkomp och effektkedjor. Skapad genom ett strukturerat AI-arbetsflöde — instruktion på naturligt språk → generering → lyssna → iterera, med beslut loggade vid sidan av git-historiken. Utvalda spår tonsätter Spacepotatis (galaxvy, missionsteman, berättelsebakgrund) och landningssidan på mikkonumminen.dev. Återanvändbart komponentbibliotek, kuraterade synthpresets, sessionsanteckningar per iteration.',
      highlights: [
        'Live-kodat i Strudel',
        'AI-styrd iteration, loggad i git',
        'Soundtrack till Spacepotatis och mikkonumminen.dev',
      ],
    },
  },
  experiencePage: {
    eyebrow: 'klättringen',
    title: 'Erfarenhet',
    lede: 'Scrolla uppför berget. Varje markering är ett steg från baslägret till där jag står idag.',
    scrollHint: 'scrolla',
    kindFoundation: 'grund',
    kindWork: 'arbete',
    kindLife: 'liv',
    kindProject: 'projekt',
    kindCraft: 'hantverk',
    kindNow: 'nu',
    summit: 'Du nådde toppen.',
    cta: 'hoppa in i terminalen →',
    lessonsAriaLabel: 'Lärdomar från detta kapitel',
    yearNow: 'Nu',
  },
  timelineData: {
    'hardware-retail': {
      title: 'Järnhandel',
      body: '24 år inom järnhandeln, mestadels i familjeföretaget. Inredning, renovering, verktyg, byggvaror — varje kategori, varje typ av kund. Den sortens jobb som lär dig vad användare faktiskt behöver innan du sätter en skärm mellan dig och dem.',
      tags: ['Kundservice', 'Familjeföretag', '24 år'],
    },
    kasvulabs: {
      title: 'Kasvu Labs Oy',
      body: 'Första betalda programmeringsjobbet. Node.js-backend, React-frontend, arbete med stora mängder öppen data. Full-stack-utveckling, UI-design, databashantering på Azure, produktunderhåll.',
      tags: ['Node.js', 'React', 'Öppen data', 'PostgreSQL', 'Azure'],
    },
    father: {
      title: 'Att bli pappa',
      body: 'Tog ett steg tillbaka från heltidsarbete för familjen. Personliga projekt fortsatte i bakgrunden.',
    },
    'ai-workflows': {
      title: 'AI-nativa arbetsflöden',
      body: 'Agentisk, AI-assisterad utveckling som en versionerad disciplin. Anpassade Claude Code-skills checkas in i repot som produktionsartefakter — varje skill lär agenten ett projektspecifikt recept (lägg till en fiende, släpp en databasmigration, granska sparpipelinen) så att den går rakt på sak istället för att grepa runt vid varje anrop. Parprogrammering med parallella delagenter över oberoende delar, sedan syntes av resultaten.\n\nSkillsen är versionshanterade, granskas kvartalsvis (drift mellan en skill och koden den refererar till är en verklig kategori av buggar — två sådana fångades i den senaste granskningen), och behandlas som produktionsartefakter. Uppskattad besparing enbart i Spacepotatis: ~2,76 miljoner token per år. Snabbare leverans utan att sänka ribban.',
      tags: [
        'Agentisk utveckling',
        'Anpassade skills',
        'Delagenter',
        'Versionerat flöde',
        'Tempo',
      ],
    },
    '2026-build': {
      title: '2026 — byggåret',
      body: 'I maj 2026: sju full-stack-projekt levererade solo på tolv månader. Riktiga användare, riktig drift, fullt ägarskap från schema till deploy.',
      tags: [
        '7 repos',
        'Riktiga användare',
        'Next.js',
        'Astro',
        'Three.js',
        'Phaser 3',
        'Python',
        'Turborepo',
      ],
      lessons: [
        {
          title: 'Triage före omdesign',
          body: 'När save-korruption slog till i Spacepotatis i maj 2026: serversideguard samma dag, audit-tabell dagen efter, arkitektonisk fix först efter en vecka av riktig data. Mitigera → observera → arkitektur.',
        },
        {
          title: 'AI-flöde som incheckad kod',
          body: 'Spacepotatis levererar tio Claude Code-skills i repot — kodgranskade, auditerade kvartalsvis. ~2,76M token sparat under första året.',
        },
        {
          title: 'Ingen verktygsinlåsning',
          body: 'AudiobookMaker kör tre TTS-motorer under en pipeline — Edge-TTS, Piper, Chatterbox. Användaren väljer per bok.',
        },
        {
          title: 'Mutationstestning > coverage',
          body: 'HRM kör Stryker på varje PR. 91,9 % radtäckning betyder att raderna kördes; mutationspoäng betyder att assertions faktiskt fångar buggar.',
        },
        {
          title: 'Fixa uppströms, inte lokalt',
          body: 'Diagnostiserade en minnesläcka djupt i Chatterboxs inferensbana; skickade två PR:ar uppströms till resemble-ai/chatterbox (#505, #510), båda öppna och bumpade av andra bidragsgivare.',
        },
        {
          title: 'Solo full-stack, inga köer',
          body: 'SQL, app-kod, CI, Vercel-deployer, signerade Windows-installerare via GitHub Releases, OpenTelemetry — ägt från ände till ände över alla sju projekt.',
        },
      ],
    },
    'skill-receipts': {
      title: 'Mätte AI-arbetsflödet',
      body: 'Efter ett år av att hävda att arbetsflödet lönade sig körde jag A/B. Varje anpassad Claude Code-skill mätt mot sig själv kall — samma uppgift, delagent på, delagent av — på Sonnet, Opus och Haiku. 34 skills, 33 kalibrerade. Aggregerad besparing: +17 %, ~327K token över portföljen.\n\nDet publicerade registret inkluderar skillsen som kostade MER än att gå kall. De är inte misslyckanden — de bär stringens som den kalla armen hoppade över (auditgrundlighet, protokolldisciplin, spec-djup). Värdet är fullständighet, inte komprimering. PDF:en går att ladda ner från contact-terminalen; varje siffra är spårbar till ett riktigt transkript.',
      tags: [
        'A/B-kalibrerat',
        '34 skills',
        'Publicerad PDF',
        'Ärlig redovisning',
        'Sonnet · Opus · Haiku',
      ],
    },
    now: {
      title: 'Blickar uppåt',
      body: 'Tillgänglig nu. Öppen för ambitiösa full-stack-roller där både hantverk och tempo räknas. Sju solo-levererade projekt i år — bevis på båda.',
      tags: ['Tillgänglig', 'Distans / Finland'],
    },
  },
  contactPage: {
    h1: 'Kontakt',
    interactiveAria: 'Interaktiv terminal',
    windowTitle: 'mikko@portfolio — zsh — 96×30',
    inputAria: 'Terminalkommando-fält',
    hintType: 'skriv',
    hintHistory: 'historik',
    hintComplete: 'komplettera',
    noscriptIntro: 'Den här sidan är en interaktiv terminal som kräver JavaScript.',
    noscriptReachMe: 'Du kan ändå nå mig direkt:',
    noscriptEmailLabel: 'E-post:',
    noscriptGithubLabel: 'GitHub:',
  },
  mobileContact: {
    typedWhoamiOutputName: 'mikko numminen — full-stack-utvecklare · finland',
    typedWhoamiOutputBio:
      'levererar full-stack-produktionsappar från ände till ände. sql till drift.',
    typedContactLabelEmail: 'e-post',
    typedContactLabelLinkedin: 'linkedin',
    typedContactLabelGithub: 'github',
    typedContactLabelLocation: 'plats',
    typedContactValueLocation: 'finland · distansvänligt',
    typedDownloadOutput: 'klar.',
    btnEmail: 'Mejla mig',
    btnLinkedin: 'LinkedIn',
    btnDownloadCv: 'Ladda ner CV',
    cardAria: 'Mobil kontaktkort med automatiskt uppspelad terminalsession',
    ariaLinkedIn: 'LinkedIn (öppnas i en ny flik)',
  },
  terminal: {
    bootBooting: 'startar mikkOS v1.0.0 ...',
    bootMounting: '[ ok ] monterar /portfolio',
    bootLoading: '[ ok ] laddar projekt, erfarenhet, kontakt',
    bootComms: '[ ok ] etablerar kommunikationslänk',
    bootWelcome: 'välkommen till mikko numminen — full-stack-utvecklare.',
    bootTypeHelp: 'skriv `help` för att se vad jag kan göra.',
    commandNotFound: 'kommando hittades inte:',
    typeHelpHint: 'skriv `help` för att se tillgängliga kommandon.',
    errorPrefix: 'fel:',
    copyButton: 'kopiera',
    copyDone: 'kopierat!',
    copyFallback: 'tryck ctrl+c',
    cmdHelpDesc: 'lista tillgängliga kommandon',
    cmdHelpAvailable: 'tillgängliga kommandon:',
    cmdHelpTip: 'tips: prova `whoami`, `contact --email` eller `download --cv`.',
    cmdWhoamiDesc: 'kort bio',
    cmdWhoamiName: 'mikko numminen',
    cmdWhoamiTitle: 'full-stack-utvecklare · finland',
    cmdWhoamiIntro:
      'levererar full-stack-produktionsappar från ände till ände. sql till drift.',
    cmdWhoamiLargest: 'störst:',
    cmdWhoamiAlso: 'även:',
    cmdWhoamiYear: 'i år:',
    cmdWhoamiCommunity: 'gemenskap',
    cmdWhoamiDesktop: 'skrivbord',
    cmdWhoamiGame: 'spel',
    cmdWhoamiCurrently: 'tillgänglig nu för ambitiösa full-stack-roller.',
    cmdContactDesc: 'visa kontaktinfo',
    cmdContactUsage: 'användning: contact [--email]',
    cmdContactUnknownFlag: 'okänd flagga:',
    cmdContactEmailLabel: 'e-post:',
    cmdLinksDesc: 'visa onlineprofiler',
    cmdLinksUsage: 'användning: links [--github|--linkedin|--all]',
    cmdLinksUnknownFlag: 'okänd flagga:',
    cmdDownloadDesc: 'ladda ner en fil',
    cmdDownloadUsage: 'download [--cv|--skills|--study|--replicates|--results]',
    // i18n: awaiting Swedish translation — English placeholders for now.
    cmdDownloadIntro: "pick what you'd like to grab:",
    cmdDownloadOptionCv: 'my cv — pdf, full résumé',
    cmdDownloadOptionSkills:
      'every claude code skill across my portfolio — pdf, token savings measured against going cold',
    cmdDownloadOptionStudy:
      'the 5-round before/after study measuring whether a SKILL.md change actually cut tokens — pdf',
    cmdDownloadOptionReplicates:
      'round-6 replication — the noisiest study cells re-measured at depth to settle the N=1 anomalies (per-cell skill-vs-cold, not a portfolio rate) — pdf',
    cmdDownloadOptionResults:
      'the two skill-auditing skills: what they cost to run, and what they fixed across the portfolio — pdf',
    cmdDownloadScopeNote:
      'note — three lenses, not one figure: +17% across the 34-skill portfolio, 33 calibrated (--skills); +36% for the two skill-auditors alone (--results); those same two auditors re-measured at depth land at 54–85% per cell (--replicates).',
    cmdDownloadTryHint:
      'try `download --cv`, `download --skills`, `download --study`, `download --replicates`, or `download --results`.',
    // i18n: awaiting Swedish translation — English placeholder for now.
    cmdDownloadAmbiguous:
      'specify only one of --cv, --skills, --study, --replicates, or --results.',
    cmdDownloadPreparing: 'förbereder nedladdning...',
    cmdDownloadNotAvailable: 'cv inte tillgänglig än — fortfarande under finputsning.',
    // i18n: awaiting Swedish translation — English placeholder for now.
    cmdDownloadSkillsNotAvailable:
      'skill registry pdf not available yet — run `npm run build:skills-pdf` to generate it.',
    // i18n: awaiting Swedish translation — English placeholder for now.
    cmdDownloadStudyNotAvailable:
      'optimization study pdf not available right now — reach out and I will send it.',
    // i18n: awaiting Swedish translation — English placeholder for now.
    cmdDownloadReplicatesNotAvailable:
      'replicates pdf not available right now — reach out and I will send it.',
    // i18n: awaiting Swedish translation — English placeholder for now.
    cmdDownloadResultsNotAvailable:
      'skill-auditor results pdf not available right now — reach out and I will send it.',
    cmdDownloadMeantime: 'under tiden, hör av dig:',
    cmdDownloadStarted: 'nedladdning startad.',
    cmdClearDesc: 'rensa skärmen',
    cmdManDesc: 'visa användning för ett kommando',
    cmdManUsage: 'man <kommando>',
    cmdManNoEntry: 'ingen manualpost för',
    cmdManNameLabel: 'NAMN',
    cmdManUsageLabel: 'ANVÄNDNING',
    // i18n: awaiting Swedish translation — English placeholders for now.
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
  },
  langSwitcher: {
    label: 'Språk',
    en: 'EN',
    fi: 'FI',
    sv: 'SV',
  },
  notFound: {
    title: 'Sidan hittades inte · mikkonumminen.dev',
    description: 'Sidan du letar efter finns inte.',
    heading: 'Sidan hittades inte',
    message: 'Den här rutten finns inte på den här webbplatsen.',
    navAria: 'Återgå till en sida',
    linkHome: 'Hem',
    linkProjects: 'Projekt',
    linkExperience: 'Erfarenhet',
    linkContact: 'Kontakt',
  },
  bgAudio: {
    soundOn: 'ljud på',
    soundOff: 'ljud av',
  },
};
