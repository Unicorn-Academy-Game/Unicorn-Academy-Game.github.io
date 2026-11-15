import { scaleNote } from '../../wonder/music';
import type { FxName } from '../../wonder/sound';
import { INSTRUMENTS, type Played } from './instruments';
import { glide, hill, hold, type Patch, strike } from './patch';

/** What one sound is asked to be. */
interface Spec {
  /** When it starts, on the context's clock. */
  t: number;
  /** The pitch as a ratio, for the sounds that are noise or sweeps. */
  k: number;
  /**
   * Steps up the scale, for the sounds that are tuned. They are all in one key, so any step sounds
   * right with any other.
   */
  step: number;
  /** 0 to 1: how big the thing is. */
  size: number;
}

export type Recipe = (p: Patch, s: Spec) => Played;

/** The key every tuned sound is in: C, and the five notes of its pentatonic scale. */
export const TONIC = 72;

const rand = (p: Patch, lo: number, hi: number): number => lo + (hi - lo) * p.rig.rand();

/** A blip of a pure tone that slides up or down, which is most of what a bubble or a coin is. */
function blip(p: Patch, t: number, from: number, to: number, seconds: number, peak: number, attack = 0.002): number {
  const stop = t + attack + seconds + 0.02;
  const o = p.osc('sine', from, t, stop);
  glide(o.frequency, from, to, t, seconds * 0.7);
  const g = p.gain(0);
  strike(g.gain, t, peak, attack, seconds);
  p.chain(o, g).connect(p.out);
  return stop;
}

/** A burst of noise that is filtered, struck and left to die away. */
function puff(
  p: Patch,
  t: number,
  type: BiquadFilterType,
  centre: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
): number {
  const stop = t + attack + decay + 0.02;
  const h = p.hiss(t, stop);
  const f = p.filter(type, centre, q);
  const g = p.gain(0);
  strike(g.gain, t, peak, attack, decay);
  p.chain(h, f, g).connect(p.out);
  return stop;
}

/** A tone that is tuned: a note from the scale, rung on one of the instruments. */
function ringing(p: Patch, voice: 'bell' | 'glass' | 'chime', t: number, midi: number, gain: number): number {
  return INSTRUMENTS[voice](p, { t, midi, gain, seconds: 0 }).end;
}

export const RECIPES: Readonly<Record<FxName, Recipe>> = {
  /** A rocket's whistle, rising. */
  launch(p, s) {
    const t = s.t;
    const dur = 0.7;
    const stop = t + dur + 0.05;
    for (const [mult, peak] of [
      [1, 0.17],
      [1.5, 0.05],
    ] as const) {
      const tone = p.osc('sine', 420 * s.k * mult, t, stop);
      glide(tone.frequency, 420 * s.k * mult, 1750 * s.k * mult, t + 0.02, dur - 0.05);
      const g = p.gain(0);
      hill(g.gain, t, dur, peak);
      p.chain(tone, g).connect(p.out);
    }
    const air = p.hiss(t, stop);
    const band = p.filter('bandpass', 1300 * s.k, 5);
    band.frequency.setValueAtTime(1300 * s.k, t);
    band.frequency.exponentialRampToValueAtTime(Math.min(5200 * s.k, 7000), t + dur);
    const g = p.gain(0);
    hill(g.gain, t, dur, 0.15);
    p.chain(air, band, g).connect(p.out);
    return { end: stop, room: 0.1 };
  },

  /**
   * A firework opening: a soft thump, a puff of air, and a shimmer of sparks that is longer for a
   * bigger one.
   */
  boom(p, s) {
    const t = s.t;
    const big = s.size;
    const body = 0.34 + 0.36 * big;
    const thump = p.osc('sine', 150 * s.k, t, t + body + 0.05);
    glide(thump.frequency, (150 - 40 * big) * s.k, 36, t, 0.3);
    const tg = p.gain(0);
    strike(tg.gain, t, 0.42 + 0.22 * big, 0.004, body);
    p.chain(thump, tg).connect(p.out);
    puff(p, t, 'lowpass', (700 + 900 * big) * s.k, 0.7, 0.3 + 0.1 * big, 0.003, 0.2 + 0.2 * big);
    // The sparks: fine noise that flickers as it fades.
    const tail = 0.35 + 0.45 * big;
    const start = t + 0.04;
    const shimmer = p.hiss(start, start + tail + 0.05);
    const high = p.filter('highpass', 4800, 0.7);
    const env = p.gain(0);
    hill(env.gain, start, tail, 0.07 + 0.03 * big);
    const flicker = p.gain(0.5);
    const lfo = p.osc('sine', 26, start, start + tail + 0.05);
    const depth = p.gain(0.5);
    p.chain(lfo, depth).connect(flicker.gain);
    p.chain(shimmer, high, env, flicker).connect(p.out);
    return { end: start + tail + 0.05, room: 0.14 };
  },

  /** A scatter of tiny bright cracks. */
  crackle(p, s) {
    const count = 6 + Math.round(8 * s.size);
    let end = s.t;
    for (let i = 0; i < count; i++) {
      // Early ones are closer together, as the sparks of a firework go.
      const at = s.t + 0.7 * rand(p, 0, 1) ** 1.6;
      const decay = rand(p, 0.006, 0.016);
      end = Math.max(end, puff(p, at, 'bandpass', rand(p, 2500, 6500) * s.k, 2, rand(p, 0.1, 0.28), 0.0005, decay));
    }
    return { end, room: 0.12 };
  },

  /** A bubble. */
  pop(p, s) {
    const from = rand(p, 520, 780) * s.k;
    const end = blip(p, s.t, from, from * 2.2, 0.09, 0.44);
    puff(p, s.t, 'bandpass', 3200 * s.k, 1, 0.2, 0.0005, 0.006);
    return { end, room: 0.08 };
  },

  /**
   * A balloon going off: a sharp crack with a thump of rubber under it, and the scraps of it
   * falling. A bigger balloon is lower and lasts longer.
   */
  snap(p, s) {
    const t = s.t;
    const big = s.size;
    puff(p, t, 'highpass', 1500 * s.k, 0.7, 0.36, 0.0004, 0.05 + 0.04 * big);
    puff(p, t, 'bandpass', (2700 - 800 * big) * s.k, 1.2, 0.2, 0.0004, 0.03);
    const from = (340 - 100 * big) * s.k;
    const body = p.osc('sine', from, t, t + 0.14);
    glide(body.frequency, from, from * 0.32, t, 0.08);
    const g = p.gain(0);
    strike(g.gain, t, 0.3, 0.001, 0.09);
    p.chain(body, g).connect(p.out);
    const end = puff(p, t + 0.012, 'bandpass', 950 * s.k, 0.9, 0.08, 0.004, 0.15 + 0.07 * big);
    return { end, room: 0.07 };
  },

  /** A spring. */
  boing(p, s) {
    const t = s.t;
    const dur = 0.55;
    const stop = t + dur + 0.05;
    const o = p.osc('triangle', 190 * s.k, t, stop);
    o.frequency.setValueAtTime(190 * s.k, t);
    o.frequency.exponentialRampToValueAtTime(560 * s.k, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(230 * s.k, t + dur);
    const wobble = p.osc('sine', 17, t, stop);
    const depth = p.gain(0);
    depth.gain.setValueAtTime(60 * s.k, t);
    depth.gain.exponentialRampToValueAtTime(3, t + dur);
    p.chain(wobble, depth).connect(o.frequency);
    const soft = p.filter('lowpass', 2200 * s.k, 0.8);
    const g = p.gain(0);
    strike(g.gain, t, 0.36, 0.003, dur);
    p.chain(o, soft, g).connect(p.out);
    return { end: stop, room: 0.06 };
  },

  /** Something rushing past from one side to the other. */
  whoosh(p, s) {
    const t = s.t;
    const dur = 0.6;
    const stop = t + dur + 0.05;
    const air = p.hiss(t, stop);
    const band = p.filter('bandpass', 350 * s.k, 0.9);
    band.frequency.setValueAtTime(350 * s.k, t);
    band.frequency.exponentialRampToValueAtTime(2400 * s.k, t + dur * 0.35);
    band.frequency.exponentialRampToValueAtTime(500 * s.k, t + dur);
    const g = p.gain(0);
    hill(g.gain, t, dur, 0.36);
    const lean = p.pan(-0.5);
    lean.pan.setValueAtTime(-0.5, t);
    lean.pan.linearRampToValueAtTime(0.5, t + dur);
    p.chain(air, band, g, lean).connect(p.out);
    return { end: stop, room: 0.08 };
  },

  /** Water landing: a wet slap and a few bubbles after it. */
  splash(p, s) {
    const t = s.t;
    let end = puff(p, t, 'lowpass', 3400 * s.k, 0.8, 0.34 + 0.1 * s.size, 0.004, 0.3 + 0.15 * s.size);
    const fizz = p.hiss(t, t + 0.5);
    const high = p.filter('highpass', 5200, 0.7);
    const fg = p.gain(0);
    hill(fg.gain, t, 0.45, 0.06);
    p.chain(fizz, high, fg).connect(p.out);
    const bubbles = 3 + Math.round(3 * s.size);
    for (let i = 0; i < bubbles; i++) {
      const from = rand(p, 480, 1300) * s.k;
      end = Math.max(end, blip(p, t + rand(p, 0.06, 0.42), from, from * 1.9, 0.07, rand(p, 0.12, 0.25)));
    }
    return { end: Math.max(end, t + 0.5), room: 0.1 };
  },

  /** A star is won: four notes climbing the scale, glass underneath and a chime on top. */
  star(p, s) {
    let end = s.t;
    for (let i = 0; i < 4; i++) {
      const midi = scaleNote(TONIC, 2 + s.step + i);
      const t = s.t + i * 0.062;
      end = Math.max(end, ringing(p, 'glass', t, midi, 0.62 - 0.05 * i), ringing(p, 'chime', t, midi + 12, 0.34));
    }
    return { end, room: 0.4 };
  },

  /** A handful of tiny bells high up, here and there. */
  twinkle(p, s) {
    let end = s.t;
    const count = 4 + Math.round(2 * s.size);
    for (let i = 0; i < count; i++) {
      const midi = scaleNote(TONIC + 12, 2 + s.step + Math.floor(rand(p, 0, 8)));
      end = Math.max(end, ringing(p, 'chime', s.t + rand(p, 0, 0.5), midi, rand(p, 0.25, 0.5)));
    }
    return { end, room: 0.45 };
  },

  /** Something building: a shimmer that opens and rises and then lets go. */
  swell(p, s) {
    const t = s.t;
    const dur = 0.8 + 0.8 * s.size;
    const stop = t + dur + 0.1;
    const low = p.filter('lowpass', 250, 1);
    low.frequency.setValueAtTime(250, t);
    low.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.85);
    const g = p.gain(0);
    // It builds all the way and falls away fast, like a breath let out.
    g.gain.setValueCurveAtTime(
      Float32Array.from({ length: 40 }, (_, i) => 0.13 * (i < 34 ? (i / 33) ** 2 : Math.max(0, 1 - (i - 33) / 6))),
      t,
      dur,
    );
    g.gain.setValueAtTime(0, t + dur + 0.002);
    for (const [hz, detune] of [
      [261.63, 0],
      [261.63, 5],
      [392, 0],
      [392, -4],
      [523.25, 3],
    ] as const) {
      const o = p.osc('sawtooth', hz * s.k, t, stop);
      o.detune.value = detune;
      const level = p.gain(hz > 500 ? 0.12 : 0.22);
      p.chain(o, level).connect(low);
    }
    p.chain(low, g).connect(p.out);
    const air = p.hiss(t, stop);
    const high = p.filter('highpass', 3500, 0.7);
    const ag = p.gain(0);
    ag.gain.setValueCurveAtTime(
      Float32Array.from({ length: 40 }, (_, i) => 0.05 * (i < 34 ? (i / 33) ** 2.4 : Math.max(0, 1 - (i - 33) / 6))),
      t,
      dur,
    );
    ag.gain.setValueAtTime(0, t + dur + 0.002);
    p.chain(air, high, ag).connect(p.out);
    return { end: stop, room: 0.3 };
  },

  /** A light touch. */
  tap(p, s) {
    const end = blip(p, s.t, 920 * s.k, 700 * s.k, 0.045, 0.24, 0.001);
    return { end, room: 0.04 };
  },

  /** A crowd: an open "aah" that swells, with bells over it. */
  cheer(p, s) {
    const t = s.t;
    const dur = 0.9 + 0.5 * s.size;
    const stop = t + dur + 0.1;
    const mouth = p.gain(0);
    hill(mouth.gain, t, dur, 0.5);
    // Three formants of an open vowel that closes a little toward the end, which is what makes it a
    // voice and not a hiss.
    const formants: readonly (readonly [from: number, to: number, q: number, level: number])[] = [
      [650, 900, 7, 1],
      [1150, 1350, 9, 0.6],
      [2600, 2500, 11, 0.25],
    ];
    const voices = p.gain(0.5);
    const air = p.hiss(t, stop);
    const sing = p.gain(0.5);
    p.chain(air, sing);
    for (const hz of [196, 197.5, 261.63, 263]) {
      const o = p.osc('sawtooth', hz * s.k, t, stop);
      o.frequency.setValueAtTime(hz * s.k * 0.97, t);
      o.frequency.linearRampToValueAtTime(hz * s.k * 1.02, t + 0.2);
      const part = p.gain(0.25);
      p.chain(o, part).connect(voices);
    }
    for (const [from, to, q, level] of formants) {
      const band = p.filter('bandpass', from, q);
      band.frequency.setValueAtTime(from, t);
      band.frequency.linearRampToValueAtTime(to, t + dur);
      const part = p.gain(level);
      voices.connect(band);
      sing.connect(band);
      p.chain(band, part).connect(mouth);
    }
    mouth.connect(p.out);
    let end = stop;
    for (let i = 0; i < 4; i++)
      end = Math.max(end, ringing(p, 'chime', t + 0.04 + i * 0.09, scaleNote(TONIC + 12, 2 + i * 2), 0.3));
    return { end, room: 0.35 };
  },

  /** A machine turning: a ratchet and a motor that climbs. */
  gear(p, s) {
    const t = s.t;
    const dur = 0.55;
    const stop = t + dur + 0.05;
    const motor = p.osc('sawtooth', 62 * s.k, t, stop);
    const low = p.filter('lowpass', 520, 1);
    const click = p.gain(0.5);
    const ratchet = p.osc('square', 16, t, stop);
    const lean = p.gain(0.5);
    p.chain(ratchet, lean).connect(click.gain);
    const g = p.gain(0);
    hill(g.gain, t, dur, 0.3);
    p.chain(motor, low, click, g).connect(p.out);
    const whine = p.osc('sine', 110 * s.k, t, stop);
    glide(whine.frequency, 110 * s.k, 175 * s.k, t, dur);
    const wg = p.gain(0);
    hill(wg.gain, t, dur, 0.08);
    p.chain(whine, wg).connect(p.out);
    return { end: stop, room: 0.04 };
  },

  /** One clear bell. */
  ding(p, s) {
    const midi = scaleNote(TONIC, 5 + s.step);
    return { end: ringing(p, 'glass', s.t, midi, 0.7), room: 0.4 };
  },

  /** A puff of smoke and a change. */
  poof(p, s) {
    const t = s.t;
    const stop = t + 0.3;
    const h = p.hiss(t, stop);
    const low = p.filter('lowpass', 1400 * s.k, 0.7);
    low.frequency.setValueAtTime(1400 * s.k, t);
    low.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const g = p.gain(0);
    strike(g.gain, t, 0.4, 0.004, 0.25);
    p.chain(h, low, g).connect(p.out);
    const end = blip(p, t + 0.02, 400 * s.k, 900 * s.k, 0.12, 0.1);
    return { end: Math.max(end, stop), room: 0.1 };
  },

  /** A slide whistle going up. */
  whistle(p, s) {
    const t = s.t;
    const dur = 0.4;
    const stop = t + dur + 0.1;
    const o = p.osc('sine', 520 * s.k, t, stop);
    glide(o.frequency, 520 * s.k, 1560 * s.k, t, dur);
    const vibrato = p.osc('sine', 6, t, stop);
    const depth = p.gain(12);
    p.chain(vibrato, depth).connect(o.frequency);
    const g = p.gain(0);
    hold(g.gain, t, 0.03, dur, 0.08, 0.3);
    p.chain(o, g).connect(p.out);
    const second = p.osc('sine', 1040 * s.k, t, stop);
    glide(second.frequency, 1040 * s.k, 3120 * s.k, t, dur);
    const sg = p.gain(0);
    hold(sg.gain, t, 0.03, dur, 0.08, 0.04);
    p.chain(second, sg).connect(p.out);
    return { end: stop, room: 0.12 };
  },

  /** Something big and far away, felt more than heard. */
  rumble(p, s) {
    const t = s.t;
    const dur = 0.9 + 0.4 * s.size;
    const stop = t + dur + 0.05;
    const h = p.hiss(t, stop);
    const low = p.filter('lowpass', 140 * s.k, 0.7);
    const shake = p.gain(0.6);
    const lfo = p.osc('sine', 8, t, stop);
    const depth = p.gain(0.4);
    p.chain(lfo, depth).connect(shake.gain);
    const g = p.gain(0);
    hill(g.gain, t, dur, 0.55);
    p.chain(h, low, shake, g).connect(p.out);
    const hum = p.osc('sine', 48 * s.k, t, stop);
    const hg = p.gain(0);
    hill(hg.gain, t, dur, 0.25);
    p.chain(hum, hg).connect(p.out);
    return { end: stop, room: 0.03 };
  },

  /** Wind going by. */
  wind(p, s) {
    const t = s.t;
    const dur = 1.4;
    const stop = t + dur + 0.05;
    const h = p.hiss(t, stop);
    const band = p.filter('bandpass', 600 * s.k, 1.2);
    const sway = p.osc('sine', 0.9, t, stop);
    const depth = p.gain(260 * s.k);
    p.chain(sway, depth).connect(band.frequency);
    const g = p.gain(0);
    hill(g.gain, t, dur, 0.22);
    p.chain(h, band, g).connect(p.out);
    return { end: stop, room: 0.1 };
  },

  /** Two bright pings, the second held. */
  coin(p, s) {
    const a = scaleNote(TONIC, 3 + s.step);
    const b = scaleNote(TONIC, 6 + s.step);
    const first = ringing(p, 'chime', s.t, a, 0.55);
    const second = ringing(p, 'glass', s.t + 0.07, b, 0.55);
    return { end: Math.max(first, second), room: 0.25 };
  },

  /** A soft landing. */
  thud(p, s) {
    const t = s.t;
    const stop = t + 0.4;
    const o = p.osc('sine', 110 * s.k, t, stop);
    glide(o.frequency, 110 * s.k, 52, t, 0.12);
    const g = p.gain(0);
    strike(g.gain, t, 0.55, 0.002, 0.28);
    p.chain(o, g).connect(p.out);
    puff(p, t, 'lowpass', 420, 0.8, 0.22, 0.001, 0.02);
    return { end: stop, room: 0.03 };
  },
};
