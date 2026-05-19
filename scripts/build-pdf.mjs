#!/usr/bin/env node
// Generic HTML -> PDF using local Chrome's --print-to-pdf. The caller
// supplies a complete HTML file (including any @page CSS that controls
// orientation / page size / margins) and gets a styled PDF.
//
// Usage:
//   node scripts/build-pdf.mjs --input <html-path> --output <pdf-path>
//
// Use the companion skill `.claude/skills/md-to-pdf/` for the markdown-to-PDF
// recipe: Claude assembles a tuned HTML file in-context, runs this script,
// the PDF lands at the requested path.
import fs from 'node:fs';
import path from 'node:path';
import { printHtmlToPdf } from './lib/chrome-pdf.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') out.input = argv[++i];
    else if (a === '--output' || a === '-o') out.output = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function printHelp() {
  console.log(`usage: node scripts/build-pdf.mjs --input <html> --output <pdf>

Renders an HTML file to PDF using the local Chrome's --print-to-pdf flag.
No npm dependencies. The HTML controls page size / orientation / margins via
@page CSS — see .claude/skills/md-to-pdf/SKILL.md for the recipe.

Environment:
  CHROME_PATH    override the auto-located Chrome / Chromium binary path
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.input || !args.output) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const inputAbs = path.resolve(args.input);
const outputAbs = path.resolve(args.output);
if (!fs.existsSync(inputAbs)) {
  console.error(`input missing: ${inputAbs}`);
  process.exit(1);
}

printHtmlToPdf({ htmlPath: inputAbs, pdfPath: outputAbs });
console.log(`wrote ${outputAbs}`);
