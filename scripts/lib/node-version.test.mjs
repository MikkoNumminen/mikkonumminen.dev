import { describe, it, expect } from 'vitest';
import { parseVersion, meetsMinimum } from './node-version.mjs';

describe('parseVersion', () => {
  it('parses bare, v-prefixed, and range-prefixed versions', () => {
    expect(parseVersion('22.12.0')).toEqual([22, 12, 0]);
    expect(parseVersion('v22.12.0')).toEqual([22, 12, 0]);
    expect(parseVersion('>=22.12.0')).toEqual([22, 12, 0]);
    expect(parseVersion('^24.22.1')).toEqual([24, 22, 1]);
  });

  it('returns null when there is no version to parse', () => {
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('meetsMinimum', () => {
  const MIN = '>=22.12.0';

  it('accepts an equal or newer version', () => {
    expect(meetsMinimum('22.12.0', MIN)).toBe(true);
    expect(meetsMinimum('22.13.0', MIN)).toBe(true);
    expect(meetsMinimum('24.0.0', MIN)).toBe(true);
  });

  it('rejects an older version at any precedence level', () => {
    expect(meetsMinimum('22.11.9', MIN)).toBe(false);
    expect(meetsMinimum('22.12.0', '>=22.12.1')).toBe(false);
    expect(meetsMinimum('21.99.99', MIN)).toBe(false);
  });

  it('returns false on unparseable input rather than throwing', () => {
    expect(meetsMinimum('garbage', MIN)).toBe(false);
    expect(meetsMinimum('22.12.0', 'garbage')).toBe(false);
  });

  it('holds a caret range to its major', () => {
    const CARET = '^24.22.1';
    expect(meetsMinimum('24.22.1', CARET)).toBe(true);
    expect(meetsMinimum('v24.23.0', CARET)).toBe(true);
    expect(meetsMinimum('24.22.0', CARET)).toBe(false);
    expect(meetsMinimum('25.0.0', CARET)).toBe(false);
    expect(meetsMinimum('26.12.1', CARET)).toBe(false);
    expect(meetsMinimum('22.23.4', CARET)).toBe(false);
  });
});
