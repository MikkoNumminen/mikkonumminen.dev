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
});
