/**
 * Signal-processing basics for the sound lever: buffers, a seeded random source, filters, a reverb,
 * mixing and loudness helpers. Everything is plain Float32Array maths so a sound is a pure function
 * of its code and a seed.
 */

import { clamp } from '../../src/shared/math';

export const SR = 44100;

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
}

export const samples = (seconds: number): number => Math.round(seconds * SR);
export const silence = (n: number): Float32Array => new Float32Array(n);
export const stereoOf = (n: number): Stereo => ({ l: new Float32Array(n), r: new Float32Array(n) });
export const dbToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(g, 1e-9));
export const TAU = Math.PI * 2;

export interface Rand {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
  gauss(): number;
  chance(p: number): boolean;
}

/** Mulberry32 with a few conveniences. The same seed always gives the same sounds. */
export function rand(seed: number): Rand {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    gauss: () => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: the sounds already shipped were rendered with this value
      return (s - 3) / 0.7071;
    },
    chance: (p) => next() < p,
  };
}

/** A seed from a name, so each sound gets its own stable noise. */
export function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C4' is 60, 'F#3' is 54, 'Bb4' is 70. */
export function note(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export function whiteNoise(n: number, r: Rand): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r.next() * 2 - 1;
  return out;
}

/** Paul Kellet's pink-noise filter. */
export function pinkNoise(n: number, r: Rand): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r.next() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

export type FilterKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peak' | 'lowshelf' | 'highshelf';

interface Coef {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Robert Bristow-Johnson's cookbook biquads. `gainDb` matters only for peak and shelf filters. */
export function coefficients(kind: FilterKind, freq: number, q: number, gainDb = 0): Coef {
  const f = clamp(freq, 10, SR * 0.49);
  const w0 = (TAU * f) / SR;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Math.max(q, 0.05));
  const A = 10 ** (gainDb / 40);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;
  switch (kind) {
    case 'lowpass':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'peak':
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - s);
      a0 = A + 1 + (A - 1) * cos + s;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - s);
      a0 = A + 1 - (A - 1) * cos + s;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - s;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

// biome-ignore lint/suspicious/noApproximativeNumericConstant: the sounds already shipped were rendered with this value, not 1/sqrt(2)
const BUTTERWORTH_Q = 0.707;

/** Filters a buffer. The cutoff may change over time, as `(t seconds) => Hz`, for sweeps. */
export function filter(
  input: Float32Array,
  kind: FilterKind,
  freq: number | ((t: number) => number),
  q = BUTTERWORTH_Q,
  gainDb = 0,
): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const fixed = typeof freq === 'number' ? coefficients(kind, freq, q, gainDb) : null;
  const STEP = 16;
  let c = fixed ?? coefficients(kind, (freq as (t: number) => number)(0), q, gainDb);
  for (let i = 0; i < input.length; i++) {
    if (!fixed && i % STEP === 0) c = coefficients(kind, (freq as (t: number) => number)(i / SR), q, gainDb);
    const x = input[i]!;
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** Two cascaded biquads, a steeper 24 dB per octave slope. */
export function filter4(
  input: Float32Array,
  kind: 'lowpass' | 'highpass',
  freq: number | ((t: number) => number),
  q = BUTTERWORTH_Q,
): Float32Array {
  return filter(filter(input, kind, freq, q), kind, freq, q);
}

export function onePoleLow(input: Float32Array, hz: number): Float32Array {
  const out = new Float32Array(input.length);
  const a = 1 - Math.exp((-TAU * hz) / SR);
  let y = 0;
  for (let i = 0; i < input.length; i++) {
    y += a * (input[i]! - y);
    out[i] = y;
  }
  return out;
}

export function dcBlock(input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!;
    y1 = x - x1 + 0.995 * y1;
    x1 = x;
    out[i] = y1;
  }
  return out;
}

/** Fades the first and last samples to silence, so a cut never clicks. */
export function fadeEdges(buf: Float32Array, inSeconds: number, outSeconds: number): void {
  const a = Math.min(buf.length, samples(inSeconds));
  const b = Math.min(buf.length, samples(outSeconds));
  for (let i = 0; i < a; i++) buf[i] = buf[i]! * (0.5 - 0.5 * Math.cos((Math.PI * i) / a));
  for (let i = 0; i < b; i++)
    buf[buf.length - 1 - i] = buf[buf.length - 1 - i]! * (0.5 - 0.5 * Math.cos((Math.PI * i) / b));
}

export function scale(buf: Float32Array, gain: number): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * gain;
  return buf;
}

/** A smooth saturator. It rounds peaks instead of clipping them flat. */
export function softClip(buf: Float32Array, drive = 1): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i]! * drive) / Math.tanh(drive);
  return buf;
}

export const peakOf = (buf: Float32Array): number => {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]!));
  return p;
};

export const peakOfStereo = (s: Stereo): number => Math.max(peakOf(s.l), peakOf(s.r));

export function rmsOf(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / Math.max(1, buf.length));
}

/** Adds `src` into `dst` starting at a sample offset. Anything past the end of `dst` is dropped. */
export function mixInto(dst: Float32Array, src: Float32Array, offset: number, gain = 1): void {
  const start = Math.max(0, offset);
  const end = Math.min(dst.length, offset + src.length);
  for (let i = start; i < end; i++) dst[i] = dst[i]! + src[i - offset]! * gain;
}

/**
 * Places a mono sound in a stereo bus. `pan` runs from -1 (left) to 1 (right), with constant power.
 */
export function mixPanned(bus: Stereo, src: Float32Array, offset: number, gain: number, pan: number): void {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  mixInto(bus.l, src, offset, gain * Math.cos(a) * Math.SQRT2);
  mixInto(bus.r, src, offset, gain * Math.sin(a) * Math.SQRT2);
}

export function addStereo(dst: Stereo, src: Stereo, gain = 1, offset = 0): void {
  mixInto(dst.l, src.l, offset, gain);
  mixInto(dst.r, src.r, offset, gain);
}

export function monoToStereo(m: Float32Array): Stereo {
  return { l: Float32Array.from(m), r: Float32Array.from(m) };
}

export function mixDown(s: Stereo): Float32Array {
  const out = new Float32Array(s.l.length);
  for (let i = 0; i < out.length; i++) out[i] = (s.l[i]! + s.r[i]!) * 0.5;
  return out;
}

/** A feedback delay with a darkened repeat. */
export function delay(input: Float32Array, seconds: number, feedback: number, damp = 4000, tail = 0): Float32Array {
  const d = Math.max(1, samples(seconds));
  const out = new Float32Array(input.length + tail);
  const lowCoef = 1 - Math.exp((-TAU * damp) / SR);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const dry = i < input.length ? input[i]! : 0;
    const echoed = i >= d ? out[i - d]! : 0;
    lp += lowCoef * (echoed - lp);
    out[i] = dry + lp * feedback;
  }
  return out;
}

export interface ReverbSettings {
  /** Roughly the size of the room, 0 to 1. Longer tails come from larger rooms. */
  size: number;
  /** How quickly high frequencies die in the tail, 0 to 1. */
  damping: number;
  /** Silence before the first reflections, in seconds. */
  preDelay?: number;
  /** Stereo spread of the tail, 0 to 1. */
  width?: number;
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const SPREAD = 23;

/**
 * A Schroeder-Moorer reverb in the Freeverb arrangement: eight damped feedback combs in parallel
 * and four allpasses in series, per channel, with the right channel's delays nudged so the tail is
 * wide. Returns only the wet signal.
 */
export function reverb(input: Stereo, settings: ReverbSettings): Stereo {
  const n = input.l.length;
  const stretch = 0.9 + settings.size * 1.4;
  const feedback = 0.74 + settings.size * 0.2;
  const damp = clamp(settings.damping, 0, 0.95);
  const pre = samples(settings.preDelay ?? 0.02);
  const width = settings.width ?? 1;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (input.l[i]! + input.r[i]!) * 0.015;
  const channel = (spread: number): Float32Array => {
    const out = new Float32Array(n);
    const combs = COMBS.map((len) => {
      const size = Math.round((len + spread) * stretch);
      return { buf: new Float32Array(size), pos: 0, store: 0 };
    });
    const alls = ALLPASSES.map((len) => ({ buf: new Float32Array(Math.round((len + spread) * stretch)), pos: 0 }));
    for (let i = 0; i < n; i++) {
      const x = i >= pre ? mono[i - pre]! : 0;
      let sum = 0;
      for (const c of combs) {
        const y = c.buf[c.pos]!;
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.pos] = x + c.store * feedback;
        c.pos = c.pos + 1 === c.buf.length ? 0 : c.pos + 1;
        sum += y;
      }
      for (const a of alls) {
        const buffered = a.buf[a.pos]!;
        const y = buffered - sum;
        a.buf[a.pos] = sum + buffered * 0.5;
        a.pos = a.pos + 1 === a.buf.length ? 0 : a.pos + 1;
        sum = y;
      }
      out[i] = sum;
    }
    return out;
  };
  const l = channel(0);
  const r = channel(SPREAD);
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mid[i] = (l[i]! + r[i]!) * 0.5;
    side[i] = (l[i]! - r[i]!) * 0.5 * width;
  }
  const wet = stereoOf(n);
  for (let i = 0; i < n; i++) {
    wet.l[i] = mid[i]! + side[i]!;
    wet.r[i] = mid[i]! - side[i]!;
  }
  return wet;
}

/**
 * A slow, shallow pitch-modulated copy of the signal to each side, which makes a bus sound wider
 * and warmer.
 */
export function chorus(input: Stereo, rate = 0.35, depthMs = 5, mix = 0.35): Stereo {
  const n = input.l.length;
  const out = stereoOf(n);
  const base = samples(0.014);
  const depth = (depthMs / 1000) * SR;
  const read = (buf: Float32Array, pos: number): number => {
    const i = Math.floor(pos);
    const f = pos - i;
    const a = i >= 0 && i < n ? buf[i]! : 0;
    const b = i + 1 >= 0 && i + 1 < n ? buf[i + 1]! : 0;
    return a + (b - a) * f;
  };
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ml = Math.sin(TAU * rate * t);
    const mr = Math.sin(TAU * rate * t + 2.1);
    out.l[i] = input.l[i]! * (1 - mix * 0.5) + read(input.r, i - base - depth * (0.5 + 0.5 * ml)) * mix;
    out.r[i] = input.r[i]! * (1 - mix * 0.5) + read(input.l, i - base - depth * (0.5 + 0.5 * mr)) * mix;
  }
  return out;
}

/**
 * Makes a buffer that repeats without a seam: the tail that ran past the loop point is added back
 * onto the start, so notes and reverb that were still sounding at the end carry over into the next
 * repeat.
 */
export function foldLoop(s: Stereo, length: number): Stereo {
  const out = stereoOf(length);
  for (let i = 0; i < s.l.length; i++) {
    const j = i % length;
    out.l[j] = out.l[j]! + s.l[i]!;
    out.r[j] = out.r[j]! + s.r[i]!;
  }
  return out;
}

/**
 * A loop with some of its own audio on either side, so a decoder that adds or trims a few
 * milliseconds cannot break the join.
 */
export function padLoop(s: Stereo, padSamples: number): Stereo {
  const n = s.l.length;
  const out = stereoOf(n + padSamples * 2);
  for (let i = 0; i < out.l.length; i++) {
    const j = (((i - padSamples) % n) + n) % n;
    out.l[i] = s.l[j]!;
    out.r[i] = s.r[j]!;
  }
  return out;
}

/** 16-bit PCM, interleaved. */
export function wavBytes(channels: Float32Array[], sampleRate = SR): Buffer {
  const n = channels[0]!.length;
  const count = channels.length;
  const data = Buffer.alloc(n * count * 2);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < count; c++) {
      const v = clamp(channels[c]![i]!, -1, 1);
      data.writeInt16LE(Math.round(v * 32767), (i * count + c) * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(count, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * count * 2, 28);
  header.writeUInt16LE(count * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Reads 16-bit PCM written by `wavBytes`. */
export function readWav(bytes: Buffer): { channels: Float32Array[]; sampleRate: number } {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not a WAV file');
  let offset = 12;
  let count = 0;
  let sampleRate = SR;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      if (bytes.readUInt16LE(offset + 8) !== 1 || bytes.readUInt16LE(offset + 22) !== 16)
        throw new Error('only 16-bit PCM is supported');
      count = bytes.readUInt16LE(offset + 10);
      sampleRate = bytes.readUInt32LE(offset + 12);
    } else if (id === 'data') {
      const frames = Math.floor(size / (2 * count));
      const channels = Array.from({ length: count }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++)
        for (let c = 0; c < count; c++) channels[c]![i] = bytes.readInt16LE(offset + 8 + (i * count + c) * 2) / 32768;
      return { channels, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('the WAV file has no sample data');
}
