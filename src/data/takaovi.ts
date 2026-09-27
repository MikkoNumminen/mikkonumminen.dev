/**
 * Copy for the /takaovi page.
 *
 * Finnish only, and deliberately outside `src/i18n/locales`: the page has no
 * English twin, so a key in `en.ts` would be a translation nobody reads, and
 * the locale files are held to parity with each other.
 *
 * The page states no facts of its own beyond the heading, the paragraph and
 * the example questions. Everything about Mikko comes from the chat backend.
 */
import type { TurnError } from '../lib/takaovi/controller';

export interface TakaoviMessage {
  title: string;
  text: string;
}

export const takaoviCopy = {
  meta: {
    title: 'Kysy Mikosta',
    description:
      'Kysy Mikon työstä ja taustasta. Vastaukset hakee tekoälyavustaja Mikon omista teksteistä, projekteista ja CV:stä.',
  },
  brand: {
    logoLabel: 'Asuntokanava, osa Takaovi Oy:tä',
    person: 'Mikko Numminen',
  },
  heading: { lead: 'Kysy', accent: 'Mikosta.' },
  lede: 'Kysy Mikon työstä ja taustasta. Vastaukset hakee tekoälyavustaja Mikon omista teksteistä, projekteista ja CV:stä.',
  questionsLabel: 'Esimerkkikysymyksiä',
  questions: [
    'Mitä Mikko tekee Takaovella?',
    'Mitä teknologioita Mikko on käyttänyt?',
    'Mikä on Mikon tausta?',
    'Millaisia projekteja Mikko on tehnyt?',
    'Miten Mikko käyttää tekoälyä työssään?',
  ],
  thread: {
    label: 'Keskustelu',
    empty: 'Valitse kysymys tai kirjoita oma.',
    you: 'Sinä',
    assistant: 'Avustaja',
    sources: 'Lähteet',
    restart: 'Aloita alusta',
    thinking: 'Avustaja miettii vastausta.',
    answered: 'Avustaja vastasi:',
    cleared: 'Keskustelu aloitettiin alusta.',
  },
  composer: {
    label: 'Kysymys Mikosta',
    placeholder: 'Kirjoita oma kysymys…',
    send: 'Kysy',
    sendLabel: 'Lähetä kysymys',
    fineprint: 'Tekoäly voi erehtyä.',
  },
  retry: 'Yritä uudelleen',
  errors: {
    unavailable: {
      title: 'Avustaja ei vastaa juuri nyt.',
      text: 'Palvelu voi olla hetken pois päältä. Yritä hetken päästä uudelleen.',
    },
    'rate-limited': {
      title: 'Kysymyksiä tulee juuri nyt paljon.',
      text: 'Odota hetki ja yritä uudelleen.',
    },
    failed: {
      title: 'Vastausta ei saatu.',
      text: 'Yritä uudelleen.',
    },
    timeout: {
      title: 'Vastaus viipyy liian kauan.',
      text: 'Yritä uudelleen.',
    },
  } satisfies Record<TurnError, TakaoviMessage>,
  notices: {
    down: {
      title: 'Avustaja ei vastaa juuri nyt.',
      text: 'Voit silti kokeilla kysyä. Jos vastausta ei tule, yritä hetken päästä uudelleen.',
    },
    unconfigured: {
      title: 'Avustaja ei ole käytössä.',
      text: 'Tämä sivun versio ei ole yhteydessä avustajaan.',
    },
    recheck: 'Tarkista uudelleen',
  },
} as const;

export type TakaoviCopy = typeof takaoviCopy;
