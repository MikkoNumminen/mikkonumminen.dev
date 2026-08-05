import { describe, expect, it } from 'vitest';
import { FIELD_TUNING, SHAPES, glslFloat } from './tuning';

describe('glslFloat', () => {
  it('gives whole numbers an explicit decimal point', () => {
    // `1` is an int literal in GLSL and fails to compile where a float
    // is expected — this is the whole reason the helper exists.
    expect(glslFloat(1)).toBe('1.0');
    expect(glslFloat(0)).toBe('0.0');
    expect(glslFloat(-3)).toBe('-3.0');
  });

  it('passes fractional values through', () => {
    expect(glslFloat(0.25)).toBe('0.25');
    expect(glslFloat(-1.5)).toBe('-1.5');
  });

  it('expands exponent notation', () => {
    expect(glslFloat(1e-7)).not.toContain('e');
    expect(Number(glslFloat(1e-7))).toBeCloseTo(1e-7, 12);
  });

  it('refuses non-finite values', () => {
    expect(() => glslFloat(NaN)).toThrow();
    expect(() => glslFloat(Infinity)).toThrow();
  });
});

describe('FIELD_TUNING', () => {
  const flatten = (o: object, path = ''): [string, number][] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null
        ? flatten(v as object, `${path}${k}.`)
        : [[`${path}${k}`, v as number]],
    );

  it('emits every value as a valid GLSL float literal', () => {
    for (const [key, value] of flatten(FIELD_TUNING)) {
      const literal = glslFloat(value);
      expect(literal, key).toMatch(/^-?\d+\.\d+$/);
      expect(Number(literal), key).toBeCloseTo(value, 9);
    }
  });

  it('keeps name-state motion well under the glyph stem width', () => {
    // A stem of the formed name is ~0.43 world units. Slow sway is scaled
    // by uDriftAmp (0.4) in the shader; shimmer is absolute, then scaled
    // per shape. If this fails, a text shape has started to blur.
    const m = FIELD_TUNING.microLife;
    const c = FIELD_TUNING.cycle;
    // Worst case is the text shape with the loosest sway, scaled by its
    // own micro-life budget.
    const textShapes = [0, 2];
    for (const i of textShapes) {
      const peak = (c.shapeSway[i] ?? 0) * 0.4 + m.shimmer * (c.shapeLife[i] ?? 0);
      expect(peak, `shape ${i}`).toBeLessThan(0.43 / 4);
    }
  });

  it('gives every per-shape table an entry for every shape', () => {
    // A short table silently reads as 0 for the missing shape, which
    // renders that shape at zero brightness / density / bloom. Compared
    // against SHAPES.length so adding a fifth shape trips this test
    // instead of quietly shipping a zeroed shape.
    const c = FIELD_TUNING.cycle;
    for (const [key, table] of Object.entries(c)) {
      if (!Array.isArray(table)) continue;
      expect(table.length, key).toBe(SHAPES.length);
    }
  });

  it('keeps strays a garnish, not a cloud', () => {
    const m = FIELD_TUNING.microLife;
    expect(m.strayFraction).toBeLessThanOrEqual(0.01);
    expect(m.strayDuty).toBeLessThan(0.5);
  });
});
