/**
 * Dispose every post-processing pass in a composer chain.
 *
 * `EffectComposer.dispose()` does not release the `ShaderMaterial` +
 * fullscreen-quad geometry that passes like `OutputPass` own, so each pass is
 * disposed explicitly. Passes without a `dispose()` (e.g. `RenderPass`) are
 * skipped via the optional call. Mirrors `disposeMaterial` — a tiny,
 * GL-free teardown helper that can be unit-tested with mock passes.
 */
export function disposePasses(passes: ReadonlyArray<{ dispose?: () => void }>): void {
  for (const pass of passes) pass.dispose?.();
}
