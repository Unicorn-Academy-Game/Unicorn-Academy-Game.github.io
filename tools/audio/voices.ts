/**
 * Instruments for the music and the sounds. Each function renders one note or one sound as a mono
 * buffer with its own natural ending, so the caller only decides when it starts and where it sits
 * in the mix.
 */
import { clamp } from '../../src/shared/math';
import { filter, midiHz, pinkNoise, type Rand, SR, TAU, whiteNoise } from './dsp';

/** Adds an exponentially fading sine into a buffer using a cheap recursive oscillator. */
export function decayingSine(
  buf: Float32Array,
  start: number,
  freq: number,
  amp: number,
  tau: number,
  phase = 0,
  attack = 0.003,
): void {
  if (freq >= SR * 0.46 || amp < 1e-5) return;
  const w = (TAU * freq) / SR;
  const k = 2 * Math.cos(w);
  let y1 = Math.sin(phase - w);
  let y2 = Math.sin(phase - 2 * w);
  const fall = Math.exp(-1 / (tau * SR));
  const rise = Math.max(1, Math.round(attack * SR));
  let env = amp;
  const end = Math.min(buf.length, start + Math.max(0, Math.ceil(tau * SR * 9)));
  for (let i = start; i < end; i++) {
    const y = k * y1 - y2;
    y2 = y1;
    y1 = y;
    const j = i - start;
    const a = j < rise ? 0.5 - 0.5 * Math.cos((Math.PI * j) / rise) : 1;
    buf[i] = buf[i]! + y * env * a;
    env *= fall;
    if (env < amp * 1e-4) break;
  }
}

/** The shape of a note held for `dur` seconds: a rise, a level stretch, and a fall. */
export function envelope(n: number, attack: number, hold: number, release: number, curve = 1): Float32Array {
  const out = new Float32Array(n);
  const a = Math.max(1, Math.round(attack * SR));
  const h = Math.round(hold * SR);
  const r = Math.max(1, Math.round(release * SR));
  for (let i = 0; i < n; i++) {
    if (i < a) out[i] = (0.5 - 0.5 * Math.cos((Math.PI * i) / a)) ** curve;
    else if (i < h) out[i] = 1;
    else if (i < h + r) out[i] = (0.5 + 0.5 * Math.cos((Math.PI * (i - h)) / r)) ** curve;
    else out[i] = 0;
  }
  return out;
}

/** Fades a buffer from its note-off point so it ends cleanly instead of being cut. */
export function damp(buf: Float32Array, at: number, release: number): void {
  const a = Math.round(at * SR);
  const r = Math.max(1, Math.round(release * SR));
  for (let i = a; i < buf.length; i++) {
    const j = i - a;
    buf[i] = j < r ? buf[i]! * (0.5 + 0.5 * Math.cos((Math.PI * j) / r)) : 0;
  }
}

/** A sum of steady sines. Cheap, and made to be shaped by an envelope afterwards. */
function sineStack(n: number, parts: { f: number; a: number; phase?: number }[]): Float32Array {
  const out = new Float32Array(n);
  for (const p of parts) {
    if (p.f >= SR * 0.46) continue;
    const w = (TAU * p.f) / SR;
    const k = 2 * Math.cos(w);
    let y1 = Math.sin((p.phase ?? 0) - w);
    let y2 = Math.sin((p.phase ?? 0) - 2 * w);
    for (let i = 0; i < n; i++) {
      const y = k * y1 - y2;
      y2 = y1;
      y1 = y;
      out[i] = out[i]! + y * p.a;
    }
  }
  return out;
}

/**
 * A soft felt piano. Two strings per note a hair apart for the slow shimmer, upper partials that
 * fade faster than the fundamental, and a muted thump for the hammer. Velocity changes the
 * brightness as well as the loudness.
 */
export function piano(freq: number, dur: number, vel: number, r: Rand): Float32Array {
  const release = 0.35;
  const buf = new Float32Array(Math.round((dur + release + 0.1) * SR));
  const base = clamp(6.4 - 1.9 * Math.log2(freq / 110), 1.1, 7.5);
  const bright = 0.16 + 0.34 * vel;
  const B = freq < 200 ? 0.0006 : 0.0002;
  const count = Math.min(14, Math.floor(8000 / freq));
  for (let n = 1; n <= count; n++) {
    const f = n * freq * Math.sqrt(1 + B * n * n);
    const amp = ((vel * 0.26) / n ** 1.05) * Math.exp(-n * (0.5 - bright));
    const tau = base / (1 + 0.55 * (n - 1));
    const phase = r.next() * TAU;
    decayingSine(buf, 0, f * 1.00018, amp * 0.55, tau, phase, 0.004);
    decayingSine(buf, 0, f * 0.99985, amp * 0.55, tau * 1.08, phase + 1.3, 0.004);
  }
  const thump = filter(whiteNoise(Math.round(0.03 * SR), r), 'bandpass', Math.min(2400, freq * 3), 0.9);
  for (let i = 0; i < thump.length; i++) buf[i] = buf[i]! + thump[i]! * 0.07 * vel * Math.exp(-i / (0.006 * SR));
  damp(buf, dur, release);
  return buf;
}

/**
 * A plucked string, like a harp: harmonics shaped by where it is plucked, and the upper ones dying
 * quickest.
 */
export function harp(freq: number, dur: number, vel: number, r: Rand): Float32Array {
  const ring = clamp(3.6 - 0.9 * Math.log2(freq / 220), 1.2, 4.2);
  const length = Math.min(dur, ring * 1.6) + 0.5;
  const buf = new Float32Array(Math.round(length * SR));
  const place = 0.17;
  const count = Math.min(16, Math.floor(9000 / freq));
  for (let n = 1; n <= count; n++) {
    const comb = Math.abs(Math.sin(Math.PI * n * place));
    const amp = ((vel * 0.3 * comb) / n) * Math.exp(-n * (0.42 - 0.22 * vel));
    decayingSine(buf, 0, n * freq, amp, ring / n ** 0.75, r.next() * TAU, 0.0015);
  }
  const tick = filter(whiteNoise(Math.round(0.012 * SR), r), 'highpass', 1800, 0.7);
  for (let i = 0; i < tick.length; i++) buf[i] = buf[i]! + tick[i]! * 0.05 * vel * Math.exp(-i / (0.003 * SR));
  damp(buf, Math.min(dur, ring * 1.6), 0.3);
  return buf;
}

export type BellKind = 'celesta' | 'glock' | 'chime' | 'marimba' | 'kalimba' | 'glass';

const BELLS: Record<BellKind, { ratios: number[]; amps: number[]; taus: number[] }> = {
  celesta: { ratios: [1, 3.98, 9.4], amps: [1, 0.3, 0.07], taus: [2.4, 0.75, 0.28] },
  glock: { ratios: [1, 2.76, 5.4, 8.93], amps: [1, 0.5, 0.26, 0.12], taus: [2.8, 1.4, 0.7, 0.35] },
  chime: { ratios: [1, 2.32, 4.25, 6.63, 9.38], amps: [1, 0.55, 0.3, 0.16, 0.08], taus: [4.6, 3.2, 2.0, 1.2, 0.7] },
  marimba: { ratios: [1, 3.93, 9.92], amps: [1, 0.34, 0.07], taus: [0.9, 0.22, 0.08] },
  kalimba: { ratios: [1, 5.4, 12.3], amps: [1, 0.22, 0.05], taus: [1.6, 0.18, 0.06] },
  glass: { ratios: [1, 2.42, 4.58, 7.1], amps: [1, 0.42, 0.2, 0.08], taus: [3.6, 1.8, 0.9, 0.4] },
};

/**
 * Struck metal, wood, or glass: a handful of partials that are not whole multiples, each fading on
 * its own clock.
 */
export function bell(kind: BellKind, freq: number, vel: number, r: Rand, ringScale = 1): Float32Array {
  const def = BELLS[kind];
  const length = def.taus[0]! * ringScale * 4.2 + 0.1;
  const buf = new Float32Array(Math.round(length * SR));
  for (let i = 0; i < def.ratios.length; i++) {
    decayingSine(
      buf,
      0,
      freq * def.ratios[i]!,
      vel * 0.3 * def.amps[i]!,
      def.taus[i]! * ringScale,
      r.next() * TAU,
      0.0012,
    );
  }
  const click = filter(whiteNoise(Math.round(0.008 * SR), r), 'bandpass', Math.min(7000, freq * 4), 1.2);
  for (let i = 0; i < click.length; i++) buf[i] = buf[i]! + click[i]! * 0.04 * vel * Math.exp(-i / (0.002 * SR));
  return buf;
}

/**
 * A breathy flute. A few soft harmonics, a little vibrato that arrives after the note has opened,
 * and a puff of filtered noise at the start.
 */
export function flute(freq: number, dur: number, vel: number, r: Rand): Float32Array {
  const release = 0.22;
  const n = Math.round((dur + release + 0.05) * SR);
  const out = new Float32Array(n);
  const harmonics = [1, 0.3, 0.12, 0.05, 0.02];
  const rate = 5.1 + r.range(-0.3, 0.3);
  let phase = 0;
  const depthAt = (t: number): number => 0.0026 * clamp((t - 0.25) / 0.4, 0, 1);
  const attack = 0.1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = freq * (1 + depthAt(t) * Math.sin(TAU * rate * t));
    phase += (TAU * f) / SR;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) s += Math.sin(phase * (h + 1)) * harmonics[h]!;
    const a = Math.min(1, t / attack);
    const trem = 1 + 0.025 * Math.sin(TAU * 4.4 * t);
    out[i] = s * (0.5 - 0.5 * Math.cos(Math.PI * a)) * trem;
  }
  const breath = filter(pinkNoise(n, r), 'bandpass', freq * 2.6, 1.1);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = out[i]! + breath[i]! * (0.5 * Math.exp(-t / 0.05) + 0.12) * 0.6;
  }
  damp(out, dur, release);
  const gain = 0.22 * vel;
  for (let i = 0; i < n; i++) out[i] = out[i]! * gain;
  return out;
}

/**
 * Warm sustained harmony: three slightly detuned voices of a soft saw spectrum, a slow rise and a
 * long fall.
 */
export function pad(
  freq: number,
  dur: number,
  vel: number,
  r: Rand,
  attack = 1.1,
  release = 1.8,
  brightness = 1,
): Float32Array {
  const n = Math.round((dur + release + 0.1) * SR);
  const parts: { f: number; a: number; phase: number }[] = [];
  for (const cents of [-7, 0, 6]) {
    const f0 = freq * 2 ** (cents / 1200);
    const harmonics = Math.min(8, Math.floor(5000 / f0));
    for (let h = 1; h <= harmonics; h++)
      parts.push({ f: f0 * h, a: (1 / h ** 1.35) * Math.exp((-h * 0.1) / brightness), phase: r.next() * TAU });
  }
  const body = sineStack(n, parts);
  const env = envelope(n, attack, dur, release, 1);
  const gain = 0.085 * vel;
  for (let i = 0; i < n; i++) {
    const wobble = 1 + 0.06 * Math.sin((TAU * 0.23 * i) / SR + parts[0]!.phase);
    body[i] = body[i]! * env[i]! * gain * wobble;
  }
  return body;
}

/** A round, quiet low note for the floor of the harmony. */
export function sub(freq: number, dur: number, vel: number, r: Rand): Float32Array {
  const release = 0.5;
  const n = Math.round((dur + release) * SR);
  const body = sineStack(n, [
    { f: freq, a: 1, phase: r.next() * TAU },
    { f: freq * 2, a: 0.28, phase: r.next() * TAU },
    { f: freq * 3, a: 0.07, phase: r.next() * TAU },
  ]);
  const env = envelope(n, 0.05, dur, release, 1);
  for (let i = 0; i < n; i++) body[i] = body[i]! * env[i]! * 0.3 * vel * (1 + 0.15 * Math.exp(-i / (0.25 * SR)));
  return body;
}

/** The soft tick of a wooden brush or a fingertip, for the lightest rhythm. */
export function tick(vel: number, r: Rand, bright = 3200): Float32Array {
  const n = Math.round(0.09 * SR);
  const noise = filter(whiteNoise(n, r), 'bandpass', bright, 1.6);
  for (let i = 0; i < n; i++) noise[i] = noise[i]! * Math.exp(-i / (0.011 * SR)) * 0.5 * vel;
  return noise;
}

export const hz = midiHz;
