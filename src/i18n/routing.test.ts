import { describe, it, expect } from 'vitest';
import { localizePath, stripLocale } from './routing';

// ---------------------------------------------------------------------------
// localizePath
// ---------------------------------------------------------------------------

describe('localizePath', () => {
  it('returns the path unchanged for the default locale (en)', () => {
    expect(localizePath('/', 'en')).toBe('/');
    expect(localizePath('/projects', 'en')).toBe('/projects');
    expect(localizePath('/experience', 'en')).toBe('/experience');
  });

  it('prefixes non-default locales', () => {
    expect(localizePath('/projects', 'fi')).toBe('/fi/projects');
    expect(localizePath('/projects', 'sv')).toBe('/sv/projects');
  });

  it('localizes the root path without a trailing slash (trailingSlash: never)', () => {
    expect(localizePath('/', 'fi')).toBe('/fi');
    expect(localizePath('/', 'sv')).toBe('/sv');
  });

  it('strips an existing locale prefix before re-localizing', () => {
    // Already-localized Finnish path re-localized to Swedish.
    expect(localizePath('/fi/projects', 'sv')).toBe('/sv/projects');
    // Already-localized path back to English (default = no prefix).
    expect(localizePath('/sv/projects', 'en')).toBe('/projects');
  });

  it('preserves query strings', () => {
    expect(localizePath('/projects?id=hrm', 'fi')).toBe('/fi/projects?id=hrm');
    expect(localizePath('/projects?id=hrm', 'en')).toBe('/projects?id=hrm');
  });

  it('preserves hash fragments', () => {
    expect(localizePath('/#top', 'fi')).toBe('/fi#top');
    expect(localizePath('/#top', 'en')).toBe('/#top');
  });
});

// ---------------------------------------------------------------------------
// stripLocale
// ---------------------------------------------------------------------------

describe('stripLocale', () => {
  it('strips known locale prefixes', () => {
    expect(stripLocale('/fi/projects')).toBe('/projects');
    expect(stripLocale('/sv/projects')).toBe('/projects');
  });

  it('leaves paths without a locale prefix unchanged', () => {
    expect(stripLocale('/projects')).toBe('/projects');
    expect(stripLocale('/')).toBe('/');
  });

  it('strips the locale from a localized root path', () => {
    expect(stripLocale('/sv/')).toBe('/');
    expect(stripLocale('/fi/')).toBe('/');
  });

  it('normalizes a missing leading slash', () => {
    expect(stripLocale('fi/projects')).toBe('/projects');
  });

  it('preserves query strings after stripping', () => {
    expect(stripLocale('/fi/projects?id=hrm')).toBe('/projects?id=hrm');
  });

  it('preserves hash fragments after stripping', () => {
    expect(stripLocale('/fi#top')).toBe('/#top');
  });

  it('does not treat the English prefix as a locale (en has no prefix)', () => {
    // English paths never have a locale prefix so stripLocale should be a
    // no-op for them — stripping twice must be idempotent.
    expect(stripLocale('/projects')).toBe('/projects');
    expect(stripLocale(stripLocale('/fi/projects'))).toBe('/projects');
  });
});
