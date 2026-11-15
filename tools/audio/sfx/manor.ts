/**
 * The Spooky Manor: the sounds of the word being accepted and of the lift, and three ambient loops.
 * Outside it is spooky and cute (a low wind, a friendly owl, a creaking gate, tiny wisps singing).
 * The hall is elegant, with a slow clock and a harp. The sky garden is a warm night, with crickets
 * and a fountain. Nothing in it is loud or sudden.
 */
import { LOOPS } from '../../../src/shared/audio';
import { filter, midiHz, pinkNoise, type Rand, rand, SR, type Stereo, seedOf, TAU, whiteNoise } from '../dsp';
import { Song } from '../song';
import { pad } from '../voices';
import { bed, breathe, finish, times } from './ambience';
import { burst, creak, ding, glide, layer, plink, wander } from './kit';

/** The lift arriving: a soft two-note bell, high then lower, with a warm pad under it. */
export function liftDing(): Float32Array {
  const r = rand(seedOf('lift-ding'));
  return layer([
    { buf: ding('chime', midiHz(88), 0.5, r, 1.5), at: 0, gain: 1 },
    { buf: ding('chime', midiHz(83), 0.42, r, 1.6), at: 0.42, gain: 0.85 },
    { buf: pad(midiHz(71), 1.6, 0.4, r, 0.2, 0.6, 1.4), at: 0.05, gain: 0.35 },
  ]);
}

/** The word was right: a tiny latch, then a rising run of bells that ends on a bright held note. */
export function codeSuccess(): Float32Array {
  const r = rand(seedOf('code-success'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    { buf: burst(0.025, r, { kind: 'bandpass', hz: 2200, q: 1.4 }, { tau: 0.005 }), at: 0, gain: 0.5 },
    { buf: glide(150, 95, 0.12, { tau: 0.035 }), at: 0.01, gain: 0.45 },
  ];
  [72, 76, 79, 84, 88].forEach((m, i) => {
    parts.push({ buf: ding('celesta', midiHz(m), 0.5, r, 0.9), at: 0.16 + i * 0.09, gain: 0.8 + i * 0.05 });
  });
  parts.push({ buf: ding('chime', midiHz(91), 0.5, r, 1.4), at: 0.62, gain: 0.7 });
  parts.push({ buf: pad(midiHz(79), 1.1, 0.4, r, 0.2, 0.7, 1.4), at: 0.3, gain: 0.35 });
  return layer(parts);
}

/** A round, soft sound that swells and fades, as an owl's hoot or a wisp's song. */
const swell = (
  from: number,
  to: number,
  seconds: number,
  harmonics: number[],
  vibrato?: [number, number],
): Float32Array => {
  const out = glide(from, to, seconds, { tau: 100, attack: 0.002, harmonics, ...(vibrato ? { vibrato } : {}) });
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * Math.sin((Math.PI * i) / out.length) ** 0.9;
  return out;
};

/** A friendly owl: one long low hoot, then two short ones. */
function owl(r: Rand): Float32Array {
  const hz = r.range(330, 400);
  return filter(
    layer([
      { buf: swell(hz * 1.04, hz * 0.97, 0.38, [1, 0.35, 0.1]), at: 0, gain: 1 },
      { buf: swell(hz * 1.0, hz * 0.94, 0.17, [1, 0.35, 0.1]), at: 0.62, gain: 0.85 },
      { buf: swell(hz * 1.0, hz * 0.92, 0.22, [1, 0.35, 0.1]), at: 0.9, gain: 0.8 },
    ]),
    'lowpass',
    1300,
    0.7,
  );
}

/** A tiny wisp humming one slow note that wobbles, like a very small friendly ghost. */
const wisp = (hz: number): Float32Array =>
  filter(swell(hz, hz * 1.06, 2.2, [1, 0.28, 0.08], [5.2, 0.018]), 'lowpass', 2400, 0.7);

/** Three quick high flutters, a bat going by. */
function bat(r: Rand): Float32Array {
  const parts = Array.from({ length: r.int(3, 5) }, (_, i) => ({
    buf: glide(r.range(6200, 7600), r.range(4600, 5600), 0.018, { tau: 0.007, attack: 0.002 }),
    at: i * 0.045,
    gain: 0.7 - i * 0.08,
  }));
  return filter(layer(parts), 'lowpass', 7800, 0.7);
}

/** A cricket: short runs of fast pulses on one high note. */
function cricket(r: Rand, hz: number): Float32Array {
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  for (let chirp = 0; chirp < 3; chirp++) {
    for (let pulse = 0; pulse < 4; pulse++)
      parts.push({
        buf: glide(hz, hz, 0.012, { tau: 0.006, attack: 0.003 }),
        at: chirp * 0.22 + pulse * 0.028,
        gain: 0.55 + 0.1 * pulse + r.range(-0.05, 0.05),
      });
  }
  return layer(parts);
}

/**
 * Outside the manor at night: a low wind that sighs, an owl, a gate that creaks, wisps and bats.
 */
export function manorYardAmbience(): Stereo {
  const seconds = 24;
  const wind = bed(seconds, 'manor-yard-wind', (r, total, start, loop) => {
    const body = filter(
      pinkNoise(total, r),
      'bandpass',
      (t) => 420 + 260 * Math.sin((TAU * 2 * (t * SR - start)) / loop),
      0.5,
    );
    times(body, (i) => breathe(i, start, loop, [2, 3, 5], [0.38, 0.2, 0.1], [0.3, 2.1, 4.0]));
    const hiss = filter(whiteNoise(total, r), 'highpass', 3600, 0.7);
    const gust = wander(total, r, 0.7, 1);
    times(hiss, (i) => gust[i]! ** 2 * 0.05 * breathe(i, start, loop, [2], [0.5], [1.4]));
    for (let i = 0; i < total; i++) body[i] = body[i]! + hiss[i]!;
    return body;
  });
  const s = new Song(60, 4, 6, seedOf('manor-yard-ambience'));
  const r = s.r;
  s.put(owl(r), 5.5, { pan: -0.7, send: 0.6, gain: 0.55 });
  s.put(filter(owl(r), 'lowpass', 1000, 0.7), 17.2, { pan: 0.8, send: 0.7, gain: 0.35 });
  [3, 15].forEach((at, i) => {
    s.put(filter(creak(0.9, r, { rate: [28, 44], pitch: [380, 640] }), 'lowpass', 2000, 0.7), at + i * 0.5, {
      pan: 0.4,
      send: 0.4,
      gain: 0.1,
    });
  });
  [9.5, 21].forEach((at, i) => {
    s.put(wisp(midiHz(i ? 70 : 66)), at, { pan: i ? 0.5 : -0.5, send: 0.7, gain: 0.35 });
  });
  [1.5, 11.5, 13.4, 19.6].forEach((at) => {
    s.put(bat(r), at, { pan: r.range(-0.9, 0.9), send: 0.3, gain: 0.12 });
  });
  [60, 63, 67].forEach((m, i) => {
    s.put(ding('glass', midiHz(m + 24), 0.2, r, 1.6), 7.5 + i * 0.45, { pan: 0.2, send: 0.8, gain: 0.25 });
  });
  const events = s.render({ size: 0.75, damping: 0.5, preDelay: 0.02 }, 0.9, { low: -6, presence: 0 });
  return finish(wind, events, 1.0, LOOPS['ambience-manor-yard'].lufs);
}

/** The Wonder Gallery: a warm room, a slow clock, and a harp that wanders up a quiet scale. */
export function manorHallAmbience(): Stereo {
  const seconds = 16;
  const room = bed(seconds, 'manor-hall-room', (r, total, start, loop) => {
    const out = filter(pinkNoise(total, r), 'lowpass', 460, 0.6);
    times(out, (i) => 0.5 * breathe(i, start, loop, [2, 3], [0.2, 0.1], [0.7, 1.9]));
    for (let i = 0; i < total; i++) {
      const t = (i - start) / SR;
      out[i] = out[i]! + 0.06 * Math.sin(TAU * 98 * t) + 0.04 * Math.sin(TAU * 147 * t);
    }
    return out;
  });
  const s = new Song(60, 4, 4, seedOf('manor-hall-ambience'));
  const r = s.r;
  for (let sec = 0; sec < seconds; sec++)
    s.put(burst(0.02, r, { kind: 'bandpass', hz: sec % 2 ? 1500 : 1900, q: 1.6 }, { tau: 0.004 }), sec, {
      pan: -0.55,
      send: 0.15,
      gain: 0.1,
    });
  [64, 67, 71, 74, 76, 79, 76, 74].forEach((m, i) => {
    s.put(ding('celesta', midiHz(m), 0.2, r, 1.4), 1.5 + i * 1.7, { pan: r.range(-0.4, 0.4), send: 0.7, gain: 0.5 });
  });
  const events = s.render({ size: 0.6, damping: 0.5, preDelay: 0.015 }, 0.9, { low: -4, presence: 0 });
  return finish(room, events, 1.0, LOOPS['ambience-manor-hall'].lufs);
}

/**
 * The sky garden at night: crickets, a breath of wind, a fountain's drops and the odd far chime.
 */
export function skyGardenAmbience(): Stereo {
  const seconds = 16;
  const night = bed(seconds, 'sky-garden-night', (r, total, start, loop) => {
    const air = filter(pinkNoise(total, r), 'bandpass', 700, 0.5);
    times(air, (i) => 0.34 * breathe(i, start, loop, [2, 3], [0.3, 0.14], [1.2, 2.8]));
    const spray = filter(filter(whiteNoise(total, r), 'highpass', 1500, 0.7), 'lowpass', 6500, 0.7);
    const flutter = wander(total, r, 14, 0.5);
    times(spray, (i) => flutter[i]! * 0.07 * breathe(i, start, loop, [3], [0.12], [0.5]));
    for (let i = 0; i < total; i++) air[i] = air[i]! + spray[i]!;
    return air;
  });
  const s = new Song(60, 4, 4, seedOf('sky-garden-ambience'));
  const r = s.r;
  for (let i = 0; i < 22; i++)
    s.put(plink(r.range(1000, 2400), r), r.range(0, seconds), {
      pan: r.range(-0.3, 0.3),
      send: 0.2,
      gain: r.range(0.05, 0.12),
    });
  [0.4, 2.9, 5.8, 8.1, 10.6, 13.4].forEach((at, i) => {
    s.put(filter(cricket(r, i % 2 ? 4300 : 4700), 'highpass', 2500, 0.7), at, {
      pan: i % 2 ? 0.75 : -0.75,
      send: 0.25,
      gain: 0.07,
    });
  });
  [88, 91, 95].forEach((m, i) => {
    s.put(ding('chime', midiHz(m - 12), 0.22, r, 2.4), 2.5 + i * 4.6, {
      pan: r.range(-0.5, 0.5),
      send: 0.85,
      gain: 0.5,
    });
  });
  const events = s.render({ size: 0.7, damping: 0.45, preDelay: 0.02 }, 0.9, { low: -5, presence: 0 });
  return finish(night, events, 1.0, LOOPS['ambience-sky-garden'].lufs);
}
