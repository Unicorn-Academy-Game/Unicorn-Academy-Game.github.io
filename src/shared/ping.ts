/**
 * The whole of a step sequencer's sound: a sine through a gentle low-pass, so every pitch is heard
 * as it is. Each curve is steep at first and flattens, as a struck thing's does, and the times are
 * the time constants of those curves, in seconds.
 *
 * Two places make this sound: the synth plays it live for the tone matrix, and
 * `tools/audio/sfx/piano.ts` renders it into the run that the piano by the palace plays when it is
 * tapped. They read the numbers here so that the piano sounds like what is inside it.
 */
export const PING = {
  /** From silence to the peak. */
  attack: 0.005,
  /** The body of the note, as a share of the peak, and how fast the peak settles to it. */
  body: 0.3,
  drop: 0.018,
  /**
   * How fast the note dies once it is let go, and how long that is waited for before the tone is
   * stopped, when it is 57 dB down.
   */
  fall: 0.131,
  ring: 0.7,
  /**
   * The corner of the low-pass, which takes the top off the highest notes. Q is in decibels, so 1
   * is a small lift at the corner.
   */
  cutoff: 1100,
  q: 1,
  peak: 0.5,
  /** How long a note is held before it is let go, when the one who plays it does not say. */
  held: 0.125,
} as const;
