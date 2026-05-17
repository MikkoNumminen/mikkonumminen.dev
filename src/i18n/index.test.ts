import { describe, it, expect } from 'vitest';
import { asLocale, getTranslations, LOCALES, DEFAULT_LOCALE } from './index';

describe('LOCALES', () => {
  it('contains exactly en, fi, sv', () => {
    expect(LOCALES).toEqual(['en', 'fi', 'sv']);
  });

  it('treats en as the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('asLocale', () => {
  it('returns a known locale unchanged', () => {
    expect(asLocale('en')).toBe('en');
    expect(asLocale('fi')).toBe('fi');
    expect(asLocale('sv')).toBe('sv');
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
    const sv = getTranslations('sv');
    // The nav labels differ between locales — a reliable signal that we got
    // the right dict and not a shared reference to the English fallback.
    expect(fi.nav.home).not.toBe(en.nav.home);
    expect(sv.nav.home).not.toBe(en.nav.home);
    expect(fi.nav.home).not.toBe(sv.nav.home);
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
