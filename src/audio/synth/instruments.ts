import { clamp } from '../../shared/math';
import { PING } from '../../shared/ping';
import { hertz } from '../../wonder/music';
import type { VoiceName } from '../../wonder/sound';
import { kit } from './kit';
import { glide, hold, type Patch, strike } from './patch';

/** One note: when it starts, which it is, how loud, and how long it is held. */
export interface Note {
  /** When it starts, on the context's clock. */
  t: number;
  midi: number;
  gain: number;
  /** How long it is held, for the instruments that are held. The ones that ring ignore it. */
  seconds: number;
}

/** What an instrument gives back: when it is silent, and how much of it is sent to the room. */
export interface Played {
  end: number;
  room: number;
}

export type Instrument = (p: Patch, n: Note) => Played;

/** A pure tone that is struck and dies away, one part of a bell or a bar. */
function ring(
  p: Patch,
  frequency: number,
  t: number,
  peak: number,
  attack: number,
  decay: number,
  into: AudioNode = p.out,
): number {
  // Above what the context can carry there is nothing to hear, and a tone there would only fold
  // back down.
  if (frequency > p.ctx.sampleRate * 0.4 || peak <= 0) return t;
  const stop = t + attack + decay + 0.02;
  const o = p.osc('sine', frequency, t, stop);
  const g = p.gain(0);
  strike(g.gain, t, peak, attack, decay);
  p.chain(o, g).connect(into);
  return stop;
}

/** A bell, glass or chime: sine partials at their own ratios, each dying away at its own rate. */
function struck(
  p: Patch,
  n: Note,
  partials: readonly (readonly [ratio: number, amp: number, life: number])[],
  attack: number,
  decay: number,
  scale: number,
  into?: AudioNode,
): number {
  const f = hertz(n.midi);
  let end = n.t;
  for (const [ratio, amp, life] of partials)
    end = Math.max(end, ring(p, f * ratio, n.t, amp * scale * n.gain, attack, decay * life, into));
  return end;
}

const BELL: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2, 0.38, 0.6],
  [2.76, 0.3, 0.42],
  [4.07, 0.14, 0.26],
  [5.4, 0.11, 0.2],
  [8.93, 0.05, 0.1],
];
const GLASS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.01, 0.22, 0.7],
  [3.02, 0.1, 0.5],
  [4.2, 0.04, 0.4],
];
const CHIME: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2.41, 0.5, 0.5],
  [3.94, 0.3, 0.3],
  [6.22, 0.14, 0.2],
];
const HARP: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [2, 0.42, 0.7],
  [3, 0.2, 0.5],
  [4, 0.09, 0.35],
  [5, 0.05, 0.25],
];

/**
 * A quick tick of noise at the start of a note, which is what makes a struck or plucked thing sound
 * struck or plucked.
 */
function tick(p: Patch, t: number, centre: number, q: number, peak: number, seconds: number): void {
  const h = p.hiss(t, t + seconds + 0.02);
  const f = p.filter('bandpass', centre, q);
  const g = p.gain(0);
  strike(g.gain, t, peak, 0.0006, seconds);
  p.chain(h, f, g).connect(p.out);
}

export const INSTRUMENTS: Readonly<Record<VoiceName, Instrument>> = {
  bell(p, n) {
    const decay = clamp(2.4 - (n.midi - 60) * 0.035, 0.7, 2.4);
    return { end: struck(p, n, BELL, 0.0015, decay, 0.32), room: 0.38 };
  },

  glass(p, n) {
    const decay = clamp(2.8 - (n.midi - 60) * 0.03, 1, 2.8);
    // A slow shimmer, as the rim of a glass has.
    const shimmer = p.gain(0.9);
    const stop = n.t + 0.012 + decay + 0.05;
    const lfo = p.osc('sine', 5.4, n.t, stop);
    const depth = p.gain(0.09);
    p.chain(lfo, depth).connect(shimmer.gain);
    shimmer.connect(p.out);
    return { end: struck(p, n, GLASS, 0.012, decay, 0.36, shimmer), room: 0.5 };
  },

  chime(p, n) {
    return { end: struck(p, n, CHIME, 0.001, 1.1, 0.3), room: 0.42 };
  },

  harp(p, n) {
    const decay = clamp(2.2 - (n.midi - 48) * 0.02, 0.8, 2.2);
    const end = struck(p, n, HARP, 0.002, decay, 0.34);
    tick(p, n.t, 2600, 1.2, 0.05 * n.gain, 0.008);
    return { end, room: 0.28 };
  },

  marimba(p, n) {
    const f = hertz(n.midi);
    const decay = clamp(0.9 - (n.midi - 48) * 0.01, 0.25, 0.9);
    let end = ring(p, f, n.t, 0.5 * n.gain, 0.001, decay);
    end = Math.max(end, ring(p, f * 4, n.t, 0.1 * n.gain, 0.001, decay * 0.18));
    end = Math.max(end, ring(p, f * 9.9, n.t, 0.03 * n.gain, 0.001, decay * 0.07));
    tick(p, n.t, 1800, 1.5, 0.1 * n.gain, 0.008);
    return { end, room: 0.1 };
  },

  pluck(p, n) {
    const f = hertz(n.midi);
    const decay = clamp(n.seconds, 0.3, 0.9);
    const stop = n.t + 0.004 + decay + 0.03;
    const low = p.filter('lowpass', Math.min(6000, f * 7), 2);
    low.frequency.setValueAtTime(Math.min(6000, f * 7), n.t);
    low.frequency.exponentialRampToValueAtTime(Math.max(120, f * 1.6), n.t + 0.2);
    const amp = p.gain(0);
    strike(amp.gain, n.t, 0.3 * n.gain, 0.004, decay);
    for (const [type, mult, level] of [
      ['sawtooth', 1, 0.5],
      ['sawtooth', 1.004, 0.5],
      ['triangle', 0.5, 0.5],
    ] as const) {
      const o = p.osc(type, f * mult, n.t, stop);
      const part = p.gain(level);
      p.chain(o, part).connect(low);
    }
    p.chain(low, amp).connect(p.out);
    return { end: stop, room: 0.16 };
  },

  pad(p, n) {
    const f = hertz(n.midi);
    const held = Math.max(0.6, n.seconds);
    const down = 0.9;
    const stop = n.t + held + down + 0.05;
    const low = p.filter('lowpass', 500 + f * 2, 0.7);
    // The sound opens as it swells and closes as it goes.
    low.frequency.setValueAtTime(380, n.t);
    low.frequency.linearRampToValueAtTime(Math.min(2600, 700 + f * 3), n.t + 0.5);
    low.frequency.linearRampToValueAtTime(420, n.t + held + down);
    const amp = p.gain(0);
    hold(amp.gain, n.t, 0.45, held, down, 0.065 * n.gain);
    for (const [type, mult, level] of [
      ['sawtooth', 1, 0.3],
      ['sawtooth', 1.006, 0.3],
      ['sawtooth', 0.994, 0.3],
      ['triangle', 0.5, 0.28],
    ] as const) {
      const o = p.osc(type, f * mult, n.t, stop);
      const part = p.gain(level);
      p.chain(o, part).connect(low);
    }
    p.chain(low, amp).connect(p.out);
    return { end: stop, room: 0.45 };
  },

  bass(p, n) {
    const f = hertz(n.midi);
    const decay = clamp(n.seconds, 0.25, 1.2);
    const stop = n.t + 0.008 + decay + 0.03;
    const low = p.filter('lowpass', 340, 0.8);
    const amp = p.gain(0);
    strike(amp.gain, n.t, 0.5 * n.gain, 0.008, decay);
    const sine = p.osc('sine', f, n.t, stop);
    const saw = p.osc('sawtooth', f, n.t, stop);
    const sawLevel = p.gain(0.3);
    p.chain(saw, sawLevel, low);
    p.chain(sine, low);
    p.chain(low, amp).connect(p.out);
    return { end: stop, room: 0.04 };
  },

  sub(p, n) {
    const f = hertz(n.midi);
    const held = clamp(n.seconds, 0.12, 3);
    const down = 0.06;
    const stop = n.t + held + down + 0.04;
    // A plucked string gives up a little of itself as it rings, so a long note is not a flat one.
    const taper = p.gain(1);
    taper.gain.setValueAtTime(1, n.t);
    taper.gain.exponentialRampToValueAtTime(0.5, n.t + 1.6);
    const amp = p.gain(0);
    hold(amp.gain, n.t, 0.006, held, down, 0.45 * n.gain);
    // The weight: the note itself.
    const weight = p.osc('sine', f, n.t, stop);
    const weighed = p.gain(0.35);
    p.chain(weight, weighed).connect(taper);
    // The tone: a saw through a low-pass that is open at the start of the note and closes as it
    // settles, the pluck. It never closes under 500 Hz, because a small speaker gives nothing below
    // about 250 Hz, and the note is heard there by the overtones that this lets through.
    const open = clamp(f * 20, 1200, 3600);
    const settle = clamp(f * 7, 500, 1600);
    const low = p.filter('lowpass', open, 1.2);
    low.frequency.setValueAtTime(open, n.t);
    low.frequency.exponentialRampToValueAtTime(settle, n.t + 0.2);
    const core = p.gain(0.9);
    p.chain(p.osc('sawtooth', f, n.t, stop), core, low).connect(taper);
    p.chain(taper, amp).connect(p.out);
    return { end: stop, room: 0.02 };
  },

  kit,

  flute(p, n) {
    const f = hertz(n.midi);
    const held = Math.max(0.3, n.seconds);
    const stop = n.t + held + 0.2;
    const amp = p.gain(0);
    const end = hold(amp.gain, n.t, 0.07, held, 0.14, 0.3 * n.gain);
    // A breath of vibrato that arrives after the note has begun, as a player's does.
    const vibrato = p.osc('sine', 5.3, n.t, stop);
    const depth = p.gain(0);
    depth.gain.setValueAtTime(0, n.t);
    depth.gain.linearRampToValueAtTime(f * 0.005, n.t + 0.3);
    vibrato.connect(depth);
    for (const [mult, level] of [
      [1, 1],
      [2, 0.1],
      [3, 0.035],
    ] as const) {
      const o = p.osc('sine', f * mult, n.t, stop);
      depth.connect(o.frequency);
      const part = p.gain(level);
      p.chain(o, part).connect(amp);
    }
    // The breath: noise round the third harmonic, strongest at the start.
    const air = p.hiss(n.t, stop);
    const band = p.filter('bandpass', Math.min(f * 3, 7000), 3);
    const breath = p.gain(0);
    strike(breath.gain, n.t, 0.08 * n.gain, 0.02, 0.18);
    p.chain(air, band, breath).connect(amp);
    amp.connect(p.out);
    return { end: Math.max(end, stop), room: 0.3 };
  },

  ping(p, n) {
    const held = clamp(n.seconds, 0.04, 0.5);
    const stop = n.t + held + PING.ring + 0.02;
    const o = p.osc('sine', hertz(n.midi), n.t, stop);
    const soft = p.filter('lowpass', PING.cutoff, PING.q);
    const amp = p.gain(0);
    const level = amp.gain;
    const peak = PING.peak * n.gain;
    // A quick rise, a drop to a soft body, and when the note is over a long fall: each fall a curve
    // that is steep first, as a struck thing's is.
    level.setValueAtTime(0, n.t);
    level.linearRampToValueAtTime(peak, n.t + PING.attack);
    level.setTargetAtTime(peak * PING.body, n.t + PING.attack, PING.drop);
    level.setTargetAtTime(0, n.t + held, PING.fall);
    p.chain(o, soft, amp).connect(p.out);
    return { end: stop, room: 0 };
  },

  kick(p, n) {
    const stop = n.t + 0.3;
    const o = p.osc('sine', 150, n.t, stop);
    glide(o.frequency, 150, 46, n.t, 0.09);
    const g = p.gain(0);
    strike(g.gain, n.t, 0.8 * n.gain, 0.001, 0.26);
    p.chain(o, g).connect(p.out);
    const h = p.hiss(n.t, n.t + 0.02);
    const soft = p.filter('lowpass', 2400, 0.7);
    const click = p.gain(0);
    strike(click.gain, n.t, 0.14 * n.gain, 0.0005, 0.006);
    p.chain(h, soft, click).connect(p.out);
    return { end: stop, room: 0.03 };
  },

  snare(p, n) {
    const stop = n.t + 0.25;
    const h = p.hiss(n.t, stop);
    const band = p.filter('bandpass', 1900, 0.7);
    const g = p.gain(0);
    strike(g.gain, n.t, 0.4 * n.gain, 0.0015, 0.16);
    p.chain(h, band, g).connect(p.out);
    const body = p.osc('triangle', 230, n.t, stop);
    glide(body.frequency, 230, 170, n.t, 0.06);
    const b = p.gain(0);
    strike(b.gain, n.t, 0.28 * n.gain, 0.002, 0.1);
    p.chain(body, b).connect(p.out);
    return { end: stop, room: 0.14 };
  },

  hat(p, n) {
    const open = n.seconds >= 0.15;
    const decay = open ? 0.22 : 0.04;
    const stop = n.t + decay + 0.03;
    const h = p.hiss(n.t, stop);
    const high = p.filter('highpass', 7200, 0.7);
    const g = p.gain(0);
    strike(g.gain, n.t, 0.2 * n.gain, 0.001, decay);
    p.chain(h, high, g).connect(p.out);
    return { end: stop, room: 0.05 };
  },
};
