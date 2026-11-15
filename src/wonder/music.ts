/**
 * The little music theory the games share. Every melody a child can make is in a major pentatonic
 * scale, which has no wrong notes: any of them, in any order, played together, sound right. Notes
 * are MIDI numbers (60 is middle C).
 */

/** The semitones above the root of a major pentatonic scale. */
export const PENTATONIC: readonly number[] = [0, 2, 4, 7, 9];

/** The semitones above the root of a major scale, for tunes that need the other two notes. */
export const MAJOR: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/**
 * The note `step` steps up a scale from `root`. Negative steps go down. Steps past the end of the
 * scale go up an octave.
 */
export function scaleNote(root: number, step: number, scale: readonly number[] = PENTATONIC): number {
  const n = scale.length;
  const octave = Math.floor(step / n);
  const degree = ((step % n) + n) % n;
  return root + octave * 12 + scale[degree]!;
}

/**
 * A note chosen by where along something a finger is, from 0 (low) to 1 (high), over `steps` notes
 * of the scale.
 */
export function noteAt(fraction: number, root = 60, steps = 15, scale: readonly number[] = PENTATONIC): number {
  const f = Math.min(1, Math.max(0, fraction));
  return scaleNote(root, Math.min(steps - 1, Math.floor(f * steps)), scale);
}

/** A frequency in hertz for a MIDI note. */
export const hertz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** A major chord on `root`, as three notes. */
export const chord = (root: number): readonly [number, number, number] => [root, root + 4, root + 7];

/**
 * An arpeggio of `count` notes rising through a pentatonic scale from `root`, the sound of a star
 * being earned.
 */
export const rising = (root: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => scaleNote(root, i));

/**
 * A tune as steps of a major scale from its root, with how long each note is in beats. `null` is a
 * rest. The tunes are old ones that belong to everybody.
 */
export interface Tune {
  readonly name: string;
  /** Beats per minute. */
  readonly tempo: number;
  /**
   * [scale degree from the root (0 is the root, 7 is an octave up), beats]. A degree of -1 is a
   * rest.
   */
  readonly notes: readonly (readonly [number, number])[];
}

/** Twinkle, Twinkle, Little Star, in four phrases. */
export const TWINKLE: Tune = {
  name: 'twinkle',
  tempo: 96,
  notes: [
    [0, 1],
    [0, 1],
    [4, 1],
    [4, 1],
    [5, 1],
    [5, 1],
    [4, 2],
    [3, 1],
    [3, 1],
    [2, 1],
    [2, 1],
    [1, 1],
    [1, 1],
    [0, 2],
    [4, 1],
    [4, 1],
    [3, 1],
    [3, 1],
    [2, 1],
    [2, 1],
    [1, 2],
    [4, 1],
    [4, 1],
    [3, 1],
    [3, 1],
    [2, 1],
    [2, 1],
    [1, 2],
    [0, 1],
    [0, 1],
    [4, 1],
    [4, 1],
    [5, 1],
    [5, 1],
    [4, 2],
    [3, 1],
    [3, 1],
    [2, 1],
    [2, 1],
    [1, 1],
    [1, 1],
    [0, 2],
  ],
};

/** Ode to Joy. */
export const JOY: Tune = {
  name: 'joy',
  tempo: 108,
  notes: [
    [2, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [4, 1],
    [3, 1],
    [2, 1],
    [1, 1],
    [0, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 1.5],
    [1, 0.5],
    [1, 2],
    [2, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [4, 1],
    [3, 1],
    [2, 1],
    [1, 1],
    [0, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 1.5],
    [0, 0.5],
    [0, 2],
  ],
};

/** Row, Row, Row Your Boat. */
export const BOAT: Tune = {
  name: 'boat',
  tempo: 100,
  notes: [
    [0, 1.5],
    [0, 1.5],
    [0, 1],
    [1, 0.5],
    [2, 1.5],
    [2, 1],
    [1, 0.5],
    [2, 1],
    [3, 0.5],
    [4, 3],
    [7, 0.5],
    [7, 0.5],
    [7, 0.5],
    [4, 0.5],
    [4, 0.5],
    [4, 0.5],
    [2, 0.5],
    [2, 0.5],
    [2, 0.5],
    [0, 0.5],
    [0, 0.5],
    [0, 0.5],
    [4, 1],
    [3, 0.5],
    [2, 1],
    [1, 0.5],
    [0, 3],
  ],
};

/** How many beats a tune lasts. */
export const tuneBeats = (tune: Tune): number => tune.notes.reduce((sum, [, beats]) => sum + beats, 0);

/**
 * The MIDI notes of a tune in order, rests left out, with the root of its key. Degree 0..6 is the
 * major scale, 7 and up is the next octave.
 */
export function tuneMidi(tune: Tune, root: number): number[] {
  return tune.notes.filter(([degree]) => degree >= 0).map(([degree]) => scaleNote(root, degree, MAJOR));
}
