import { describe, it, expect, afterEach } from 'vitest';
import { buildCommands } from './commands';
import { getTranslations, LOCALES } from '../../i18n';
import { makeContext, type TerminalElements } from './dom';
import type { CommandContext } from './types';

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

// Behavioural tests: invoke real command handlers through the real dom.ts
// context (the same object Terminal.astro wires up) and assert what actually
// lands in the DOM. dom.test.ts already proved `print`/`printHTML` escape
// correctly in isolation; the point here is the other half of the invariant
// documented in dom.ts — that commands.ts, as the `printHTML` caller, never
// forwards an unescaped interpolation. We drive that with adversarial
// argument strings (the one input surface a guest actually controls) and
// with a real project's data, and assert both the escaped string AND that no
// live element (e.g. `<img>`) was parsed into the DOM.

const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

function runCommandCtx() {
  // Typed as HTMLElement, not the inferred HTMLDivElement: the partial cast
  // below is only legal because TerminalElements is assignable to
  // `{ output: HTMLElement }`. Narrow it to HTMLDivElement and neither type is
  // assignable to the other, so `astro check` rejects the cast even though
  // Vitest and ESLint both pass. Same shape as dom.test.ts's helper.
  const output: HTMLElement = document.createElement('div');
  document.body.appendChild(output);
  const elements = { output } as TerminalElements;
  const ctx: CommandContext = makeContext(elements);
  return { output, ctx };
}

async function run(name: string, args: string[] = [], locale: 'en' | 'fi' | 'sv' = 'en') {
  const cmds = buildCommands(getTranslations(locale));
  const cmd = cmds.find((c) => c.name === name);
  if (!cmd) throw new Error(`no such command: ${name}`);
  const { output, ctx } = runCommandCtx();
  await cmd.handler(args, ctx);
  return { output, cmds };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('command handlers — adversarial argument escaping', () => {
  it('contact with an unknown flag echoes the flag escaped, not parsed', async () => {
    const { output } = await run('contact', [XSS]);
    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });

  it('links with an unknown flag echoes the flag escaped, not parsed', async () => {
    const { output } = await run('links', [XSS]);
    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });

  it('ls on an unknown path echoes the path escaped, not parsed', async () => {
    const { output } = await run('ls', [XSS]);
    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });

  it('cat on an unknown path echoes the path escaped, not parsed', async () => {
    const { output } = await run('cat', [`"><script>alert(1)</script>`]);
    expect(output.innerHTML).not.toContain('<script>alert(1)</script>');
    expect(output.querySelector('script')).toBeNull();
  });

  it('man on an unknown command name echoes it escaped, not parsed', async () => {
    const { output } = await run('man', [XSS]);
    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });

  it('download rejects an unknown flag and echoes it escaped, not parsed', async () => {
    // Unknown-flag detection requires a `--` prefix (see commands.ts) — a
    // bare adversarial string falls through to the default menu instead.
    const { output } = await run('download', [`--${XSS}`]);
    expect(output.innerHTML).toContain(`&lt;img src=x onerror=alert(1)&gt;`);
    expect(output.querySelector('img')).toBeNull();
  });

  it('sudo with an adversarial argument is denied and the argument is never echoed', async () => {
    const { output } = await run('sudo', [XSS]);
    // sudo only compares args, never prints them back — confirm the payload
    // never reaches the DOM at all (stricter than "escaped").
    expect(output.innerHTML).not.toContain('img');
    expect(output.querySelector('img')).toBeNull();
  });
});

describe('command handlers — project card rendering (cat projects/<id>)', () => {
  it('renders a real project card with escaped, live hrefs and no unintended elements', async () => {
    const { output } = await run('cat', ['projects/hrm']);
    const anchors = output.querySelectorAll('a');
    expect(anchors.length).toBe(2);
    expect(anchors[0]?.getAttribute('href')).toBe('https://hr-manager-pearl.vercel.app');
    expect(anchors[1]?.getAttribute('href')).toBe(
      'https://github.com/MikkoNumminen/HRManager',
    );
    expect(output.textContent).toContain('HRM');
    expect(output.querySelector('img')).toBeNull();
  });

  it('errors on an unknown project id, escaped', async () => {
    const { output } = await run('cat', [`projects/${XSS}`]);
    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });
});

describe('command handlers — happy-path output', () => {
  it('help lists every visible command name, hides `man`', async () => {
    const { output, cmds } = await run('help');
    const visible = cmds.filter((c) => !c.hidden);
    for (const c of visible) {
      expect(output.textContent, c.name).toContain(c.name);
    }
    expect(output.textContent).not.toContain('man ');
  });

  it('whoami prints the scripted bio with live links', async () => {
    const { output } = await run('whoami');
    expect(
      output.querySelector('a[href="https://hr-manager-pearl.vercel.app"]'),
    ).not.toBeNull();
    expect(output.textContent).toContain('Mikko Numminen');
  });

  it('contact with no args prints the mailto link and a copy button', async () => {
    const { output } = await run('contact');
    const mailto = output.querySelector('a[href^="mailto:"]');
    expect(mailto?.getAttribute('href')).toBe('mailto:numminen.mikko.petteri@gmail.com');
    expect(output.querySelector('button.copy')).not.toBeNull();
  });

  it('links --all prints both github and linkedin', async () => {
    const { output } = await run('links', ['--all']);
    expect(
      output.querySelector('a[href="https://github.com/MikkoNumminen"]'),
    ).not.toBeNull();
    expect(
      output.querySelector(
        'a[href="https://www.linkedin.com/in/mikko-numminen-269795205/"]',
      ),
    ).not.toBeNull();
  });

  it('ls with no path lists the virtual top-level dir', async () => {
    const { output } = await run('ls');
    expect(output.textContent).toContain('projects/');
    expect(output.textContent).toContain('cv');
  });

  it('ls projects lists every project id', async () => {
    const { output } = await run('ls', ['projects']);
    expect(output.textContent).toContain('hrm');
  });

  it('cat cv prints the scripted CV summary', async () => {
    const { output } = await run('cat', ['cv']);
    // Name is locale-stable (not translated); the `download cv` hint is the
    // CLI-syntax pointer to the full résumé and stays literal across locales too.
    expect(output.textContent).toContain('Mikko Numminen');
    expect(output.textContent).toContain('download cv');
  });

  it('cv command prints the same scripted summary as `cat cv`', async () => {
    const { output } = await run('cv');
    expect(output.textContent).toContain('Mikko Numminen');
    expect(output.textContent).toContain('download cv');
  });

  it('man with no target prints a usage hint', async () => {
    const { output } = await run('man');
    // Default locale is `en`; the usage syntax itself (not just any output).
    expect(output.textContent).toContain('man <command>');
  });

  it('man on a known command prints its name and description', async () => {
    const { output } = await run('man', ['whoami']);
    expect(output.textContent).toContain('whoami');
  });

  it('sudo hire mikko is the intended easter-egg path', async () => {
    const { output } = await run('sudo', ['hire', 'mikko']);
    expect(output.querySelector('span.line--accent')).not.toBeNull();
  });

  it('rm always refuses', async () => {
    const { output } = await run('rm');
    expect(output.querySelector('span.line--err')).not.toBeNull();
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

  it('points each locale at its own research page', () => {
    // The path is baked into the translated string rather than composed from a
    // locale, which is cheaper but silently wrong the moment a translator copies
    // the English line. A Finnish visitor sent to /research gets the English
    // page, which is the failure this whole change exists to stop repeating.
    //
    // Found by SCANNING every terminal string rather than naming the two that
    // carry a path today. The first version checked `cmdDownloadPageHint` by
    // name and left `chatIntroDownloads` — same string shape, same failure mode,
    // written in the same commit — completely unguarded.
    const expected: Record<string, string> = { en: '/research', fi: '/fi/research' };
    let checked = 0;
    for (const locale of LOCALES) {
      const strings = Object.entries(getTranslations(locale).terminal).filter(
        ([, value]) => typeof value === 'string' && value.includes('/research'),
      );
      for (const [key, value] of strings) {
        checked += 1;
        expect(value as string, `${locale}.terminal.${key}`).toContain(expected[locale]);
        // `/fi/research` contains `/research`, so the assertion above accepts
        // the Finnish path inside an English string. That direction is only
        // caught by forbidding the prefix outright.
        if (locale === 'en') {
          expect(
            value as string,
            `en.terminal.${key} carries a Finnish path`,
          ).not.toContain('/fi/');
        }
      }
    }
    // Guard the guard: a renamed key or a rewritten sentence would empty the
    // scan, and an empty loop asserts nothing. Two strings per locale today.
    expect(
      checked,
      'no terminal string mentions /research any more',
    ).toBeGreaterThanOrEqual(2 * LOCALES.length);
  });

  it('localizes descriptions — every command has a non-empty description in every locale', () => {
    for (const locale of LOCALES) {
      for (const c of buildCommands(getTranslations(locale))) {
        expect(c.description, `locale=${locale} ${c.name}.description`).toBeTruthy();
      }
    }
  });
});
