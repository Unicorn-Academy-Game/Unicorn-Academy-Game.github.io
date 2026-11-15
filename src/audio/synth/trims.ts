import type { Trims } from './synth';

/**
 * What each sound is multiplied by so that they sit together and next to the sounds the world
 * plays. Worked out by `tools/qa/synth-sheet.ts --raw` against the loudness targets in that file,
 * and checked again with these in place (`tools/qa/synth-sheet.ts` with no flag reports any sound
 * that is more than 1.5 LU off).
 */
export const TRIMS: Trims = {
  launch: 0.7,
  boom: 1.01,
  crackle: 5.32,
  pop: 1.57,
  snap: 1.05,
  boing: 1.24,
  whoosh: 1.16,
  splash: 1.16,
  star: 0.65,
  twinkle: 0.65,
  swell: 2.14,
  tap: 2.38,
  cheer: 1.16,
  gear: 1.04,
  ding: 0.84,
  poof: 2.1,
  whistle: 0.29,
  rumble: 0.63,
  wind: 1.32,
  coin: 0.7,
  thud: 0.97,
  bell: 0.46,
  glass: 0.42,
  pluck: 1.09,
  marimba: 0.61,
  harp: 0.43,
  pad: 1.41,
  bass: 0.52,
  chime: 0.57,
  flute: 0.29,
  ping: 0.61,
  kick: 0.85,
  snare: 1.47,
  hat: 1.51,
  sub: 0.25,
  kit: 1,
};
