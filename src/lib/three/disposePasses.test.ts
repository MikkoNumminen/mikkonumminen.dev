import { describe, it, expect, vi } from 'vitest';
import { disposePasses } from './disposePasses';

// disposePasses frees the post-processing chain (EffectComposer.dispose leaks
// pass-owned ShaderMaterials). It must dispose every pass that has a dispose()
// and skip those that don't (e.g. RenderPass) — the leak guard for the bloom
// chain, mirrored on the disposeMaterial pattern.

describe('disposePasses', () => {
  it('disposes every pass that has a dispose() method', () => {
    const a = { dispose: vi.fn() };
    const b = { dispose: vi.fn() };
    disposePasses([a, b]);
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it('skips passes without a dispose() (e.g. RenderPass) without throwing', () => {
    const withDispose = { dispose: vi.fn() };
    const withoutDispose = {}; // RenderPass-shaped: no dispose
    expect(() => disposePasses([withoutDispose, withDispose])).not.toThrow();
    expect(withDispose.dispose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on an empty chain', () => {
    expect(() => disposePasses([])).not.toThrow();
  });
});
