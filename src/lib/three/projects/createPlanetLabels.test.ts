import { describe, it, expect } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import type { PlanetEntry } from './buildPlanet';
import { createPlanetLabels } from './createPlanetLabels';

// createPlanetLabels manages floating DOM name-tags that track each planet via
// CPU projection (Vector3.project + Group.getWorldPosition — both jsdom-safe).
// A minimal fake planet (the handle only reads group + project.{id,name,scale})
// avoids buildPlanet's CanvasTextures.

function fakePlanet(id: string, name: string, z: number, scale = 1): PlanetEntry {
  const group = new Group();
  group.position.set(0, 0, z);
  return { group, project: { id, name, scale } } as unknown as PlanetEntry;
}

function frontCamera() {
  const cam = new PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

describe('createPlanetLabels', () => {
  it('appends one .planet-label span per planet, with its name', () => {
    const container = document.createElement('div');
    createPlanetLabels(container, [
      fakePlanet('a', 'Alpha', 0),
      fakePlanet('b', 'Beta', 0),
    ]);
    const labels = container.querySelectorAll('.planet-label');
    expect(labels.length).toBe(2);
    expect([...labels].map((el) => el.textContent)).toEqual(['Alpha', 'Beta']);
  });

  it('shows and positions a label for a planet in front of the camera', () => {
    const container = document.createElement('div');
    const handle = createPlanetLabels(container, [fakePlanet('a', 'Alpha', 0)]);
    handle.update(frontCamera());
    const el = container.querySelector('.planet-label') as HTMLElement;
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toContain('translate(');
    expect(el.style.transform).toContain('translate(-50%, -100%)');
  });

  it('hides a label for a planet behind the camera (projection.z > 1)', () => {
    const container = document.createElement('div');
    // camera at z=5 looking toward -z; a planet at z=20 is behind it.
    const handle = createPlanetLabels(container, [fakePlanet('a', 'Alpha', 20)]);
    handle.update(frontCamera());
    const el = container.querySelector('.planet-label') as HTMLElement;
    expect(el.style.opacity).toBe('0');
  });

  it('setHidden(true) hides every label and makes update() a no-op', () => {
    const container = document.createElement('div');
    const handle = createPlanetLabels(container, [fakePlanet('a', 'Alpha', 0)]);
    handle.setHidden(true);
    const el = container.querySelector('.planet-label') as HTMLElement;
    expect(el.style.opacity).toBe('0');
    handle.update(frontCamera());
    expect(el.style.opacity).toBe('0');
  });

  it('dispose() removes every label element from the container', () => {
    const container = document.createElement('div');
    const handle = createPlanetLabels(container, [
      fakePlanet('a', 'Alpha', 0),
      fakePlanet('b', 'Beta', 0),
    ]);
    handle.dispose();
    expect(container.querySelectorAll('.planet-label').length).toBe(0);
  });
});
