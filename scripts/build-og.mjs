// Build-time asset rasterizer: turns the SVG OG cards into the PNGs
// referenced by <head> meta tags. Run via `npm run build:og` whenever any of
// the source SVGs change.
//
// NOTE: The PNGs in public/ are the committed source of truth — Vercel does
// NOT re-run this script during deploy. Text in the SVGs is rendered by
// sharp / libvips via Pango + FontConfig, so the resulting glyph shapes
// depend on whichever fonts are installed on whoever ran the script. If
// you re-run it on a different host, eyeball each regenerated PNG (the
// title and stat-chip text in particular) before committing.

import sharp from 'sharp';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, '..', 'public');

// OG cards: Facebook/LinkedIn/WhatsApp/Telegram want 1200x630 PNGs. We
// rasterize at density: 200 (≈200 dpi) so that text anti-aliases cleanly
// before being downscaled to the final 1200x630 canvas — lower densities
// ghost the stroke weights on the monospace lockup.
const OG_DENSITY = 200;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const OG_FILES = ['og-default', 'og-projects', 'og-experience', 'og-contact'];

function usage() {
  console.log(
    'build-og: rasterize the OG card SVGs into the PNGs referenced by <head> meta.\n' +
      '\n' +
      '  usage: node scripts/build-og.mjs\n' +
      '\n' +
      `  expected sources in ${PUBLIC}:\n` +
      OG_FILES.map((f) => `    - ${f}.svg`).join('\n') +
      '\n    - favicon.svg'
  );
}

async function buildOgCard(name) {
  const svgPath = join(PUBLIC, `${name}.svg`);
  const pngPath = join(PUBLIC, `${name}.png`);
  const svg = readFileSync(svgPath);

  await sharp(svg, { density: OG_DENSITY })
    .resize(OG_WIDTH, OG_HEIGHT)
    .png({ compressionLevel: 9 })
    .toFile(pngPath);

  const size = statSync(pngPath).size;
  console.log(`built ${pngPath} (${(size / 1024).toFixed(1)} KB)`);
}


async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  // Sanity-check that every source SVG we need actually exists so we fail
  // fast with a useful error instead of a confusing sharp stack trace.
  const missing = OG_FILES.map((name) => join(PUBLIC, `${name}.svg`)).filter(
    (p) => !existsSync(p)
  );
  if (missing.length > 0) {
    console.error('build-og: missing source SVG files:');
    for (const p of missing) console.error(`  - ${p}`);
    usage();
    throw new Error(`build-og: ${missing.length} source SVG file(s) missing`);
  }

  let failed = 0;

  for (const name of OG_FILES) {
    try {
      await buildOgCard(name);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`build-og: failed to build ${name}.png — ${msg}`);
    }
  }


  if (failed > 0) throw new Error(`build-og: ${failed} asset(s) failed to build`);
}

await main();
