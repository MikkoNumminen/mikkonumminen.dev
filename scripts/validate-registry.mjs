#!/usr/bin/env node
// Validate the served skills registry against its published JSON Schema at build
// time, so a malformed or wrong-shape registry fails `npm run build` instead of
// silently degrading the contact terminal at runtime. The committed registry is
// canonical (ADR 0006); this is the build-time gate complementing parseRegistry's
// runtime guard. Dependency-free (see scripts/lib/validate-json-schema.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainst } from './lib/validate-json-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const SCHEMA = path.join(ROOT, 'public', 'data', 'skills-registry.schema.json');

function main() {
  if (!fs.existsSync(DATA)) {
    console.log(
      'validate-registry: no public/data/skills-registry.json yet — skipping (the terminal renders a graceful empty state).',
    );
    return;
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch (err) {
    console.error(`validate-registry: skills-registry.json is not valid JSON — ${err.message}`);
    process.exit(1);
  }

  const errors = validateAgainst(data, schema);
  if (errors.length > 0) {
    console.error(
      `validate-registry: ${errors.length} schema violation(s) in public/data/skills-registry.json:`,
    );
    for (const e of errors.slice(0, 30)) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `validate-registry: OK — ${data.repos.length} repos / ${data.totals.skills} skills conform to skills-registry.schema.json.`,
  );
}

main();
