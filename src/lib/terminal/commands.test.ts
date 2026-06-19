import { describe, it, expect } from 'vitest';
import { buildCommands } from './commands';
import { getTranslations, LOCALES } from '../../i18n';

// buildCommands() assembles the terminal's command surface for a locale.
// The contract these tests defend: command *names* and flags are the CLI
// surface and stay English/stable across every locale, while descriptions are
// localized. A translation that accidentally renamed a command, or a dropped
// command, would break tab-completion and the help screen — caught here.

const en = buildCommands(getTranslations('en'));

describe('buildCommands (English)', () => {
  it('exposes the expected command set', () => {
    const names = en.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'cat',
        'clear',
        'contact',
        'cv',
        'download',
        'help',
        'links',
        'ls',
        'man',
        'rm',
        'skills',
        'sudo',
        'whoami',
      ].sort(),
    );
  });

  it('has unique command names', () => {
    const names = en.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses lowercase ASCII names (the CLI surface, never translated)', () => {
    for (const c of en) {
      expect(c.name, c.name).toMatch(/^[a-z]+$/);
    }
  });

  it('gives every command a non-empty description', () => {
    for (const c of en) {
      expect(c.description, `${c.name}.description`).toBeTruthy();
    }
  });

  it('keeps `man` hidden from the listed surface', () => {
    const man = en.find((c) => c.name === 'man');
    expect(man?.hidden).toBe(true);
  });
});

describe('buildCommands across locales', () => {
  it('produces the identical set of command names in every locale', () => {
    const enNames = en.map((c) => c.name).sort();
    for (const locale of LOCALES) {
      const names = buildCommands(getTranslations(locale))
        .map((c) => c.name)
        .sort();
      expect(names, `locale=${locale}`).toEqual(enNames);
    }
  });

  it('localizes descriptions — every command has a non-empty description in every locale', () => {
    for (const locale of LOCALES) {
      for (const c of buildCommands(getTranslations(locale))) {
        expect(c.description, `locale=${locale} ${c.name}.description`).toBeTruthy();
      }
    }
  });
});
