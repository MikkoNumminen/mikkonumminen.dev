import {
  type Camera,
  type Intersection,
  type Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';

/**
 * One clickable element in the scene. The raycaster matches the registered
 * `object` and any descendant Object3D (recursive=true), so a Group with
 * children counts as one target. `play()` runs the visual response; the
 * hit point is provided in target-local space when relevant.
 */
export interface InteractionTarget {
  /** Stable identifier — used by the sound layer (added later) so each
   *  click can play its own SFX without rewiring the play callbacks. */
  id: string;
  /** Object the raycaster matches. Hits on any descendant also count. */
  object: Object3D;
  /** Visual response. `hit.localPoint` is the intersection point in the
   *  target's local space (useful for per-letter offsets, ripple origin). */
  play: (hit: { localPoint: Vector3 }) => void;
  /**
   * Whether the cursor switches to a pointer when hovering this target.
   * `true` for the large, intentionally-discoverable elements (title,
   * galaxy, data feed); `false` for the small Easter-egg targets (goat,
   * star, ring). See the senior-designer recommendation in the session
   * notes for the rationale on this split.
   */
  cursor?: boolean;
}

export interface InteractionEmitterEvent {
  id: string;
  localPoint: Vector3;
}

export interface InteractionManagerHandle {
  add: (target: InteractionTarget) => void;
  /** Subscribe to interaction fires. Sound layer hooks here later. */
  on: (cb: (e: InteractionEmitterEvent) => void) => () => void;
  dispose: () => void;
}

export interface CreateInteractionManagerOptions {
  canvas: HTMLCanvasElement;
  camera: Camera;
  /** If true, play() is still called (so sound hooks fire) but no cursor
   *  changes or hover work runs. Animation modules check reduced-motion
   *  themselves inside their play() bodies. */
  reducedMotion?: boolean;
}

export function createInteractionManager(
  opts: CreateInteractionManagerOptions,
): InteractionManagerHandle {
  const { canvas, camera, reducedMotion = false } = opts;

  const targets: InteractionTarget[] = [];
  // Pre-built object arrays for the raycaster. Updated only in `add()`
  // so the per-frame pointermove hot path doesn't filter+map on every
  // event. `clickObjects` mirrors every registered target; `cursorObjects`
  // only the cursor=true ones (used for the hover-cursor raycast).
  const clickObjects: Object3D[] = [];
  const cursorObjects: Object3D[] = [];
  const listeners = new Set<(e: InteractionEmitterEvent) => void>();
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const localPoint = new Vector3();

  const toNDC = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };

  /**
   * Walks `object` and its ancestors up to the scene root to find a
   * registered target. Raycast hits are typically on the leaf mesh
   * (a single per-letter Mesh, the ring Torus, etc.), so we climb the
   * graph to match decor builders that register a wrapping Group.
   */
  const findTarget = (hit: Object3D): InteractionTarget | null => {
    let node: Object3D | null = hit;
    while (node) {
      for (const t of targets) {
        if (t.object === node) return t;
      }
      node = node.parent;
    }
    return null;
  };

  /**
   * Returns the first intersection whose chain includes a registered
   * target. Sorting is already nearest-first in three.js's raycaster
   * results, so we iterate in order and stop at the first match —
   * the click hits whatever is visibly in front.
   */
  const firstTargetHit = (
    hits: Intersection[],
  ): { target: InteractionTarget; hit: Intersection } | null => {
    for (const h of hits) {
      const t = findTarget(h.object);
      if (t) return { target: t, hit: h };
    }
    return null;
  };

  const handlePointerDown = (e: PointerEvent): void => {
    if (targets.length === 0) return;
    toNDC(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(clickObjects, true);
    const found = firstTargetHit(hits);
    if (!found) return;
    // Convert hit point to target-local space so animations don't have
    // to know about parent transforms (title group floats / scales).
    found.target.object.worldToLocal(localPoint.copy(found.hit.point));
    found.target.play({ localPoint });
    for (const cb of listeners) {
      cb({ id: found.target.id, localPoint: localPoint.clone() });
    }
  };

  // Cursor handling: only matters on devices with a hover-capable pointer.
  // Touch devices fire pointermove on touch — running raycasts on every
  // such event would be wasteful. The matchMedia check below guards that.
  let hoverEnabled = false;
  const setHoverEnabled = (on: boolean): void => {
    if (hoverEnabled === on) return;
    hoverEnabled = on;
    if (!on) canvas.style.cursor = '';
  };

  const handlePointerMove = (e: PointerEvent): void => {
    if (!hoverEnabled) return;
    if (cursorObjects.length === 0) return;
    toNDC(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(cursorObjects, true);
    const found = firstTargetHit(hits);
    canvas.style.cursor = found ? 'pointer' : '';
  };

  // pointerdown always wired (touch + mouse both fire it). pointermove is
  // only worth listening to on hover-capable pointers — skipped under
  // reduced-motion (no cursor flourish) and on touch-only devices.
  canvas.addEventListener('pointerdown', handlePointerDown);
  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!reducedMotion && hoverQuery.matches) {
    setHoverEnabled(true);
    canvas.addEventListener('pointermove', handlePointerMove);
  }
  const onHoverChange = (ev: MediaQueryListEvent): void => {
    if (reducedMotion) return;
    if (ev.matches && !hoverEnabled) {
      setHoverEnabled(true);
      canvas.addEventListener('pointermove', handlePointerMove);
    } else if (!ev.matches && hoverEnabled) {
      canvas.removeEventListener('pointermove', handlePointerMove);
      setHoverEnabled(false);
    }
  };
  hoverQuery.addEventListener('change', onHoverChange);

  return {
    add: (t: InteractionTarget): void => {
      targets.push(t);
      clickObjects.push(t.object);
      if (t.cursor === true) cursorObjects.push(t.object);
    },
    on: (cb): (() => void) => {
      listeners.add(cb);
      return (): void => {
        listeners.delete(cb);
      };
    },
    dispose: (): void => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      if (hoverEnabled) {
        canvas.removeEventListener('pointermove', handlePointerMove);
      }
      hoverQuery.removeEventListener('change', onHoverChange);
      canvas.style.cursor = '';
      targets.length = 0;
      clickObjects.length = 0;
      cursorObjects.length = 0;
      listeners.clear();
    },
  };
}
