import { PerspectiveCamera, WebGLRenderer } from 'three';

export interface ResizeHandlerHandle {
  handler: () => void;
  dispose: () => void;
}

/**
 * Creates a window-resize handler that updates renderer size, DPR, and the
 * camera projection. The optional `onResize` hook receives the new dimensions
 * for scene-specific tweaks (e.g. scaling a title group).
 */
export function createResizeHandler(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  onResize?: (width: number, height: number) => void,
): ResizeHandlerHandle {
  const handler = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
