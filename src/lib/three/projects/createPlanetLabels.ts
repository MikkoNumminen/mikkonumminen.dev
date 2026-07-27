import { Camera, Object3D, Vector3 } from 'three';
import { packLabels, type LabelBox } from './labelLayout';

/**
 * The minimum a body needs to carry a floating name label. Planets, moons and
 * the star all satisfy it, and each supplies its own lift because a label that
 * clears a planet would sit inside the star's corona.
 */
export interface LabelledBody {
  project: { id: string; name: string };
  group: Object3D;
  labelLift: number;
}

export interface PlanetLabelsHandle {
  /** Per-frame screen-space reposition of every planet label. */
  update: (camera: Camera) => void;
  /** Toggle visibility together (e.g. while the detail drawer is open). */
  setHidden: (hidden: boolean) => void;
  /** Remove all label elements from the DOM. */
  dispose: () => void;
}

/**
 * Persistent name labels that float above each body so users can identify any
 * of them at a glance without hovering. The label sits above the body's
 * apparent position so it tracks with orbit motion but does not cover it.
 *
 * Labels that would collide are dropped rather than moved — see labelLayout.
 * Element sizes are measured once and cached: reading offsetWidth every frame
 * for every label would force a layout flush inside the render loop.
 */
export function createPlanetLabels(
  container: HTMLElement,
  planets: LabelledBody[],
): PlanetLabelsHandle {
  const labels = new Map<string, HTMLElement>();
  const elements: HTMLElement[] = [];
  for (const planet of planets) {
    const el = document.createElement('span');
    el.className = 'planet-label';
    el.textContent = planet.project.name;
    container.appendChild(el);
    labels.set(planet.project.id, el);
    elements.push(el);
  }

  const worldPos = new Vector3();
  const projection = new Vector3();
  let hidden = false;

  // Reused across frames, along with the packer's output and scratch below, so
  // the per-frame path allocates nothing. An earlier version of this built a
  // Set and three arrays every frame, which is the kind of render-loop garbage
  // the connection code goes out of its way to avoid.
  const boxes: LabelBox[] = planets.map(() => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    depth: 0,
  }));
  const labelVisible: boolean[] = planets.map(() => false);
  const packOrder: number[] = planets.map((_, i) => i);
  // Sizes only change when the text or the font does, neither of which happens
  // without a remount. Zero means not yet measurable (webfont still loading),
  // so it is retried rather than cached.
  const sizes: { w: number; h: number }[] = planets.map(() => ({ w: 0, h: 0 }));

  const update = (camera: Camera): void => {
    if (hidden) return;

    for (let i = 0; i < planets.length; i++) {
      const planet = planets[i]!;
      const el = elements[i]!;
      planet.group.getWorldPosition(worldPos);
      // Sits just above the body's apparent top edge; the body decides how
      // far that is, since a star's corona reaches well past its core.
      worldPos.y += planet.labelLift;
      const depth = worldPos.distanceTo(camera.position);
      projection.copy(worldPos).project(camera);
      // `project()` returns z > 1 for points behind the camera. Hide
      // those rather than smearing the label across the screen edge.
      const box = boxes[i]!;
      if (projection.z > 1) {
        // Infinity parks it at the end of the packing order and out of the pass.
        box.depth = Number.POSITIVE_INFINITY;
        el.style.opacity = '0';
        continue;
      }
      const size = sizes[i]!;
      if (size.w === 0) {
        size.w = el.offsetWidth;
        size.h = el.offsetHeight;
      }
      box.x = (projection.x * 0.5 + 0.5) * window.innerWidth;
      box.y = (-projection.y * 0.5 + 0.5) * window.innerHeight;
      box.width = size.w;
      box.height = size.h;
      box.depth = depth;
      el.style.transform = `translate(${box.x}px, ${box.y}px) translate(-50%, -100%)`;
    }

    // Nearest body wins a collision; the loser sits out this frame.
    packLabels(boxes, labelVisible, packOrder);
    for (let i = 0; i < planets.length; i++) {
      if (!Number.isFinite(boxes[i]!.depth)) continue; // already hidden above
      elements[i]!.style.opacity = labelVisible[i] ? '1' : '0';
    }
  };

  const setHidden = (h: boolean): void => {
    hidden = h;
    for (const el of labels.values()) {
      if (h) el.style.opacity = '0';
    }
  };

  const dispose = (): void => {
    for (const el of labels.values()) el.remove();
    labels.clear();
  };

  return { update, setHidden, dispose };
}
