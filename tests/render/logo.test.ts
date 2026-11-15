import { describe, expect, it } from 'vitest';
import { GAME_NAME } from '../../src/shared/brand';
import { logoMarkup } from '../../src/ui/logo';
import { WORDMARK_HEIGHT, WORDMARK_LINES, WORDMARK_WIDTH } from '../../src/ui/wordmark-paths';

const count = (text: string, part: string): number => text.split(part).length - 1;
const idsIn = (markup: string): string[] => [...markup.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]!);

describe('the title lettering', () => {
  it('spells the name of the game, so renaming the game means drawing it again', () => {
    expect(WORDMARK_LINES.map((line) => line.text).join(' ')).toBe(GAME_NAME);
  });

  it('is drawn outlines and no text, so it needs no font and cannot change when one arrives', () => {
    expect(logoMarkup('t')).not.toMatch(/<text|font-family/);
  });

  it('draws each line from one outline that every layer shares, so no inner edge of the font can show', () => {
    const markup = logoMarkup('t');
    WORDMARK_LINES.forEach((_, index) => {
      expect(count(markup, `<path id="t-${index}-shape"`)).toBe(1);
      // The shadow, the outline, the letters, the clip of the light edge and the light edge.
      expect(count(markup, `href="#t-${index}-shape"`)).toBe(5);
    });
    expect(count(markup, '<path id=')).toBe(WORDMARK_LINES.length);
  });

  it('closes the counters the outline would leave a pinhole in', () => {
    const plugged = WORDMARK_LINES.filter((line) => line.plugs.length > 0);
    expect(plugged.map((line) => line.text)).toEqual(['Unicorn', 'Academy', 'the Fan Game']);
    const markup = logoMarkup('t');
    for (const line of plugged) expect(markup).toContain(`<path d="${line.plugs}" fill="#26183d"/>`);
  });

  it('gives every copy ids of its own and uses only ids that exist, so two copies on a page do not borrow from each other', () => {
    const first = logoMarkup('a');
    const second = logoMarkup('b');
    expect(idsIn(first).filter((id) => idsIn(second).includes(id))).toEqual([]);
    for (const markup of [first, second]) {
      const ids = new Set(idsIn(markup));
      expect(ids.size).toBe(idsIn(markup).length);
      for (const [, id] of markup.matchAll(/(?:href="#|url\(#)([^")]+)/g)) expect(ids.has(id!), id).toBe(true);
    }
  });

  it('keeps every line and its outline inside the picture', () => {
    expect(logoMarkup('t')).toContain(`viewBox="0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}"`);
    for (const line of WORDMARK_LINES) {
      expect(line.top - line.ink / 2, `${line.text} top`).toBeGreaterThanOrEqual(0);
      expect(line.bottom + line.ink / 2 + line.lift, `${line.text} bottom with its shadow`).toBeLessThanOrEqual(
        WORDMARK_HEIGHT,
      );
    }
  });
});
