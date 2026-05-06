export type Locale = 'en' | 'fi' | 'sv';

export const LOCALES: Locale[] = ['en', 'fi', 'sv'];
export const DEFAULT_LOCALE: Locale = 'en';

export interface Translations {
  meta: {
    home: { title: string; description: string };
    contact: { title: string; description: string };
    projects: { title: string; description: string };
    experience: { title: string; description: string };
  };
  nav: {
    home: string;
    projects: string;
    experience: string;
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
    statTests: string;
    statCoverage: string;
    statProducts: string;
  };
  focus: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    items: Array<{ title: string; body: string }>;
  };
  integrations: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    items: Array<{ project: string; api: string; body: string }>;
  };
  velocity: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    body: string;
    stats: Array<{ num: string; label: string }>;
  };
  navCards: {
    sectionAria: string;
    eyebrow: string;
    heading: string;
    projects: { label: string; description: string };
    experience: { label: string; description: string };
    contact: { label: string; description: string };
    footerCopyright: string;
    footerBuiltWith: string;
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
    liveDemo: string;
    githubLink: string;
    gridAria: string;
    gridLede: string;
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
  };
  timelineData: Record<
    string,
    {
      title: string;
      body: string;
      tags?: string[];
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
  };
  terminal: {
    bootBooting: string;
    bootMounting: string;
    bootLoading: string;
    bootComms: string;
    bootWelcome: string;
    bootTypeHelp: string;
    bootSudoHint: string;
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
    cmdWhoamiAlso: string;
    cmdWhoamiCommunity: string;
    cmdWhoamiDesktop: string;
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
    cmdDownloadHint: string;
    cmdDownloadPreparing: string;
    cmdDownloadNotAvailable: string;
    cmdDownloadMeantime: string;
    cmdDownloadStarted: string;
    cmdProjectsDesc: string;
    cmdProjectsOpening: string;
    cmdHomeDesc: string;
    cmdHomeOpening: string;
    cmdExperienceDesc: string;
    cmdExperienceOpening: string;
    cmdClearDesc: string;
    cmdEchoDesc: string;
    cmdDateDesc: string;
    cmdSudoDesc: string;
    cmdSudoPasswordPrompt: string;
    cmdSudoApproved: string;
    cmdSudoExcellent: string;
    cmdSudoReachOut: string;
    cmdSudoOrRun: string;
    cmdSudoNotFound: string;
    cmdSudoNoCommand: string;
    cmdSudoHint: string;
    cmdManDesc: string;
    cmdManUsage: string;
    cmdManNoEntry: string;
    cmdManNameLabel: string;
    cmdManUsageLabel: string;
  };
  langSwitcher: {
    label: string;
    en: string;
    fi: string;
    sv: string;
  };
}
