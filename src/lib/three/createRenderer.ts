/**
 * The one place a Three.js WebGLRenderer is constructed. Every scene
 * (home, projects, experience) calls this so the renderer flags stay
 * consistent: antialiased, alpha-transparent over the page background,
 * high-performance GPU preference, a capped device-pixel-ratio (the single
 * biggest per-frame cost — see maxPixelRatio below), and optional tone
 * mapping. Construction only — callers own sizing on resize and disposal.
 */
import { type ToneMapping, WebGLRenderer } from 'three';
import { resolvePixelRatio } from './resolvePixelRatio';

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
  renderer.setPixelRatio(
    resolvePixelRatio(window.devicePixelRatio, options.maxPixelRatio),
  );
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
