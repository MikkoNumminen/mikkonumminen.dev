import { Camera, Vector3 } from 'three';
import type { PlanetEntry } from './buildPlanet';
import { PLANET_BASE_RADIUS } from './constants';

export interface PlanetLabelsHandle {
  /** Per-frame screen-space reposition of every planet label. */
  update: (camera: Camera) => void;
  /** Toggle visibility together (e.g. while the detail drawer is open). */
  setHidden: (hidden: boolean) => void;
  /** Remove all label elements from the DOM. */
  dispose: () => void;
}

/**
 * Persistent name labels that float above each planet so users can
 * identify any planet at a glance without hovering. The label sits
 * one planet-radius above the planet's apparent position so it tracks
 * with orbit motion but doesn't overlap the body.
 */
export function createPlanetLabels(
  container: HTMLElement,
  planets: PlanetEntry[],
): PlanetLabelsHandle {
  const labels = new Map<string, HTMLElement>();
  for (const planet of planets) {
    const el = document.createElement('span');
    el.className = 'planet-label';
    el.textContent = planet.project.name;
    container.appendChild(el);
    labels.set(planet.project.id, el);
  }

  const worldPos = new Vector3();
  const projection = new Vector3();
  let hidden = false;

  const update = (camera: Camera): void => {
    if (hidden) return;
    for (const planet of planets) {
      const el = labels.get(planet.project.id);
      if (!el) continue;
      planet.group.getWorldPosition(worldPos);
      // Lift the label one scaled-radius above the planet centre so it
      // sits just above the body's apparent top edge.
      worldPos.y += PLANET_BASE_RADIUS * planet.project.scale * 1.5;
      projection.copy(worldPos).project(camera);
      // `project()` returns z > 1 for points behind the camera. Hide
      // those rather than smearing the label across the screen edge.
      if (projection.z > 1) {
        el.style.opacity = '0';
        continue;
      }
      const x = (projection.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projection.y * 0.5 + 0.5) * window.innerHeight;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      el.style.opacity = '1';
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
