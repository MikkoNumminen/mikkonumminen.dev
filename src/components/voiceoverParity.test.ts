import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The three voice layers are duplicated on purpose, which means the only thing
 * keeping them in agreement is a header comment asking the next person to
 * mirror their edits. That works until it doesn't.
 *
 * Blog narration shipped WITHOUT the reduced-motion gate on the argument that a
 * one-shot reading is not the recurring clip the preference is about. The gate
 * is now uniform across all three, and this file is what makes that a rule
 * rather than a note: dropping it from any of the three fails the suite instead
 * of failing quietly in a browser nobody is testing with the preference on.
 *
 * These are source-text assertions, which is a blunt instrument. They are here
 * because the alternative is a jsdom harness for an inline Astro `<script>` that
 * would assert the same strings with more machinery in between.
 */

const COMPONENTS = {
  hero: join(process.cwd(), 'src', 'components', 'home', 'HeroVoiceover.astro'),
  projects: join(
    process.cwd(),
    'src',
    'components',
    'projects',
    'ProjectsVoiceover.astro',
  ),
  blog: join(process.cwd(), 'src', 'components', 'blog', 'BlogVoiceover.astro'),
} as const;

const sources = Object.fromEntries(
  Object.entries(COMPONENTS).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
) as Record<keyof typeof COMPONENTS, string>;

/** Strips `//` line comments so prose about a gate can't stand in for the gate. */
function code(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

describe('voiceover parity', () => {
  it('reads all three components', () => {
    // Guards every assertion below: a renamed or moved file would otherwise
    // throw here rather than silently passing an empty string through them.
    for (const [name, source] of Object.entries(sources)) {
      expect(source.length, name).toBeGreaterThan(500);
    }
  });

  it('all three query prefers-reduced-motion in code, not just in comments', () => {
    for (const [name, source] of Object.entries(sources)) {
      expect(
        code(source).includes("matchMedia('(prefers-reduced-motion: reduce)')"),
        name,
      ).toBe(true);
    }
  });

  it('all three gate their mount on that query', () => {
    // Reading the preference and then ignoring it is the failure mode a
    // string check alone would miss.
    for (const [name, source] of Object.entries(sources)) {
      expect(code(source), name).toMatch(/!reducedMotion/);
    }
  });

  it('all three share the bg-audio:state handshake', () => {
    for (const [name, source] of Object.entries(sources)) {
      const body = code(source);
      expect(body.includes("'bg-audio:state'"), name).toBe(true);
      expect(body.includes('new AbortController()'), name).toBe(true);
      expect(body.includes('onRoute('), name).toBe(true);
    }
  });

  it('only the blog layer omits the idle replay', () => {
    // The deliberate difference, asserted in both directions so removing the
    // idle timer from home/projects is as loud as adding one to blog.
    expect(code(sources.hero)).toMatch(/IDLE|idleTimer|idle/i);
    expect(code(sources.projects)).toMatch(/IDLE|idleTimer|idle/i);
    expect(code(sources.blog)).not.toMatch(/idleTimer/);
  });

  it('only the blog layer persists a position, keyed by slug and locale', () => {
    // The key must carry both: one recording per locale, of different lengths,
    // so a slug-only key drops a Finnish offset into the English reading.
    expect(code(sources.blog)).toMatch(/mn_blogvoice_/);
    expect(code(sources.blog)).toMatch(/dataset\.slug/);
    expect(code(sources.blog)).toMatch(/dataset\.locale/);
    expect(code(sources.hero)).not.toMatch(/sessionStorage/);
    expect(code(sources.projects)).not.toMatch(/sessionStorage/);
  });

  it('the blog layer passes slug and locale through data attributes', () => {
    // The inline script cannot read Astro frontmatter, so the markup is the
    // only channel. Losing either attribute degrades to one shared key.
    expect(sources.blog).toMatch(/data-slug=\{slug\}/);
    expect(sources.blog).toMatch(/data-locale=\{locale\}/);
  });

  it('no sessionStorage access in the blog layer sits outside a try', () => {
    // Safari in private browsing throws on access. An unguarded read would
    // take the whole narration down with it.
    //
    // Written as "delete the try blocks, assert nothing is left" rather than
    // "count the guarded ones": a try block holding two accesses is one match
    // for two occurrences, and the counting version failed a control that had
    // correctly guarded both.
    const withoutTryBlocks = code(sources.blog).replace(/try\s*\{[^}]*\}/g, '');
    expect(withoutTryBlocks).not.toMatch(/sessionStorage/);
  });
});
