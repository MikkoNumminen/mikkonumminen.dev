import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseRegistry } from './skills';
import { makeContext, type TerminalElements } from './dom';
import type { CommandContext } from './types';
import { getTranslations } from '../../i18n';

// parseRegistry replaced a blind `as SkillRegistry` cast on the runtime-fetched
// registry JSON. These tests pin that it accepts the real (enriched) shape and
// rejects structurally-broken input by returning null — which routes the
// `skills` command to its graceful empty state instead of crashing the render.

const validRegistry = {
  generated_at: '2026-06-13T00:00:00.000Z',
  totals: { skills: 1, redirects: 0, with_receipts: 1, annual_tokens_saved: 1000 },
  repos: [
    {
      name: 'claude-skills',
      github_url: 'https://github.com/MikkoNumminen/claude-skills',
      skills: [
        {
          name: 'mikko-audit',
          description: 'Robustness audit.',
          redirect: false,
          // Enriched receipt with many fields beyond the SkillReceipt interface —
          // the guard must NOT reject these.
          receipt: {
            path: '.claude/agent-verdicts/SKILL-USAGE-LATEST.json',
            source: 'transcript-measurement',
            tokens_per_use: 1000,
            uses_per_year: 12,
            annual_total: 12000,
            tokens_saved_per_use: 3000,
            calibration_arm_A: 5000,
            alt_model_measurements: { opus: { arm_A_tokens: 1, arm_B_tokens: 1 } },
          },
        },
      ],
    },
  ],
};

describe('parseRegistry — accepts', () => {
  it('returns the object for a well-formed enriched registry', () => {
    const out = parseRegistry(validRegistry);
    expect(out).not.toBeNull();
    expect(out?.repos[0]?.skills[0]?.name).toBe('mikko-audit');
  });

  it('accepts a null receipt (skill with no token estimate)', () => {
    const reg = {
      ...validRegistry,
      repos: [
        {
          name: 'r',
          skills: [{ name: 'n', description: 'd', redirect: false, receipt: null }],
        },
      ],
    };
    expect(parseRegistry(reg)).not.toBeNull();
  });

  it('accepts an empty repo list', () => {
    expect(parseRegistry({ ...validRegistry, repos: [] })).not.toBeNull();
  });

  it('accepts an optional built_in_references array (and its absence)', () => {
    expect(parseRegistry(validRegistry)).not.toBeNull(); // absent
    expect(
      parseRegistry({ ...validRegistry, built_in_references: [{ name: 'review' }] }),
    ).not.toBeNull();
  });
});

describe('parseRegistry — rejects (returns null)', () => {
  it('non-object roots', () => {
    expect(parseRegistry(null)).toBeNull();
    expect(parseRegistry(undefined)).toBeNull();
    expect(parseRegistry('{}')).toBeNull();
    expect(parseRegistry(42)).toBeNull();
    expect(parseRegistry([])).toBeNull();
  });

  it('a missing or mistyped generated_at', () => {
    expect(parseRegistry({ totals: validRegistry.totals, repos: [] })).toBeNull();
    expect(parseRegistry({ ...validRegistry, generated_at: 12345 })).toBeNull();
  });

  it('repos that is not an array, or totals that is not an object', () => {
    expect(parseRegistry({ ...validRegistry, repos: 'nope' })).toBeNull();
    expect(parseRegistry({ ...validRegistry, totals: null })).toBeNull();
  });

  it('a built_in_references that is not an array, or whose elements lack a string name', () => {
    expect(parseRegistry({ ...validRegistry, built_in_references: 'nope' })).toBeNull();
    expect(parseRegistry({ ...validRegistry, built_in_references: {} })).toBeNull();
    expect(parseRegistry({ ...validRegistry, built_in_references: [5] })).toBeNull();
    expect(parseRegistry({ ...validRegistry, built_in_references: [{}] })).toBeNull();
  });

  it('a repo missing a name or a skills array', () => {
    expect(parseRegistry({ ...validRegistry, repos: [{ skills: [] }] })).toBeNull();
    expect(
      parseRegistry({ ...validRegistry, repos: [{ name: 'x', skills: {} }] }),
    ).toBeNull();
  });

  it('a skill with a mistyped required field', () => {
    const bad = (skill: unknown) =>
      parseRegistry({ ...validRegistry, repos: [{ name: 'r', skills: [skill] }] });
    expect(bad({ name: 1, description: 'd', redirect: false, receipt: null })).toBeNull();
    expect(bad({ name: 'n', description: 2, redirect: false, receipt: null })).toBeNull();
    expect(
      bad({ name: 'n', description: 'd', redirect: 'no', receipt: null }),
    ).toBeNull();
    expect(
      bad({ name: 'n', description: 'd', redirect: false, receipt: 'x' }),
    ).toBeNull();
  });
});

// runSkillsCommand — behavioural tests through the real dom.ts context, same
// approach as commands.test.ts. This is the important half of the coverage
// gap: `isSafeHref` (skills.ts, guarding the `printHTML` calls in
// renderSkillLine/renderRepo) is the ONLY thing standing between a tampered
// registry file and a `javascript:`/`data:` URL in a live `href`. It isn't
// exported, so it's proven here through the render paths that consume it.
//
// `fetchRegistry` caches its promise at module scope for CACHE_TTL_MS, so
// each test that drives a fetch needs a fresh module instance — otherwise a
// later test would silently reuse an earlier test's cached registry. We
// `vi.resetModules()` and re-`import('./skills')` per test instead.

const en = getTranslations('en');
const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;';

function runCommandCtx() {
  const output: HTMLElement = document.createElement('div');
  document.body.appendChild(output);
  const elements = { output } as TerminalElements;
  const ctx: CommandContext = makeContext(elements);
  return { output, ctx };
}

function mockJsonFetch(json: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => json }) as Response);
}

async function freshSkillsModule() {
  vi.resetModules();
  return import('./skills');
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const wellFormedRegistry = {
  generated_at: '2026-06-13T00:00:00.000Z',
  totals: { skills: 1, redirects: 0, with_receipts: 1, annual_tokens_saved: 12000 },
  repos: [
    {
      name: 'claude-skills',
      github_url: 'https://github.com/MikkoNumminen/claude-skills',
      skills: [
        {
          name: 'mikko-audit',
          description: 'Robustness audit.',
          redirect: false,
          receipt: {
            path: 'https://example.com/receipts/mikko-audit.json',
            source: 'transcript-measurement',
            tokens_per_use: 1000,
            uses_per_year: 12,
            annual_total: 12000,
          },
        },
      ],
    },
  ],
};

const adversarialRegistry = {
  generated_at: '2026-06-13T00:00:00.000Z',
  totals: { skills: 1, redirects: 0, with_receipts: 1, annual_tokens_saved: 1000 },
  repos: [
    {
      name: 'evil-repo',
      // A malformed/tampered registry could put an arbitrary scheme here —
      // this must never reach a live href.
      github_url: 'javascript:alert(document.cookie)',
      skills: [
        {
          name: XSS,
          description: XSS,
          redirect: false,
          receipt: {
            path: 'javascript:alert(document.cookie)',
            source: 'manual',
            tokens_per_use: 100,
            uses_per_year: 10,
            annual_total: 1000,
          },
        },
      ],
    },
  ],
};

describe('isSafeHref (through renderSkillLine / renderRepo — not exported directly)', () => {
  it('accepts https:// and http:// and renders them as live anchors', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(wellFormedRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--all'], ctx, en);

    const repoAnchor = output.querySelector(
      'a[href="https://github.com/MikkoNumminen/claude-skills"]',
    );
    expect(repoAnchor).not.toBeNull();
    const receiptAnchor = output.querySelector(
      'a[href="https://example.com/receipts/mikko-audit.json"]',
    );
    expect(receiptAnchor).not.toBeNull();
    expect(receiptAnchor?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(receiptAnchor?.getAttribute('target')).toBe('_blank');
  });

  it('rejects a javascript: URL — no live anchor, and the literal scheme never reaches output', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(adversarialRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--all'], ctx, en);

    expect(output.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(output.innerHTML).not.toContain('javascript:');
  });

  it('rejects a data: URL the same way as javascript:', async () => {
    const dataUrlRegistry = {
      ...adversarialRegistry,
      repos: [
        {
          ...adversarialRegistry.repos[0],
          github_url: 'data:text/html,<script>alert(1)</script>',
          skills: [
            {
              ...adversarialRegistry.repos[0]!.skills[0]!,
              receipt: {
                ...adversarialRegistry.repos[0]!.skills[0]!.receipt,
                path: 'data:text/html,<script>alert(1)</script>',
              },
            },
          ],
        },
      ],
    };
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(dataUrlRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--all'], ctx, en);

    expect(output.querySelector('a[href^="data:"]')).toBeNull();
    expect(output.innerHTML).not.toContain('data:text/html');
    expect(output.querySelector('script')).toBeNull();
  });
});

describe('runSkillsCommand / renderSkillLine / renderRepo — adversarial content escaping', () => {
  it('escapes an adversarial skill name/description and never parses a live <img>', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(adversarialRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--all'], ctx, en);

    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });

  it('falls back to a receipt-source span (not an anchor) when the path is unsafe', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(adversarialRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--all'], ctx, en);

    expect(output.textContent).toContain('[manual]');
  });

  it('an unknown flag echoes it escaped, not parsed', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(wellFormedRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand([`--${XSS}`], ctx, en);

    expect(output.innerHTML).toContain(XSS_ESCAPED);
    expect(output.querySelector('img')).toBeNull();
  });
});

describe('runSkillsCommand — happy-path rendering', () => {
  it('default (aggregate) mode prints the repo table with formatted totals', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(wellFormedRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand([], ctx, en);

    expect(output.textContent).toContain('claude-skills');
    // formatNumber(12000) === '12k'
    expect(output.textContent).toContain('12k');
    expect(output.textContent).toContain('2026-06-13');
  });

  it('--repo <name> renders just that repo (case-insensitive match)', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(wellFormedRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--repo', 'CLAUDE-SKILLS'], ctx, en);

    expect(output.textContent).toContain('mikko-audit');
    expect(
      output.querySelector('a[href="https://github.com/MikkoNumminen/claude-skills"]'),
    ).not.toBeNull();
  });

  it('--repo on an unknown name errors and lists the known repos', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(wellFormedRegistry));
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--repo', 'nonexistent'], ctx, en);

    expect(output.querySelector('span.line--err')).not.toBeNull();
    expect(output.textContent).toContain('claude-skills');
  });

  it('renders the graceful empty state when the registry file is missing (404)', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => null }) as Response),
    );
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand([], ctx, en);

    // The hint's file path is the load-bearing part — it's what tells a
    // visitor/dev what's actually missing, and it isn't locale-translated.
    expect(output.querySelector('span.line--err')).not.toBeNull();
    expect(output.textContent).toContain('skills-registry.json');
  });

  it('--json opens the raw registry in a new tab without rendering it inline', async () => {
    const { runSkillsCommand } = await freshSkillsModule();
    vi.stubGlobal('fetch', mockJsonFetch(wellFormedRegistry));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { output, ctx } = runCommandCtx();
    await runSkillsCommand(['--json'], ctx, en);

    expect(openSpy).toHaveBeenCalledWith(
      '/data/skills-registry.json',
      '_blank',
      'noopener',
    );
    expect(output.querySelector('a')).toBeNull();
  });
});
