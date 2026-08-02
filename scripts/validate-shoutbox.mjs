#!/usr/bin/env node
// Validate the published shoutbox snapshot against its JSON Schema at build
// time, so a malformed file fails `npm run build` instead of degrading the
// contact page at runtime. Mirrors scripts/validate-registry.mjs exactly,
// including the skip-when-absent behaviour: the snapshot does not exist until
// the first message is approved, and the box renders a graceful empty state
// until then.
//
// This complements parseSnapshot's runtime guard rather than replacing it. The
// two catch different things: this catches a bad file before it ships, the guard
// catches a bad file that shipped anyway or was replaced by a CDN edge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainst } from './lib/validate-json-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data', 'shoutbox.json');
const SCHEMA = path.join(ROOT, 'public', 'data', 'shoutbox.schema.json');

function main() {
  if (!fs.existsSync(DATA)) {
    console.log(
      'validate-shoutbox: no public/data/shoutbox.json yet — skipping (the box renders a graceful empty state).',
    );
    return;
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch (err) {
    console.error(`validate-shoutbox: shoutbox.json is not valid JSON — ${err.message}`);
    process.exit(1);
  }

  const errors = validateAgainst(data, schema);
  if (errors.length > 0) {
    console.error(
      `validate-shoutbox: ${errors.length} schema violation(s) in public/data/shoutbox.json:`,
    );
    for (const e of errors.slice(0, 30)) console.error(`  - ${e}`);
    process.exit(1);
  }

  // THREE CHECKS THE SCHEMA CANNOT MAKE. scripts/lib/validate-json-schema.mjs is
  // dependency-free and implements `type`, `required` and `items` — it does NOT
  // implement `const` or `additionalProperties`. Writing those in the schema and
  // assuming they bite is how a gate ends up decorative: I ran a `version: 2`
  // file and an extra `ip` key past it, and both passed. They are enforced here
  // instead, and the schema says so.

  if (data.version !== 1) {
    console.error(
      `validate-shoutbox: version is ${JSON.stringify(data.version)}, expected 1. ` +
        'The runtime reader refuses unknown versions and renders the empty box.',
    );
    process.exit(1);
  }

  // A disagreement means a truncated or hand-edited file.
  if (data.count !== data.threads.length) {
    console.error(
      `validate-shoutbox: count says ${data.count} but there are ${data.threads.length} threads.`,
    );
    process.exit(1);
  }

  // The snapshot must carry ONLY what is published. This is the check that would
  // catch a future generator leaking queue state — a status, an ip, a body_hash —
  // into a file that gets committed to a public repository.
  const TOP = new Set(['version', 'generated_at', 'count', 'threads']);
  const THREAD = new Set(['id', 'body', 'at', 'reply']);
  const REPLY = new Set(['body', 'at']);
  const stray = [];
  for (const k of Object.keys(data)) if (!TOP.has(k)) stray.push(`$.${k}`);
  data.threads.forEach((thread, i) => {
    for (const k of Object.keys(thread)) {
      if (!THREAD.has(k)) stray.push(`$.threads[${i}].${k}`);
    }
    if (thread.reply) {
      for (const k of Object.keys(thread.reply)) {
        if (!REPLY.has(k)) stray.push(`$.threads[${i}].reply.${k}`);
      }
    }
  });
  if (stray.length > 0) {
    console.error(
      `validate-shoutbox: ${stray.length} field(s) that must not be published:`,
    );
    for (const s of stray) console.error(`  - ${s}`);
    process.exit(1);
  }

  console.log(
    `validate-shoutbox: OK — ${data.threads.length} thread(s) conform to shoutbox.schema.json.`,
  );
}

main();
