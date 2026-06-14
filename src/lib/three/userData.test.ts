import { describe, it, expect } from 'vitest';
import { userDataNumber, userDataString } from './userData';

describe('userDataNumber', () => {
  it('returns the stored number when present and finite', () => {
    expect(userDataNumber({ userData: { line: 3 } }, 'line')).toBe(3);
    expect(userDataNumber({ userData: { x: 0 } }, 'x')).toBe(0);
    expect(userDataNumber({ userData: { x: -2.5 } }, 'x')).toBe(-2.5);
  });

  it('falls back when the key is missing, non-numeric, or non-finite', () => {
    expect(userDataNumber({ userData: {} }, 'line')).toBe(0);
    expect(userDataNumber({ userData: { line: '3' } }, 'line')).toBe(0);
    expect(userDataNumber({ userData: { line: NaN } }, 'line')).toBe(0);
    expect(userDataNumber({ userData: { line: Infinity } }, 'line')).toBe(0);
  });

  it('uses a caller-supplied fallback', () => {
    expect(userDataNumber({ userData: {} }, 'line', -1)).toBe(-1);
  });
});

describe('userDataString', () => {
  it('returns the stored string when present', () => {
    expect(userDataString({ userData: { projectId: 'hrm' } }, 'projectId')).toBe('hrm');
    expect(userDataString({ userData: { projectId: '' } }, 'projectId')).toBe('');
  });

  it('returns undefined when the key is missing or non-string', () => {
    expect(userDataString({ userData: {} }, 'projectId')).toBeUndefined();
    expect(userDataString({ userData: { projectId: 42 } }, 'projectId')).toBeUndefined();
    expect(
      userDataString({ userData: { projectId: null } }, 'projectId'),
    ).toBeUndefined();
  });
});
