import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CYCLE_ORDER, FIELD_TUNING, SHAPES, glslShapeTable } from './tuning';
import { cvBodyTextPx } from './cvTargets';

/**
 * The fifth shape lane, guarded at the seam where it can fail quietly.
 *
 * ADR 0016's consequences section is explicit that this field's state masks
 * do not fail loudly: a per-shape term that reads only the first four lanes
 * still compiles, still runs, and simply gives the CV shape whatever value
 * the other four blended to. There is no error, no warning, and on a shape
 * that appears for eleven seconds out of every forty-odd there is a good
 * chance nobody notices which of eight tables was missed.
 *
 * So the shader is checked as SOURCE. Reading the file rather than the
 * built string is deliberate: the property worth holding is that no
 * per-shape read bypasses `shapeVal`, and that is a statement about how the
 * code is written, not about one interpolation of it.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fieldSource = readFileSync(path.join(here, 'buildParticleField.ts'), 'utf8');

/** Table names the shader generates a vec4 + _CV pair for. */
const tableNames = [...fieldSource.matchAll(/glslShapeTable\('(\w+)'/g)].map((m) => m[1]);

describe('glslShapeTable', () => {
  it('emits a vec4 for the first four lanes and a float for the fifth', () => {
    const out = glslShapeTable('SHAPE_TEST', [1, 2, 3, 4, 5]);
    expect(out).toContain('const vec4 SHAPE_TEST = vec4(1.0, 2.0, 3.0, 4.0);');
    expect(out).toContain('const float SHAPE_TEST_CV = 5.0;');
  });

  it('refuses a table that does not carry every lane', () => {
    // The failure this replaces: interpolating a 5-entry array into vec4()
    // is a loud compile error, but a 4-entry array silently drops the CV
    // lane's value and the shape inherits another shape's tuning.
    expect(() => glslShapeTable('SHAPE_TEST', [1, 2, 3, 4])).toThrow(/expected 5/);
    expect(() => glslShapeTable('SHAPE_TEST', [1, 2, 3, 4, 5, 6])).toThrow(/expected 5/);
  });
});

describe('the shader reads every per-shape table through shapeVal', () => {
  it('generates at least the tables the shader is known to need', () => {
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'SHAPE_LIFE',
        'SHAPE_SWAY',
        'SHAPE_TWINKLE',
        'SHAPE_WAVE_FREQ',
        'SHAPE_SIZE',
      ]),
    );
  });

  it.each(tableNames)('%s is read through shapeVal with its _CV companion', (name) => {
    const call = new RegExp(`shapeVal\\(\\s*w,\\s*w5,\\s*${name},\\s*${name}_CV\\s*\\)`);
    expect(
      fieldSource,
      `${name} is generated but never read through shapeVal(w, w5, ${name}, ${name}_CV); the CV lane would silently take the other four shapes' blended value`,
    ).toMatch(call);
  });

  it('never reads a shape table with a bare dot()', () => {
    // A bare dot(w, TABLE) is precisely the four-lane read this guard
    // exists to forbid: it compiles, it runs, and it ignores the fifth.
    const bare = fieldSource.match(/dot\(\s*w\s*,\s*SHAPE_\w+/g) ?? [];
    expect(bare, `bypasses shapeVal: ${bare.join(', ')}`).toEqual([]);
  });

  it('adds the fifth lane to the geometry sum and the dust mask', () => {
    // Two terms that are not table reads and so are not covered above.
    // Missing the geometry term collapses the CV shape onto the origin;
    // missing the dust term stops its faded tail from fading.
    expect(fieldSource, 'the shaped sum is missing its w5 term').toMatch(
      /\+ w5 \* \(aCvPos \* uCvScale\)/,
    );
    expect(fieldSource, 'shapeDust is missing its w5 term').toMatch(
      /shapeDust = .*\+ w5 \* aCvDim/,
    );
  });
});

describe('lane and cycle order', () => {
  it('carries five lanes with cv last, so the vec4 lanes kept their indices', () => {
    expect(SHAPES.length).toBe(5);
    expect(SHAPES[4]).toBe('cv');
    // The first four must stay put: they are vec4 components in the shader
    // and row indices in eight tables.
    expect(SHAPES.slice(0, 4)).toEqual(['name', 'galaxy', 'word', 'sparse']);
  });

  it('shows every lane exactly once', () => {
    // A duplicated entry would show one shape twice a lap; a missing one
    // would make a shape unreachable, and neither throws.
    expect([...CYCLE_ORDER].sort()).toEqual(SHAPES.map((_s, i) => i));
  });

  it('gives every lane a hold window', () => {
    expect(FIELD_TUNING.cycle.shapeHold.length).toBe(SHAPES.length);
    for (const hold of FIELD_TUNING.cycle.shapeHold) expect(hold).toBeGreaterThan(0);
  });
});

/**
 * The legibility gate. Silent in the same way as the masks above: if this
 * returned world units instead of CSS px, or nothing at all, the CV shape
 * would simply never appear and no test or console line would say so.
 */
describe('cvBodyTextPx', () => {
  // 2 * tan(fov/2) * cameraZ at the home camera (fov 50, z 26).
  const WORLD_HEIGHT = 2 * Math.tan((50 * Math.PI) / 180 / 2) * 26;

  it('reports CSS pixels, not world units', () => {
    // A 40px canvas font at the shared world-per-pixel, mapped onto a
    // 1080-tall window: ~25 CSS px, comfortably over the 15px gate.
    expect(cvBodyTextPx(1080, WORLD_HEIGHT, 1)).toBeCloseTo(25.45, 1);
  });

  it('shrinks with the window and with the fit scale', () => {
    const full = cvBodyTextPx(1080, WORLD_HEIGHT, 1);
    expect(cvBodyTextPx(540, WORLD_HEIGHT, 1)).toBeCloseTo(full / 2, 5);
    expect(cvBodyTextPx(1080, WORLD_HEIGHT, 0.5)).toBeCloseTo(full / 2, 5);
    // A short window is where the gate has to bite: the block is fitted to
    // width, so a 600px-tall viewport lands under 15px and the cycle skips.
    expect(cvBodyTextPx(600, WORLD_HEIGHT, 1)).toBeLessThan(15);
  });

  it('returns 0 rather than dividing by a degenerate frustum height', () => {
    expect(cvBodyTextPx(1080, 0, 1)).toBe(0);
    expect(cvBodyTextPx(1080, -1, 1)).toBe(0);
  });
});
