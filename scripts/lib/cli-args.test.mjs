import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseInputOutput } from './cli-args.mjs';

describe('parseInputOutput', () => {
  const defaults = { input: '/def/in.json', output: '/def/out.json' };

  it('returns the defaults when no flags are given', () => {
    expect(parseInputOutput([], defaults)).toEqual(defaults);
  });

  it('overrides input/output and resolves them to absolute paths', () => {
    const r = parseInputOutput(
      ['--input', 'a/in.json', '--output', 'b/out.json'],
      defaults,
    );
    expect(r.input).toBe(path.resolve('a/in.json'));
    expect(r.output).toBe(path.resolve('b/out.json'));
  });

  it('overrides only the flag given, keeping the other default', () => {
    const r = parseInputOutput(['--output', 'only-out.json'], defaults);
    expect(r.input).toBe('/def/in.json');
    expect(r.output).toBe(path.resolve('only-out.json'));
  });

  it('does not mutate the caller-supplied defaults object', () => {
    const d = { input: 'x', output: 'y' };
    parseInputOutput(['--input', 'z'], d);
    expect(d).toEqual({ input: 'x', output: 'y' });
  });
});
