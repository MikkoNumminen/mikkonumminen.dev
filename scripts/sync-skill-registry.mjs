#!/usr/bin/env node
// Sync the most-recent skill-registry verdict into the static data file consumed
// by the contact-page terminal. This is the FIRST step of the manual
// /skill-localUpdate refresh chain (sync → apply-measurement-overlay →
// build-review-stats → build-skills-pdf), NOT a prebuild step.
//
// The served public/data/skills-registry.json is a locally-enriched canonical
// artifact: the overlay and review-stats passes layer on transcript-measured
// receipts and A/B buckets that require local ~/.claude data and cannot be
// regenerated on a build server. Auto-syncing the raw dated registry on every
// build (as prebuild used to) silently downgraded the committed file to its
// pre-enrichment state. Run /skill-localUpdate to refresh, then commit the result.
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
