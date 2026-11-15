/**
 * Building blocks for sound effects: glides, bubbles, bursts, sweeps. Each returns a mono buffer.
 * Shorter and sharper than the music's instruments, and all of them fade to nothing so they can be
 * cut without a click.
 */
import { clamp } from '../../../src/shared/math';
import { fadeEdges, filter, mixInto, pinkNoise, type Rand, SR, samples, TAU, whiteNoise } from '../dsp';
import { type BellKind, bell } from '../voices';

/** A sine that glides between two frequencies, with a fast-attack, exponential-decay envelope. */
export function glide(
  f0: number,
  f1: number,
  seconds: number,
  opts: { tau?: number; attack?: number; curve?: number; vibrato?: [number, number]; harmonics?: number[] } = {},
): Float32Array {
  const n = samples(seconds);
  const out = new Float32Array(n);
  const tau = opts.tau ?? seconds / 3;
  const attack = Math.max(1, Math.round((opts.attack ?? 0.004) * SR));
  const curve = opts.curve ?? 1;
  const harmonics = opts.harmonics ?? [1];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = (i / Math.max(1, n - 1)) ** curve;
    let f = f0 + (f1 - f0) * u;
    if (opts.vibrato) f *= 1 + opts.vibrato[1] * Math.sin(TAU * opts.vibrato[0] * t);
    phase += (TAU * f) / SR;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) s += Math.sin(phase * (h + 1)) * harmonics[h]!;
    const a = i < attack ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attack) : 1;
    out[i] = s * a * Math.exp(-t / tau);
  }
  fadeEdges(out, 0, Math.min(0.02, seconds * 0.2));
  return out;
}

/** A small round water bubble: a sine that rises as it fades. */
export function bubble(freq: number, seconds = 0.03): Float32Array {
  return glide(freq, freq * 1.7, seconds, { tau: seconds / 3, attack: 0.002, curve: 0.8 });
}

/** A burst of shaped noise. */
export function burst(
  seconds: number,
  r: Rand,
  band: { kind: 'lowpass' | 'highpass' | 'bandpass'; hz: number; q?: number },
  opts: { tau?: number; attack?: number; pink?: boolean } = {},
): Float32Array {
  const n = samples(seconds);
  const noise = opts.pink ? pinkNoise(n, r) : whiteNoise(n, r);
  const shaped = filter(noise, band.kind, band.hz, band.q ?? 0.8);
  const tau = opts.tau ?? seconds / 3;
  const attack = Math.max(1, Math.round((opts.attack ?? 0.002) * SR));
  for (let i = 0; i < n; i++) {
    const a = i < attack ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attack) : 1;
    shaped[i] = shaped[i]! * a * Math.exp(-i / SR / tau);
  }
  fadeEdges(shaped, 0, Math.min(0.02, seconds * 0.2));
  return shaped;
}

/**
 * Noise through a bandpass whose centre sweeps from one frequency to another, shaped by a swell.
 */
export function sweep(
  seconds: number,
  r: Rand,
  f0: number,
  f1: number,
  q: number,
  shape: (u: number) => number = (u) => Math.sin(Math.PI * u),
): Float32Array {
  const n = samples(seconds);
  const out = filter(pinkNoise(n, r), 'bandpass', (t) => f0 + (f1 - f0) * clamp(t / seconds, 0, 1), q);
  for (let i = 0; i < n; i++) out[i] = out[i]! * shape(i / n);
  fadeEdges(out, 0.004, 0.03);
  return out;
}

/** Sparse tiny clicks like fire or ice, from a seeded random density. */
export function crackle(seconds: number, perSecond: number, r: Rand, hz = 3500, loudness = 1): Float32Array {
  const out = new Float32Array(samples(seconds));
  const count = Math.round(seconds * perSecond);
  for (let i = 0; i < count; i++) {
    const at = Math.floor(r.next() * out.length * 0.97);
    const pop = burst(
      r.range(0.004, 0.014),
      r,
      { kind: 'bandpass', hz: hz * r.range(0.6, 1.5), q: 1.2 },
      { tau: 0.003 },
    );
    const gain = loudness * r.range(0.25, 1) * (1 - at / out.length / 2);
    mixInto(out, pop, at, gain);
  }
  return out;
}

/** A soft pitched drop of water in a basin: a bubble with a splash of noise. */
export function plink(freq: number, r: Rand): Float32Array {
  const out = new Float32Array(samples(0.12));
  mixInto(out, glide(freq, freq * 1.5, 0.06, { tau: 0.016, attack: 0.001 }), 0, 0.7);
  mixInto(out, burst(0.03, r, { kind: 'highpass', hz: 2500 }, { tau: 0.007 }), 0, 0.2);
  return out;
}

/**
 * Mixes several buffers into one, each at its own start time (seconds) and gain. Wraps nothing: the
 * result is as long as needed.
 */
export function layer(parts: { buf: Float32Array; at: number; gain?: number }[], minLength = 0): Float32Array {
  let end = minLength;
  for (const p of parts) end = Math.max(end, Math.round(p.at * SR) + p.buf.length);
  const out = new Float32Array(end);
  for (const p of parts) mixInto(out, p.buf, Math.round(p.at * SR), p.gain ?? 1);
  return out;
}

/**
 * Adds into a loop buffer, wrapping around the end so a sound that straddles the loop point
 * continues at the start.
 */
export function mixWrapped(dst: Float32Array, src: Float32Array, offset: number, gain = 1): void {
  const n = dst.length;
  for (let i = 0; i < src.length; i++) {
    const j = (((offset + i) % n) + n) % n;
    dst[j] = dst[j]! + src[i]! * gain;
  }
}

/**
 * A steady amplitude shape that repeats exactly over the loop: a sum of slow sines at whole numbers
 * of cycles.
 */
export function loopShape(n: number, cycles: number[], depths: number[], phases: number[]): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 1;
    for (let k = 0; k < cycles.length; k++) v += depths[k]! * Math.sin((TAU * cycles[k]! * i) / n + phases[k]!);
    out[i] = Math.max(0, v);
  }
  return out;
}

/**
 * Makes a steady noise texture repeat without a seam. The input runs `overlap` samples past the
 * loop length; those extra samples fade out while the first `overlap` samples fade in, with equal
 * power so the level does not dip at the join.
 */
export function seamless(x: Float32Array, length: number): Float32Array {
  const overlap = x.length - length;
  const out = x.slice(0, length);
  for (let i = 0; i < overlap; i++) {
    const a = (Math.PI / 2) * (i / overlap);
    out[i] = x[i]! * Math.sin(a) + x[length + i]! * Math.cos(a);
  }
  return out;
}

/**
 * A positive, slowly wandering gain from low-pass-filtered noise: `rate` is roughly how many
 * wobbles a second.
 */
export function wander(n: number, r: Rand, rate: number, depth: number): Float32Array {
  const raw = filter(whiteNoise(n, r), 'lowpass', rate, 0.6);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(raw[i]!));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, 1 + (depth * raw[i]!) / peak);
  return out;
}

/**
 * How long the first partial of each struck instrument rings in `bell`, which was tuned for music.
 */
const FIRST_RING: Record<BellKind, number> = {
  celesta: 2.4,
  glock: 2.8,
  chime: 4.6,
  marimba: 0.9,
  kalimba: 1.6,
  glass: 3.6,
};

/** A struck bell that rings for about `ring` seconds, short enough for a sound effect. */
export function ding(kind: BellKind, freq: number, vel: number, r: Rand, ring: number): Float32Array {
  return bell(kind, freq, vel, r, ring / FIRST_RING[kind]);
}

/**
 * The squeak of a hinge or a timber: stick-slip friction is a train of tiny resonant pulses, and
 * the rate and pitch of the train drift while the thing moves. Slightly random timing keeps it from
 * sounding like a tone.
 */
export function creak(
  seconds: number,
  r: Rand,
  o: { rate: [number, number]; pitch: [number, number]; level?: number },
): Float32Array {
  const out = new Float32Array(samples(seconds));
  let t = 0;
  while (t < seconds - 0.01) {
    const u = t / seconds;
    const rate = (o.rate[0] + (o.rate[1] - o.rate[0]) * u) * (1 + 0.22 * r.range(-1, 1));
    const f = (o.pitch[0] + (o.pitch[1] - o.pitch[0]) * u) * (1 + 0.07 * r.range(-1, 1));
    const swell = Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.7;
    mixInto(
      out,
      glide(f, f * 0.96, 0.014, { tau: 0.0045, attack: 0.0006, harmonics: [1, 0.45, 0.2] }),
      Math.round(t * SR),
      (o.level ?? 1) * swell * r.range(0.45, 1),
    );
    t += 1 / rate;
  }
  return out;
}
