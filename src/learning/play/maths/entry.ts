/**
 * What is on the display of the keypad, as a calculator keeps it: the digits typed so far, as
 * text, so that a number is never longer on the display than the keys that made it. The rules are
 * here and not in the screen, so that the keys of the screen and the keys of a keyboard end up at
 * the same number.
 */

/** The most digits that can be typed. The biggest answer in the game has three. */
export const MOST_DIGITS = 3;

/** A key of the keypad that is not a digit. */
export type EditKey = 'back' | 'clear';

const DIGIT = /^[0-9]$/;

/**
 * What is on the display after a key. A digit goes on the end, and a nought at the start is
 * replaced by the digit after it, as on a calculator, so 0 and then 7 shows 7. A digit past the
 * most there can be is not taken.
 */
export function press(typed: string, key: string | EditKey): string {
  if (key === 'back') return typed.slice(0, -1);
  if (key === 'clear') return '';
  if (!DIGIT.test(key)) return typed;
  if (typed === '0') return key;
  return typed.length >= MOST_DIGITS ? typed : typed + key;
}

/** The number that is on the display, or nothing when nothing has been typed. */
export const numberOn = (typed: string): number | null => (typed === '' ? null : Number(typed));

/** The keys of a number, as a string of digits. */
export const digitsOf = (value: number): string => String(value);
