import { type ClipId, numberWords, numeralClip } from '../../lines';

/** The most a number in the maths game can be. */
export const NUMBER_TOP = 100;

/** Every number the voice can say, which is every whole number from nought to a hundred. */
export const SAID_NUMBERS: readonly number[] = Array.from({ length: NUMBER_TOP + 1 }, (_, n) => n);

/**
 * Where a number falls in what is said, which is how it sounds. A number on its own is said as an
 * answer is, with the voice coming down at the end. A number that has more said after it leans on
 * into it (`lead`), and a number that ends a question is said as the end of one (`last`). Each is
 * a clip of its own, cut from a sentence with the number in that place.
 */
export type Place = 'alone' | 'lead' | 'last';

/** The clip for a number from 0 to 100 in the place it is said. */
export function numberClip(n: number, place: Place = 'alone'): ClipId {
  if (!Number.isInteger(n) || n < 0 || n > NUMBER_TOP)
    throw new RangeError(`${n} is not a number from 0 to ${NUMBER_TOP}`);
  return place === 'alone' ? numeralClip(n) : `${place}.${n}`;
}

/** A number from 0 to 100 in words, for the voice to read. */
export const wordsOfNumber = (n: number): string => (n === NUMBER_TOP ? 'one hundred' : numberWords(n));
