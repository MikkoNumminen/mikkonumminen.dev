import { PerspectiveCamera, WebGLRenderer } from 'three';
import { resolvePixelRatio } from './resolvePixelRatio';

export interface ResizeHandlerHandle {
  handler: () => void;
  dispose: () => void;
}

/**
 * Creates a window-resize handler that updates renderer size, DPR, and the
 * camera projection. The optional `onResize` hook receives the new dimensions
 * for scene-specific tweaks (e.g. scaling a title group).
 *
 * `maxPixelRatio` must match the value passed to `createRenderer` so that
 * every resize event keeps the same DPR cap that was set at init time.
 * Defaults to 1.5 — the same default used by `createRenderer`.
 */
export function createResizeHandler(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  onResize?: (width: number, height: number) => void,
  maxPixelRatio = 1.5,
): ResizeHandlerHandle {
  const handler = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(resolvePixelRatio(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    onResize?.(width, height);
  };
  window.addEventListener('resize', handler);
  return {
    handler,
    dispose: (): void => {
      window.removeEventListener('resize', handler);
    },
  };
}
