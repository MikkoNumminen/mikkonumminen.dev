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
  // above the horizon). Reflects in the metal as a bright warm blob.
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

  const source = new CanvasTexture(canvas);
  source.mapping = EquirectangularReflectionMapping;
  source.colorSpace = SRGBColorSpace;
  source.needsUpdate = true;

  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(source).texture;

  return { envMap, source, pmrem };
}
