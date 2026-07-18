import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inputFingerprint, pdfContentEquals, shouldRender } from './pdf-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_PDF = path.join(ROOT, 'public', 'skills-registry.pdf');

const DATE_A = "D:20260601042416+00'00'";
const DATE_B = "D:20260707154744+00'00'";
const ID_A = '/ID [<AAAAAAAA> <AAAAAAAA>]';
const ID_B = '/ID [<BBBBBBBB> <BBBBBBBB>]';

function pdf({ date = DATE_A, id = ID_A, body = 'the document body' } = {}) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Contents(${body})>>endobj\n` +
      `trailer<</CreationDate(${date})/ModDate(${date})${id}>>\n%%EOF\n`,
    'latin1',
  );
}

describe('inputFingerprint', () => {
  it('is stable for identical html and differs for any change', () => {
    expect(inputFingerprint('<p>a</p>')).toBe(inputFingerprint('<p>a</p>'));
    expect(inputFingerprint('<p>a</p>')).not.toBe(inputFingerprint('<p>b</p>'));
  });
});

describe('shouldRender', () => {
  const base = { force: false, pdfExists: true, storedFingerprint: 'x', fingerprint: 'x' };

  it('skips the render when the inputs have not moved', () => {
    // The Chrome-upgrade case: same html, a browser that would emit different
    // bytes. Nothing about the document changed, so nothing should be rendered.
    expect(shouldRender(base)).toBe(false);
  });

  it('renders when the inputs changed', () => {
    expect(shouldRender({ ...base, fingerprint: 'y' })).toBe(true);
  });

  it('renders when there is no stored fingerprint yet', () => {
    expect(shouldRender({ ...base, storedFingerprint: null })).toBe(true);
  });

  it('renders when the pdf is missing even if the fingerprint matches', () => {
    expect(shouldRender({ ...base, pdfExists: false })).toBe(true);
  });

  it('renders on --force', () => {
    expect(shouldRender({ ...base, force: true })).toBe(true);
  });
});

describe('pdfContentEquals', () => {
  it('ignores a differing creation/modification date', () => {
    expect(pdfContentEquals(pdf({ date: DATE_A }), pdf({ date: DATE_B }))).toBe(true);
  });

  it('ignores a differing file /ID', () => {
    expect(pdfContentEquals(pdf({ id: ID_A }), pdf({ id: ID_B }))).toBe(true);
  });

  it('ignores date and /ID changing together, as a real re-render does', () => {
    const before = pdf({ date: DATE_A, id: ID_A });
    const after = pdf({ date: DATE_B, id: ID_B });
    expect(pdfContentEquals(before, after)).toBe(true);
  });

  it('reports a real content change even when the stamps match', () => {
    const before = pdf({ body: 'scan every sibling repo in the workspace' });
    const after = pdf({ body: 'scan every sibling repo under D:/koodaamista' });
    expect(pdfContentEquals(before, after)).toBe(false);
  });

  it('reports a content change that also carries new stamps', () => {
    const before = pdf({ date: DATE_A, id: ID_A, body: 'one' });
    const after = pdf({ date: DATE_B, id: ID_B, body: 'two' });
    expect(pdfContentEquals(before, after)).toBe(false);
  });

  it('treats an empty or truncated file as different', () => {
    expect(pdfContentEquals(pdf(), Buffer.alloc(0))).toBe(false);
  });

  it('matches the committed PDF against itself re-stamped', () => {
    // The realistic case, on real Chrome output rather than a synthetic fixture.
    const real = fs.readFileSync(REAL_PDF);
    const restamped = Buffer.from(
      real
        .toString('latin1')
        .replace(/\/CreationDate\s*\([^)]*\)/g, `/CreationDate(${DATE_B})`)
        .replace(/\/ModDate\s*\([^)]*\)/g, `/ModDate(${DATE_B})`),
      'latin1',
    );
    expect(restamped.equals(real)).toBe(false); // the bytes really did change
    expect(pdfContentEquals(real, restamped)).toBe(true); // the content did not
  });
});
