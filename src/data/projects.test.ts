import { describe, it, expect } from 'vitest';
import { connections, localizeProjects, projects } from './projects';
import { getTranslations, LOCALES } from '../i18n';

describe('projects (structural data)', () => {
  it('every project has a non-empty id, name, color, and tech array', () => {
    for (const p of projects) {
      expect(p.id, `${p.id}.id`).toBeTruthy();
      expect(p.name, `${p.id}.name`).toBeTruthy();
      expect(p.color, `${p.id}.color`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.tech.length, `${p.id}.tech`).toBeGreaterThan(0);
    }
  });

  it('all project ids are unique', () => {
    const ids = projects.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe('connections (referential integrity)', () => {
  // Connections are drawn as arcs between planets by id. A typo in a
  // sourceId/targetId would not be a type error — it would silently render
  // no arc (or throw at lookup time) only once the projects scene boots in a
  // browser. This pins the cross-reference at unit-test time instead.
  const ids = new Set(projects.map((p) => p.id));

  it('every connection endpoint refers to a real project id', () => {
    for (const c of connections) {
      expect(ids.has(c.sourceId), `sourceId "${c.sourceId}"`).toBe(true);
      expect(ids.has(c.targetId), `targetId "${c.targetId}"`).toBe(true);
    }
  });

  it('no connection links a project to itself', () => {
    for (const c of connections) {
      expect(c.sourceId, 'self-link').not.toBe(c.targetId);
    }
  });

  it('every connection has a valid hex color', () => {
    for (const c of connections) {
      expect(c.color, `${c.sourceId}->${c.targetId}.color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('localizeProjects', () => {
  it('returns one entry per project for every locale', () => {
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      const result = localizeProjects(t);
      expect(result.length, `locale=${locale} count`).toBe(projects.length);
    }
  });

  it('every project has non-empty tagline and description in every locale', () => {
    for (const locale of LOCALES) {
      const t = getTranslations(locale);
      const result = localizeProjects(t);
      for (const p of result) {
        expect(p.tagline, `locale=${locale} ${p.id}.tagline`).toBeTruthy();
        expect(p.description, `locale=${locale} ${p.id}.description`).toBeTruthy();
      }
    }
  });

  it('preserves structural fields (id, name, color, tech) unchanged', () => {
    const t = getTranslations('en');
    const localized = localizeProjects(t);
    for (const [i, orig] of projects.entries()) {
      const loc = localized[i];
      expect(loc?.id).toBe(orig.id);
      expect(loc?.name).toBe(orig.name);
      expect(loc?.color).toBe(orig.color);
      expect(loc?.tech).toEqual(orig.tech);
    }
  });
});
