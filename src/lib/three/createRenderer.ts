import { type ToneMapping, WebGLRenderer } from 'three';

export interface CreateRendererOptions {
  toneMapping?: ToneMapping;
  toneMappingExposure?: number;
  /**
   * Hard cap on the renderer's pixel ratio. At 2 the internal buffer is
   * 4× the CSS-pixel area on a retina/HiDPI display; bloom + post chain
   * scale linearly with pixel count, so lowering this is the biggest
   * single per-frame saving on a CPU-bound or slow-GPU client. Defaults
   * to 1.5 (a nice middle ground: 56% of the pixel work of DPR=2, still
   * sharper than 1).
   */
  maxPixelRatio?: number;
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
  const maxPixelRatio = options.maxPixelRatio ?? 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
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
