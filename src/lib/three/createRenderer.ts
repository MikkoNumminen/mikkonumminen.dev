import { type ToneMapping, WebGLRenderer } from 'three';

export interface CreateRendererOptions {
  toneMapping?: ToneMapping;
  toneMappingExposure?: number;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions = {},
): WebGLRenderer {
  const renderer = new WebGLRenderer({
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
