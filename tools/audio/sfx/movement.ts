/**
 * Footsteps and the soft sounds of work: hooves on grass and on hard ground, a brush on a coat, a
 * broom, hay.
 */
import { filter, mixInto, rand, samples, seedOf } from '../dsp';
import { burst, glide, layer } from './kit';

/**
 * A hoof on soft ground: a muffled thump, with a little blade-of-grass swish. Four variants, a
 * touch different each.
 */
export function hoofGrass(variant: number): Float32Array {
  const r = rand(seedOf(`hoof-grass-${variant}`));
  const body = glide(96 + variant * 9, 58 + variant * 4, 0.09, { tau: 0.022, attack: 0.002 });
  const thud = burst(0.08, r, { kind: 'bandpass', hz: 260 + variant * 70, q: 0.9 }, { tau: 0.02, attack: 0.001 });
  const swish = burst(0.1, r, { kind: 'highpass', hz: 3000 }, { tau: 0.03, attack: 0.012 });
  return layer([
    { buf: body, at: 0, gain: 0.7 },
    { buf: thud, at: 0, gain: 1 },
    { buf: swish, at: 0.012, gain: 0.07 },
  ]);
}

/** A hoof on stone or boards: a short, rounded knock with a woody ring. Three variants. */
export function hoofHard(variant: number): Float32Array {
  const r = rand(seedOf(`hoof-hard-${variant}`));
  const ring = [640, 720, 580][variant % 3]!;
  const knock = burst(0.04, r, { kind: 'bandpass', hz: 1500 + variant * 200, q: 1.1 }, { tau: 0.007, attack: 0.0008 });
  const wood = glide(ring, ring * 0.86, 0.12, { tau: 0.03, attack: 0.0015, harmonics: [1, 0.3] });
  const thump = glide(120, 80, 0.07, { tau: 0.018 });
  return layer([
    { buf: knock, at: 0, gain: 0.9 },
    { buf: wood, at: 0, gain: 0.55 },
    { buf: thump, at: 0, gain: 0.5 },
  ]);
}

/** One stroke of a brush down a coat. Three variants, each a little longer or softer. */
export function brushStroke(variant: number): Float32Array {
  const r = rand(seedOf(`brush-${variant}`));
  const length = 0.26 + variant * 0.05;
  const n = samples(length);
  const noise = burst(length, r, { kind: 'bandpass', hz: 3200 + variant * 500, q: 0.7 }, { tau: 10, attack: 0.03 });
  for (let i = 0; i < n; i++) {
    const u = i / n;
    noise[i] = noise[i]! * Math.sin(Math.PI * u ** 0.8) ** 1.4;
  }
  const bristle = burst(length, r, { kind: 'highpass', hz: 5000 }, { tau: 10, attack: 0.02 });
  for (let i = 0; i < n; i++) bristle[i] = bristle[i]! * Math.sin(Math.PI * (i / n)) ** 2 * 0.12;
  return filter(
    layer([
      { buf: noise, at: 0, gain: 1 },
      { buf: bristle, at: 0.01, gain: 1 },
    ]),
    'lowpass',
    8500,
    0.7,
  );
}

/** The swish of a broom across stone. */
export function broomSwish(variant: number): Float32Array {
  const r = rand(seedOf(`broom-${variant}`));
  const length = 0.5 + variant * 0.06;
  const n = samples(length);
  const noise = burst(length, r, { kind: 'bandpass', hz: 2100, q: 0.6 }, { tau: 10, attack: 0.05 });
  for (let i = 0; i < n; i++) noise[i] = noise[i]! * Math.sin(Math.PI * (i / n)) ** 1.2;
  const grit = burst(length, r, { kind: 'highpass', hz: 4200 }, { tau: 10, attack: 0.05 });
  for (let i = 0; i < n; i++) grit[i] = grit[i]! * Math.sin(Math.PI * (i / n)) ** 2 * 0.14;
  return filter(
    layer([
      { buf: noise, at: 0, gain: 1 },
      { buf: grit, at: 0, gain: 1 },
    ]),
    'lowpass',
    8000,
    0.7,
  );
}

/** Taking up or setting down an armful of hay: a dry crunch of rustles. */
export function hayRustle(variant: number): Float32Array {
  const r = rand(seedOf(`hay-${variant}`));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  const count = 9 + variant * 2;
  for (let i = 0; i < count; i++) {
    parts.push({
      buf: burst(r.range(0.015, 0.05), r, { kind: 'bandpass', hz: r.range(2500, 6000), q: 0.9 }, { tau: 0.012 }),
      at: (i / count) * 0.45 + r.range(0, 0.03),
      gain: r.range(0.3, 0.9),
    });
  }
  parts.push({
    buf: burst(0.4, r, { kind: 'bandpass', hz: 900, q: 0.6 }, { tau: 0.15, attack: 0.05 }),
    at: 0,
    gain: 0.25,
  });
  return filter(layer(parts), 'lowpass', 7500, 0.7);
}

/** Two quick snips of pruning shears. */
export function shearsSnip(): Float32Array {
  const r = rand(seedOf('shears'));
  const snip = (): Float32Array => {
    const click = burst(0.03, r, { kind: 'bandpass', hz: 5200, q: 2 }, { tau: 0.006, attack: 0.0006 });
    const ring = glide(3400, 3000, 0.08, { tau: 0.02, attack: 0.0008, harmonics: [1, 0.4] });
    return layer([
      { buf: click, at: 0, gain: 1 },
      { buf: ring, at: 0, gain: 0.35 },
    ]);
  };
  return layer([
    { buf: snip(), at: 0, gain: 0.9 },
    { buf: snip(), at: 0.17, gain: 1 },
  ]);
}

/** Water from a can onto leaves and soil: a soft pattering hiss that rises and falls. */
export function waterPour(): Float32Array {
  const r = rand(seedOf('water-pour'));
  const length = 1.5;
  const n = samples(length);
  const hiss = burst(length, r, { kind: 'bandpass', hz: 3800, q: 0.55 }, { tau: 100, attack: 0.1, pink: true });
  const droplets = new Float32Array(n);
  for (let i = 0; i < 46; i++) {
    const at = Math.floor(r.range(0.05, 0.95) * n);
    mixInto(
      droplets,
      burst(0.02, r, { kind: 'bandpass', hz: r.range(2200, 5200), q: 2 }, { tau: 0.005 }),
      at,
      r.range(0.15, 0.5),
    );
  }
  const swell = new Float32Array(n);
  for (let i = 0; i < n; i++) swell[i] = Math.sin(Math.PI * (i / n)) ** 0.6;
  for (let i = 0; i < n; i++) hiss[i] = hiss[i]! * swell[i]! * 0.6 + droplets[i]! * swell[i]!;
  return filter(hiss, 'lowpass', 9000, 0.7);
}
