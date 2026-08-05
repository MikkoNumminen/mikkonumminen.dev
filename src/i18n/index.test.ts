import { describe, it, expect } from 'vitest';
import { asLocale, getTranslations, LOCALES, DEFAULT_LOCALE } from './index';

describe('LOCALES', () => {
  it('contains exactly en, fi', () => {
    expect(LOCALES).toEqual(['en', 'fi']);
  });

  it('treats en as the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('asLocale', () => {
  it('returns a known locale unchanged', () => {
    expect(asLocale('en')).toBe('en');
    expect(asLocale('fi')).toBe('fi');
  });

  it('falls back to English for an unknown string', () => {
    expect(asLocale('de')).toBe('en');
    expect(asLocale('fr')).toBe('en');
    expect(asLocale('zh')).toBe('en');
  });

  it('falls back to English for undefined', () => {
    expect(asLocale(undefined)).toBe('en');
  });

  it('falls back to English for an empty string', () => {
    expect(asLocale('')).toBe('en');
  });
});

describe('projectsData parity across locales', () => {
  // `highlights` is optional in the Translations type, so the compiler cannot
  // see one locale dropping it — that card just renders without bullets in
  // that language. Meaning drift still needs a human, but shape drift is
  // mechanical and belongs here.
  it('gives every project the same keys in every locale', () => {
    const en = getTranslations('en');
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      expect(Object.keys(t.projectsData).sort(), locale).toEqual(
        Object.keys(en.projectsData).sort(),
      );
      for (const [id, project] of Object.entries(en.projectsData)) {
        const twin = t.projectsData[id];
        expect(twin, `${locale}:${id}`).toBeDefined();
        if (!twin) continue;
        expect(Object.keys(twin).sort(), `${locale}:${id}`).toEqual(
          Object.keys(project).sort(),
        );
      }
    }
  });
});

describe('getTranslations', () => {
  it('returns the English dictionary for "en"', () => {
    const t = getTranslations('en');
    // Spot-check a few stable fields from the English locale.
    expect(t.nav.home).toBe('home');
    expect(t.hero.subtitle).toBe('full-stack developer · finland');
  });

  it('returns a distinct dictionary for each known locale', () => {
    const en = getTranslations('en');
    const fi = getTranslations('fi');
    // The nav labels differ between locales — a reliable signal that we got
    // the right dict and not a shared reference to the English fallback.
    expect(fi.nav.home).not.toBe(en.nav.home);
  });

  it('falls back to English for an unknown locale string', () => {
    const t = getTranslations('de');
    const en = getTranslations('en');
    expect(t.nav.home).toBe(en.nav.home);
  });

  it('falls back to English when locale is undefined', () => {
    const t = getTranslations(undefined);
    const en = getTranslations('en');
    expect(t.nav.home).toBe(en.nav.home);
  });
});
