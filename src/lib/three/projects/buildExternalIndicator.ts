import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { PlanetEntry } from './buildPlanet';

const PLANET_BASE_RADIUS = 0.55;

const NUM_PULSES = 3;
const PULSE_DURATION = 2.6;
const SATELLITE_SPEED = 1.45;

/** Single shared pulse texture across all indicators. */
let _sharedPulseTexture: CanvasTexture | null = null;
function getPulseTexture(): CanvasTexture {
  if (_sharedPulseTexture) return _sharedPulseTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(190, 225, 255, 0.95)');
  grad.addColorStop(0.5, 'rgba(140, 180, 255, 0.4)');
  grad.addColorStop(1, 'rgba(120, 160, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  _sharedPulseTexture = tex;
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
  satelliteMaterial: MeshStandardMaterial;
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
  const satelliteMaterial = new MeshStandardMaterial({
    color: new Color(baseColor),
    emissive: new Color(baseColor),
    emissiveIntensity: 1.1,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 1,
  });
  const satellite = new Mesh(satelliteGeometry, satelliteMaterial);
  planet.group.add(satellite);

  const pulseTexture = getPulseTexture();
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
  const basePhase = ((h % 1000) / 1000 + 1) % 1;

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
  indicator.satelliteMaterial.opacity = visibility;
  indicator.satelliteMaterial.emissiveIntensity = 1.1 * visibility;

  // Pulse rings expand from the satellite. Each pulse cycles through
  // [0, 1), peaks in opacity midway, and rides a sin-shaped envelope.
  for (const p of indicator.pulses) {
    const t =
      (elapsed / PULSE_DURATION + p.phase + indicator.basePhase) % 1;
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
  }
  // The pulse texture is shared module-wide; dispose only on full teardown.
  if (_sharedPulseTexture) {
    _sharedPulseTexture.dispose();
    _sharedPulseTexture = null;
  }
}
