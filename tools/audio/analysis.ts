/**
 * Looks at a rendered sound the way an engineer would before a person listens: how loud it is, how
 * long it rings, where its energy sits, what pitch it has, whether it starts or stops with a click,
 * and what it looks like as a spectrogram. None of this replaces listening. It is how a sound that
 * is too quiet, too sharp, or clicking is caught first.
 */
import type { Rgba } from '../art/core/image';
import type { Stereo } from './dsp';
import { momentaryLoudness } from './loudness';

/** Fast Fourier transform in place; `re` and `im` must be a power of two long. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

const SIZE = 2048;

/** Magnitudes of the first half of the spectrum of a Hann-windowed frame starting at `at`. */
function frame(x: Float32Array, at: number, size = SIZE): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const v = x[at + i] ?? 0;
    re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i]!, im[i]!) / size;
  return mag;
}

export interface Analysis {
  /** Highest sample, dBFS. */
  readonly peakDb: number;
  /** Loudest 400 ms, LUFS. */
  readonly loudness: number;
  /** Seconds from the start to the last moment it is louder than 50 dB under its peak. */
  readonly seconds: number;
  /** Where the energy sits on average, Hz, over the moments that are loud. */
  readonly centroid: number;
  /** The strongest steady frequency in the loudest part, Hz, or 0 for a sound that is noise. */
  readonly pitch: number;
  /** How noisy the loudest part is, 0 for a pure tone and 1 for noise (spectral flatness). */
  readonly noisiness: number;
  /** The level the sound is cut off at when it ends, dBFS. Above about -60 it ends with a click. */
  readonly endDb: number;
  /** The level it jumps in at on its first sample, dBFS. */
  readonly startDb: number;
  /**
   * Milliseconds from the first sound to 70% of the loudest point of the first 120 ms. Under about
   * 0.7 ms the start is heard as a click; a struck bell is 1 to 3.
   */
  readonly attackMs: number;
  /** Mean value; anything but nearly 0 pushes the speaker. */
  readonly dc: number;
}

const db = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));

export function analyze(s: Stereo, rate: number): Analysis {
  const n = s.l.length;
  const mono = new Float32Array(n);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const l = s.l[i]!;
    const r = s.r[i]!;
    mono[i] = (l + r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += mono[i]!;
  }
  const floor = peak * 10 ** (-50 / 20);
  let last = 0;
  let firstAt = n;
  let lastLoud = 0;
  for (let i = 0; i < n; i++) {
    const m = Math.max(Math.abs(s.l[i]!), Math.abs(s.r[i]!));
    if (m > 1e-6) {
      if (firstAt === n) firstAt = i;
      last = i;
    }
    if (m > floor) lastLoud = i;
  }
  // The strongest frame and the spectrum around it.
  let best = 0;
  let bestAt = 0;
  const hop = 512;
  for (let at = 0; at + SIZE <= n + hop; at += hop) {
    let e = 0;
    for (let i = 0; i < SIZE; i++) e += (mono[at + i] ?? 0) ** 2;
    if (e > best) {
      best = e;
      bestAt = at;
    }
  }
  const mag = frame(mono, bestAt);
  let top = 0;
  let topAt = 0;
  let total = 0;
  let weighted = 0;
  let logSum = 0;
  for (let i = 2; i < mag.length; i++) {
    const m = mag[i]!;
    total += m;
    weighted += m * i;
    logSum += Math.log(Math.max(m, 1e-12));
    if (m > top) {
      top = m;
      topAt = i;
    }
  }
  const flatness = total > 0 ? Math.exp(logSum / (mag.length - 2)) / (total / (mag.length - 2)) : 0;
  // A tone has a peak many times the average; noise does not.
  const mean = total / (mag.length - 2);
  const tonal = top > mean * 12;
  const binHz = rate / SIZE;
  // Parabolic interpolation around the top bin for a better pitch.
  let pitchBin = topAt;
  if (topAt > 2 && topAt < mag.length - 1) {
    const a = Math.log(Math.max(mag[topAt - 1]!, 1e-12));
    const b = Math.log(Math.max(mag[topAt]!, 1e-12));
    const c = Math.log(Math.max(mag[topAt + 1]!, 1e-12));
    const denom = a - 2 * b + c;
    if (denom !== 0) pitchBin = topAt + (0.5 * (a - c)) / denom;
  }
  const tail = (x: Float32Array, from: number, to: number): number => {
    let m = 0;
    for (let i = Math.max(0, from); i <= Math.min(to, x.length - 1); i++) m = Math.max(m, Math.abs(x[i]!));
    return m;
  };
  const stereoPeak = (from: number, to: number): number => Math.max(tail(s.l, from, to), tail(s.r, from, to));
  const early = stereoPeak(firstAt, firstAt + Math.round(0.12 * rate));
  let reached = firstAt;
  for (let i = firstAt; i < n; i++) {
    if (Math.max(Math.abs(s.l[i]!), Math.abs(s.r[i]!)) >= early * 0.7) {
      reached = i;
      break;
    }
  }
  return {
    peakDb: db(peak),
    loudness: momentaryLoudness(s, rate),
    seconds: lastLoud / rate,
    centroid: total > 0 ? (weighted / total) * binHz : 0,
    pitch: tonal ? pitchBin * binHz : 0,
    noisiness: flatness,
    endDb: db(stereoPeak(last - 2, last)),
    startDb: db(stereoPeak(firstAt, firstAt + 2)),
    attackMs: ((reached - firstAt) / rate) * 1000,
    dc: sum / n,
  };
}

/**
 * A colour for a level between 0 (silent) and 1 (as loud as it gets). Black to purple to orange to
 * white.
 */
function heat(v: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, v));
  const stops: ReadonlyArray<readonly [number, number, number]> = [
    [4, 3, 12],
    [48, 14, 92],
    [140, 40, 110],
    [230, 92, 70],
    [252, 190, 90],
    [255, 250, 220],
  ];
  const f = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const k = f - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export interface SpectrogramOptions {
  /** Pixels for each second of sound. */
  readonly pxPerSecond?: number;
  readonly height?: number;
  /** Lowest and highest frequency shown, Hz; the axis is logarithmic. */
  readonly lowHz?: number;
  readonly highHz?: number;
  /** Decibels under the brightest point that are shown. */
  readonly range?: number;
  readonly maxSeconds?: number;
}

/**
 * What the sound looks like over time: time across, pitch up (logarithmic), brightness for
 * loudness.
 */
export function spectrogram(x: Float32Array, rate: number, o: SpectrogramOptions = {}): Rgba {
  const pxPerSecond = o.pxPerSecond ?? 160;
  const height = o.height ?? 140;
  const lowHz = o.lowHz ?? 80;
  const highHz = Math.min(o.highHz ?? 14000, rate / 2);
  const range = o.range ?? 70;
  const seconds = Math.min(o.maxSeconds ?? 4, x.length / rate);
  const width = Math.max(40, Math.round(seconds * pxPerSecond));
  const data = new Uint8Array(width * height * 4);
  const mags: Float64Array[] = [];
  let loudest = 1e-9;
  for (let px = 0; px < width; px++) {
    const centre = Math.round((px / pxPerSecond) * rate);
    const m = frame(x, centre - SIZE / 2);
    mags.push(m);
    for (let i = 0; i < m.length; i++) loudest = Math.max(loudest, m[i]!);
  }
  const binHz = rate / SIZE;
  for (let px = 0; px < width; px++) {
    const m = mags[px]!;
    for (let py = 0; py < height; py++) {
      const f = lowHz * (highHz / lowHz) ** (1 - py / (height - 1));
      const bin = f / binHz;
      const i = Math.min(m.length - 2, Math.floor(bin));
      const k = bin - i;
      const v = m[i]! * (1 - k) + m[i + 1]! * k;
      const level = (db(v) - db(loudest) + range) / range;
      const [r, g, b] = heat(level);
      const at = (py * width + px) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}
