import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The nav-card grid's layout is hand-tuned to the number of cards.
 *
 * Six columns, three cards spanning 2 on the first row and two spanning 3 on the
 * second, so both rows fill. That arithmetic only works for five cards, and the
 * CSS cannot say so: adding a sixth gives it a 2-column span and a ragged third
 * row, which reads as a styling bug rather than as a decision nobody made.
 *
 * So the count is asserted here instead. This case is meant to fail when a card
 * is added — that failure IS the reminder to re-tune the grid.
 */
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'NavCards.astro'),
  'utf8',
);

/**
 * Comments stripped, because the rule below forbids a selector that the comment
 * explaining the rule necessarily quotes. The first version failed on the prose
 * describing what it was there to prevent.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '');

describe('NavCards', () => {
  it('has exactly the five cards the grid is tuned for', () => {
    const cards = code.match(/href: localizePath\(/g) ?? [];
    expect(
      cards.length,
      'the nav-card grid spans are hand-tuned for five cards; re-tune .nav-cards__grid before changing the count',
    ).toBe(5);
  });

  it('spans the cards the grid rule names', () => {
    // Guards the guard above: if the span rule were deleted or reverted to an
    // open-ended `:nth-child(n + 4)`, the count assertion would still pass while
    // protecting nothing.
    expect(code).toContain('grid-template-columns: repeat(6, 1fr)');
    expect(code).toMatch(/nth-child\(4\)[\s\S]{0,80}nth-child\(5\)[\s\S]{0,60}span 3/);
    expect(code, 'open-ended span rule is back').not.toMatch(/nth-child\(n \+ 4\)/);
  });
});
