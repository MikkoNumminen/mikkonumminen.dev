export type Locale = 'en' | 'fi' | 'sv';

export const LOCALES: Locale[] = ['en', 'fi', 'sv'];
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
  };
  nav: {
    home: string;
    projects: string;
    experience: string;
    blog: string;
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
  };
  intro: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    body: string;
    /**
     * Marker chip rendered above the intro body while `body` is still
     * placeholder copy. Delete this key and the `.intro__placeholder`
     * element in Intro.astro once the real paragraph is written.
     */
    placeholderNote: string;
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
    projects: { label: string };
    experience: { label: string };
    blog: { label: string };
    contact: { label: string };
    footerCopyright: string;
    footerBuiltWith: string;
  };
  blog: {
    eyebrow: string;
    title: string;
    lede: string;
    /** Prominent badge on any entry whose frontmatter sets `aiGenerated: true`. */
    aiBadge: string;
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
    keyHeading: string;
    keyConnectionsLabel: string;
    keyExternalDesc: string;
    listHeading: string;
    listAriaLabel: string;
    connectionKindLabels: {
      submodule: string;
      voice: string;
      music: string;
      port: string;
    };
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
    eyebrow: string;
    title: string;
    lede: string;
    scrollHint: string;
    kindFoundation: string;
    kindWork: string;
    kindLife: string;
    kindProject: string;
    kindCraft: string;
    kindNow: string;
    summit: string;
    cta: string;
    /** ARIA label for the nested lessons sub-timeline rendered inside an
     *  entry's card when `lessons` is present in `timelineData[id]`. */
    lessonsAriaLabel: string;
    /** Localized label for the sentinel year value 'NOW' in timeline entries. */
    yearNow: string;
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
    cmdDownloadOptionCv: string;
    cmdDownloadOptionSkills: string;
    cmdDownloadOptionResearch: string;
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
    cmdDownloadResearchHint: string;
    cmdDownloadTryHint: string;
    cmdDownloadAmbiguous: string;
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
    sv: string;
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
}
