/** Things in the world: doors, the chest, gems, the cups at the fountain, the palace's welcome. */
import { filter, midiHz, rand, samples, seedOf } from '../dsp';
import { pad } from '../voices';
import { bubble, burst, creak, ding, glide, layer, plink, sweep } from './kit';

/** A wooden door swinging open: a latch click, a soft creak that climbs, a rounded stop. */
export function doorOpen(): Float32Array {
  const r = rand(seedOf('door-open'));
  return layer([
    { buf: burst(0.03, r, { kind: 'bandpass', hz: 2400, q: 1.5 }, { tau: 0.006 }), at: 0, gain: 0.8 },
    { buf: filter(creak(0.55, r, { rate: [46, 78], pitch: [620, 1150] }), 'lowpass', 3200, 0.7), at: 0.06, gain: 0.55 },
    { buf: glide(110, 70, 0.14, { tau: 0.04 }), at: 0.62, gain: 0.35 },
  ]);
}

/** A door settling shut: a soft knock and a latch. */
export function doorClose(): Float32Array {
  const r = rand(seedOf('door-close'));
  return layer([
    { buf: glide(130, 62, 0.16, { tau: 0.045, attack: 0.003 }), at: 0, gain: 0.8 },
    { buf: burst(0.05, r, { kind: 'bandpass', hz: 700, q: 0.9 }, { tau: 0.012 }), at: 0, gain: 0.9 },
    { buf: burst(0.025, r, { kind: 'bandpass', hz: 2600, q: 1.6 }, { tau: 0.005 }), at: 0.09, gain: 0.5 },
  ]);
}

/** The treasure chest opening: a short creak, the lid, then a glitter that blooms. */
export function chestOpen(): Float32Array {
  const r = rand(seedOf('chest-open'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    { buf: filter(creak(0.28, r, { rate: [55, 85], pitch: [820, 1300] }), 'lowpass', 3200, 0.7), at: 0, gain: 0.45 },
    { buf: glide(150, 90, 0.1, { tau: 0.03 }), at: 0.28, gain: 0.6 },
    { buf: burst(0.04, r, { kind: 'bandpass', hz: 1300, q: 1 }, { tau: 0.01 }), at: 0.28, gain: 0.6 },
    { buf: sweep(1.0, r, 1800, 6800, 1.3), at: 0.3, gain: 0.1 },
    { buf: pad(midiHz(79), 1.1, 0.4, r, 0.2, 0.7, 1.4), at: 0.3, gain: 0.5 },
  ];
  [84, 88, 91, 96, 100, 103].forEach((m, i) => {
    parts.push({ buf: ding('glass', midiHz(m - 12), 0.4, r, 0.5), at: 0.33 + i * 0.06, gain: 0.9 });
  });
  return layer(parts);
}

/** The chest closing: the lid comes down softly. */
export function chestClose(): Float32Array {
  const r = rand(seedOf('chest-close'));
  return layer([
    { buf: glide(140, 80, 0.12, { tau: 0.035 }), at: 0, gain: 0.7 },
    { buf: burst(0.04, r, { kind: 'bandpass', hz: 1000, q: 0.9 }, { tau: 0.01 }), at: 0, gain: 0.7 },
    { buf: ding('glock', midiHz(79), 0.2, r, 0.38), at: 0.05, gain: 0.4 },
  ]);
}

/**
 * A gem catching the light: three or four high twinkles. Three variants so repeats do not match.
 */
export function gemSparkle(variant: number): Float32Array {
  const r = rand(seedOf(`gem-${variant}`));
  const sets = [
    [96, 100, 103, 108],
    [98, 103, 105, 110],
    [93, 98, 101, 105],
  ];
  const notes = sets[variant % sets.length]!;
  return layer(
    notes.map((m, i) => ({
      buf: ding('glass', midiHz(m - 12), 0.32, r, 0.5),
      at: i * (0.05 + variant * 0.01) + r.range(0, 0.012),
      gain: 1 - i * 0.12,
    })),
  );
}

/** A treasure bouncing: a soft rubbery boing under a bell. */
export function treasureBounce(): Float32Array {
  const r = rand(seedOf('treasure-bounce'));
  return layer([
    { buf: glide(240, 560, 0.2, { tau: 0.07, attack: 0.004, curve: 0.55 }), at: 0, gain: 0.5 },
    { buf: ding('marimba', midiHz(84), 0.5, r, 0.35), at: 0.03, gain: 0.8 },
    { buf: ding('glock', midiHz(96), 0.25, r, 0.38), at: 0.1, gain: 0.5 },
  ]);
}

/** A treasure lifting into the air and floating: a rising shimmer and a held glow. */
export function treasureFloat(): Float32Array {
  const r = rand(seedOf('treasure-float'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [
    { buf: sweep(1.6, r, 1500, 6800, 1.2), at: 0, gain: 0.12 },
    { buf: pad(midiHz(79), 1.8, 0.45, r, 0.6, 1.0, 1.4), at: 0, gain: 0.6 },
  ];
  [72, 76, 79, 84, 88, 91].forEach((m, i) => {
    parts.push({ buf: ding('celesta', midiHz(m), 0.34, r, 0.45), at: i * 0.15, gain: 0.8 });
  });
  return layer(parts);
}

/** The palace says welcome: a bright, open set of bells like a small fanfare, then sparkle. */
export function palaceWelcome(): Float32Array {
  const r = rand(seedOf('palace-welcome'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  [60, 67, 72, 76, 79].forEach((m, i) => {
    parts.push({ buf: ding('chime', midiHz(m + 12), 0.4, r, 0.9), at: i * 0.11, gain: 0.9 });
  });
  parts.push({ buf: ding('chime', midiHz(84), 0.5, r, 1.0), at: 0.62, gain: 0.9 });
  parts.push({ buf: pad(midiHz(72), 2.0, 0.4, r, 0.35, 1.2, 1.3), at: 0.05, gain: 0.55 });
  [91, 96, 100, 103].forEach((m, i) => {
    parts.push({ buf: ding('glock', midiHz(m - 12), 0.22, r, 0.38), at: 0.7 + i * 0.07, gain: 0.55 });
  });
  return layer(parts);
}

/** A cup filling: a trickle whose resonance climbs as the water rises, about a second. */
export function cupFill(): Float32Array {
  const r = rand(seedOf('cup-fill'));
  const seconds = 1.1;
  const n = samples(seconds);
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  const trickle = burst(seconds, r, { kind: 'bandpass', hz: 3000, q: 0.6 }, { tau: 100, attack: 0.08, pink: true });
  for (let i = 0; i < n; i++) trickle[i] = trickle[i]! * (0.35 + 0.65 * Math.sin(Math.PI * (i / n) ** 0.9));
  parts.push({ buf: trickle, at: 0, gain: 0.3 });
  for (let i = 0; i < 18; i++) {
    const u = i / 18;
    parts.push({
      buf: bubble(380 + 1100 * u + r.range(-40, 40), r.range(0.025, 0.045)),
      at: u * (seconds - 0.1),
      gain: 0.35 + 0.35 * u,
    });
  }
  return layer(parts);
}

/** Small gulps, for a unicorn drinking from a cup or the pond. */
export function drink(): Float32Array {
  const r = rand(seedOf('drink'));
  const parts: { buf: Float32Array; at: number; gain: number }[] = [];
  for (let i = 0; i < 3; i++) {
    parts.push({
      buf: glide(230 - i * 18, 130 - i * 8, 0.13, { tau: 0.05, attack: 0.012, harmonics: [1, 0.35] }),
      at: i * 0.27,
      gain: 0.7,
    });
    parts.push({
      buf: burst(0.1, r, { kind: 'bandpass', hz: 900, q: 1 }, { tau: 0.04, attack: 0.01 }),
      at: i * 0.27,
      gain: 0.25,
    });
    parts.push({ buf: plink(r.range(900, 1400), r), at: i * 0.27 + 0.08, gain: 0.3 });
  }
  return layer(parts);
}

/** A hoof stamping once: a soft, round knock with a little earth. */
export function stomp(): Float32Array {
  const r = rand(seedOf('stomp'));
  return layer([
    { buf: glide(105, 52, 0.16, { tau: 0.04, attack: 0.003 }), at: 0, gain: 0.8 },
    { buf: burst(0.1, r, { kind: 'bandpass', hz: 320, q: 0.8 }, { tau: 0.025 }), at: 0, gain: 0.8 },
    { buf: burst(0.2, r, { kind: 'highpass', hz: 2800 }, { tau: 0.05, attack: 0.01 }), at: 0.02, gain: 0.06 },
  ]);
}

/** A small hop onto a cloud: a puff of air and a gentle rising note. */
export function hop(): Float32Array {
  const r = rand(seedOf('hop'));
  return layer([
    {
      buf: burst(0.3, r, { kind: 'bandpass', hz: 1400, q: 0.5 }, { tau: 0.1, attack: 0.05, pink: true }),
      at: 0,
      gain: 0.25,
    },
    { buf: ding('marimba', midiHz(79), 0.4, r, 0.35), at: 0.12, gain: 0.8 },
  ]);
}

/** A lantern or brazier flickering on: a soft pop, not as big as the spell cues. */
export function ignite(): Float32Array {
  const r = rand(seedOf('ignite'));
  return layer([
    { buf: sweep(0.45, r, 200, 800, 0.8, (u) => Math.sin(Math.PI * u ** 0.7)), at: 0, gain: 0.5 },
    { buf: ding('glock', midiHz(84), 0.2, r, 0.38), at: 0.08, gain: 0.35 },
  ]);
}
