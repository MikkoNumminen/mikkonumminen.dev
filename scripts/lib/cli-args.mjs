// Tiny shared arg parser for the scoreboard scripts: `--input <path>` /
// `--output <path>` overriding caller-supplied defaults. Pure (no IO), so the
// only non-trivial logic in build-scoreboard.mjs's IO wrapper is unit-tested
// (the surrounding fs.read/writeFile is Node itself). Tested in cli-args.test.mjs.

import path from 'node:path';

/**
 * @param {string[]} argv  args after the script name (process.argv.slice(2))
 * @param {{input: string, output: string}} defaults  used when a flag is absent
 * @returns {{input: string, output: string}}  flag values resolved to absolute paths
 */
export function parseInputOutput(argv, defaults) {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') out.input = path.resolve(argv[++i] ?? '');
    else if (argv[i] === '--output') out.output = path.resolve(argv[++i] ?? '');
  }
  return out;
}
