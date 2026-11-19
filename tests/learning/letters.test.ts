import { describe, expect, it } from 'vitest';
import { boxOf, DIGITS, glyphOf, RULES, symbolsOf, WRITE_KINDS, type WriteKind } from '../../src/content/letters';
import { LETTER_CASES } from '../../src/shared/learning';

const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];
const every = WRITE_KINDS.flatMap((kase) => symbolsOf(kase).map((letter) => ({ kase, letter })));

const found = (letter: string, kase: WriteKind) => {
  const glyph = glyphOf(letter, kase);
  if (!glyph) throw new Error(`no ${letter}`);
  return glyph;
};

describe('how the letters are written', () => {
  it('has every letter of the alphabet, in both cases', () => {
    for (const kase of LETTER_CASES) for (const letter of LETTERS) expect(glyphOf(letter, kase)).toBeDefined();
  });

  it('has nothing for what is not a letter', () => {
    for (const not of ['', '1', 'ab', 'A', '-', 'constructor', 'toString', '__proto__'])
      for (const kase of LETTER_CASES) expect(glyphOf(not, kase)).toBeUndefined();
  });

  it('has every numeral from nought to nine, and nothing else on its page', () => {
    expect(DIGITS).toEqual([...'0123456789']);
    for (const digit of DIGITS) expect(glyphOf(digit, 'digits')).toBeDefined();
    for (const not of ['', 'a', 'A', '10', '-', 'constructor', 'toString', '__proto__'])
      expect(glyphOf(not, 'digits')).toBeUndefined();
  });

  it('keeps a letter off the page of numerals and a numeral off the pages of letters', () => {
    expect(symbolsOf('upper')).toEqual(LETTERS);
    expect(symbolsOf('lower')).toEqual(LETTERS);
    expect(symbolsOf('digits')).toEqual(DIGITS);
  });

  it('stands every numeral between the top and the line it sits on', () => {
    for (const digit of DIGITS) {
      const { y0, y1, x0, x1 } = boxOf(found(digit, 'digits'));
      expect(y0).toBeLessThan(1);
      expect(y1).toBeLessThanOrEqual(RULES.base + 1);
      expect(y1).toBeGreaterThanOrEqual(RULES.base - 1);
      expect(x1 - x0, 'a numeral is not as wide as it is tall').toBeLessThan(RULES.base);
    }
  });

  it('begins each numeral where a teacher would: the top of the line, bar the ones that begin lower', () => {
    for (const digit of DIGITS) {
      const [first] = found(digit, 'digits').strokes;
      expect(first![0]![1], digit).toBeLessThan(RULES.body);
    }
  });

  it.each(every)('gives $letter on the $kase page a few strokes, each with a line to follow', ({ letter, kase }) => {
    const { strokes } = found(letter, kase);
    expect(strokes.length).toBeGreaterThanOrEqual(1);
    expect(strokes.length).toBeLessThanOrEqual(4);
    for (const stroke of strokes) {
      expect(stroke.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < stroke.length; i++) {
        const [ax, ay] = stroke[i - 1]!;
        const [bx, by] = stroke[i]!;
        expect(ax === bx && ay === by).toBe(false);
      }
      for (const [x, y] of stroke) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(RULES.tail);
      }
    }
  });

  it('stands every capital between the top and the line it sits on', () => {
    for (const letter of LETTERS) {
      const { y0, y1 } = boxOf(found(letter, 'upper'));
      expect(y0).toBeLessThan(1);
      expect(y1).toBeLessThanOrEqual(RULES.base + 1);
      expect(y1).toBeGreaterThanOrEqual(RULES.base - 1);
    }
  });

  it('reaches up for the tall small letters, and down for the ones with tails', () => {
    const tall = [...'bdfhkl'];
    const tailed = [...'gjpqy'];
    for (const letter of LETTERS) {
      const { y0, y1 } = boxOf(found(letter, 'lower'));
      if (tall.includes(letter)) expect(y0).toBeLessThan(1);
      else if (letter === 't') expect(y0).toBeLessThan(RULES.body - 20);
      else if (letter === 'i' || letter === 'j') expect(y0).toBeLessThan(RULES.body);
      else expect(y0).toBeGreaterThanOrEqual(RULES.body - 1);
      if (tailed.includes(letter)) expect(y1).toBeGreaterThan(RULES.base + 20);
      else expect(y1).toBeLessThanOrEqual(RULES.base + 1);
    }
  });

  it('starts a small letter with a body on the body line', () => {
    for (const letter of [...'acemnorsuvwxz']) expect(boxOf(found(letter, 'lower')).y0).toBeGreaterThanOrEqual(44);
  });
});
