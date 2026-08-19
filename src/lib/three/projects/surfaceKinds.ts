/**
 * Which surface a project's planet wears, and the knobs that shape it.
 *
 * Shared by the bake pass and the draw material so the two cannot drift: the
 * bake decides what the texture looks like, the material decides how much
 * relief to read out of it, and both need the same table.
 */
import type { Rgb } from './planetNoise';

export const SURFACE_KIND = {
  rocky: 0,
  banded: 1,
  icy: 2,
  crystalline: 3,
} as const;

export type SurfaceKindName = keyof typeof SURFACE_KIND;

const KIND_BY_ID: Record<string, SurfaceKindName> = {
  hrm: 'banded',
  platform: 'banded',
  portfolio: 'rocky',
  audiobookmaker: 'rocky',
  passwordmanager: 'icy',
  'feedback-intelligence': 'banded',
  readlog: 'rocky',
  'readlog-dotnet': 'rocky',
  'readlog-laravel': 'rocky',
  spacepotatis: 'rocky',
  'strudel-patterns': 'crystalline',
  'claude-continue': 'icy',
  'claude-agents': 'crystalline',
};

export function surfaceKindFor(id: string): SurfaceKindName {
  return KIND_BY_ID[id] ?? 'rocky';
}

export interface SurfaceTuning {
  noiseScale: number;
  bandStrength: number;
  featureColor: Rgb;
  featureThreshold: number;
  featureMix: number;
  relief: number;
}

/** Per-kind defaults; the palette itself still comes from the brand colour. */
export const TUNING: Record<SurfaceKindName, SurfaceTuning> = {
  rocky: {
    noiseScale: 2.6,
    bandStrength: 0,
    featureColor: [214, 196, 168],
    featureThreshold: 0.62,
    featureMix: 0.5,
    relief: 0.9,
  },
  banded: {
    noiseScale: 2.2,
    bandStrength: 0.62,
    featureColor: [232, 240, 255],
    featureThreshold: 0.66,
    featureMix: 0.45,
    // Cloud bands are not surface relief.
    relief: 0.15,
  },
  icy: {
    noiseScale: 3.0,
    bandStrength: 0.18,
    featureColor: [226, 242, 255],
    featureThreshold: 0.52,
    featureMix: 0.7,
    relief: 0.6,
  },
  crystalline: {
    noiseScale: 4.6,
    bandStrength: 0.35,
    featureColor: [255, 226, 246],
    featureThreshold: 0.58,
    featureMix: 0.66,
    relief: 1.1,
  },
};
