import { COLUMNS, timeOfColumn } from '../../../src/shared/computer';
import { scaleNote } from '../../../src/wonder/music';
import { filter, midiHz, mixInto, rand, SR, samples, seedOf, TAU, whiteNoise } from '../dsp';

/**
 * A note of a toy: a triangle wave, which is round and a little hollow, that is struck at once and
 * dies away on a curve. It is not the sine of the piano, so the two toys are not mistaken for each
 * other across the garden.
 */
export function bleep(hz: number, ring = 0.34, tau = 0.075): Float32Array {
  const out = new Float32Array(samples(ring + 0.01));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const w = TAU * hz * t;
    const wave = Math.sin(w) - Math.sin(3 * w) / 9 + Math.sin(5 * w) / 25;
    out[i] = wave * Math.min(1, t / 0.004) * Math.exp(-t / tau);
  }
  return filter(out, 'lowpass', 4800);
}

/** The tap of a key: a few milliseconds of bright noise. */
function tap(): Float32Array {
  const n = samples(0.016);
  const noise = whiteNoise(n, rand(seedOf('computer-key')));
  for (let i = 0; i < n; i++) noise[i]! *= Math.exp(-(i / SR) / 0.003);
  return filter(noise, 'bandpass', 2600, 2);
}

/**
 * The rising whirr of a screen switching on, which is over by the time the light reaches the first
 * key.
 */
function whirr(length: number): Float32Array {
  const n = samples(length);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    phase += (TAU * 220 * 4 ** x) / SR;
    out[i] = Math.sin(phase) * Math.sin(Math.PI * x) ** 2;
  }
  return out;
}

/**
 * The run starts two steps up the key from the piano's first note, on the E over the C an octave
 * above middle C, so it starts a little above the piano's.
 */
const RUN_STEPS = 2;
/**
 * The columns that sound a note, one in two, so five notes go up the key in the time the light
 * takes to cross.
 */
const NOTE_COLUMNS = [1, 3, 5, 7, 9] as const;

/**
 * What is heard when the computer wakes, each part on its own and as long as the whole, so each can
 * be held to the times of the picture.
 */
export interface WakeParts {
  whirr: Float32Array;
  taps: Float32Array;
  notes: Float32Array;
  bell: Float32Array;
}

export function wakeParts(): WakeParts {
  const bellAt = timeOfColumn(COLUMNS - 1) + 0.05;
  const length = samples(bellAt + 0.95 + 0.02);
  const part = (): Float32Array => new Float32Array(length);
  const parts = { whirr: part(), taps: part(), notes: part(), bell: part() };
  mixInto(parts.whirr, whirr(timeOfColumn(0)), 0, 0.3);
  const click = tap();
  for (let column = 0; column < COLUMNS; column++)
    mixInto(parts.taps, click, Math.round(timeOfColumn(column) * SR), 0.2);
  NOTE_COLUMNS.forEach((column, i) => {
    mixInto(
      parts.notes,
      bleep(midiHz(scaleNote(72, RUN_STEPS + i))),
      Math.round(timeOfColumn(column) * SR),
      1 - 0.05 * i,
    );
  });
  mixInto(parts.bell, bleep(midiHz(88), 0.95, 0.1), Math.round(bellAt * SR), 0.55);
  return parts;
}

/**
 * The computer by the palace when it is tapped: a whirr as the screen wakes, a tap for each key as
 * the light reaches it, five notes going up the key one in two of the columns, and a bell as the
 * screen settles. The picture and the sparks that fly off it take their times from
 * `src/shared/computer.ts` as this does, so what is heard is what is seen.
 */
export function computerWake(): Float32Array {
  const { whirr, taps, notes, bell } = wakeParts();
  const out = new Float32Array(whirr.length);
  for (const part of [whirr, taps, notes, bell]) mixInto(out, part, 0);
  return out;
}
