import sharp from 'sharp';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = 'public';
const FILES = ['og-default', 'og-projects', 'og-experience', 'og-contact'];

for (const name of FILES) {
  const svgPath = join(PUBLIC, `${name}.svg`);
  const pngPath = join(PUBLIC, `${name}.png`);
  const svg = readFileSync(svgPath);

  await sharp(svg, { density: 200 })
    .resize(1200, 630)
    .png({ compressionLevel: 9 })
    .toFile(pngPath);

  const size = statSync(pngPath).size;
  console.log(`built ${pngPath} (${(size / 1024).toFixed(1)} KB)`);
}
