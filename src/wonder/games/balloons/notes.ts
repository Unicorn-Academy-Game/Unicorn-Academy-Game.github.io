import type { RGB } from '../../engine/color';
import { PENTATONIC } from '../../music';

/**
 * The five notes a balloon can sing. They are the notes of the major pentatonic scale on C, which
 * has no wrong notes, so whichever balloons they pop, and in whatever order, it is music. Each note
 * has one colour for good, the same colours the bells of a school music room wear, so a child who
 * has played one knows red is C before they can read the word.
 */

/** 0 is C, 1 is D, 2 is E, 3 is G and 4 is A. */
export type Degree = 0 | 1 | 2 | 3 | 4;

export const DEGREES: readonly Degree[] = [0, 1, 2, 3, 4];

export interface Pitch {
  readonly name: 'C' | 'D' | 'E' | 'G' | 'A';
  /** The colour of its balloon. */
  readonly color: RGB;
}

export const PITCHES: Readonly<Record<Degree, Pitch>> = {
  0: { name: 'C', color: [235, 48, 72] },
  1: { name: 'D', color: [255, 132, 28] },
  2: { name: 'E', color: [255, 224, 56] },
  3: { name: 'G', color: [52, 140, 255] },
  4: { name: 'A', color: [160, 96, 250] },
};

/**
 * Middle C, the lowest note of a big balloon. A small balloon sings the same note an octave higher.
 */
const ROOT = 60;

export const midiOf = (degree: Degree, high = false): number => ROOT + PENTATONIC[degree]! + (high ? 12 : 0);

/** The note of a letter, for writing a song down. */
export const degreeOf = (letter: string): Degree => {
  const found = DEGREES.find((d) => PITCHES[d].name === letter);
  if (found === undefined) throw new Error(`${letter} is not one of the five notes: C D E G A`);
  return found;
};
