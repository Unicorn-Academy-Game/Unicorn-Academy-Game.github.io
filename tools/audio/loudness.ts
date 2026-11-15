/**
 * Integrated loudness in the manner of ITU-R BS.1770 (K-weighting, 400 ms blocks with 75% overlap,
 * absolute and relative gates). The build uses it to set levels, and `ffmpeg -af ebur128` checks
 * the same files independently.
 */
import { SR, type Stereo } from './dsp';

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The high shelf near 1.7 kHz from BS.1770, re-derived for the sample rate in use. */
function shelf(rate: number): Biquad {
  const gain = 3.999843853973347;
  const f0 = 1681.974450955533;
  const q = 0.7071752369554196;
  const k = Math.tan((Math.PI * f0) / rate);
  const vh = 10 ** (gain / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / q + k * k;
  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

/** The high-pass near 38 Hz from BS.1770. */
function highpass(rate: number): Biquad {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;
  const k = Math.tan((Math.PI * f0) / rate);
  const a0 = 1 + k / q + k * k;
  return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
}

function run(x: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(x.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const y = c.b0 * v + z1;
    z1 = c.b1 * v - c.a1 * y + z2;
    z2 = c.b2 * v - c.a2 * y;
    out[i] = y;
  }
  return out;
}

const kWeighted = (x: Float32Array, rate: number): Float32Array => run(run(x, shelf(rate)), highpass(rate));

/**
 * Integrated loudness in LUFS of a stereo signal, or -Infinity for silence. `rate` is the sample
 * rate it was made at.
 */
export function integratedLoudness(s: Stereo, rate = SR): number {
  const l = kWeighted(s.l, rate);
  const r = kWeighted(s.r, rate);
  const block = Math.round(0.4 * rate);
  const hop = Math.round(0.1 * rate);
  const powers: number[] = [];
  for (let start = 0; start + block <= l.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + block; i++) sum += l[i]! * l[i]! + r[i]! * r[i]!;
    powers.push(sum / block);
  }
  const toLufs = (p: number): number => -0.691 + 10 * Math.log10(p);
  const absolute = powers.filter((p) => toLufs(p) > -70);
  if (absolute.length === 0) return -Infinity;
  const mean = absolute.reduce((a, b) => a + b, 0) / absolute.length;
  const relativeGate = toLufs(mean) - 10;
  const gated = absolute.filter((p) => toLufs(p) > relativeGate);
  if (gated.length === 0) return -Infinity;
  return toLufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/**
 * The loudest 400 ms of a stereo signal, in LUFS: the loudness a short sound has when it is heard,
 * which an integrated measure cannot give for a sound shorter than the block. The signal is padded
 * with silence to fill a block.
 */
export function momentaryLoudness(s: Stereo, rate = SR): number {
  const block = Math.round(0.4 * rate);
  const hop = Math.round(0.05 * rate);
  const pad = (x: Float32Array): Float32Array => {
    const out = new Float32Array(Math.max(x.length, block) + block);
    out.set(x);
    return out;
  };
  const l = kWeighted(pad(s.l), rate);
  const r = kWeighted(pad(s.r), rate);
  let best = 0;
  for (let start = 0; start + block <= l.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + block; i++) sum += l[i]! * l[i]! + r[i]! * r[i]!;
    best = Math.max(best, sum / block);
  }
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -Infinity;
}
