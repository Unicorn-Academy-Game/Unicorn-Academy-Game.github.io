/**
 * How loud each synthesized sound should be, at its loudest 400 ms, in LUFS, for the same `gain`.
 * The world's own sounds run from -15 for a recruit or a welcome through -19 for a typical effect
 * to -25 for a quiet texture, so a big moment sits at -16 and a background texture well under. A
 * sound is never turned up past a peak of `PEAK_CAP` to get there. `tools/qa/synth-sheet.ts --raw`
 * works out the trims from these; `tests/e2e/synth.spec.ts` fails if any sound drifts.
 */
export const TARGETS: Readonly<Record<string, number>> = {
  launch: -20,
  boom: -17,
  crackle: -28,
  pop: -21,
  snap: -20,
  boing: -20,
  whoosh: -21,
  splash: -20,
  star: -16,
  twinkle: -22,
  swell: -19,
  tap: -26,
  cheer: -17,
  gear: -21,
  ding: -18,
  poof: -24,
  whistle: -21,
  rumble: -22,
  wind: -27,
  coin: -20,
  thud: -21,
  'note:bell': -21,
  'note:glass': -21,
  'note:pluck': -23,
  'note:marimba': -21,
  'note:harp': -22,
  'note:pad': -27,
  'note:bass': -22,
  'note:chime': -22,
  'note:flute': -21,
  'note:ping': -21,
  'note:kick': -19,
  'note:snare': -24,
  'note:hat': -31,
  'note:sub': -22,
  'chord:pad': -22,
  // The drums of the tone matrix's kit, struck one at a time. The kick and the toms are the weight
  // of it; the hats and the shaker are the light.
  'drum:kick': -19,
  'drum:rim': -27,
  'drum:snare': -23,
  'drum:clap': -24,
  'drum:tomFloor': -20,
  'drum:tomLow': -20,
  'drum:tomMid': -21,
  'drum:tomHigh': -21,
  'drum:hatClosed': -31,
  'drum:hatOpen': -27,
  'drum:crash': -21,
  'drum:cowbell': -25,
  'drum:shaker': -31,
  'drum:blockHigh': -27,
  'drum:blockLow': -27,
  'drum:triangle': -25,
};

/**
 * The note each instrument is measured on when it is asked for one note, where that is not the
 * default of 72: the bass sounds are low, and the kit is not measured on a note at all but on each
 * of its drums, as `drum:` and the name of the drum.
 */
export const PROBE_MIDI: Readonly<Record<string, number>> = { bass: 48, sub: 43, kit: 38 };

/** The highest a sound's loudest sample may be after it is trimmed, in dBFS. */
export const PEAK_CAP = -3.5;

/**
 * The target for a rendered item, whose label may carry a variant after an @ (such as `boom@big`).
 */
export const targetOf = (label: string): number | undefined => TARGETS[label.split('@')[0]!];
