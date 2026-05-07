import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface BloomComposerOptions {
  strength?: number;
  radius?: number;
  threshold?: number;
}

export interface BloomComposerHandle {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Wraps the renderer in an `EffectComposer` chain — render the scene, run
 * `UnrealBloomPass` to lift bright pixels into a glow, then `OutputPass` to
 * convert linear to sRGB. The caller swaps `renderer.render(scene, camera)`
 * for `composer.render()`.
 *
 * Threshold is set high enough that only specular peaks and the sun glow
 * bloom — the body of the metal stays grounded.
 */
export function createBloomComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  opts: BloomComposerOptions = {},
): BloomComposerHandle {
  const { strength = 0.6, radius = 0.45, threshold = 0.82 } = opts;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new Vector2(window.innerWidth, window.innerHeight),
    strength,
    radius,
    threshold,
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  return {
    composer,
    bloomPass,
    resize: (width: number, height: number): void => {
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
    },
    dispose: (): void => {
      bloomPass.dispose();
      composer.dispose();
    },
  };
}
