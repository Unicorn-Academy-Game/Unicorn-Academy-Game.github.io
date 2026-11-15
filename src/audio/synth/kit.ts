import { type Drum, drumOf } from '../../shared/kit';
import { clamp } from '../../shared/math';
import { hertz } from '../../wonder/music';
import type { Instrument, Note, Played } from './instruments';
import { glide, type Patch, SILENCE, strike } from './patch';

/**
 * The drums of the tone matrix, made of oscillators and noise as the rest of the synth is. One
 * instrument holds all sixteen and the note it is given is which drum to strike, by the number in
 * `src/shared/kit.ts`. Whatever can be tuned is tuned to the one key of the game (the toms are G C
 * E A, the cowbell C and G, the blocks A and E, the triangle C), so a drum that rings sits in the
 * song with the notes of the melody and the bass and never against them.
 */

type Recipe = (p: Patch, n: Note) => Played;

/**
 * A level that strikes to `peak`, falls to `then` of it in `first` seconds, and from there to
 * nothing in `last` more. Returns when it is silent.
 */
function strikeInStages(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  first: number,
  then: number,
  last: number,
): number {
  param.setValueAtTime(SILENCE, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(Math.max(SILENCE, peak * then), t + attack + first);
  param.exponentialRampToValueAtTime(SILENCE, t + attack + first + last);
  param.setValueAtTime(0, t + attack + first + last + 0.002);
  return t + attack + first + last;
}

/**
 * A pure tone that is struck and dies away. Returns when it is silent. A tone above what the
 * context can carry is not made.
 */
function tone(p: Patch, frequency: number, t: number, peak: number, attack: number, decay: number): number {
  if (frequency > p.ctx.sampleRate * 0.4 || peak <= 0) return t;
  const stop = t + attack + decay + 0.02;
  const o = p.osc('sine', frequency, t, stop);
  const g = p.gain(0);
  strike(g.gain, t, peak, attack, decay);
  p.chain(o, g).connect(p.out);
  return stop;
}

/**
 * A tick of noise through a band, which is what makes a struck thing sound struck. Returns when it
 * is silent.
 */
function tick(p: Patch, t: number, centre: number, q: number, peak: number, decay: number, attack = 0.0008): number {
  const stop = t + attack + decay + 0.02;
  const h = p.hiss(t, stop);
  const f = p.filter('bandpass', centre, q);
  const g = p.gain(0);
  strike(g.gain, t, peak, attack, decay);
  p.chain(h, f, g).connect(p.out);
  return stop;
}

/**
 * The notes the drums that ring are tuned to, as MIDI numbers: all of the key the rest of the game
 * is in.
 */
export const TUNED = {
  kick: 31,
  tomFloor: 43,
  tomLow: 48,
  tomMid: 52,
  tomHigh: 57,
  cowbell: [72, 79],
  blockLow: 81,
  blockHigh: 88,
  triangle: 96,
} as const;

/**
 * A kick: a sine that falls fast from a thump you can hear on a phone to the low note of the kit, a
 * knock above it that a small speaker can play, and a click.
 */
const kick: Recipe = (p, n) => {
  const t = n.t;
  const stop = t + 0.36;
  const low = hertz(TUNED.kick);
  const body = p.osc('sine', 230, t, stop);
  glide(body.frequency, 230, low * 1.05, t, 0.11);
  const level = p.gain(0);
  strike(level.gain, t, 0.85 * n.gain, 0.0015, 0.32);
  p.chain(body, level).connect(p.out);
  const knock = p.osc('triangle', 420, t, t + 0.12);
  glide(knock.frequency, 420, 130, t, 0.05);
  const knocked = p.gain(0);
  strike(knocked.gain, t, 0.5 * n.gain, 0.001, 0.07);
  p.chain(knock, knocked).connect(p.out);
  tick(p, t, 2400, 0.7, 0.16 * n.gain, 0.007);
  return { end: stop, room: 0.02 };
};

/**
 * A tom: a sine that falls from a fifth above its note to it, the overtones of a drum head that die
 * first, and a tick at the start. The lower it is the longer it rings.
 */
const tom =
  (midi: number): Recipe =>
  (p, n) => {
    const t = n.t;
    const f = hertz(midi);
    const decay = clamp(0.62 - (midi - 43) * 0.018, 0.3, 0.62);
    const stop = t + decay + 0.06;
    const body = p.osc('sine', f * 1.5, t, stop);
    glide(body.frequency, f * 1.5, f, t, 0.07);
    const level = p.gain(0);
    strike(level.gain, t, 0.75 * n.gain, 0.0015, decay);
    p.chain(body, level).connect(p.out);
    tone(p, f * 1.59, t, 0.3 * n.gain, 0.001, decay * 0.4);
    tone(p, f * 2.14, t, 0.2 * n.gain, 0.001, decay * 0.22);
    // The lower the drum, the less a small speaker has of it but its tick, so the tick is more of
    // the sound.
    tick(p, t, 1600, 1.4, (0.18 + 0.2 * clamp((60 - midi) / 17, 0, 1)) * n.gain, 0.012);
    return { end: stop, room: 0.05 };
  };

/**
 * A snare: a band of noise, and under it a drum head's tone that falls a little as it is struck.
 */
const snare: Recipe = (p, n) => {
  const t = n.t;
  const stop = t + 0.26;
  const hiss = p.hiss(t, stop);
  const band = p.filter('bandpass', 2300, 0.55);
  const soft = p.filter('lowpass', 8000, 0.6);
  const level = p.gain(0);
  strike(level.gain, t, 0.5 * n.gain, 0.0015, 0.17);
  p.chain(hiss, band, soft, level).connect(p.out);
  const head = p.osc('triangle', 215, t, stop);
  glide(head.frequency, 215, 165, t, 0.06);
  const headLevel = p.gain(0);
  strike(headLevel.gain, t, 0.3 * n.gain, 0.002, 0.1);
  p.chain(head, headLevel).connect(p.out);
  return { end: stop, room: 0.12 };
};

/**
 * A side stick: a short wooden knock, a tone and a tick that are over almost as soon as they begin.
 */
const rim: Recipe = (p, n) => {
  const t = n.t;
  const body = p.osc('sine', 2100, t, t + 0.08);
  glide(body.frequency, 2100, 1650, t, 0.012);
  const level = p.gain(0);
  strike(level.gain, t, 0.55 * n.gain, 0.001, 0.034);
  p.chain(body, level).connect(p.out);
  tone(p, hertz(64), t, 0.4 * n.gain, 0.001, 0.045);
  const end = tick(p, t, 3600, 2, 0.28 * n.gain, 0.018);
  return { end: Math.max(end, t + 0.1), room: 0.06 };
};

/** A clap: three quick hands and a fourth that rings, all noise through one band. */
const clap: Recipe = (p, n) => {
  const t = n.t;
  const peak = 0.55 * n.gain;
  const hiss = p.hiss(t, t + 0.3);
  const band = p.filter('bandpass', 1500, 1.1);
  const level = p.gain(0);
  const param = level.gain;
  param.setValueAtTime(SILENCE, t);
  for (const apart of [0, 0.012, 0.025]) {
    param.linearRampToValueAtTime(peak, t + apart + 0.001);
    param.exponentialRampToValueAtTime(peak * 0.22, t + apart + 0.011);
  }
  param.linearRampToValueAtTime(peak, t + 0.038);
  param.exponentialRampToValueAtTime(SILENCE, t + 0.24);
  param.setValueAtTime(0, t + 0.242);
  p.chain(hiss, band, level).connect(p.out);
  return { end: t + 0.3, room: 0.18 };
};

/**
 * The six squares of an electric hat, which are not in tune with each other, and so ring as metal
 * does.
 */
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800] as const;

/**
 * A hat: the metal squares and a little noise, taken to the top of the hearing. How long it rings
 * is the difference between a closed hat and an open one.
 */
const hat =
  (decay: number): Recipe =>
  (p, n) => {
    const t = n.t;
    const stop = t + decay + 0.04;
    const band = p.filter('bandpass', 9500, 0.8);
    const high = p.filter('highpass', 6800, 0.7);
    const level = p.gain(0);
    strike(level.gain, t, 0.6 * n.gain, 0.0012, decay);
    for (const f of METAL) p.chain(p.osc('square', f, t, stop), band);
    const sizzle = p.hiss(t, stop);
    const dust = p.gain(0.5);
    p.chain(sizzle, dust, band);
    p.chain(band, high, level).connect(p.out);
    return { end: stop, room: 0.04 };
  };

/**
 * A shaker: noise in a band that swells for a moment before it falls, as a handful of seeds does.
 */
const shaker: Recipe = (p, n) => {
  const t = n.t;
  const stop = t + 0.14;
  const hiss = p.hiss(t, stop);
  const band = p.filter('bandpass', 5800, 0.9);
  const level = p.gain(0);
  strike(level.gain, t, 0.4 * n.gain, 0.014, 0.09);
  p.chain(hiss, band, level).connect(p.out);
  return { end: stop, room: 0.03 };
};

/**
 * A cowbell: two squares a fifth apart through a band, which is struck hard and rings on a little.
 */
const cowbell: Recipe = (p, n) => {
  const t = n.t;
  const stop = t + 0.34;
  const band = p.filter('bandpass', 1500, 0.9);
  const level = p.gain(0);
  strikeInStages(level.gain, t, 0.5 * n.gain, 0.002, 0.045, 0.4, 0.26);
  for (const midi of TUNED.cowbell) p.chain(p.osc('square', hertz(midi), t, stop), band);
  p.chain(band, level).connect(p.out);
  return { end: stop, room: 0.05 };
};

/** A wooden block: a tone that is gone in a tenth of a second, its overtone, and a tick. */
const block =
  (midi: number): Recipe =>
  (p, n) => {
    const t = n.t;
    const f = hertz(midi);
    const stop = t + 0.14;
    const body = p.osc('sine', f * 1.05, t, stop);
    glide(body.frequency, f * 1.05, f, t, 0.012);
    const level = p.gain(0);
    strike(level.gain, t, 0.6 * n.gain, 0.001, 0.085);
    p.chain(body, level).connect(p.out);
    tone(p, f * 2.1, t, 0.14 * n.gain, 0.001, 0.03);
    tick(p, t, 2800, 2.5, 0.12 * n.gain, 0.008);
    return { end: stop, room: 0.04 };
  };

/**
 * The partials of a struck triangle as ratios of its note: not whole numbers, so it rings like
 * metal, and the high ones die first.
 */
const TRIANGLE: readonly (readonly [ratio: number, amp: number, life: number])[] = [
  [1, 1, 1],
  [2.76, 0.4, 0.55],
  [5.4, 0.2, 0.32],
  [8.93, 0.08, 0.18],
];

/** A triangle: a bright ring that goes on for more than a second. */
const triangle: Recipe = (p, n) => {
  const t = n.t;
  const f = hertz(TUNED.triangle);
  let end = t;
  for (const [ratio, amp, life] of TRIANGLE)
    end = Math.max(end, tone(p, f * ratio, t, 0.26 * amp * n.gain, 0.0012, 1.35 * life));
  return { end, room: 0.3 };
};

/**
 * A crash: a wash of noise from the high end of the hearing, struck loud and fading in two stages,
 * with a ring of high tones in it.
 */
const crash: Recipe = (p, n) => {
  const t = n.t;
  const stop = t + 1.75;
  const hiss = p.hiss(t, stop);
  const high = p.filter('highpass', 3200, 0.7);
  const level = p.gain(0);
  const end = strikeInStages(level.gain, t, 0.5 * n.gain, 0.002, 0.3, 0.32, 1.35);
  p.chain(hiss, high, level).connect(p.out);
  for (const [ratio, amp] of [
    [1, 1],
    [1.47, 0.7],
    [2.09, 0.5],
  ] as const)
    tone(p, 3300 * ratio, t, 0.05 * amp * n.gain, 0.002, 0.9);
  return { end: Math.max(end, stop), room: 0.12 };
};

const RECIPES: Readonly<Record<Drum, Recipe>> = {
  kick,
  rim,
  snare,
  clap,
  tomFloor: tom(TUNED.tomFloor),
  hatClosed: hat(0.04),
  tomLow: tom(TUNED.tomLow),
  tomMid: tom(TUNED.tomMid),
  hatOpen: hat(0.26),
  tomHigh: tom(TUNED.tomHigh),
  crash,
  cowbell,
  shaker,
  blockHigh: block(TUNED.blockHigh),
  blockLow: block(TUNED.blockLow),
  triangle,
};

/**
 * What each drum is multiplied by so that the kit is balanced as a kit and not by its meter: a kick
 * and a tom are the weight of the kit, a snare and a clap come next, and the hats, the shaker and
 * the triangle are lighter, as they are in any drum machine. These are what
 * `tools/qa/synth-sheet.ts --raw` measured against the `drum:` targets in `tools/audio/targets.ts`.
 */
export const LEVELS: Readonly<Record<Drum, number>> = {
  kick: 0.62,
  rim: 0.69,
  snare: 1.17,
  clap: 1.31,
  tomFloor: 0.49,
  hatClosed: 0.9,
  tomLow: 0.51,
  tomMid: 0.48,
  hatOpen: 0.58,
  tomHigh: 0.53,
  crash: 0.27,
  cowbell: 0.47,
  shaker: 0.64,
  blockHigh: 0.57,
  blockLow: 0.65,
  triangle: 0.31,
};

/**
 * The kit: the drum that is on the note it is asked for. A note that is no drum of the kit is a
 * snare, so a wrong note is still a sound of the right kind.
 */
export const kit: Instrument = (p, n) => {
  const drum = drumOf(n.midi) ?? 'snare';
  return RECIPES[drum](p, { ...n, gain: n.gain * LEVELS[drum] });
};
