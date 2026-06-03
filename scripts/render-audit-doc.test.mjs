import { describe, it, expect } from 'vitest';
import { inline, pctClass, slug } from './render-audit-doc.mjs';

describe('inline', () => {
  it('parses nested bold-with-italic without dropping the bold or leaking asterisks', () => {
    // The exact bug class that shipped once: **a *b* c** used to drop <strong>,
    // mis-italicise everything except the inner word, and leak literal '*'.
    expect(inline('**Note it carries *more* noise, not less**')).toBe(
      '<strong>Note it carries <em>more</em> noise, not less</strong>',
    );
  });

  it('handles standalone bold and italic', () => {
    expect(inline('**b** and *i*')).toBe('<strong>b</strong> and <em>i</em>');
  });

  it('renders links and inline code', () => {
    expect(inline('[x](https://e.com) and `code`')).toBe('<a href="https://e.com">x</a> and <code>code</code>');
  });

  it('escapes HTML metacharacters', () => {
    expect(inline('a < b & c')).toBe('a &lt; b &amp; c');
  });
});

describe('pctClass — gated on a "% saved" column header', () => {
  const H = 'Opus %'; // header ends in "%"

  it('greens a save >= +10%, signed or unsigned', () => {
    expect(pctClass('+43%', H)).toBe(' class="pos"');
    expect(pctClass('38%', H)).toBe(' class="pos"'); // results sheet writes saves unsigned
  });

  it('reds a cost <= -10% (ascii or unicode minus)', () => {
    expect(pctClass('−30%', H)).toBe(' class="neg"'); // U+2212 unicode minus (as the docs use)
    expect(pctClass('-21%', H)).toBe(' class="neg"'); // ascii hyphen-minus
  });

  it('stays neutral within +/-10%', () => {
    expect(pctClass('+8%', H)).toBe('');
    expect(pctClass('−9%', H)).toBe('');
  });

  it('only colours columns whose header ends with "%"', () => {
    expect(pctClass('+90pp', 'Swing')).toBe(''); // value isn't a %
    expect(pctClass('+43%', 'Saved')).toBe(''); // value IS a %, but the column isn't a "% saved" one
  });

  it('leaves a footnote-flagged cell (lone *) neutral', () => {
    expect(pctClass('−74%*', H)).toBe(''); // contaminated/annotated cell
  });
});

describe('slug — GitHub-style, matches the in-doc anchors', () => {
  it('lowercases, hyphenates spaces, drops other punctuation', () => {
    expect(slug('Pin the BEFORE arm')).toBe('pin-the-before-arm');
    expect(slug('On the PASS/MIXED/FAIL thresholds')).toBe('on-the-passmixedfail-thresholds');
    expect(slug('The three cost-trap mechanisms (the transferable result)')).toBe(
      'the-three-cost-trap-mechanisms-the-transferable-result',
    );
  });
});
