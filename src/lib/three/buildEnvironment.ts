import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * Procedural sky-and-sun environment used as the title's reflection source.
 *
 * Without an envMap a `MeshPhysicalMaterial` with non-zero `metalness` has
 * nothing to reflect, so the metal reads as flat mid-gray no matter how the
 * lights are configured. Drawing a custom equirectangular gradient in 2D and
 * baking it through `PMREMGenerator` gives us full control over what shows
 * up in the chrome highlights — here, a deep navy sky with a warm orange
 * sun in the upper-right (lined up with the existing fill light) and a cool
 * blue counter-glow opposite it.
 *
 * Returns the baked PMREM texture (ready to plug into `scene.environment`)
 * plus the source equirect texture and the PMREMGenerator so the caller can
 * dispose all three on teardown.
 */
export interface EnvironmentHandle {
  envMap: Texture;
  source: Texture;
  pmrem: PMREMGenerator;
}

export function buildEnvironment(renderer: WebGLRenderer): EnvironmentHandle {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildEnvironment: 2D context unavailable');

  // Vertical gradient: top sky → horizon → ground. Equirect maps v=0 to the
  // top of the sphere and v=1 to the bottom.
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
  skyGrad.addColorStop(0, '#1c2452');
  skyGrad.addColorStop(0.42, '#0a0e22');
  skyGrad.addColorStop(0.55, '#06080f');
  skyGrad.addColorStop(1, '#020308');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, 1024, 512);

  // Cool white-blue star in the upper-right quadrant — same azimuth as
  // the in-scene horizon glow, so the chrome's reflected sun and the
  // visible star match. Replaces the previous warm orange "manor" sun
  // for a sci-fi look.
  const star = ctx.createRadialGradient(720, 150, 0, 720, 150, 320);
  star.addColorStop(0, 'rgba(245, 250, 255, 0.95)');
  star.addColorStop(0.16, 'rgba(200, 225, 255, 0.65)');
  star.addColorStop(0.45, 'rgba(150, 190, 255, 0.2)');
  star.addColorStop(1, 'rgba(120, 160, 240, 0)');
  ctx.fillStyle = star;
  ctx.fillRect(0, 0, 1024, 512);

  // Cool counter-glow on the opposite side so the rim of the metal picks
  // up a faint blue from the other direction too. Slightly deeper /
  // electric-blue tone than the star to differentiate.
  const cool = ctx.createRadialGradient(220, 220, 0, 220, 220, 360);
  cool.addColorStop(0, 'rgba(120, 165, 255, 0.42)');
  cool.addColorStop(0.5, 'rgba(90, 130, 230, 0.14)');
  cool.addColorStop(1, 'rgba(90, 130, 230, 0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, 1024, 512);

  // ── Four-worlds color zones ─────────────────────────────────────────
  // Each non-home world contributes a faint color zone so the chrome
  // reflects all four destinations as the rim light orbits.

  // Galaxy blue (projects) — lower-left.
  const galaxy = ctx.createRadialGradient(180, 380, 0, 180, 380, 280);
  galaxy.addColorStop(0, 'rgba(128, 168, 255, 0.55)');
  galaxy.addColorStop(0.4, 'rgba(110, 150, 240, 0.22)');
  galaxy.addColorStop(1, 'rgba(110, 150, 240, 0)');
  ctx.fillStyle = galaxy;
  ctx.fillRect(0, 0, 1024, 512);

  // Phosphor green (contact) — narrow band across the top center.
  const phosphor = ctx.createRadialGradient(512, 50, 0, 512, 50, 220);
  phosphor.addColorStop(0, 'rgba(74, 222, 128, 0.32)');
  phosphor.addColorStop(0.6, 'rgba(74, 222, 128, 0.08)');
  phosphor.addColorStop(1, 'rgba(74, 222, 128, 0)');
  ctx.fillStyle = phosphor;
  ctx.fillRect(0, 0, 1024, 512);

  const source = new CanvasTexture(canvas);
  source.mapping = EquirectangularReflectionMapping;
  source.colorSpace = SRGBColorSpace;
  source.needsUpdate = true;

  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(source).texture;

  return { envMap, source, pmrem };
}
