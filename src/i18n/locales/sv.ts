import type { Translations } from '../types';

export const sv: Translations = {
  common: {
    opensInNewTab: '(öppnas i en ny flik)',
  },
  meta: {
    jobTitle: 'Fullstack-utvecklare',
    home: {
      title: 'Mikko Numminen — full-stack-utvecklare',
      description:
        'Full-stack-utvecklare i Finland. Arbetsanteckningar och utvalda projekt, levererade solo och AI-nativt som standard.',
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
    blog: {
      title: 'Blogg — Mikko Numminen',
      description:
        'Arbetsanteckningar från Mikko Nummisens projekt. Inlägg skrivna utifrån commit-historiken är märkta som AI-genererade.',
    },
  },
  nav: {
    home: 'hem',
    projects: 'projekt',
    experience: 'erfarenhet',
    blog: 'blogg',
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
    heading: 'En kort introduktion.',
    placeholderNote: 'platshållare, ersätt detta stycke',
    body: 'Det här stycket är en platshållare och har inte skrivits ännu. Det finns här så att sektionen har verklig längd att utgå ifrån. Ersätt den här texten med din egen introduktion och ta sedan bort platshållarmarkeringen ovanför.',
  },
  latestEntries: {
    sectionAria: 'Senaste blogginläggen',
    eyebrow: 'skrivet',
    heading: 'Senaste inläggen.',
    viewAll: 'Alla inlägg',
    empty: 'Inga inlägg publicerade än.',
  },
  navCards: {
    sectionAria: 'Utforska resten av sajten',
    eyebrow: 'fortsätt',
    heading: 'Övrigt på sajten.',
    projects: { label: 'Projekt' },
    experience: { label: 'Erfarenhet' },
    blog: { label: 'Blogg' },
    contact: { label: 'Kontakt' },
    footerCopyright: '© 2026 Mikko Numminen',
    footerBuiltWith: 'byggt med astro · three.js · gsap',
  },
  blog: {
    eyebrow: 'skrivet',
    title: 'Blogg',
    lede: 'Arbetsanteckningar om vad jag har byggt. Vissa inlägg är skrivna av en maskin utifrån commit-historiken, och det står överst i dem.',
    aiBadge: 'AI-genererad',
    aiNotice:
      'Det här inlägget genererades från commit-historiken av en språkmodell. Jag har inte skrivit om det. Betrakta det som en sammanfattning av vad som ändrades, inte som något jag satt mig ner och skrivit.',
    backToIndex: 'Alla inlägg',
    empty: 'Inga inlägg än.',
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
      port: 'portning',
    },
  },
  projectsData: {
    hrm: {
      tagline: 'Full-stack-system för personalhantering',
      description:
        'Produktionsklart HR-system byggt enligt portföljstandard. Två databaser (PostgreSQL för strukturerad data, MongoDB för en oföränderlig hash-kedjad granskningslogg), 38 finkorniga behörigheter med användarspecifika undantag, TOTP-tvåfaktorsautentisering, hastighetsbegränsning på serversidan, OpenTelemetry-spårning, 18 språk och realtidsaktivitetsnotiser via SSE (med pollning som reserv).',
      highlights: ['2906+ tester', '92,2 % radtäckning', 'PostgreSQL + MongoDB'],
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
        'Personlig läsdagbok. Söker i Open Library och Google Books parallellt och avduplicerar resultat, sedan kan du logga böcker med format (papper / e-bok / ljudbok), ett 0–5-stjärnbetyg och slutdatum. Publikt anonymt flöde av nyligen loggade böcker på startsidan.',
      highlights: ['90 tester', 'Sökning från flera källor'],
    },
    'readlog-dotnet': {
      tagline: 'ReadLog, portad till ASP.NET Core',
      description:
        'En idiomatisk ASP.NET Core-portning av ReadLog, körandes live och gratis på Azure App Service. Samma läsdagboksapp — sök i Open Library och Google Books, logga böcker med format, slutdatum och ett 0–5-stjärnbetyg, bläddra i ditt bibliotek och ett publikt "nyligen läst"-flöde — återskapad i .NET 8 Razor Pages, EF Core + SQLite och ASP.NET Core Identity (lokal och Google-inloggning). Containeriserad och levererad av en granskarstyrd GitHub Actions-pipeline till GHCR, sedan vidare till Azure via OIDC; EF Core-migrationer tillämpas vid första körningen.',
      highlights: [
        'ASP.NET Core 8-portning',
        'Live på Azure App Service',
        'EF Core · SQLite · OIDC-deploy',
      ],
    },
    audiobookmaker: {
      tagline: 'PDF → ljudbok',
      description:
        'Skrivbordsapp som omvandlar PDF-, EPUB-, Word/DOCX- och textfiler till ljudböcker; skannade PDF:er körs först genom Tesseract-OCR. Fyra TTS-motorer: Edge-TTS (moln, 30+ röster på sex språk), Piper (offline, ingen GPU krävs), Chatterbox med "Grandmom"-rösten för röstkloning från ett kort referensklipp och VoxCPM2 för zero-shot röstkloning och röstdesign från text (kräver NVIDIA-GPU, endast utvecklarinstallation). Samma Chatterbox-motor ger rösten åt berättelsen i Spacepotatis. Engelsk talsyntes fungerar redan bra; finska är svårare att syntetisera med tillgängliga resurser, så den har en dedikerad 19-stegs textnormaliseringspipeline som hanterar kontextbaserad nummerböjning, förkortningsexpansion, enhetsavtal och lånordsuttalskorrigeringar — kvaliteten förbättras med varje release. Levereras som en Windows-installerare med automatiska uppdateringar och 3000+ tester.',
      highlights: [
        'Chatterbox röstkloning med Grandmom-rösten',
        '19-stegs finsk textnormalisering, 3000+ tester',
        'Ger rösten åt berättelsen i Spacepotatis',
      ],
    },
    spacepotatis: {
      tagline: 'Webbläsarspel — din potatis mot galaxen',
      description:
        'Live webbläsarspel där en potatis i en sköldbubbla skjuter buggar tvärs över en procedurell galax. Bootar som en vintage-terminal, öppnar sig till ett 3D-solsystem du drar och zoomar, släpper sedan dig i top-down vertikal strid i andan av Tyrian 2000. Next.js 16 + React 19-skal runt en Phaser 4-stridsscen; Three.js + GSAP driver galaxvyn och kameraövergången in i strid; PostgreSQL på Neon talas till via Kysely (typad SQL-byggare, ingen ORM). All röst genererad av AudiobookMaker; all musik skriven i strudel-patterns. Levereras med en uppsättning egna Claude Code-skills under .claude/skills/ — versionshanterade, granskade, behandlade som produktionsartefakter.',
      highlights: [
        'Next.js 16 + Phaser 4 + Three.js',
        '~1300 tester, CI vid varje push',
        'Egna Claude Code-skills som produktionsartefakter',
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
    'claude-continue': {
      tagline: 'Håll Claude Code-fönster rygg mot rygg',
      description:
        'Ett plattformsoberoende Python-verktyg — en CLI plus ett enknapps Tkinter-GUI — som håller Claude Codes 5-timmarsfönster för användning igång rygg mot rygg. Det läser det aktiva fönstrets återställningstid från ccusage, väntar på övergången och återupptar sedan pausade sessioner — broadcast till iTerm2 på macOS, till tmux-paneler på macOS eller Linux, eller en headless-körning på Windows/WSL — och laddar om för nästa fönster. Körs oövervakat via launchd (macOS) eller Windows Task Scheduler. Byggt för långa autonoma agentkörningar — och ärligt om den granskningsskuld som det mönstret skapar.',
      highlights: [
        'Python · Tkinter-GUI',
        'macOS · Windows · WSL · Linux (tmux)',
        'Oövervakat via launchd / Task Scheduler',
      ],
    },
    passwordmanager: {
      tagline: 'Nollkunskaps-lösenordshanterare i Rust',
      description:
        'Lokalt förankrad lösenordshanterare där en enda Rust-crate är den enda platsen där kryptering existerar — Argon2id-nyckelderivering och XChaCha20-Poly1305-autentiserad kryptering, kompilerad både nativt och till WebAssembly. Fyra klienter delar den: ett offline-först CLI-valv på SQLite, en synkserver som endast lagrar krypterad text, en WASM-klient i webbläsaren och ett Chrome-tillägg med autofyllning och spara-vid-inloggning. Post-specifika nonces och AEAD bundna till post-id + tidsstämpel förhindrar att poster byts ut; nycklar nollställs efter användning; huvudlösenordet lämnar aldrig klienten. Varje säkerhetsval är dokumenterat som en ADR mot en uttrycklig hotmodell, och CI vaktar hemligheter borta från repot samtidigt som den kör format, clippy, hela arbetsytans tester och wasm-bygget.',
      highlights: [
        'En krypto-crate, fyra klienter',
        'Argon2id + XChaCha20-Poly1305',
        'Servern lagrar endast krypterad text',
      ],
    },
    'claude-agents': {
      tagline: 'Kostnadsroutade subagenter för Claude Code',
      description:
        'En liten global uppsättning Claude Code-subagenter som slutar betala Opus-priser för arbete som en billigare modell klarar lika bra. Tolv agenter, var och en fixerar både modellnivå och resonemangsansträngning i sin frontmatter: Haiku för skrivskyddad rekognosering (scout, log-miner, scribe, dep-checker, tidy), Sonnet för specifikationsstyrda redigeringar (mechanic, test-writer, locale-translator, doc-scribe, migrator, bisect), och en ofixerad architect som ärver sessionens modell för designarbete. Agenterna känner självmant av varje repos stack — testkörare, linter, i18n-struktur — så en enda uppsättning täcker JS-, C#- och Python-projekt. Installeras som ett Claude Code-plugin från en delad marknadsplats eller via script. MIT-licensierat.',
      highlights: [
        '12 modellfixerade agenter',
        'Frikopplar modellnivå från resonemangsansträngning',
        'Plugin- eller skriptinstallation',
      ],
    },
    'feedback-intelligence': {
      tagline: 'Underbyggd feedbackanalys med en lokal LLM',
      description:
        'Feedback-intelligensmotor som omvandlar rörig fritextfeedback till situationssignal utan att låta LLM:en komma nära siffrorna: ett deterministiskt, regelkodat larmlager beräknar varje antal och trend, och LLM:en strukturerar bara indata och syntetiserar temanarrativ — varje påstående citerat tillbaka till feedback-id och nedgraderat till en reservlösning om det inte klarar validering. Domäner är kopplingsbara moduler (först ut: finsk hybriddetaljhandel med dagligvaror och järnhandel); en konfigurationsflagga byter in en annan domän utan kärnändringar. .NET 8 ovanpå en lokal Poro 2 8B på Ollama — vald i ett 30-omgångars blindtest — med en live-demo på Azure Static Web Apps som når den lokala GPU:n via en Tailscale Funnel till noll molnkostnad för inferens. GDPR-ren syntetisk korpus, flerskiktat försvar mot prompt-injektion, hermetisk xUnit-svit i CI.',
      highlights: [
        'Deterministiska larm — LLM:en räknar aldrig siffrorna',
        'Kopplingsbara domäner, inga kärnändringar',
        'Live-demo på Azure, inferens på en lokal GPU',
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
      body: 'Agentisk, AI-assisterad utveckling som en versionerad disciplin. Anpassade Claude Code-skills checkas in i repot som produktionsartefakter — varje skill lär agenten ett projektspecifikt recept (lägg till en fiende, släpp en databasmigration, granska sparpipelinen) så att den går rakt på sak istället för att grepa runt vid $X/token. Parprogrammering med parallella delagenter över oberoende delar, sedan syntes av resultaten.\n\nSkillsen är versionshanterade, granskade (drift mellan en skill och koden den refererar till är en verklig kategori av buggar — drift fångas och åtgärdas), och behandlas som produktionsartefakter. Uppskattad besparing enbart i Spacepotatis: ~3,13 miljoner token per år. Snabbare leverans utan att sänka ribban.\n\nArbetsflödet har egna verktyg: claude-continue håller Claude Codes 5-timmarsfönster rygg mot rygg genom att läsa det aktiva fönstrets återställningstid och återuppta pausade sessioner i samma stund som nästa fönster öppnas — så att en lång autonom körning inte stannar av i gapet mellan fönster.',
      tags: [
        'Agentisk utveckling',
        'Anpassade skills',
        'Delagenter',
        'claude-continue',
        'Versionerat flöde',
        'Tempo',
      ],
    },
    '2026-build': {
      title: '2026 — byggåret',
      body: 'I juni 2026: nio projekt levererade solo på tolv månader — full-stack-webbappar, ett skrivbordsverktyg och en ReadLog-portning som körs live på Azure. Riktiga användare, riktig drift, fullt ägarskap från schema till deploy.',
      tags: [
        '9 repos',
        'Riktiga användare',
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
          title: 'Triage före omdesign',
          body: 'När save-korruption slog till i Spacepotatis i maj 2026: serversideguard samma dag, audit-tabell dagen efter, arkitektonisk fix först efter en vecka av riktig data. Mitigera → observera → arkitektur.',
        },
        {
          title: 'AI-flöde som incheckad kod',
          body: 'Spacepotatis levererar en uppsättning Claude Code-skills i repot — kodgranskade och auditerade. ~3,13M token sparat under första året.',
          link: {
            href: 'https://github.com/MikkoNumminen/Spacepotatis/blob/master/docs/SKILLS.md',
            label: 'Metod',
          },
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
          body: 'SQL, app-kod, CI, Vercel- och Azure-deployer, signerade Windows-installerare via GitHub Releases, OpenTelemetry — ägt från ände till ände över alla nio projekt.',
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
    'rust-crypto': {
      title: 'Rust, och att kontrollera mitt eget arbete',
      body: 'Ett nytt språk och ett hårdare beviskrav kom samtidigt. Språket är Rust, plockat upp för en lösenordshanterare där hela den kryptografiska ytan bor i en enda crate som kompilerar både nativt och till WebAssembly. Kommandoradsvalvet, synkroniseringsservern, klienten i webbläsaren och Chrome-tillägget kör alla samma kod, i stället för fyra kopior som tyst glider isär.\n\nVanan var att vägra ta mitt eget ord för något. Parametrarna för nyckelderivering, nonce-strategin, vad den autentiserade krypterade texten är bunden till: var och en är ett nedskrivet beslut med en hotmodell bifogad, inklusive en tydlig lista över vad designen inte skyddar mot. Repot bär egna granskare för just den sista punkten: en går igenom besluten mot koden, en annan håller de uttalade säkerhetspåståendena mot vad kryptografin faktiskt gör. Ett påstående som ingen kontrollerar igen är bara en kommentar.',
      tags: [
        'Rust',
        'WebAssembly',
        'Argon2id',
        'XChaCha20-Poly1305',
        'Nollkunskap',
        'Hotmodell i repot',
      ],
      lessons: [
        {
          title: 'En crate, fyra klienter',
          body: 'Argon2id på 256 MiB och tre pass, XChaCha20-Poly1305 med en färsk nonce per post, och varje post bunden till sitt eget id och sin egen tidsstämpel så att två poster inte kan bytas ut under dig. Huvudlösenordet lämnar aldrig klienten, och synkroniseringsservern håller alltid bara krypterad text. Att låsa upp kostar omkring 430 ms, vilket är funktionen snarare än regressionen.',
        },
        {
          title: 'Trettio rundor, blint',
          body: 'Valet av finsk språkmodell för den lokala stacken avgjordes genom att rangordna trettio finska svar blint, bedömda av en modersmålstalare som inte kunde se vilken modell som skrev vad. Poro-2-8B placerade sig först i 26 av 30 och gick till produktion på det resultatet. Ett andra projekt körde samma siffror och avstod, eftersom rätt val beror på hur utdatan används. Att välja åt något håll på känsla hade gått snabbare och hade inte bevisat något.',
          link: {
            href: '/poro-findings.pdf',
            label: 'Läs studien',
          },
        },
        {
          title: 'Oftast är buggen min',
          body: 'När svaren började koppla fel datum till min egen forskning var den bekväma förklaringen att en liten modell hallucinerade. Det gjorde den inte. Datumet föll bort vid prompt-gränsen innan modellen någonsin såg det. Tre tidigare försök att fixa det på modellsidan är nedskrivna som återvändsgränder, så nästa person som tittar inte behöver lägga ner en vecka som jag gjorde.',
        },
        {
          title: 'En mätning som inte ändrade något',
          body: 'En flerspråkig embedder såg ut som den självklara uppgraderingen för finsk retrieval. Uppmätt sida vid sida fick den redan driftsatta uppsättningen 0,810 mot kandidatens 0,762, så inget skeppades. Experimentet som talar emot din plan är lika mycket värt som det som bekräftar den, förutsatt att du skriver ner det ändå.',
        },
      ],
    },
    now: {
      title: 'Blickar uppåt',
      body: 'Tillgänglig nu. Öppen för ambitiösa full-stack-roller där både hantverk och tempo räknas. Nio solo-levererade projekt i år — bevis på båda.',
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
    typedWhoamiOutputName: 'Mikko Numminen — full-stack-utvecklare · finland',
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
    bootWelcome: 'välkommen till Mikko Numminen — full-stack-utvecklare.',
    bootTypeHelp: 'skriv `help` för att se vad jag kan göra.',
    commandNotFound: 'kommando hittades inte:',
    typeHelpHint: 'skriv `help` för att se tillgängliga kommandon.',
    errorPrefix: 'fel:',
    copyButton: 'kopiera',
    copyDone: 'kopierat!',
    copyFallback: 'tryck ctrl+c',
    cmdHelpDesc: 'lista tillgängliga kommandon',
    cmdHelpAvailable: 'tillgängliga kommandon:',
    cmdHelpTip:
      'tips: prova `whoami`, `contact --email`, `skills` eller `download --research`.',
    cmdWhoamiDesc: 'kort bio',
    cmdWhoamiName: 'Mikko Numminen',
    cmdWhoamiTitle: 'full-stack-utvecklare · finland',
    cmdWhoamiIntro:
      'levererar full-stack-produktionsappar från ände till ände. sql till drift.',
    cmdWhoamiLargest: 'störst:',
    cmdWhoamiLargestStats: '{tests}+ tester, {coverage} täckning.',
    cmdWhoamiAlso: 'även:',
    cmdWhoamiYear: 'i år:',
    cmdWhoamiYearStats:
      '{projects} projekt levererade solo · ~{tokens} token sparade · {prs} PR:er upstream till',
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
    cmdDownloadDesc:
      'mitt cv, eller forskningen — katalog, skills-studier, kalibrering och rag finska studien (pdf)',
    cmdDownloadUsage:
      'download [--cv|--research]; --research lists [--catalog|--study|--replicates|--results|--calibration|--finnish]',
    cmdDownloadIntro: 'välj vad du vill hämta:',
    cmdDownloadOptionCv: 'mitt cv — pdf, fullständig meritförteckning',
    cmdDownloadOptionSkills:
      'juni 2026 · senaste + bredaste — 16 skills, kall-vs-skill A/B över 3 modeller; den aktuella ögonblicksbilden',
    cmdDownloadOptionResearch:
      'forskningen — 10 pdf:er: skills-sviten + rag finska studien + poro-resultaten + översättningsgranskningen (ingen nedladdning)',
    cmdDownloadResearchIntro: 'katalogen + studierna, äldst → nyast:',
    cmdDownloadOptionCatalog:
      'varje skill i alla 4 repor — inventeringen, med uppmätta (inte gissade) kostnader',
    cmdDownloadOptionStudy:
      'maj 2026 · optimeringen — 5 omgångar före/efter på en SKILL.md; 3 kostnadsfällor hittade + fixade',
    cmdDownloadOptionReplicates:
      'omgång 6 · de brusigaste cellerna ommätta på djupet — en N=1-slump motbevisad, ~+76 % bekräftat',
    cmdDownloadOptionResults:
      'syntesen — vad de två skill-granskarna kostade (~36 % billigare att köra) och fällorna de avslöjade',
    cmdDownloadOptionFinnish:
      'juni 2026 · rag finska experimentet — 3 lokala 8B-modeller på finsk syntes vs begränsning, singelvariabel, €0',
    // English placeholder — not localized yet
    cmdDownloadOptionMethodology:
      'jun 2026 · finnish rag, the methodology — how the experiment caught and corrected its own mistake; the process, not the findings',
    // English placeholder — not localized yet
    cmdDownloadOptionBlindTest:
      'jul 2026 · the blind test — a native speaker ranks 3 local models blind on Finnish naturalness; Poro wins 26/30',
    cmdDownloadOptionPoro:
      'juli 2026 · Poro-2-8B i produktion — vad två projekt mätte, varför ett antog den och ett avstod, och det deterministiska lagret byggt runt den',
    cmdDownloadOptionTranslations:
      'juli 2026 · översättningsgranskningen — en lokal finsk språkmodell läser om alla sidans 396 finska strängar mot den engelska källan; bara 2 av dess 276 föreslagna ändringar höll',
    cmdDownloadResearchHint: 'hämta vilken som helst direkt, t.ex. `download --catalog`.',
    cmdDownloadTryHint:
      'prova `download --cv`, `download --catalog`, `download --study`, `download --replicates`, `download --results`, `download --calibration` eller `download --finnish`.',
    cmdDownloadAmbiguous:
      'ange endast en av --cv, --catalog, --study, --replicates, --results, --calibration eller --finnish.',
    cmdDownloadPreparing: 'förbereder nedladdning...',
    cmdDownloadNotAvailable: 'cv inte tillgänglig än — fortfarande under finputsning.',
    cmdDownloadSkillsNotAvailable:
      'skills-kalibrerings-pdf:en är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadCatalogNotAvailable:
      'skillregistrets pdf är inte tillgänglig än — kör `npm run build:skills-pdf` för att skapa den.',
    cmdDownloadStudyNotAvailable:
      'optimeringsstudiens pdf är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadReplicatesNotAvailable:
      'replikat-pdf:en är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadResultsNotAvailable:
      'skill-granskarens resultat-pdf är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadFinnishNotAvailable:
      'rag finska studiens pdf är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadMethodologyNotAvailable:
      'rag finnish methodology pdf not available right now — reach out and I will send it.',
    cmdDownloadBlindTestNotAvailable:
      'rag blind test pdf not available right now — reach out and I will send it.',
    cmdDownloadPoroNotAvailable:
      'poro-resultatens pdf är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadTranslationsNotAvailable:
      'översättningsgranskningens pdf är inte tillgänglig just nu — hör av dig så skickar jag den.',
    cmdDownloadMeantime: 'under tiden, hör av dig:',
    cmdDownloadStarted: 'nedladdning startad.',
    cmdClearDesc: 'rensa skärmen',
    cmdManDesc: 'visa användning för ett kommando',
    cmdManUsage: 'man <kommando>',
    cmdManNoEntry: 'ingen manualpost för',
    cmdManNameLabel: 'NAMN',
    cmdManUsageLabel: 'ANVÄNDNING',
    cmdSkillsDesc: 'lista claude code-skills i alla repor',
    cmdSkillsUsage: 'användning: skills [--repo <namn>|--all|--json]',
    cmdSkillsUnknownFlag: 'okänd flagga:',
    cmdSkillsLoading: 'laddar skillregistret...',
    cmdSkillsNotGenerated: 'skillregistret har inte genererats än.',
    cmdSkillsNotGeneratedHint:
      'kör `skill-registry`-skillen lokalt och lägg sedan json:en på public/data/skills-registry.json.',
    cmdSkillsGeneratedLabel: 'genererad:',
    cmdSkillsAggregateTip:
      'tips: `skills --repo <namn>` eller `skills --all` för detaljer.',
    cmdSkillsRepoNotFound: 'repo hittades inte:',
    cmdSkillsJsonOpened: 'öppnade skills-registry.json i ny flik.',
    cmdSkillsColRepo: 'Repo',
    cmdSkillsColSkills: 'Skills',
    cmdSkillsColRedirects: 'Omdirig.',
    cmdSkillsColReceipts: 'Kvitton',
    cmdSkillsColTokensYr: 'Token/år',
    cmdSkillsTotal:
      'totalt: {skills} skills · {redirects} omdirigeringar · {receipts} med kvitto · ~{tokens} token/år',
    cmdSkillsNoSkills: '(inga skills)',
    cmdSkillsKnownRepos: 'kända repor:',
    cmdSkillsReceiptLabel: '[kvitto]',
    cmdSkillsPerYear: '/år',
    cmdLsDesc: 'lista projekt (prova `ls projects`)',
    cmdLsNoSuch: 'No such file or directory',
    cmdCatDesc: 'skriv ut ett projekt eller cv:t (t.ex. `cat projects/hrm`)',
    cmdCatUsage: 'användning: cat <sökväg> — prova `cat projects/hrm` eller `cat cv`',
    cmdCatNoSuch: 'No such file or directory',
    cmdCvDesc: 'kort cv-sammanfattning',
    cmdCvDownloadHint:
      'kör `download --cv` för den fullständiga meritförteckningen (pdf).',
    cmdSudoDesc: 'kör ett kommando som en annan användare',
    cmdSudoHire:
      'åtkomst beviljad. arbetar på erbjudandebrevet — nå mig på e-posten ovan.',
    cmdSudoDenied: 'bra försök. det här (in)träffandet kommer (inte) att rapporteras.',
    cmdRmDesc: 'ta bort filer',
    cmdRmRefusal:
      'jag är rädd att jag inte kan låta dig göra det. ingenting här är ditt att radera.',
    chatThinking: '...tänker',
    chatError: 'anslutningen bröts — återgår till skriptat läge.',
    chatAskUsage: 'användning: ask "din fråga om projekten"',
    chatHint: '…eller fråga bara om projekten',
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
