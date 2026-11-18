import { describe, expect, it } from 'vitest';
import { digitsOf, MOST_DIGITS, numberOn, press } from '../../../src/learning/play/maths/entry';

describe('the display of the keypad', () => {
  it('puts each digit on the end, and shows nothing as nothing', () => {
    expect(press('', '4')).toBe('4');
    expect(press('4', '2')).toBe('42');
    expect(numberOn('42')).toBe(42);
    expect(numberOn('')).toBeNull();
    expect(numberOn('0')).toBe(0);
  });

  it('takes a nought as the start of a number only once, and a digit after it replaces it, as on a calculator', () => {
    expect(press('', '0')).toBe('0');
    expect(press('0', '0')).toBe('0');
    expect(press('0', '7')).toBe('7');
    expect(press('7', '0')).toBe('70');
  });

  it('holds no more digits than an answer has, and takes the last one back with the back key', () => {
    let typed = '';
    for (const digit of '123456') typed = press(typed, digit);
    expect(typed).toBe('123');
    expect(typed.length).toBe(MOST_DIGITS);
    expect(press(typed, 'back')).toBe('12');
    expect(press('', 'back')).toBe('');
    expect(press(typed, 'clear')).toBe('');
  });

  it('ignores a key that is not a digit or an edit', () => {
    for (const key of ['a', ' ', '-', '+', '.', 'Enter', '10', '']) expect(press('12', key)).toBe('12');
  });

  it('can write any answer the game asks as digits that make the same number again', () => {
    for (let n = 0; n <= 100; n++) {
      let typed = '';
      for (const digit of digitsOf(n)) typed = press(typed, digit);
      expect(numberOn(typed)).toBe(n);
    }
  });
});
