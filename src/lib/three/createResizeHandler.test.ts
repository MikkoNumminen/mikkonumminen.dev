import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerspectiveCamera, type WebGLRenderer } from 'three';
import { createResizeHandler } from './createResizeHandler';

// createResizeHandler is where a known regression lived (full audit E-MA1: a
// hardcoded DPR of 2 silently overrode the 1.5 cap on every resize, undoing the
// low-perf path on Retina displays). These tests pin the cap, the camera-aspect
// recompute, and listener teardown. The renderer is a stub (the handler only
// calls setPixelRatio/setSize, never a GL context); the camera is real.

const saved = {
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
};

function setWindow(prop: keyof typeof saved, value: number) {
  Object.defineProperty(window, prop, { value, configurable: true, writable: true });
}

afterEach(() => {
  setWindow('innerWidth', saved.innerWidth);
  setWindow('innerHeight', saved.innerHeight);
  setWindow('devicePixelRatio', saved.devicePixelRatio);
});

function makeRenderer() {
  return { setPixelRatio: vi.fn(), setSize: vi.fn() } as unknown as WebGLRenderer & {
    setPixelRatio: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
  };
}

describe('createResizeHandler', () => {
  it('sizes the renderer and recomputes the camera aspect from the window', () => {
    setWindow('innerWidth', 1600);
    setWindow('innerHeight', 800);
    setWindow('devicePixelRatio', 1);
    const renderer = makeRenderer();
    const camera = new PerspectiveCamera();
    const updateSpy = vi.spyOn(camera, 'updateProjectionMatrix');
    const { handler, dispose } = createResizeHandler(renderer, camera);
    handler();
    expect(renderer.setSize).toHaveBeenCalledWith(1600, 800, false);
    expect(camera.aspect).toBeCloseTo(2, 10);
    expect(updateSpy).toHaveBeenCalled();
    dispose();
  });

  it('clamps the device pixel ratio to the default 1.5 cap (the E-MA1 fix)', () => {
    setWindow('devicePixelRatio', 3);
    const renderer = makeRenderer();
    const { handler, dispose } = createResizeHandler(renderer, new PerspectiveCamera());
    handler();
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5);
    dispose();
  });

  it('passes a DPR below the cap through unchanged', () => {
    setWindow('devicePixelRatio', 1);
    const renderer = makeRenderer();
    const { handler, dispose } = createResizeHandler(renderer, new PerspectiveCamera());
    handler();
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
    dispose();
  });

  it('honours an explicit maxPixelRatio argument', () => {
    setWindow('devicePixelRatio', 5);
    const renderer = makeRenderer();
    const { handler, dispose } = createResizeHandler(
      renderer,
      new PerspectiveCamera(),
      undefined,
      2,
    );
    handler();
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
    dispose();
  });

  it('invokes the onResize hook with the new dimensions', () => {
    setWindow('innerWidth', 1280);
    setWindow('innerHeight', 720);
    const onResize = vi.fn();
    const renderer = makeRenderer();
    const { handler, dispose } = createResizeHandler(
      renderer,
      new PerspectiveCamera(),
      onResize,
    );
    handler();
    expect(onResize).toHaveBeenCalledWith(1280, 720);
    dispose();
  });

  it('fires on a window resize event and stops firing after dispose', () => {
    const renderer = makeRenderer();
    const { dispose } = createResizeHandler(renderer, new PerspectiveCamera());
    window.dispatchEvent(new Event('resize'));
    expect(renderer.setSize).toHaveBeenCalledTimes(1);
    dispose();
    window.dispatchEvent(new Event('resize'));
    expect(renderer.setSize).toHaveBeenCalledTimes(1);
  });
});
