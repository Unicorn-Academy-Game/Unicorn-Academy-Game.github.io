/**
 * The Santa grove theme: sixteen bars of 4/4 at 120 bpm, exactly 32 seconds, in G. A sleigh ride.
 * The tune is the chorus of "Jingle Bells", which James Lord Pierpont published in 1857 and which is
 * in the public domain. Glockenspiel and celesta play it first over sleigh bells, a felt piano and
 * a soft pad; a flute takes it the second time round, and the loop ends on the chord it began on.
 */
import { midiHz, type Rand, SR, type Stereo, seedOf } from '../dsp';
import { Song } from '../song';
import { bell, flute, harp, pad, piano, sub, tick } from '../voices';

interface Chord {
  pad: number[];
  root: number;
}

const G: Chord = { pad: [55, 59, 62, 67], root: 43 };
const C: Chord = { pad: [55, 60, 64, 67], root: 48 };
const D: Chord = { pad: [57, 62, 66, 69], root: 50 };

const CHORDS: Chord[] = [G, G, G, G, C, G, G, D, G, G, G, G, C, G, D, G];

/** The tune as it lies in C, as [beat, note, beats]. It is raised a fifth into G when it is played. */
const E = 64;
const F = 65;
const Gn = 67;
const Cn = 60;
const Dn = 62;
type Bar = [number, number, number][];

const HEAD: Bar[] = [
  [
    [0, E, 1],
    [1, E, 1],
    [2, E, 2],
  ],
  [
    [0, E, 1],
    [1, E, 1],
    [2, E, 2],
  ],
  [
    [0, E, 1],
    [1, Gn, 1],
    [2, Cn, 1.5],
    [3.5, Dn, 0.5],
  ],
  [[0, E, 4]],
  [
    [0, F, 1],
    [1, F, 1],
    [2, F, 1.5],
    [3.5, F, 0.5],
  ],
  [
    [0, F, 1],
    [1, E, 1],
    [2, E, 1],
    [3, E, 0.5],
    [3.5, E, 0.5],
  ],
];
const FIRST_END: Bar[] = [
  [
    [0, E, 1],
    [1, Dn, 1],
    [2, Dn, 1],
    [3, E, 1],
  ],
  [
    [0, Dn, 2],
    [2, Gn, 2],
  ],
];
const SECOND_END: Bar[] = [
  [
    [0, Gn, 1],
    [1, Gn, 1],
    [2, F, 1],
    [3, Dn, 1],
  ],
  [[0, Cn, 4]],
];
const MELODY: Bar[] = [...HEAD, ...FIRST_END, ...HEAD, ...SECOND_END];

/** A shake of the sleigh bells: three quick, bright ticks, close together. */
function jingle(vel: number, r: Rand): Float32Array {
  const n = Math.round(0.16 * SR);
  const out = new Float32Array(n);
  for (const [at, v] of [
    [0, 1],
    [0.028, 0.7],
    [0.056, 0.5],
  ] as const) {
    const hit = tick(vel * v, r, 6800 + r.next() * 1800);
    const off = Math.round(at * SR);
    for (let i = 0; i < hit.length && off + i < n; i++) out[off + i] = out[off + i]! + hit[i]!;
  }
  return out;
}

export function snowTheme(): Stereo {
  const s = new Song(120, 4, 16, seedOf('snow-theme'));
  const r = s.r;

  for (let bar = 0; bar < 16; bar++) {
    const chord = CHORDS[bar]!;
    const second = bar >= 8;
    const t0 = s.at(bar, 0);

    // A warm pad under everything, a little fuller the second time round.
    for (const m of chord.pad)
      s.put(pad(midiHz(m), s.bar + 0.5, second ? 0.5 : 0.4, r, 0.8, 1.5, 1.2), t0 - 0.04, {
        pan: (m - 62) / 24,
        send: 0.5,
      });

    // Oom, pah: the bass on one and three, the chord on two and four.
    for (const beat of [0, 2]) s.put(sub(midiHz(chord.root), s.beat * 1.5, 0.34, r), s.at(bar, beat), { send: 0.1 });
    for (const beat of [1, 3])
      for (const [i, m] of chord.pad.entries())
        s.put(piano(midiHz(m + 12), s.beat * 0.8, 0.2 - i * 0.012, r), s.at(bar, beat) + i * 0.012, {
          pan: -0.2 + i * 0.1,
          send: 0.35,
          loose: 0.004,
        });

    // Sleigh bells on every beat, with a shake on the off beats.
    for (let beat = 0; beat < 4; beat++) {
      s.put(jingle(0.34 - (beat % 2) * 0.08, r), s.at(bar, beat), { pan: -0.3 + beat * 0.2, send: 0.25, loose: 0.006 });
      s.put(tick(0.16, r, 7400), s.at(bar, beat + 0.5), { pan: 0.4 - beat * 0.2, send: 0.2 });
    }

    // A harp run into each change of chord.
    if (CHORDS[bar + 1] !== chord && bar < 15)
      for (const [i, m] of chord.pad.entries())
        s.put(harp(midiHz(m + 24), s.beat * 0.9, 0.2, r), s.at(bar, 3 + i * 0.12), { pan: 0.3, send: 0.6 });
  }

  MELODY.forEach((line, bar) => {
    const second = bar >= 8;
    for (const [beat, note, len] of line) {
      const m = note + 7;
      const t = s.at(bar, beat);
      const dur = len * s.beat;
      if (!second) {
        s.put(bell('glock', midiHz(m + 12), 0.42, r, 0.8), t, { pan: 0.15, send: 0.55, loose: 0.006 });
        s.put(piano(midiHz(m), dur, 0.34, r), t, { pan: 0.05, send: 0.4, loose: 0.006 });
        if (beat === 0) s.put(bell('celesta', midiHz(m + 12), 0.18, r), t + 0.01, { pan: 0.35, send: 0.6 });
      } else {
        s.put(flute(midiHz(m), dur * 0.95, 0.66, r), t, { pan: 0.05, send: 0.5, loose: 0.01 });
        s.put(bell('celesta', midiHz(m + 12), 0.24, r), t, { pan: 0.3, send: 0.6 });
        s.put(piano(midiHz(m - 12), dur, 0.16, r), t, { pan: -0.15, send: 0.4 });
      }
    }
  });

  // A little glitter that falls the way snow does, placed once and kept.
  const sparkle = [91, 95, 98, 102, 103];
  for (let i = 0; i < 18; i++) {
    const bar = 1 + Math.floor((i * 29) / 18);
    const beat = [1.5, 2.5, 0.5, 3.5][i % 4]!;
    s.put(
      bell(i % 2 ? 'glass' : 'glock', midiHz(sparkle[(i * 2) % sparkle.length]! - 12), 0.1 + (i % 3) * 0.03, r),
      s.at(bar, beat),
      { pan: -0.6 + (i % 5) * 0.3, send: 0.8 },
    );
  }

  return s.render({ size: 0.78, damping: 0.4, preDelay: 0.02 }, 1.0, { air: 1.5 });
}
