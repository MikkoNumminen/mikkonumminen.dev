#!/usr/bin/env node
// Sync the most-recent skill-registry verdict into the static data file consumed
// by the contact-page terminal. Without this step, public/data/skills-registry.json
// drifts whenever a new SKILL-REGISTRY-{date}.json lands in .claude/agent-verdicts/
// — the terminal would silently serve stale data until someone remembered to copy
// by hand. Run this as a prebuild step (package.json "prebuild") so every build
// picks up the freshest verdict automatically.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERDICTS_DIR = path.join(ROOT, '.claude', 'agent-verdicts');
const DEST = path.join(ROOT, 'public', 'data', 'skills-registry.json');
const FILE_RE = /^SKILL-REGISTRY-(\d{4}-\d{2}-\d{2})\.json$/;

function findLatestSource() {
  if (!fs.existsSync(VERDICTS_DIR)) return null;
  const entries = fs
    .readdirSync(VERDICTS_DIR)
    .map((name) => ({ name, match: FILE_RE.exec(name) }))
    .filter((e) => e.match !== null)
    .sort((a, b) => b.match[1].localeCompare(a.match[1]));
  return entries.length > 0 ? path.join(VERDICTS_DIR, entries[0].name) : null;
}

function main() {
  const src = findLatestSource();

  if (!src) {
    console.log(
      'sync-skill-registry: no source file found — run the skill-registry skill at' +
        ' .claude/skills/skill-registry/ to generate one. Skipping copy.',
    );
    process.exit(0);
  }

  const srcBuf = fs.readFileSync(src);

  if (fs.existsSync(DEST) && fs.readFileSync(DEST).equals(srcBuf)) {
    console.log(`sync-skill-registry: already in sync (${path.basename(src)})`);
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  fs.writeFileSync(DEST, srcBuf);
  console.log(`sync-skill-registry: copied ${src} → ${DEST}`);
}

main();
