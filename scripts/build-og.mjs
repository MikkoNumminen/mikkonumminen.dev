// Build-time asset rasterizer: turns the SVG OG cards and the favicon into
// the PNGs referenced by <head> meta tags and the web app manifest. Run via
// `npm run build:og` whenever any of the source SVGs change.

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

// Icon sizes required by the web app manifest. 192 and 512 are the PWA
// baseline (Android home screen, iOS install prompts); the maskable 512
// is used for adaptive icons that crop to the device's mask shape.
const ICONS = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

const FAVICON_SVG = join(PUBLIC, 'favicon.svg');

function usage() {
  console.log(
    'build-og: rasterize OG card SVGs and favicon into the PNGs referenced by <head> meta and the manifest.\n' +
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

async function buildIcon(svg, { name, size, maskable }) {
  const pngPath = join(PUBLIC, name);

  // Maskable icons need ~20% safe-area padding so the launcher crop never
  // eats the glyph — we pre-pad by rendering at 60% into a transparent
  // square of the target size. Regular icons render edge-to-edge.
  if (maskable) {
    const inner = Math.round(size * 0.6);
    const rendered = await sharp(svg, { density: OG_DENSITY })
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        // Solid background is recommended for maskable icons so the mask
        // shape always fills — we match the manifest background_color.
        background: { r: 5, g: 8, b: 7, alpha: 1 },
      },
    })
      .composite([{ input: rendered, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toFile(pngPath);
  } else {
    await sharp(svg, { density: OG_DENSITY })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(pngPath);
  }

  const bytes = statSync(pngPath).size;
  console.log(`built ${pngPath} (${(bytes / 1024).toFixed(1)} KB)`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return 0;
  }

  // Sanity-check that every source SVG we need actually exists so we fail
  // fast with a useful error instead of a confusing sharp stack trace.
  const missing = OG_FILES.map((name) => join(PUBLIC, `${name}.svg`)).filter(
    (p) => !existsSync(p)
  );
  if (!existsSync(FAVICON_SVG)) missing.push(FAVICON_SVG);
  if (missing.length > 0) {
    console.error('build-og: missing source SVG files:');
    for (const p of missing) console.error(`  - ${p}`);
    usage();
    return 1;
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

  // Manifest icons come last so an existing OG run behaves the same even
  // if the favicon step errors — callers that only care about OG cards
  // still get them.
  const faviconSvg = readFileSync(FAVICON_SVG);
  for (const spec of ICONS) {
    try {
      await buildIcon(faviconSvg, spec);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`build-og: failed to build ${spec.name} — ${msg}`);
    }
  }

  return failed === 0 ? 0 : 1;
}

const code = await main();
if (code !== 0) process.exit(code);
