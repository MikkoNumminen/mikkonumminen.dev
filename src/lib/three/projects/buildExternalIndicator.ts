import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { PlanetEntry } from './buildPlanet';
import { PLANET_BASE_RADIUS } from './constants';
import { makeRadialSpriteTexture } from '../textures';

const NUM_PULSES = 3;
const PULSE_DURATION = 2.6;
const SATELLITE_SPEED = 1.45;

/** Single shared pulse texture across all indicators. */
let sharedPulseTexture: CanvasTexture | null = null;
let sharedPulseTextureRefCount = 0;

function getPulseTexture(): CanvasTexture {
  if (sharedPulseTexture) return sharedPulseTexture;
  const tex = makeRadialSpriteTexture(128, [
    [0, 'rgba(190, 225, 255, 0.95)'],
    [0.5, 'rgba(140, 180, 255, 0.4)'],
    [1, 'rgba(120, 160, 255, 0)'],
  ]);
  sharedPulseTexture = tex;
  return tex;
}

interface PulseEntry {
  sprite: Sprite;
  material: SpriteMaterial;
  /** Phase offset in [0, 1) so the N pulses cycle out of sync. */
  phase: number;
}

export interface ExternalIndicator {
  /** Tiny mesh orbiting the planet, "broadcasting". */
  satellite: Mesh;
  satelliteMaterial: MeshBasicMaterial;
  satelliteGeometry: SphereGeometry;
  pulses: PulseEntry[];
  /** Local orbit radius of the satellite around its planet center. */
  orbitRadius: number;
  /** Maximum scale a pulse sprite reaches before fully fading out. */
  pulseMaxScale: number;
  /** Initial random phase offset so adjacent indicators don't pulse in sync. */
  basePhase: number;
}

export function buildExternalIndicator(planet: PlanetEntry): ExternalIndicator {
  const planetRadius = PLANET_BASE_RADIUS * planet.project.scale;
  const orbitRadius = planetRadius * 2.6;
  const pulseMaxScale = 1.4 + planet.project.scale * 0.7;
  const baseColor = 0x80c8ff;

  const satelliteGeometry = new SphereGeometry(0.075, 14, 14);
  // Unlit. There are no lights in this scene any more — every surface is a
  // shader that knows where the star is — so a PBR material here would run the
  // whole lighting path to render a self-lit dot that receives nothing. The
  // emissive colour it used to rely on IS the colour, so this is the same
  // output for a fraction of the shader.
  const satelliteMaterial = new MeshBasicMaterial({
    color: new Color(baseColor),
    transparent: true,
    opacity: 1,
  });
  const satellite = new Mesh(satelliteGeometry, satelliteMaterial);
  planet.group.add(satellite);

  const pulseTexture = getPulseTexture();
  sharedPulseTextureRefCount += 1;
  const pulses: PulseEntry[] = [];
  for (let i = 0; i < NUM_PULSES; i++) {
    const material = new SpriteMaterial({
      map: pulseTexture,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      color: new Color(baseColor),
    });
    const sprite = new Sprite(material);
    sprite.scale.set(0.001, 0.001, 1);
    planet.group.add(sprite);
    pulses.push({ sprite, material, phase: i / NUM_PULSES });
  }

  // Random per-planet phase offset so adjacent satellites don't appear
  // locked in step. Hash the project id to keep it stable across reloads.
  let h = 0;
  for (let i = 0; i < planet.project.id.length; i++) {
    h = (h * 31 + planet.project.id.charCodeAt(i)) & 0xffffffff;
  }
  const basePhase = (((h % 1000) + 1000) % 1000) / 1000;

  return {
    satellite,
    satelliteMaterial,
    satelliteGeometry,
    pulses,
    orbitRadius,
    pulseMaxScale,
    basePhase,
  };
}

export function updateExternalIndicator(
  indicator: ExternalIndicator,
  elapsed: number,
  visibility: number,
): void {
  // Orbit the satellite around the planet center on a slightly tilted plane
  // so it reads as "in motion" rather than locked to the ecliptic.
  const angle = elapsed * SATELLITE_SPEED + indicator.basePhase * Math.PI * 2;
  const r = indicator.orbitRadius;
  indicator.satellite.position.set(
    Math.cos(angle) * r,
    Math.sin(angle * 0.42) * r * 0.32,
    Math.sin(angle) * r,
  );
  // Opacity alone carries the fade now. The emissive channel it used to drive
  // alongside it belonged to a PBR material that no longer exists.
  indicator.satelliteMaterial.opacity = visibility;

  // Pulse rings expand from the satellite. Each pulse cycles through
  // [0, 1), peaks in opacity midway, and rides a sin-shaped envelope.
  for (const p of indicator.pulses) {
    const t = (elapsed / PULSE_DURATION + p.phase + indicator.basePhase) % 1;
    const scale = 0.18 + t * indicator.pulseMaxScale;
    p.sprite.scale.set(scale, scale, 1);
    p.sprite.position.copy(indicator.satellite.position);
    p.material.opacity = Math.sin(t * Math.PI) * 0.55 * visibility;
  }
}

export function disposeExternalIndicators(indicators: ExternalIndicator[]): void {
  for (const ind of indicators) {
    ind.satelliteGeometry.dispose();
    ind.satelliteMaterial.dispose();
    for (const p of ind.pulses) {
      p.material.dispose();
    }
    sharedPulseTextureRefCount -= 1;
  }
  // The pulse texture is shared; only dispose when the last indicator releases it.
  if (sharedPulseTextureRefCount <= 0 && sharedPulseTexture) {
    sharedPulseTexture.dispose();
    sharedPulseTexture = null;
    sharedPulseTextureRefCount = 0;
  }
}
