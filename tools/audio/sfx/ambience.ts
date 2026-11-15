/**
 * Ambient loops. Each is a bed of filtered noise that repeats without a seam, with sparse events
 * (birds, chimes, droplets, creaks) laid over it. Beds are decorrelated between the ears for width.
 * Events that run past the end fold back onto the start, so the loop point cannot be heard.
 */
import { LOOPS } from '../../../src/shared/audio';
import {
  addStereo,
  filter,
  midiHz,
  pinkNoise,
  type Rand,
  rand,
  SR,
  type Stereo,
  samples,
  seedOf,
  stereoOf,
  TAU,
  whiteNoise,
} from '../dsp';
import { integratedLoudness } from '../loudness';
import { Song, setLevel } from '../song';
import { nicker } from './creatures';
import { creak, ding, glide, layer, plink, seamless, wander } from './kit';
import { hayRustle } from './movement';

const chirp = (from: number, to: number, seconds: number, harmonics: number[] = [1, 0.12]): Float32Array =>
  glide(from, to, seconds, { tau: seconds * 0.5, attack: 0.007, curve: 0.8, harmonics });

/** A run of short phrases that wander up and down, like a robin. */
export function robin(r: Rand): Float32Array {
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  let at = 0;
  let hz = r.range(2600, 3600);
  for (let i = 0, n = r.int(4, 7); i < n; i++) {
    const next = Math.min(4300, Math.max(2200, hz * r.range(0.78, 1.3)));
    const seconds = r.range(0.045, 0.09);
    parts.push({ buf: chirp(hz, next, seconds), at, gain: r.range(0.6, 1) });
    at += seconds + r.range(0.03, 0.09);
    hz = next;
  }
  return layer(parts);
}

/** Two or three quick rising notes, like a finch. */
export function finch(r: Rand): Float32Array {
  const base = r.range(2900, 3500);
  const count = r.int(2, 3);
  return layer(
    Array.from({ length: count }, (_, i) => ({
      buf: chirp(base * (1 + i * 0.05), base * 1.35, 0.075),
      at: i * 0.115,
      gain: 1 - i * 0.12,
    })),
  );
}

/** A fast trill alternating between two notes, like a wren. */
export function wren(r: Rand): Float32Array {
  const a = r.range(3400, 3900);
  const b = a * r.range(1.12, 1.25);
  const count = r.int(11, 17);
  return layer(
    Array.from({ length: count }, (_, i) => ({
      buf: chirp(i % 2 ? b : a, i % 2 ? a : b, 0.022),
      at: i * 0.03,
      gain: 0.5 + 0.5 * Math.sin((Math.PI * i) / count),
    })),
  );
}

/** A soft three-part coo from a dove, low and round. */
export function dove(r: Rand): Float32Array {
  const hz = r.range(430, 520);
  const coo = (from: number, to: number, seconds: number): Float32Array => {
    const out = glide(from, to, seconds, { tau: 10, attack: 0.08, harmonics: [1, 0.4, 0.14], vibrato: [6, 0.015] });
    for (let i = 0; i < out.length; i++) out[i] = out[i]! * Math.sin(Math.PI * (i / out.length)) ** 0.8;
    return filter(out, 'lowpass', 1600, 0.7);
  };
  return layer([
    { buf: coo(hz * 0.92, hz * 0.96, 0.26), at: 0, gain: 0.8 },
    { buf: coo(hz * 1.06, hz * 1.0, 0.36), at: 0.32, gain: 1 },
    { buf: coo(hz * 0.98, hz * 0.88, 0.3), at: 0.74, gain: 0.8 },
  ]);
}

const WARM = samples(0.6);
const OVERLAP = samples(2.5);

/**
 * Builds a looping noise bed for both ears. `build` gets the random stream, the total sample count
 * to fill, and the sample at which the loop starts, so periodic modulation can be written as a
 * function of `(i - start) / loop`.
 */
export function bed(
  seconds: number,
  name: string,
  build: (r: Rand, total: number, start: number, loop: number) => Float32Array,
): Stereo {
  const loop = samples(seconds);
  const channel = (tag: string): Float32Array =>
    seamless(build(rand(seedOf(`${name}-${tag}`)), WARM + loop + OVERLAP, WARM, loop).slice(WARM), loop);
  return { l: channel('l'), r: channel('r') };
}

/** Whole numbers of slow cycles per loop, so any modulation lines up at the join. */
export function breathe(
  i: number,
  start: number,
  loop: number,
  cycles: number[],
  depths: number[],
  phases: number[],
): number {
  let v = 1;
  for (let k = 0; k < cycles.length; k++)
    v += depths[k]! * Math.sin((TAU * cycles[k]! * (i - start)) / loop + phases[k]!);
  return Math.max(0, v);
}

export const times = (buf: Float32Array, f: (i: number) => number): Float32Array => {
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * f(i);
  return buf;
};

/** Mixes a bed and an event track, then sets the loudness. */
export function finish(bedBus: Stereo, events: Stereo, eventGain: number, target: number): Stereo {
  const out = stereoOf(bedBus.l.length);
  addStereo(out, bedBus, 1);
  addStereo(out, events, eventGain);
  setLevel(out, integratedLoudness(out), target);
  return out;
}

/** Wind moving through leaves, with birds and far-off chimes. */
export function forestAmbience(): Stereo {
  const seconds = 24;
  const wind = bed(seconds, 'forest-wind', (r, total, start, loop) => {
    const body = filter(
      pinkNoise(total, r),
      'bandpass',
      (t) => 850 + 380 * Math.sin((TAU * 2 * (t * SR - start)) / loop),
      0.45,
    );
    times(body, (i) => breathe(i, start, loop, [3, 5, 7], [0.32, 0.18, 0.1], [0.4, 1.9, 4.1]));
    const leaves = filter(whiteNoise(total, r), 'highpass', 4200, 0.7);
    const gust = wander(total, r, 1.1, 1.0);
    times(leaves, (i) => gust[i]! ** 2 * 0.1 * breathe(i, start, loop, [2, 4], [0.4, 0.2], [0.9, 3.2]));
    for (let i = 0; i < total; i++) body[i] = body[i]! + leaves[i]!;
    return body;
  });
  const s = new Song(60, 4, 6, seedOf('forest-ambience'));
  const r = s.r;
  const birds = [robin, finch, wren, dove, robin, finch, robin, dove, wren, finch];
  birds.forEach((make, i) => {
    const at = (i + r.range(0.1, 0.9)) * (seconds / birds.length);
    const far = r.range(0.25, 0.7);
    s.put(filter(make(r), 'lowpass', 7000 - far * 3500, 0.6), at, {
      pan: r.range(-0.9, 0.9),
      send: 0.2 + far * 0.4,
      gain: 0.5 * (1.1 - far * 0.6),
    });
  });
  [84, 91, 88].forEach((m, i) => {
    s.put(ding('chime', midiHz(m), 0.28, r, 3), 3 + i * 7.3 + r.range(-0.5, 0.5), {
      pan: r.range(-0.6, 0.6),
      send: 0.8,
      gain: 0.5,
    });
  });
  const events = s.render({ size: 0.7, damping: 0.5, preDelay: 0.02 }, 0.9, { low: -6, presence: 0 });
  return finish(wind, events, 1.0, LOOPS['ambience-forest'].lufs);
}

/** A fountain, a light breeze, a few birds, and bells across the grounds. */
export function gardenAmbience(): Stereo {
  const seconds = 24;
  const water = bed(seconds, 'garden-water', (r, total, start, loop) => {
    const hiss = filter(filter(whiteNoise(total, r), 'highpass', 1100, 0.7), 'lowpass', 7500, 0.7);
    const flutter = wander(total, r, 16, 0.45);
    times(hiss, (i) => flutter[i]! * 0.22 * breathe(i, start, loop, [3, 8], [0.12, 0.06], [1.1, 2.7]));
    const body = filter(pinkNoise(total, r), 'bandpass', 520, 0.7);
    times(body, (i) => 0.5 * breathe(i, start, loop, [4], [0.1], [0.6]));
    const breeze = filter(
      pinkNoise(total, r),
      'bandpass',
      (t) => 1000 + 260 * Math.sin((TAU * 3 * (t * SR - start)) / loop),
      0.4,
    );
    times(breeze, (i) => 0.28 * breathe(i, start, loop, [2, 5], [0.35, 0.15], [2.2, 0.3]));
    for (let i = 0; i < total; i++) hiss[i] = hiss[i]! + body[i]! + breeze[i]!;
    return hiss;
  });
  const s = new Song(60, 4, 6, seedOf('garden-ambience'));
  const r = s.r;
  for (let i = 0; i < 34; i++)
    s.put(plink(r.range(900, 2600), r), r.range(0, seconds), {
      pan: r.range(-0.4, 0.4),
      send: 0.12,
      gain: r.range(0.05, 0.14),
    });
  const birds = [finch, robin, dove, finch, robin, finch];
  birds.forEach((make, i) => {
    const far = r.range(0.2, 0.7);
    s.put(filter(make(r), 'lowpass', 7000 - far * 3500, 0.6), (i + r.range(0.1, 0.9)) * (seconds / birds.length), {
      pan: r.range(-0.9, 0.9),
      send: 0.2 + far * 0.4,
      gain: 0.5 * (1.1 - far * 0.6),
    });
  });
  [79, 86, 83].forEach((m, i) => {
    s.put(ding('chime', midiHz(m + 12), 0.26, r, 3), 2 + i * 7.9 + r.range(-0.5, 0.5), {
      pan: r.range(-0.6, 0.6),
      send: 0.85,
      gain: 0.5,
    });
  });
  const events = s.render({ size: 0.72, damping: 0.45, preDelay: 0.02 }, 0.9, { low: -6, presence: 0 });
  return finish(water, events, 1.0, LOOPS['ambience-garden'].lufs);
}

/** The treasure house: a warm low hum and faint sparkles. */
export function treasureRoomAmbience(): Stereo {
  const seconds = 16;
  const hum = bed(seconds, 'treasure-hum', (r, total, start, loop) => {
    const out = filter(pinkNoise(total, r), 'lowpass', 520, 0.6);
    times(out, (i) => 0.5 * breathe(i, start, loop, [2, 3], [0.25, 0.1], [0.2, 1.4]));
    for (let i = 0; i < total; i++) {
      const t = (i - start) / SR;
      out[i] =
        out[i]! +
        0.07 * Math.sin(TAU * 110 * t) +
        0.05 * Math.sin(TAU * 165.0625 * t) * (0.7 + 0.3 * Math.sin((TAU * 2 * (i - start)) / loop));
    }
    return out;
  });
  const s = new Song(60, 4, 4, seedOf('treasure-ambience'));
  const r = s.r;
  for (let i = 0; i < 8; i++)
    s.put(
      ding(
        r.chance(0.5) ? 'glass' : 'glock',
        midiHz(r.pick([91, 93, 95, 98, 100, 103]) - 12),
        r.range(0.1, 0.22),
        r,
        1.2,
      ),
      (i + r.range(0, 0.8)) * 2,
      { pan: r.range(-0.8, 0.8), send: 0.6, gain: 0.7 },
    );
  const events = s.render({ size: 0.4, damping: 0.5, preDelay: 0.01 }, 0.8, { low: -4, presence: 0 });
  return finish(hum, events, 1.0, LOOPS['ambience-treasure-room'].lufs);
}

/** The stable: warm room tone, straw, the occasional creak of timber, and the world outside. */
export function stableRoomAmbience(): Stereo {
  const seconds = 16;
  const tone = bed(seconds, 'stable-tone', (r, total, start, loop) => {
    const out = filter(pinkNoise(total, r), 'lowpass', 650, 0.6);
    times(out, (i) => 0.55 * breathe(i, start, loop, [2, 5], [0.2, 0.1], [0.5, 2.4]));
    const air = filter(whiteNoise(total, r), 'bandpass', 2400, 0.5);
    const g = wander(total, r, 0.8, 1);
    times(air, (i) => 0.03 * g[i]! ** 2);
    for (let i = 0; i < total; i++) out[i] = out[i]! + air[i]!;
    return out;
  });
  const s = new Song(60, 4, 4, seedOf('stable-ambience'));
  const r = s.r;
  for (let i = 0; i < 4; i++)
    s.put(hayRustle(i % 3), 1 + i * 3.7 + r.range(0, 1.2), { pan: r.range(-0.8, 0.8), send: 0.25, gain: 0.07 });
  for (let i = 0; i < 2; i++) {
    s.put(filter(creak(0.5, r, { rate: [38, 62], pitch: [520, 900] }), 'lowpass', 2600, 0.7), 3.5 + i * 7.1, {
      pan: r.range(-0.5, 0.5),
      send: 0.4,
      gain: 0.09,
    });
  }
  s.put(filter(nicker('river'), 'lowpass', 1500, 0.7), 9.3, { pan: 0.5, send: 0.55, gain: 0.07 });
  s.put(filter(finch(r), 'lowpass', 3200, 0.7), 5.2, { pan: -0.7, send: 0.5, gain: 0.12 });
  s.put(filter(robin(r), 'lowpass', 3000, 0.7), 12.6, { pan: 0.8, send: 0.5, gain: 0.1 });
  const events = s.render({ size: 0.45, damping: 0.55, preDelay: 0.012 }, 0.7, { low: -4, presence: 0 });
  return finish(tone, events, 1.0, LOOPS['ambience-stable-room'].lufs);
}
