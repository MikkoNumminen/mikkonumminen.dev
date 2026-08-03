// Locate the system Chrome / Chromium binary and run it headless with
// `--print-to-pdf`. No npm dependencies — keeps the repo's static-output-only
// constraint intact and avoids puppeteer's ~150MB Chromium bundle. Page
// size / orientation / margins live in the HTML's `@page` CSS, not on
// Chrome's command line, so callers control layout through the document.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function locateChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH))
    return process.env.CHROME_PATH;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          path.join(
            process.env.LOCALAPPDATA ?? '',
            'Google/Chrome/Application/chrome.exe',
          ),
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((p) => p && fs.existsSync(p));
}

/**
 * Chrome flags that shape the rendered page (the output path and source URL are
 * appended per call). Exported so a caller that caches a rendered PDF can fold
 * them into its cache key: changing a flag here changes the PDF without
 * changing a single byte of the source HTML.
 */
export const PRINT_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  // Lets `@import url(...)` and remote fonts finish before the snapshot
  // when the HTML pulls in webfonts (e.g. a Google Fonts stylesheet).
  '--virtual-time-budget=2000',
];

/**
 * Render an HTML file to PDF using the local Chrome's --print-to-pdf.
 * Page format (size / orientation / margins) is controlled by the HTML's
 * `@page` CSS, not by this function — callers are expected to set that.
 *
 * @param {object} opts
 * @param {string} opts.htmlPath - absolute path to source HTML
 * @param {string} opts.pdfPath  - absolute path for the output PDF
 * @param {string} [opts.chromePath] - optional override for the auto-located
 *   Chrome binary; falls back to `locateChrome()`, which is what all three
 *   in-repo callers rely on.
 */
export function printHtmlToPdf({ htmlPath, pdfPath, chromePath }) {
  const chrome = chromePath ?? locateChrome();
  if (!chrome) {
    throw new Error('Chrome / Chromium not found. Set CHROME_PATH or install Chrome.');
  }
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`html source missing: ${htmlPath}`);
  }
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  execFileSync(
    chrome,
    [...PRINT_FLAGS, `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href],
    { stdio: 'inherit' },
  );

  // Chrome can exit 0 having written nothing — verify the file actually
  // landed with non-zero bytes before reporting success. (SKILL.md flags
  // this in the failure-modes section; enforce it here.)
  let size = 0;
  try {
    size = fs.statSync(pdfPath).size;
  } catch {
    // fall through — size stays 0
  }
  if (size === 0) {
    throw new Error(
      `chrome exited 0 but wrote 0 bytes to ${pdfPath}. Check the source HTML and retry.`,
    );
  }
}
