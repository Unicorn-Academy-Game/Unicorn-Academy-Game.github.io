/**
 * The small sounds the unicorns make, a little chime for friendship, and the gentle interface cues.
 */
import { clamp } from '../../../src/shared/math';
import { filter, midiHz, rand, SR, samples, seedOf, TAU } from '../dsp';
import { harp } from '../voices';
import { burst, ding, glide, layer } from './kit';

export const VOICES = {
  wildstar: { pitch: 330, bright: 1.0, breath: 0.1 },
  leaf: { pitch: 280, bright: 0.85, breath: 0.12 },
  glacier: { pitch: 372, bright: 1.25, breath: 0.16 },
  river: { pitch: 305, bright: 0.95, breath: 0.1 },
  cinder: { pitch: 236, bright: 0.75, breath: 0.14 },
  storm: { pitch: 404, bright: 1.15, breath: 0.1 },
} as const;
export type VoiceId = keyof typeof VOICES;

/**
 * A small, friendly unicorn sound: a voiced hum that glides up (a question, `a`) or down
 * (contentment, `b`), shaped by vowel-like resonances and a whisper of breath. Quiet, short, and
 * never a whinny.
 */
export function unicornVoice(id: VoiceId, variant: 'a' | 'b'): Float32Array {
  const v = VOICES[id];
  const r = rand(seedOf(`voice-${id}-${variant}`));
  const seconds = variant === 'a' ? 0.52 : 0.62;
  const n = samples(seconds);
  const f0 = v.pitch * (variant === 'a' ? 0.9 : 1.1);
  const f1 = v.pitch * (variant === 'a' ? 1.16 : 0.9);
  const source = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = i / n;
    const bend = variant === 'a' ? u ** 1.6 : 1 - (1 - u) ** 1.4;
    const f = (f0 + (f1 - f0) * bend) * (1 + 0.012 * clamp(t / 0.15, 0, 1) * Math.sin(TAU * 5.4 * t));
    phase += (TAU * f) / SR;
    let s = 0;
    for (let h = 1; h <= 24; h++) s += Math.sin(phase * h) / h ** 0.9;
    source[i] = s;
  }
  // The mouth opens and closes around the note, like a soft "mm-ah-mm": the resonances rise and
  // fall with it.
  const open = (t: number): number => Math.sin(Math.PI * clamp(t / seconds, 0, 1)) ** 1.2;
  const one = filter(source, 'bandpass', (t) => v.bright * (320 + 330 * open(t)), 4);
  const two = filter(source, 'bandpass', (t) => v.bright * (1100 + 650 * open(t)), 6);
  const three = filter(source, 'bandpass', () => v.bright * 2800, 8);
  const air = filter(
    burst(seconds, r, { kind: 'bandpass', hz: 2400 * v.bright, q: 0.8 }, { tau: 100, attack: 0.04 }),
    'lowpass',
    5000,
  );
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const shape = Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 1.3;
    const puff = variant === 'b' ? Math.exp(-(((u - 0.9) / 0.08) ** 2)) * 0.5 : 0;
    out[i] =
      (one[i]! * 0.55 + two[i]! * 0.5 + three[i]! * 0.3) * shape * 0.5 +
      air[i]! * (v.breath * shape * 0.5 + puff * v.breath * 2);
  }
  return filter(out, 'lowpass', 6500, 0.7);
}

/** A soft nicker of recognition: a few quick breathy pulses on a low voiced note. */
export function nicker(id: VoiceId): Float32Array {
  const v = VOICES[id];
  const r = rand(seedOf(`nicker-${id}`));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const pulse = glide(v.pitch * 0.62 * (1 - i * 0.03), v.pitch * 0.55, 0.11, {
      tau: 0.04,
      attack: 0.012,
      harmonics: [1, 0.55, 0.3, 0.15],
    });
    const breath = burst(0.11, r, { kind: 'bandpass', hz: 1800 * v.bright, q: 0.9 }, { tau: 0.04, attack: 0.01 });
    parts.push({ buf: filter(pulse, 'lowpass', 1900, 0.8), at: i * 0.1, gain: 0.8 - i * 0.12 });
    parts.push({ buf: breath, at: i * 0.1, gain: 0.25 });
  }
  return layer(parts);
}

/** Two companions leaning together: a warm breath and a pair of soft bells, like hearts. */
export function hearts(): Float32Array {
  const r = rand(seedOf('hearts'));
  return layer([
    { buf: burst(0.5, r, { kind: 'bandpass', hz: 700, q: 0.6 }, { tau: 100, attack: 0.15 }), at: 0, gain: 0.18 },
    { buf: ding('celesta', midiHz(79), 0.4, r, 0.45), at: 0.05, gain: 1 },
    { buf: ding('celesta', midiHz(84), 0.34, r, 0.45), at: 0.2, gain: 1 },
  ]);
}

/**
 * A new friend joins the herd: a rising run on harp and celesta that lands on a bright open chord.
 */
export function recruit(): Float32Array {
  const r = rand(seedOf('recruit'));
  const run = [67, 72, 76, 79, 84, 88];
  const parts: { buf: Float32Array; at: number; gain: number }[] = run.map((m, i) => ({
    buf: harp(midiHz(m), 1.2, 0.8, r),
    at: i * 0.075,
    gain: 0.9,
  }));
  run.forEach((m, i) => {
    parts.push({ buf: ding('celesta', midiHz(m + 12), 0.4, r, 0.45), at: i * 0.075 + 0.015, gain: 0.8 });
  });
  for (const m of [72, 79, 84, 88]) parts.push({ buf: ding('glass', midiHz(m), 0.4, r, 0.9), at: 0.5, gain: 0.8 });
  parts.push({
    buf: burst(1.4, r, { kind: 'bandpass', hz: 4200, q: 0.9 }, { tau: 100, attack: 0.3, pink: true }),
    at: 0,
    gain: 0.06,
  });
  return layer(parts);
}

/** A friendly wave from a grown-up: a small two-note greeting on a bell. */
export function hello(): Float32Array {
  const r = rand(seedOf('hello'));
  return layer([
    { buf: ding('kalimba', midiHz(76), 0.6, r, 0.32), at: 0, gain: 1 },
    { buf: ding('kalimba', midiHz(79), 0.6, r, 0.32), at: 0.13, gain: 1 },
  ]);
}

/** A soft pop for any tap. */
export function tap(): Float32Array {
  return glide(520, 760, 0.09, { tau: 0.025, attack: 0.002, curve: 0.6 });
}

/** The gentlest confirmation: two rising notes on a wooden bell. */
export function confirm(): Float32Array {
  const r = rand(seedOf('confirm'));
  return layer([
    { buf: ding('marimba', midiHz(72), 0.6, r, 0.35), at: 0, gain: 1 },
    { buf: ding('marimba', midiHz(79), 0.6, r, 0.35), at: 0.09, gain: 1 },
  ]);
}

/** A tap that did not do anything: a soft low note that settles, with no sharp edge. */
export function refusal(): Float32Array {
  return glide(300, 236, 0.2, { tau: 0.06, attack: 0.012, harmonics: [1, 0.2] });
}

/** A map change: a soft airy swell and one bell. */
export function transition(): Float32Array {
  const r = rand(seedOf('transition'));
  const air = filter(
    burst(0.9, r, { kind: 'bandpass', hz: 1600, q: 0.5 }, { tau: 100, attack: 0.35, pink: true }),
    'lowpass',
    4000,
  );
  for (let i = 0; i < air.length; i++) air[i] = air[i]! * Math.sin(Math.PI * (i / air.length));
  return layer([
    { buf: air, at: 0, gain: 0.5 },
    { buf: ding('chime', midiHz(84), 0.3, r, 0.5), at: 0.25, gain: 1 },
  ]);
}
