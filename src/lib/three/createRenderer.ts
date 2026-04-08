import * as THREE from 'three';

export interface CreateRendererOptions {
  toneMapping?: THREE.ToneMapping;
  toneMappingExposure?: number;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions = {},
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  if (options.toneMapping !== undefined) {
    renderer.toneMapping = options.toneMapping;
  }
  if (options.toneMappingExposure !== undefined) {
    renderer.toneMappingExposure = options.toneMappingExposure;
  }
  return renderer;
}
