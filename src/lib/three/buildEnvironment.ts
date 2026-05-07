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

  // Warm sun in the upper-right quadrant of the sphere (azimuth ~110°, just
  // above the horizon). Reflects in the metal as a bright warm blob — also
  // the "experience" world's signature warmth.
  const sun = ctx.createRadialGradient(720, 150, 0, 720, 150, 320);
  sun.addColorStop(0, 'rgba(255, 192, 130, 0.95)');
  sun.addColorStop(0.18, 'rgba(255, 156, 92, 0.7)');
  sun.addColorStop(0.5, 'rgba(255, 120, 60, 0.22)');
  sun.addColorStop(1, 'rgba(255, 120, 60, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);

  // Cool counter-glow on the opposite side so the rim of the metal picks up
  // a faint blue. Stops the warm side from feeling lopsided.
  const cool = ctx.createRadialGradient(220, 220, 0, 220, 220, 360);
  cool.addColorStop(0, 'rgba(110, 150, 255, 0.42)');
  cool.addColorStop(0.5, 'rgba(80, 120, 220, 0.14)');
  cool.addColorStop(1, 'rgba(80, 120, 220, 0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, 1024, 512);

  // ── Four-worlds color zones ─────────────────────────────────────────
  // Each non-home world contributes a faint color zone to the envMap so
  // the chrome reflects all four destinations as the rim light orbits.
  // Opacities are kept low so the dominant warm-cool composition still reads;
  // these are accent bounces that pick up only on the brightest specular
  // peaks of the chrome.

  // Galaxy blue (projects) — lower-left quadrant. Sits below horizon so
  // reflections show on the underside of the letterforms.
  const galaxy = ctx.createRadialGradient(180, 380, 0, 180, 380, 280);
  galaxy.addColorStop(0, 'rgba(128, 168, 255, 0.55)');
  galaxy.addColorStop(0.4, 'rgba(110, 150, 240, 0.22)');
  galaxy.addColorStop(1, 'rgba(110, 150, 240, 0)');
  ctx.fillStyle = galaxy;
  ctx.fillRect(0, 0, 1024, 512);

  // Earthy green (experience) — lower-right horizon. Echoes the mountain
  // silhouette's color so the metal picks up a warm-earth bounce on its
  // bottom edge.
  const earth = ctx.createRadialGradient(820, 400, 0, 820, 400, 260);
  earth.addColorStop(0, 'rgba(110, 130, 70, 0.45)');
  earth.addColorStop(0.5, 'rgba(80, 100, 50, 0.16)');
  earth.addColorStop(1, 'rgba(80, 100, 50, 0)');
  ctx.fillStyle = earth;
  ctx.fillRect(0, 0, 1024, 512);

  // Phosphor green (contact) — narrow band across the top center. Echoes
  // the CRT scan-line overlay; reads on the topmost specular highlights of
  // the metal as a faint terminal-green flash.
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
