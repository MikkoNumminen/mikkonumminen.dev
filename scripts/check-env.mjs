#!/usr/bin/env node
/**
 * One-command environment sanity check for a fresh clone (human or agent):
 *   npm run check:env
 *
 * Confirms the running Node satisfies package.json's `engines.node` and that
 * dependencies are installed. Exits non-zero with an actionable message if not,
 * so the first thing a new contributor runs either passes or tells them exactly
 * what to fix — rather than discovering it as a cryptic failure three commands
 * later. Dependency-free; the version comparison is unit-tested
 * (scripts/lib/node-version.test.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meetsMinimum } from './lib/node-version.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const checks = [];

const required = pkg.engines?.node ?? '';
const nodeOk = meetsMinimum(process.versions.node, required);
checks.push({
  ok: nodeOk,
  label: `Node ${process.versions.node} (requires ${required || 'unspecified'})`,
  fix: 'Install/select a matching Node (see .nvmrc): nvm install && nvm use',
});

const depsOk = fs.existsSync(path.join(ROOT, 'node_modules'));
checks.push({
  ok: depsOk,
  label: 'Dependencies installed (node_modules present)',
  fix: 'Run: npm ci',
});

let failed = false;
for (const c of checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.label}`);
  if (!c.ok) {
    console.log(`  → ${c.fix}`);
    failed = true;
  }
}

if (failed) {
  console.error('\ncheck:env: environment is not ready — fix the items above.');
  process.exit(1);
}
console.log('\ncheck:env: ready to build and test.');
