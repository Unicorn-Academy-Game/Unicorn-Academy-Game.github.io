/**
 * The six spells and what they do to the things around them. All share a bright, forgiving tonal
 * palette (C major pentatonic, soft attacks, shimmering tails) and differ in material: glass, leaf,
 * ice, water, ember and storm.
 */
import { midiHz, rand, SR, samples, seedOf } from '../dsp';
import { harp, pad } from '../voices';
import { bubble, burst, crackle, ding, glide, layer, plink, sweep } from './kit';

/** Wildstar's light: a run of glass chimes climbing to a shimmering peak. */
export function spellLight(): Float32Array {
  const r = rand(seedOf('spell-light'));
  const run = [72, 76, 79, 84, 88, 91, 96];
  const parts: { buf: Float32Array; at: number; gain: number }[] = run.map((m, i) => ({
    buf: ding('glass', midiHz(m), 0.42 - i * 0.02, r, 0.5),
    at: i * 0.07,
    gain: 1,
  }));
  for (const [i, m] of [84, 88, 91, 96, 100].entries())
    parts.push({ buf: ding('glock', midiHz(m), 0.25, r, 0.38), at: 0.55 + i * 0.045, gain: 0.8 });
  parts.push({ buf: sweep(1.1, r, 1400, 6500, 1.6), at: 0, gain: 0.1 });
  parts.push({ buf: pad(midiHz(72), 0.9, 0.5, r, 0.25, 0.7, 1.5), at: 0.05, gain: 0.8 });
  return layer(parts);
}

/**
 * Leaf's nature magic: a cascade of kalimba notes like seeds sprouting, with a rustle of leaves.
 */
export function spellNature(): Float32Array {
  const r = rand(seedOf('spell-nature'));
  const run = [60, 64, 67, 72, 76, 79, 84];
  const parts: { buf: Float32Array; at: number; gain: number }[] = run.map((m, i) => ({
    buf: ding('kalimba', midiHz(m), 0.6, r, 0.32),
    at: i * 0.085 + r.range(0, 0.012),
    gain: 1,
  }));
  parts.push({ buf: harp(midiHz(67), 1.2, 0.6, r), at: 0.5, gain: 0.7 });
  parts.push({ buf: harp(midiHz(76), 1.2, 0.5, r), at: 0.56, gain: 0.7 });
  const rustle = burst(1.0, r, { kind: 'highpass', hz: 4200 }, { tau: 100, attack: 0.25, pink: true });
  for (let i = 0; i < rustle.length; i++)
    rustle[i] = rustle[i]! * Math.sin((Math.PI * i) / rustle.length) * (0.6 + 0.4 * Math.sin(i / 500));
  parts.push({ buf: rustle, at: 0, gain: 0.12 });
  parts.push({ buf: pad(midiHz(64), 1.0, 0.45, r, 0.3, 0.7, 1.1), at: 0.1, gain: 0.7 });
  return layer(parts);
}

/** Glacier's ice: glass partials, a handful of crackles, and a shimmer that sinks. */
export function spellIce(): Float32Array {
  const r = rand(seedOf('spell-ice'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  const high = [91, 96, 98, 103, 105, 108];
  high.forEach((m, i) => {
    parts.push({ buf: ding('glass', midiHz(m - 12), 0.34, r, 0.5), at: i * 0.06 + r.range(0, 0.02), gain: 0.9 });
  });
  parts.push({ buf: ding('chime', midiHz(84), 0.3, r, 0.6), at: 0.05, gain: 0.9 });
  parts.push({ buf: crackle(0.9, 36, r, 6200, 0.7), at: 0.1, gain: 0.45 });
  parts.push({ buf: sweep(0.8, r, 7500, 2400, 1.8, (u) => Math.sin(Math.PI * u ** 0.6)), at: 0.2, gain: 0.12 });
  return layer(parts);
}

/** River's water: rising bubbles, a splash of noise, a marimba arpeggio. */
export function spellWater(): Float32Array {
  const r = rand(seedOf('spell-water'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) ** 0.8 * 0.9;
    parts.push({ buf: bubble(r.range(520, 1800), r.range(0.025, 0.05)), at: t, gain: r.range(0.35, 0.8) });
  }
  [67, 71, 74, 79].forEach((m, i) => {
    parts.push({ buf: ding('marimba', midiHz(m), 0.6, r, 0.35), at: 0.1 + i * 0.11, gain: 0.9 });
  });
  parts.push({ buf: sweep(0.7, r, 1200, 3600, 0.9), at: 0.15, gain: 0.18 });
  parts.push({ buf: plink(1100, r), at: 0.75, gain: 0.8 });
  parts.push({ buf: plink(1500, r), at: 0.88, gain: 0.6 });
  return layer(parts);
}

/** Cinder's fire: a warm rising whoomph, crackles, and a low plucked chord. */
export function spellFire(): Float32Array {
  const r = rand(seedOf('spell-fire'));
  const whoomph = sweep(0.8, r, 180, 1100, 0.7, (u) => Math.sin(Math.PI * u ** 0.7) ** 1.5);
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    { buf: whoomph, at: 0, gain: 0.7 },
    { buf: crackle(1.1, 38, r, 2400, 0.9), at: 0.1, gain: 0.5 },
    { buf: glide(110, 70, 0.3, { tau: 0.09, attack: 0.01 }), at: 0, gain: 0.5 },
  ];
  [48, 55, 60, 64].forEach((m, i) => {
    parts.push({ buf: harp(midiHz(m), 1.2, 0.7, r), at: 0.12 + i * 0.04, gain: 0.8 });
  });
  [84, 88, 91].forEach((m, i) => {
    parts.push({ buf: ding('glock', midiHz(m), 0.2, r, 0.38), at: 0.45 + i * 0.07, gain: 0.7 });
  });
  return layer(parts);
}

/**
 * Storm's lightning: a rising breath of wind, a soft electric zap, a rumble that rolls away, a
 * bright sparkle.
 */
export function spellLightning(): Float32Array {
  const r = rand(seedOf('spell-lightning'));
  const rumble = burst(1.3, r, { kind: 'lowpass', hz: 150, q: 0.9 }, { tau: 0.45, attack: 0.05 });
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    {
      buf: sweep(0.5, r, 500, 5200, 0.9, (u) => u ** 1.5 * Math.sin(Math.PI * Math.min(1, u * 1.05))),
      at: 0,
      gain: 0.35,
    },
    {
      buf: glide(2600, 320, 0.14, { tau: 0.04, attack: 0.002, curve: 0.5, harmonics: [1, 0.5, 0.3, 0.15] }),
      at: 0.38,
      gain: 0.45,
    },
    { buf: crackle(0.35, 70, r, 5200, 0.8), at: 0.38, gain: 0.5 },
    { buf: rumble, at: 0.42, gain: 0.85 },
  ];
  [96, 100, 103, 108].forEach((m, i) => {
    parts.push({ buf: ding('glass', midiHz(m - 12), 0.26, r, 0.5), at: 0.55 + i * 0.05, gain: 0.7 });
  });
  return layer(parts);
}

/** A flower bed blooming: three soft notes rising and a breath of leaves. */
export function fxBloom(): Float32Array {
  const r = rand(seedOf('fx-bloom'));
  return layer([
    ...[72, 76, 79].map((m, i) => ({ buf: ding('kalimba', midiHz(m), 0.55, r, 0.32), at: i * 0.1, gain: 1 })),
    { buf: ding('celesta', midiHz(91), 0.2, r, 0.45), at: 0.3, gain: 0.8 },
    { buf: burst(0.6, r, { kind: 'highpass', hz: 4500 }, { tau: 100, attack: 0.2, pink: true }), at: 0, gain: 0.07 },
  ]);
}

/** A lantern catching Wildstar's light: a warm chime and a soft pop of glow. */
export function fxLantern(): Float32Array {
  const r = rand(seedOf('fx-lantern'));
  return layer([
    { buf: ding('chime', midiHz(79), 0.4, r, 0.55), at: 0.02, gain: 1 },
    { buf: ding('glass', midiHz(91), 0.2, r, 0.5), at: 0.08, gain: 0.8 },
    { buf: glide(260, 520, 0.14, { tau: 0.04, curve: 0.6 }), at: 0, gain: 0.35 },
  ]);
}

/** A brazier taking flame: a soft whoomph and a few embers. */
export function fxBrazier(): Float32Array {
  const r = rand(seedOf('fx-brazier'));
  return layer([
    { buf: sweep(0.7, r, 160, 900, 0.7, (u) => Math.sin(Math.PI * u ** 0.6) ** 1.4), at: 0, gain: 0.8 },
    { buf: crackle(0.9, 30, r, 2300, 0.9), at: 0.1, gain: 0.5 },
    { buf: glide(95, 62, 0.25, { tau: 0.08 }), at: 0, gain: 0.5 },
  ]);
}

/** An ice sculpture freezing and flowering: a handful of glassy tinkles. */
export function fxIce(): Float32Array {
  const r = rand(seedOf('fx-ice'));
  return layer([
    ...[84, 88, 91, 96, 100].map((m, i) => ({
      buf: ding('glass', midiHz(m - 6), 0.3, r, 0.5),
      at: i * 0.07,
      gain: 0.9,
    })),
    { buf: crackle(0.5, 30, r, 6500, 0.5), at: 0, gain: 0.35 },
  ]);
}

/** The fountain leaping: a swelling rush of water with bubbles on top. */
export function fxSpray(): Float32Array {
  const r = rand(seedOf('fx-spray'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    { buf: sweep(1.4, r, 1800, 4200, 0.5, (u) => Math.sin(Math.PI * u) ** 0.8), at: 0, gain: 0.45 },
  ];
  for (let i = 0; i < 12; i++)
    parts.push({ buf: plink(r.range(900, 2200), r), at: r.range(0.1, 1.2), gain: r.range(0.25, 0.6) });
  return layer(parts);
}

/** A pinwheel whirring up on the wind: a flutter of noise that swells and fades. */
export function fxPinwheel(): Float32Array {
  const r = rand(seedOf('fx-pinwheel'));
  const n = samples(1.8);
  const body = burst(1.8, r, { kind: 'bandpass', hz: 1500, q: 1.1 }, { tau: 100, attack: 0.1, pink: true });
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const rate = 11 + 9 * Math.sin(Math.PI * u);
    body[i] = body[i]! * Math.sin(Math.PI * u) * (0.55 + 0.45 * Math.sin((2 * Math.PI * rate * i) / SR));
  }
  return layer([
    { buf: body, at: 0, gain: 0.7 },
    { buf: ding('kalimba', midiHz(88), 0.3, r, 0.32), at: 0.5, gain: 0.5 },
  ]);
}

/** A weather ornament glowing: a few high sparkles. */
export function fxGlow(): Float32Array {
  const r = rand(seedOf('fx-glow'));
  return layer([
    ...[91, 96, 98, 103].map((m, i) => ({
      buf: ding('glock', midiHz(m - 12), 0.28, r, 0.38),
      at: i * 0.08,
      gain: 0.9,
    })),
    { buf: sweep(0.5, r, 2000, 5200, 1.4), at: 0, gain: 0.06 },
  ]);
}

/**
 * A companion's splash, a hop on a cloud, a hoof stamp: tiny signature cues sit with the effects
 * they start.
 */
export function fxSplash(): Float32Array {
  const r = rand(seedOf('fx-splash'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    { buf: sweep(0.5, r, 1200, 3200, 0.7, (u) => Math.sin(Math.PI * u ** 0.5) ** 2), at: 0, gain: 0.5 },
  ];
  for (let i = 0; i < 8; i++)
    parts.push({ buf: plink(r.range(800, 2000), r), at: r.range(0.02, 0.4), gain: r.range(0.3, 0.7) });
  return layer(parts);
}

/** A friendly relocation: a gentle upward swoosh and a bell. */
export function fxRelocate(): Float32Array {
  const r = rand(seedOf('fx-relocate'));
  return layer([
    { buf: sweep(0.5, r, 600, 3800, 0.9, (u) => Math.sin(Math.PI * u)), at: 0, gain: 0.25 },
    { buf: ding('glass', midiHz(84), 0.3, r, 0.5), at: 0.3, gain: 1 },
  ]);
}

/** A rainbow arching over the palace: a broad shimmering swell, a rising glass scale. */
export function fxRainbow(): Float32Array {
  const r = rand(seedOf('fx-rainbow'));
  const scale = [72, 74, 76, 79, 81, 84, 86, 88];
  return layer([
    ...scale.map((m, i) => ({ buf: ding('glass', midiHz(m), 0.26, r, 0.5), at: i * 0.12, gain: 1 })),
    { buf: pad(midiHz(72), 1.4, 0.45, r, 0.5, 1.2, 1.5), at: 0, gain: 0.7 },
    { buf: sweep(1.6, r, 1800, 7000, 1.0), at: 0, gain: 0.07 },
  ]);
}
