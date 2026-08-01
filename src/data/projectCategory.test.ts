import { describe, expect, it } from 'vitest';
import { projects } from './projects';

/**
 * `category` exists to be counted, and a count nobody checks drifts the moment
 * a thirteenth project lands. These tests are what makes adding one a decision
 * rather than an accident: a new entry cannot compile without a category, and
 * the totals below fail until someone updates them on purpose.
 *
 * The rule is SHAPE, not audience: an app presents an interface a person uses,
 * a tool is run from a terminal or a config file. That is why AudiobookMaker
 * and PasswordManager are apps despite being things you run for yourself, and
 * why Strudel Patterns is a tool despite being the most creative thing here.
 */

const APPS = projects.filter((p) => p.category === 'app');
const TOOLS = projects.filter((p) => p.category === 'tool');

describe('project category', () => {
  it('every project is classified', () => {
    const missing = projects.filter((p) => p.category !== 'app' && p.category !== 'tool');
    expect(missing.map((p) => p.id)).toEqual([]);
  });

  it('splits 9 apps and 3 tools', () => {
    // Pinned deliberately. If this fails because a project was added, the fix
    // is to decide which side it falls on and update this number, not to make
    // the assertion loose.
    expect({ apps: APPS.length, tools: TOOLS.length }).toEqual({ apps: 9, tools: 3 });
  });

  it('classifies the three that decide the split the way the rule says', () => {
    // These are the entries where "shape" and "audience" disagree, so they are
    // the ones a later reader is most likely to flip without noticing that the
    // totals move with them.
    const byId = new Map(projects.map((p) => [p.id, p.category]));
    expect(byId.get('audiobookmaker')).toBe('app');
    expect(byId.get('passwordmanager')).toBe('app');
    expect(byId.get('strudel-patterns')).toBe('tool');
  });

  it('accounts for every project exactly once', () => {
    expect(APPS.length + TOOLS.length).toBe(projects.length);
  });
});
