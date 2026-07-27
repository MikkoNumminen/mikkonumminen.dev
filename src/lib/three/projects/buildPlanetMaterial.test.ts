import { describe, it, expect } from 'vitest';
import {
  createPlanetMaterial,
  NIGHT_FLOOR,
  NIGHT_FLOOR_HOVERED,
} from './buildPlanetMaterial';
import type { LocalizedProject } from '../../../data/projects';

const project = (over: Partial<LocalizedProject> = {}): LocalizedProject =>
  ({
    id: 'passwordmanager',
    name: 'PasswordManager',
    color: '#eab308',
    scale: 1,
    orbitRadius: 10,
    orbitSpeed: 0.01,
    phase: 0,
    tilt: 0,
    tech: [],
    tagline: '',
    description: '',
    ...over,
  }) as LocalizedProject;

describe('createPlanetMaterial', () => {
  it('carries no noise: the draw shader must not reference the fbm chunk', () => {
    // This is the whole point of the bake. If fbm reappears here, the first
    // frame goes back to blocking for a second.
    const m = createPlanetMaterial(project());
    expect(m.fragmentShader).not.toMatch(/\bfbm\s*\(/);
    expect(m.fragmentShader).not.toMatch(/\bsnoise\s*\(/);
  });

  it('samples the baked surface for its neighbours, not the noise field', () => {
    const m = createPlanetMaterial(project());
    // Three lookups: the texel itself and one along each tangent.
    expect(m.fragmentShader.match(/texture2D\(uSurface/g)).toHaveLength(3);
  });

  it('derives the texel step from the bake size it was given', () => {
    const m = createPlanetMaterial(project(), { surfaceWidth: 256, surfaceHeight: 128 });
    expect(m.uniforms.uTexel!.value.x).toBeCloseTo(1 / 256, 8);
    expect(m.uniforms.uTexel!.value.y).toBeCloseTo(1 / 128, 8);
  });

  it('builds without a surface, so a missing GL context is not a crash', () => {
    const m = createPlanetMaterial(project());
    expect(m.uniforms.uSurface!.value).toBeNull();
  });

  it('dims tier 2 and leaves tier 1 alone', () => {
    expect(
      createPlanetMaterial(project({ tier: 2 })).uniforms.uTierDim!.value,
    ).toBeLessThan(createPlanetMaterial(project({ tier: 1 })).uniforms.uTierDim!.value);
  });

  it('starts on the resting night floor, which hover lifts', () => {
    expect(createPlanetMaterial(project()).uniforms.uNightFloor!.value).toBe(NIGHT_FLOOR);
    expect(NIGHT_FLOOR_HOVERED).toBeGreaterThan(NIGHT_FLOOR);
  });
});
