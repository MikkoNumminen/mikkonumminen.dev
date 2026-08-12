export type Locale = 'en' | 'fi';

export const LOCALES: Locale[] = ['en', 'fi'];
export const DEFAULT_LOCALE: Locale = 'en';

export interface ReceiptLink {
  href: string;
  label: string;
}

export interface TimelineLesson {
  title: string;
  /**
   * Single paragraph of body text. Multi-paragraph bodies are not
   * supported — split into multiple `TimelineLesson` entries instead so
   * each beat gets its own marker on the sub-timeline. URLs that match
   * a known project's host (per `data/projects.ts`) auto-link via
   * `LinkifiedText`.
   */
  body: string;
  /** Optional external link rendered after the body so readers can verify the claim. */
  link?: ReceiptLink;
}

export interface Translations {
  common: {
    /** Appended to aria-labels on links that open in a new browser tab. */
    opensInNewTab: string;
  };
  meta: {
    jobTitle: string;
    home: { title: string; description: string };
    contact: { title: string; description: string };
    projects: { title: string; description: string };
    experience: { title: string; description: string };
    blog: { title: string; description: string };
    research: { title: string; description: string };
  };
  nav: {
    home: string;
    projects: string;
    experience: string;
    blog: string;
    research: string;
    contact: string;
    primaryAria: string;
    languageSwitcherAria: string;
    skipToContent: string;
  };
  hero: {
    sectionAria: string;
    eyebrow: string;
    titleSrOnly: string;
    titleFallbackTop: string;
    titleFallbackBottom: string;
    subtitle: string;
    scrollHint: string;
    /** The masthead's CV download. Its href is derived from `papers.ts`. */
    cvLabel: string;
    cvAria: string;
  };
  intro: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    body: string;
  };
  latestEntries: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    viewAll: string;
    empty: string;
  };
  navCards: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    projects: { label: string; description: string };
    experience: { label: string; description: string };
    blog: { label: string; description: string };
    research: { label: string; description: string };
    contact: { label: string; description: string };
    footerCopyright: string;
    footerBuiltWith: string;
    /** Footer CV link. Lives here because the footer's other two strings do. */
    footerCv: string;
    footerCvAria: string;
  };
  /** The research listing at /research. Papers themselves stay English. */
  researchPage: {
    eyebrow: string;
    title: string;
    lede: string;
    pdfLabel: string;
    downloadAria: string;
    /** Link label on a paper that can be read in the browser. */
    readLabel: string;
    /** Link label for a page that accompanies the PDF rather than reproducing it. */
    aboutLabel: string;
    readAria: string;
    aboutAria: string;
    /** Shown on a companion page, naming the PDF as the document. */
    companionNotice: string;
    /** Shown on a page generated from the same data as its PDF. */
    generatedNotice: string;
    backToList: string;
    /** Why the body is English on the Finnish route. */
    englishNotice: string;
    sourceLabel: string;
    pdfAlsoLabel: string;
  };
  blog: {
    eyebrow: string;
    title: string;
    lede: string;
    /** Prominent badge on any entry whose frontmatter sets `aiGenerated: true`. */
    aiBadge: string;
    /** Meta-row state on a blog card: this entry has narration, or it does not.
     *  Always one or the other, never absent, so "no badge" can never be read
     *  as "nobody got round to marking this one". */
    hasAudio: string;
    noAudio: string;
    /** Longer disclosure shown on the entry page itself, under the badge. */
    aiNotice: string;
    backToIndex: string;
    empty: string;
  };
  projectsPage: {
    eyebrow: string;
    title: string;
    lede: string;
    legendHover: string;
    legendClick: string;
    legendDrag: string;
    legendZoom: string;
    detailAria: string;
    closeAria: string;
    techLabel: string;
    externalApisLabel: string;
    liveDemo: string;
    githubLink: string;
    gridAria: string;
    gridLede: string;
    listAriaLabel: string;
    /** Toggle label while the panel is collapsed, and while it is open. */
    listToggleShow: string;
    listToggleHide: string;
  };
  projectsData: Record<
    string,
    {
      tagline: string;
      description: string;
      highlights?: string[];
    }
  >;
  experiencePage: {
    /** Language donut on the technology card. The note names the METRIC:
     *  projects per language, which is not share of code and a reader will
     *  assume the second one unless told. */
    languageMixTitle: string;
    languageMixNote: string;
    eyebrow: string;
    title: string;
    lede: string;
    scrollHint: string;
    /** Base-camp link that jumps to the tech stack at the top of the page. */
    skipToTech: string;
    kindFoundation: string;
    kindWork: string;
    kindLife: string;
    kindProject: string;
    kindCraft: string;
    kindNow: string;
    /** Labels on the top panel's two routes onward. */
    summitBlogLink: string;
    summitContactLink: string;
    /** ARIA label for the nested lessons sub-timeline rendered inside an
     *  entry's card when `lessons` is present in `timelineData[id]`. */
    lessonsAriaLabel: string;
    /** Localized label for the sentinel year value 'NOW' in timeline entries. */
    yearNow: string;
  };
  /** The technology box at the end of /experience. Tech names are never translated. */
  techStack: {
    categories: {
      languages: string;
      frontend: string;
      backend: string;
      ai: string;
      platform: string;
    };
    /** Labels on the two-way view toggle. */
    viewOverall: string;
    viewByProject: string;
    /** Badge on items used in client work. */
    workBadge: string;
    /** One legend line under the box. */
    legend: string;
  };
  /** Single lesson inside a timeline entry's optional sub-timeline. */
  timelineData: Record<
    string,
    {
      title: string;
      body: string;
      tags?: string[];
      /**
       * Optional sub-timeline of "what this chapter taught me" entries.
       * When present, the entry's card renders the lessons as a nested
       * mini-timeline under the body. Each lesson is short (a headline
       * naming the takeaway and a body explaining + pointing at the
       * project / tech / decision that proves it).
       */
      lessons?: TimelineLesson[];
    }
  >;
  contactPage: {
    h1: string;
    interactiveAria: string;
    windowTitle: string;
    inputAria: string;
    hintType: string;
    hintHistory: string;
    hintComplete: string;
    /** Fourth footer hint, pointing at the papers. */
    hintDownloads: string;
    noscriptIntro: string;
    noscriptReachMe: string;
    noscriptEmailLabel: string;
    noscriptGithubLabel: string;
  };
  mobileContact: {
    typedWhoamiOutputName: string;
    typedWhoamiOutputBio: string;
    typedContactLabelEmail: string;
    typedContactLabelLinkedin: string;
    typedContactLabelGithub: string;
    typedContactLabelLocation: string;
    typedContactValueLocation: string;
    typedDownloadOutput: string;
    btnEmail: string;
    btnLinkedin: string;
    btnDownloadCv: string;
    cardAria: string;
    ariaLinkedIn: string;
  };
  terminal: {
    bootBooting: string;
    bootMounting: string;
    bootLoading: string;
    bootComms: string;
    bootWelcome: string;
    bootTypeHelp: string;
    commandNotFound: string;
    typeHelpHint: string;
    errorPrefix: string;
    copyButton: string;
    copyDone: string;
    copyFallback: string;
    cmdHelpDesc: string;
    cmdHelpAvailable: string;
    cmdHelpTip: string;
    cmdWhoamiDesc: string;
    cmdWhoamiName: string;
    cmdWhoamiTitle: string;
    cmdWhoamiIntro: string;
    cmdWhoamiLargest: string;
    /** Stat fragment after the largest-project link. `{tests}` and `{coverage}` interpolated. */
    cmdWhoamiLargestStats: string;
    cmdWhoamiAlso: string;
    cmdWhoamiYear: string;
    /** Year stat fragment before the chatterbox link. `{projects}`, `{tokens}`, `{prs}` interpolated. */
    cmdWhoamiYearStats: string;
    cmdWhoamiCommunity: string;
    cmdWhoamiDesktop: string;
    cmdWhoamiGame: string;
    cmdWhoamiCurrently: string;
    cmdContactDesc: string;
    cmdContactUsage: string;
    cmdContactUnknownFlag: string;
    cmdContactEmailLabel: string;
    cmdLinksDesc: string;
    cmdLinksUsage: string;
    cmdLinksUnknownFlag: string;
    cmdDownloadDesc: string;
    cmdDownloadUsage: string;
    cmdDownloadIntro: string;
    cmdDownloadDidYouMean: string;
    cmdDownloadOptionCv: string;
    cmdDownloadOptionSkills: string;
    cmdDownloadResearchIntro: string;
    cmdDownloadOptionCatalog: string;
    cmdDownloadOptionStudy: string;
    cmdDownloadOptionReplicates: string;
    cmdDownloadOptionResults: string;
    cmdDownloadOptionFinnish: string;
    cmdDownloadOptionMethodology: string;
    cmdDownloadOptionBlindTest: string;
    cmdDownloadOptionPoro: string;
    cmdDownloadOptionTranslations: string;
    cmdDownloadOptionDelegation: string;
    cmdDownloadResearchHint: string;
    /** Points the listing at /research, which is the closest thing to "download all". */
    cmdDownloadPageHint: string;
    cmdDownloadTryHint: string;
    cmdDownloadAmbiguous: string;
    cmdDownloadPickOne: string;
    cmdDownloadPreparing: string;
    cmdDownloadNotAvailable: string;
    cmdDownloadSkillsNotAvailable: string;
    cmdDownloadCatalogNotAvailable: string;
    cmdDownloadStudyNotAvailable: string;
    cmdDownloadReplicatesNotAvailable: string;
    cmdDownloadResultsNotAvailable: string;
    cmdDownloadFinnishNotAvailable: string;
    cmdDownloadMethodologyNotAvailable: string;
    cmdDownloadBlindTestNotAvailable: string;
    cmdDownloadPoroNotAvailable: string;
    cmdDownloadTranslationsNotAvailable: string;
    cmdDownloadDelegationNotAvailable: string;
    cmdDownloadMeantime: string;
    cmdDownloadStarted: string;
    cmdClearDesc: string;
    cmdManDesc: string;
    cmdManUsage: string;
    cmdManNoEntry: string;
    cmdManNameLabel: string;
    cmdManUsageLabel: string;
    cmdSkillsDesc: string;
    cmdSkillsUsage: string;
    cmdSkillsUnknownFlag: string;
    cmdSkillsLoading: string;
    cmdSkillsNotGenerated: string;
    cmdSkillsNotGeneratedHint: string;
    cmdSkillsGeneratedLabel: string;
    cmdSkillsAggregateTip: string;
    cmdSkillsRepoNotFound: string;
    cmdSkillsJsonOpened: string;
    /** Aggregate table column headers. */
    cmdSkillsColRepo: string;
    cmdSkillsColSkills: string;
    cmdSkillsColRedirects: string;
    cmdSkillsColReceipts: string;
    cmdSkillsColTokensYr: string;
    /** Aggregate summary line. `{skills}`, `{redirects}`, `{receipts}`, `{tokens}` interpolated. */
    cmdSkillsTotal: string;
    /** Rendered when a repo has no skills. */
    cmdSkillsNoSkills: string;
    /** Prefix for the comma-separated list of known repos on a not-found error. */
    cmdSkillsKnownRepos: string;
    /** Label on a skill's receipt link. */
    cmdSkillsReceiptLabel: string;
    /** Suffix appended to a skill's annual token figure (e.g. "/yr"). */
    cmdSkillsPerYear: string;
    // --- ls / cat / cv (fake-shell file commands) ---
    cmdLsDesc: string;
    /** Trailing half of an `ls: cannot access '...': <this>` error. */
    cmdLsNoSuch: string;
    cmdCatDesc: string;
    cmdCatUsage: string;
    /** Trailing half of a `cat: ...: <this>` error. */
    cmdCatNoSuch: string;
    cmdCvDesc: string;
    /** Pointer from the scripted `cv` summary to the full PDF. */
    cmdCvDownloadHint: string;
    // --- easter eggs (hidden commands) ---
    cmdSudoDesc: string;
    cmdSudoHire: string;
    cmdSudoDenied: string;
    cmdRmDesc: string;
    cmdRmRefusal: string;
    // --- RAG chat (Phase 3 progressive enhancement) ---
    /** "…thinking" placeholder shown while the model responds. */
    /** Announced once in the output when the chat backend comes online. */
    chatIntroReady: string;
    chatIntroHow: string;
    /** Dim line naming the download command and the /research page. */
    chatIntroDownloads: string;
    chatThinking: string;
    /** Shell-style line shown when a chat turn fails; chat then degrades. */
    chatError: string;
    /** Usage shown when `ask` is run with no question. */
    chatAskUsage: string;
    /** Hint revealed only when free chat is available. */
    chatHint: string;
  };
  langSwitcher: {
    label: string;
    en: string;
    fi: string;
  };
  notFound: {
    title: string;
    description: string;
    heading: string;
    message: string;
    navAria: string;
    linkHome: string;
    linkProjects: string;
    linkExperience: string;
    linkContact: string;
  };
  bgAudio: {
    soundOn: string;
    soundOff: string;
  };
  /**
   * The moderated shoutbox at the foot of the contact page. Finnish is the
   * source language for this block — it was written in Finnish and mirrored to
   * English, not the other way round.
   */
  shoutbox: {
    /** Box title, in the terminal chrome. */
    title: string;
    /** Shown when no message has been approved yet. Not an error. */
    empty: string;
    /** Attribution on the owner's own replies. */
    replyFrom: string;
    /** Summary of the info disclosure. Opens on hover, tap and keyboard focus. */
    infoLabel: string;
    /** What the disclosure reveals: review, and that publishing is permanent. */
    infoBody: string;
    /** Placeholder in the message field. */
    placeholder: string;
    /** Submit button. */
    send: string;
    /** After a successful submit. Not a published state, and does not claim to be. */
    queued: string;
    /** Shown instead of the form when the backend is unreachable. */
    offline: string;
    /** A submit that failed in flight. The visitor's move is to retry. */
    failed: string;
    /** Closing legend, in the Technologies-box register. */
    legend: string;
    /** Accessible name for the thread list region. */
    threadsAria: string;
    /**
     * Hint at the foot of the full-height terminal, because the box sits below
     * the fold and nothing else signals it exists. Names what is down there
     * rather than just saying "scroll".
     */
    scrollHint: string;
  };
}
