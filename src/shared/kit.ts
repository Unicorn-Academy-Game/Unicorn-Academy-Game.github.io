/**
 * The drums of the tone matrix and the number each is asked for with. They are the notes of General
 * MIDI's percussion map, so 36 is the kick, 38 the snare and 42 the closed hat as they are in any
 * drum machine. The synth's `kit` voice reads which drum to strike from the note it is given, and
 * the game's drum rows ask for the same numbers, so this file is the one place that says which drum
 * is which.
 */
export const KIT = {
  kick: 36,
  rim: 37,
  snare: 38,
  clap: 39,
  tomFloor: 41,
  hatClosed: 42,
  tomLow: 43,
  tomMid: 45,
  hatOpen: 46,
  tomHigh: 47,
  crash: 49,
  cowbell: 56,
  shaker: 70,
  blockHigh: 76,
  blockLow: 77,
  triangle: 81,
} as const;

export type Drum = keyof typeof KIT;

/** Every drum of the kit, so a test or a measuring tool can walk them all. */
export const DRUMS = Object.keys(KIT) as readonly Drum[];

/**
 * The drum that has a number, or none: the kit's own answer to a note that is not a drum is a
 * snare, but a caller may want to know.
 */
export const drumOf = (midi: number): Drum | undefined => DRUMS.find((drum) => KIT[drum] === midi);
