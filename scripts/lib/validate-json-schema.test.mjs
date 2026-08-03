import { describe, it, expect } from 'vitest';
import { validateAgainst } from './validate-json-schema.mjs';

const schema = {
  type: 'object',
  required: ['name', 'items'],
  properties: {
    name: { type: 'string' },
    count: { type: ['number', 'null'] },
    items: { type: 'array', items: { $ref: '#/definitions/item' } },
    note: { oneOf: [{ type: 'null' }, { type: 'string' }] },
  },
  definitions: {
    item: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  },
};

describe('validateAgainst (tiny JSON-schema subset)', () => {
  it('returns no errors for valid objects', () => {
    expect(validateAgainst({ name: 'x', items: [{ id: 'a' }], note: null }, schema)).toEqual([]);
    expect(validateAgainst({ name: 'x', count: 5, items: [], note: 'hi' }, schema)).toEqual([]);
  });

  it('flags a missing required field', () => {
    const errs = validateAgainst({ items: [] }, schema);
    expect(errs.some((e) => e.includes('missing required "name"'))).toBe(true);
  });

  it('flags a wrong scalar type', () => {
    const errs = validateAgainst({ name: 5, items: [] }, schema);
    expect(errs.some((e) => e.includes('expected string'))).toBe(true);
  });

  it('flags array-element ($ref) violations with an indexed path', () => {
    const errs = validateAgainst({ name: 'x', items: [{ id: 1 }] }, schema);
    expect(errs.some((e) => e.includes('items[0].id'))).toBe(true);
  });

  it('accepts array-of-types (number|null) and a matching oneOf', () => {
    expect(validateAgainst({ name: 'x', count: null, items: [], note: 'ok' }, schema)).toEqual([]);
  });

  it('flags a oneOf that matches nothing', () => {
    const errs = validateAgainst({ name: 'x', items: [], note: 5 }, schema);
    expect(errs.some((e) => e.includes('matches none'))).toBe(true);
  });

  it('ignores extra (additional) properties', () => {
    expect(validateAgainst({ name: 'x', items: [], extra: 'whatever' }, schema)).toEqual([]);
  });

  it('accepts a value in an enum', () => {
    const enumSchema = { type: 'object', properties: { kind: { enum: ['a', 'b'] } } };
    expect(validateAgainst({ kind: 'a' }, enumSchema)).toEqual([]);
  });

  it('flags a value outside an enum, naming the path', () => {
    const enumSchema = { type: 'object', properties: { kind: { enum: ['a', 'b'] } } };
    const errs = validateAgainst({ kind: 'c' }, enumSchema);
    expect(errs.some((e) => e.includes('$.kind') && e.includes('expected one of'))).toBe(true);
  });

  it('accepts a value matching const', () => {
    const constSchema = { type: 'object', properties: { version: { const: 1 } } };
    expect(validateAgainst({ version: 1 }, constSchema)).toEqual([]);
  });

  it('flags a value that does not match const, naming the path', () => {
    const constSchema = { type: 'object', properties: { version: { const: 1 } } };
    const errs = validateAgainst({ version: 2 }, constSchema);
    expect(errs.some((e) => e.includes('$.version') && e.includes('expected 1'))).toBe(true);
  });

  it('accepts a number at or above minimum', () => {
    const minSchema = { type: 'object', properties: { count: { type: 'number', minimum: 0 } } };
    expect(validateAgainst({ count: 0 }, minSchema)).toEqual([]);
  });

  it('flags a number below minimum, naming the path', () => {
    const minSchema = { type: 'object', properties: { count: { type: 'number', minimum: 0 } } };
    const errs = validateAgainst({ count: -1 }, minSchema);
    expect(errs.some((e) => e.includes('$.count') && e.includes('expected >= 0'))).toBe(true);
  });

  it('accepts a number at or below maximum', () => {
    const maxSchema = { type: 'object', properties: { count: { type: 'number', maximum: 10 } } };
    expect(validateAgainst({ count: 10 }, maxSchema)).toEqual([]);
  });

  it('flags a number above maximum, naming the path', () => {
    const maxSchema = { type: 'object', properties: { count: { type: 'number', maximum: 10 } } };
    const errs = validateAgainst({ count: 11 }, maxSchema);
    expect(errs.some((e) => e.includes('$.count') && e.includes('expected <= 10'))).toBe(true);
  });

  it('accepts an object with only declared properties when additionalProperties is false', () => {
    const strictSchema = {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' } },
    };
    expect(validateAgainst({ name: 'x' }, strictSchema)).toEqual([]);
  });

  it('flags an extra property when additionalProperties is false, naming the path', () => {
    const strictSchema = {
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' } },
    };
    const errs = validateAgainst({ name: 'x', extra: 'whatever' }, strictSchema);
    expect(errs.some((e) => e.includes('$: unexpected additional property "extra"'))).toBe(true);
  });
});
