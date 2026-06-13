import { describe, it, expect, vi } from 'vitest';
import type { Material } from 'three';
import { disposeMaterial } from './disposeMaterial';

// disposeMaterial normalizes Three's `Material | Material[]` union so every
// scene's dispose() path frees materials without repeating the array check.
// Leaked materials are a real GPU-memory bug, so the "dispose each exactly
// once" contract is worth pinning. A mock with a dispose() spy stands in for a
// real Material — the helper only ever calls Array.isArray and .dispose().

const mockMaterial = () =>
  ({ dispose: vi.fn() }) as unknown as Material & { dispose: ReturnType<typeof vi.fn> };

describe('disposeMaterial', () => {
  it('disposes a single material exactly once', () => {
    const m = mockMaterial();
    disposeMaterial(m);
    expect(m.dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes every material in an array exactly once', () => {
    const arr = [mockMaterial(), mockMaterial(), mockMaterial()];
    disposeMaterial(arr as unknown as Material[]);
    for (const m of arr) expect(m.dispose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on an empty array', () => {
    expect(() => disposeMaterial([] as unknown as Material[])).not.toThrow();
  });
});
