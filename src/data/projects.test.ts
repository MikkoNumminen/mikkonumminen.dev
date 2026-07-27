import { describe, it, expect } from 'vitest';
import { connections, localizeProjects, projects } from './projects';
import { getTranslations, LOCALES } from '../i18n';
import { PLANET_BASE_RADIUS } from '../lib/three/projects/constants';
import { fitRadius } from '../lib/three/projects/cameraControls';

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

describe('solar-system layout', () => {
  const sun = projects.filter((p) => p.isSun);
  const moons = projects.filter((p) => p.moonOf);
  const orbiting = projects.filter((p) => !p.isSun && !p.moonOf);
  const byRadius = [...orbiting].sort((a, b) => a.orbitRadius - b.orbitRadius);

  it('has exactly one star', () => {
    expect(sun.map((p) => p.id)).toEqual(['portfolio']);
  });

  it('every moon names a parent that is itself an orbiting planet', () => {
    for (const m of moons) {
      const parent = projects.find((p) => p.id === m.moonOf);
      expect(parent, `${m.id}.moonOf`).toBeDefined();
      expect(parent?.isSun, `${m.id} orbits the star`).toBeFalsy();
      expect(parent?.moonOf, `${m.id} orbits another moon`).toBeUndefined();
    }
  });

  it('ranks every orbiting planet into a tier', () => {
    for (const p of orbiting) {
      expect([1, 2], `${p.id}.tier`).toContain(p.tier);
    }
  });

  it('puts every tier-1 planet inside every tier-2 planet', () => {
    const innermostTier2 = Math.min(
      ...orbiting.filter((p) => p.tier === 2).map((p) => p.orbitRadius),
    );
    for (const p of orbiting.filter((q) => q.tier === 1)) {
      expect(p.orbitRadius, `${p.id} is tier 1 but outside the tier-2 belt`).toBeLessThan(
        innermostTier2,
      );
    }
  });

  it('renders tier 1 larger than every tier-2 planet', () => {
    const largestTier2 = Math.max(
      ...orbiting.filter((p) => p.tier === 2).map((p) => p.scale),
    );
    for (const p of orbiting.filter((q) => q.tier === 1)) {
      expect(p.scale, `${p.id}`).toBeGreaterThan(largestTier2);
    }
  });

  it('leaves no two orbits closer than the bodies riding them', () => {
    // Adjacent orbit lines have to clear both planets' radii, or the rings
    // visually cross and the tiering stops reading as distance.
    for (let i = 1; i < byRadius.length; i++) {
      const inner = byRadius[i - 1]!;
      const outer = byRadius[i]!;
      const gap = outer.orbitRadius - inner.orbitRadius;
      const needed = (inner.scale + outer.scale) * PLANET_BASE_RADIUS * 0.5;
      expect(gap, `${inner.id} -> ${outer.id}`).toBeGreaterThan(needed);
    }
  });

  it('keeps a moon and its satellite inside the gap to the next orbit', () => {
    // A moon orbits its parent locally; if that reach exceeds the gap to the
    // neighbouring orbit it swings across another planet's ring.
    for (const m of moons) {
      const parent = projects.find((p) => p.id === m.moonOf)!;
      const idx = byRadius.findIndex((p) => p.id === parent.id);
      const outer = byRadius[idx + 1];
      if (!outer) continue;
      const gap = outer.orbitRadius - parent.orbitRadius;
      // Reach = the moon's own orbit plus its body, and the parent's
      // external-API satellite, which sits at 2.6x the parent radius.
      const satelliteReach = PLANET_BASE_RADIUS * parent.scale * 2.6;
      const moonReach = m.orbitRadius + PLANET_BASE_RADIUS * m.scale;
      expect(Math.max(moonReach, satelliteReach), `${m.id} reach`).toBeLessThan(gap);
    }
  });

  it('frames the whole system at the default camera on a square viewport', () => {
    // The binding case: aspect 1 means width and height constrain equally.
    // Anything beyond MAX_RADIUS would clip no matter how far the camera pulls.
    const rMax = Math.max(...orbiting.map((p) => p.orbitRadius));
    const polar = Math.acos(8 / Math.hypot(0, 8, 28));
    const radius = fitRadius(rMax, 2.6, 52, 1, polar, 9, 68);
    const halfExtent = Math.tan((52 * Math.PI) / 180 / 2) * radius;
    expect(halfExtent).toBeGreaterThanOrEqual(rMax);
    expect(halfExtent * Math.abs(Math.cos(polar))).toBeLessThan(rMax);
    expect(radius).toBeLessThan(68);
  });

  it('gives the star no orbit of its own', () => {
    for (const p of sun) {
      expect(p.orbitRadius).toBe(0);
      expect(p.orbitSpeed).toBe(0);
    }
  });
});
