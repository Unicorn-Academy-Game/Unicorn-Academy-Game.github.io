import { noteOfKey, PIANO_KEYS, timeOfKey } from '../../../src/shared/piano';
import { PING } from '../../../src/shared/ping';
import { scaleNote } from '../../../src/wonder/music';
import { filter, midiHz, mixInto, SR, samples, TAU } from '../dsp';

/**
 * The note the tone matrix plays, rendered: a sine that rises in 5 ms, settles to a soft body, and
 * when it is let go falls away on a long curve, through the low-pass the synth has for it. The
 * curves are those of the synth's own `ping`, from the same numbers.
 */
export function ping(hz: number, held: number = PING.held): Float32Array {
  const out = new Float32Array(samples(held + PING.ring + 0.02));
  // What `setTargetAtTime` makes of a target, a start and a time constant: the value goes to the
  // target on a curve that is steep first.
  const body = (t: number): number =>
    PING.peak * (PING.body + (1 - PING.body) * Math.exp(-(t - PING.attack) / PING.drop));
  const heldLevel = body(held);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const level =
      t < PING.attack
        ? (PING.peak * t) / PING.attack
        : t < held
          ? body(t)
          : heldLevel * Math.exp(-(t - held) / PING.fall);
    out[i] = Math.sin(TAU * hz * t) * level;
  }
  // The synth's Q is in decibels, as a browser's is; the filter here is told it as a ratio.
  return filter(out, 'lowpass', PING.cutoff, 10 ** (PING.q / 20));
}

/**
 * The note the run starts on: the C an octave above middle C, so that it is bright and still heard
 * on a small speaker.
 */
const RUN_FROM = 72;

/**
 * The piano by the palace when it is tapped: a run up two octaves of the five notes of the key, one
 * note for each key that lights, at the moment its key is down. The picture and the notes that fly
 * off it take their times from `src/shared/piano.ts` as this does, so what is heard is what is
 * seen.
 */
export function pianoRun(): Float32Array {
  const keys = Array.from({ length: PIANO_KEYS }, (_, key) => key).filter((key) => noteOfKey(key) !== null);
  const end = timeOfKey(keys[keys.length - 1]!) + PING.held + PING.ring + 0.05;
  const out = new Float32Array(samples(end));
  // Each a little quieter than the one before it, so that the run grows lighter as it goes up.
  keys.forEach((key, i) => {
    mixInto(out, ping(midiHz(scaleNote(RUN_FROM, i))), Math.round(timeOfKey(key) * SR), 1 - 0.035 * i);
  });
  return out;
}
