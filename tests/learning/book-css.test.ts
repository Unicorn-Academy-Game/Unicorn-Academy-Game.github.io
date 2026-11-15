import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD, PICTURE } from '../../src/ui/learning/book-fit';

const css = readFileSync(new URL('../../src/ui/learning/book.css', import.meta.url), 'utf8');

/** What a rule says for a property, with the spaces that do not matter taken out. */
function says(selector: string, property: string): string {
  const block = css.match(new RegExp(`\\n${selector.replace(/[.[\]()]/g, '\\$&')} \\{([^}]*)\\}`));
  const value = block?.[1]?.match(new RegExp(`\\n\\s*${property}:\\s*([^;]+);`))?.[1];
  if (value === undefined) throw new Error(`book.css has no ${property} in ${selector}`);
  return value.replace(/\s+/g, ' ').trim();
}

describe('the cards in book.css and the layout in book-fit.ts', () => {
  it('make the picture the same way: the cell less what is beside it, or less what is around it over how tall a card is, never more than the most', () => {
    expect(says('.book-card', '--pic')).toBe(
      `max(${PICTURE.least}px, min(calc(100cqw - ${CARD.beside}px), calc((100cqh - ${CARD.around}px) / ${CARD.tall}), ${PICTURE.most}px))`,
    );
  });

  it('make the card the same size: a picture and what is beside it across, and as many pictures tall as the layout says', () => {
    expect(says('.book-card', 'width')).toBe(`calc(var(--pic) + ${CARD.beside}px)`);
    expect(says('.book-card', 'height')).toBe(`calc(var(--pic) * ${CARD.tall} + ${CARD.around}px)`);
  });

  it('give the sizes of a cell to the page, which fills them in', () => {
    expect(says('.book-word', 'width')).toContain('var(--cell-w');
    expect(says('.book-word', 'height')).toContain('var(--cell-h');
    expect(says('.book-word', 'container-type')).toBe('size');
  });
});
