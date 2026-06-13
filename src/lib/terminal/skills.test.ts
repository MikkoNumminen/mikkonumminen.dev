import { describe, it, expect } from 'vitest';
import { parseRegistry } from './skills';

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
