import { describe, expect, it } from 'vitest';
import { languageMix, LANGUAGES, projectLanguages } from './projectLanguages';
import { projects, type Project } from './projects';

/**
 * The derivation behind the language chart.
 *
 * The coverage test at the bottom is the one that earned its place before this
 * file existed: `readlog-dotnet` listed `.NET 8`, `ASP.NET Core`, `Razor Pages`,
 * `EF Core` and `xUnit` and never named C#, so the chart would have shown one C#
 * project instead of two. Nothing would have looked wrong. A chart is a claim,
 * and a claim built on a list nobody checks is worse than no chart.
 */

function fake(id: string, tech: string[]): Project {
  return { id, tech } as Project;
}

describe('languageMix', () => {
  it('counts a project once per language it declares', () => {
    const mix = languageMix([
      fake('a', ['TypeScript', 'React', 'Vercel']),
      fake('b', ['TypeScript', 'Python']),
    ]);
    expect(mix).toEqual([
      { language: 'TypeScript', count: 2, share: 2 / 3 },
      { language: 'Python', count: 1, share: 1 / 3 },
    ]);
  });

  it('ignores frameworks, services and libraries', () => {
    // The reason the allowlist exists: `tech` is mostly not languages.
    const mix = languageMix([
      fake('a', ['ASP.NET Core', 'MUI', 'Zod', 'GitHub Actions']),
    ]);
    expect(mix).toEqual([]);
  });

  it('breaks ties alphabetically so the order is stable', () => {
    // Without this the chart would appear to change whenever the project list
    // was reordered, while nothing about the data had.
    const mix = languageMix([fake('a', ['Python', 'Rust'])]);
    expect(mix.map((s) => s.language)).toEqual(['Python', 'Rust']);
  });

  it('shares sum to one', () => {
    const mix = languageMix();
    const total = mix.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('an empty project list produces an empty mix rather than a divide by zero', () => {
    expect(languageMix([])).toEqual([]);
  });
});

describe('the real project data', () => {
  it('every project declares at least one language', () => {
    // THE ONE THAT MATTERS. `readlog-dotnet` failed this before it was written:
    // an entire .NET project invisible to the chart because the tech list named
    // the framework and never the language.
    const silent = projects.filter((p) => projectLanguages(p).length === 0);
    expect(
      silent.map(
        (p) => `${p.id} lists no language (tech: ${p.tech.slice(0, 4).join(', ')}...)`,
      ),
    ).toEqual([]);
  });

  it('produces a mix worth charting', () => {
    const mix = languageMix();
    expect(mix.length).toBeGreaterThanOrEqual(3);
    expect(mix[0]?.count).toBeGreaterThan(1);
  });

  it('the allowlist has no duplicates', () => {
    expect(new Set(LANGUAGES).size).toBe(LANGUAGES.length);
  });
});
