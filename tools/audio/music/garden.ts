/**
 * The palace garden theme: twenty bars of 3/4 at 100 bpm, exactly 36 seconds, in G. A gentle waltz
 * with a low note on the first beat and harp chords on the second and third. A felt piano sings the
 * opening tune, a flute answers it, and a glass-bright celesta and glockenspiel carry the middle.
 * Interiors play this same loop, quieter and darker.
 */
import { midiHz, type Stereo, seedOf } from '../dsp';
import { Song } from '../song';
import { bell, flute, harp, pad, piano, sub } from '../voices';

interface Chord {
  pad: number[];
  root: number;
}

const CHORDS: Chord[] = [
  { pad: [55, 59, 62, 67], root: 43 }, // G
  { pad: [57, 62, 66, 69], root: 42 }, // D/F#
  { pad: [55, 59, 64, 67], root: 40 }, // Em
  { pad: [55, 59, 60, 64], root: 48 }, // Cmaj7
  { pad: [55, 59, 62, 67], root: 47 }, // G/B
  { pad: [55, 57, 60, 64], root: 45 }, // Am7
  { pad: [57, 60, 62, 67], root: 50 }, // D7sus4
  { pad: [57, 62, 66, 69], root: 50 }, // D
  { pad: [55, 59, 62, 67], root: 43 }, // G
  { pad: [57, 59, 62, 66], root: 47 }, // Bm7
  { pad: [55, 59, 60, 64], root: 48 }, // Cmaj7
  { pad: [57, 62, 67, 69], root: 50 }, // Dsus4
  { pad: [55, 59, 62, 64], root: 40 }, // Em7
  { pad: [57, 59, 62, 66], root: 47 }, // Bm7
  { pad: [55, 57, 60, 64], root: 45 }, // Am7
  { pad: [57, 60, 62, 67], root: 50 }, // D7sus4
  { pad: [55, 59, 62, 67], root: 43 }, // G
  { pad: [55, 59, 64, 67], root: 40 }, // Em
  { pad: [55, 59, 60, 64], root: 48 }, // Cmaj7
  { pad: [57, 60, 62, 67], root: 50 }, // D7sus4
];

const MELODY: [number, number, number][][] = [
  [
    [0, 74, 1],
    [1, 79, 1],
    [2, 83, 1],
  ],
  [
    [0, 78, 1.5],
    [1.5, 76, 0.5],
    [2, 74, 1],
  ],
  [
    [0, 76, 1],
    [1, 79, 1],
    [2, 83, 1],
  ],
  [
    [0, 81, 1.5],
    [1.5, 79, 0.5],
    [2, 76, 1],
  ],
  [
    [0, 71, 1],
    [1, 74, 1],
    [2, 79, 1],
  ],
  [
    [0, 81, 1.5],
    [1.5, 79, 0.5],
    [2, 76, 1],
  ],
  [
    [0, 79, 2],
    [2, 81, 1],
  ],
  [
    [0, 78, 1.5],
    [1.5, 76, 0.5],
    [2, 74, 1],
  ],
  [
    [0, 79, 1],
    [1, 83, 1],
    [2, 86, 1],
  ],
  [
    [0, 86, 1.5],
    [1.5, 83, 0.5],
    [2, 81, 1],
  ],
  [
    [0, 83, 1],
    [1, 79, 1],
    [2, 76, 1],
  ],
  [
    [0, 81, 2],
    [2, 78, 1],
  ],
  [
    [0, 79, 1.5],
    [1.5, 83, 0.5],
    [2, 86, 1],
  ],
  [
    [0, 78, 1],
    [1, 83, 1],
    [2, 81, 1],
  ],
  [
    [0, 84, 1.5],
    [1.5, 83, 0.5],
    [2, 81, 1],
  ],
  [
    [0, 79, 2],
    [2, 81, 1],
  ],
  [
    [0, 83, 1],
    [1, 86, 1],
    [2, 83, 1],
  ],
  [
    [0, 79, 1.5],
    [1.5, 76, 0.5],
    [2, 79, 1],
  ],
  [
    [0, 76, 1],
    [1, 79, 1],
    [2, 84, 1],
  ],
  [
    [0, 83, 2],
    [2, 81, 1],
  ],
];

export function gardenTheme(): Stereo {
  const s = new Song(100, 3, 20, seedOf('garden-theme'));
  const r = s.r;

  for (let bar = 0; bar < 20; bar++) {
    const chord = CHORDS[bar]!;
    const section = bar < 8 ? 0 : bar < 12 ? 1 : bar < 16 ? 2 : 3;
    const t0 = s.at(bar, 0);

    // Strings-like pad, brighter than the forest's, swelling toward the middle of the tune.
    const level = [0.46, 0.55, 0.62, 0.52][section]!;
    for (const m of chord.pad)
      s.put(pad(midiHz(m), s.bar + 0.6, level, r, 0.9, 1.6, 1.35), t0 - 0.04, { pan: (m - 62) / 24, send: 0.55 });

    // Waltz: the bass note, then two chords.
    s.put(sub(midiHz(chord.root), s.beat * 2.6, 0.36, r), t0, { send: 0.12 });
    s.put(piano(midiHz(chord.root + 12), s.beat * 1.6, 0.3, r), t0, { pan: -0.1, send: 0.3, loose: 0.005 });
    const upper = chord.pad.slice(0, 4);
    for (const beat of [1, 2]) {
      upper.forEach((m, i) => {
        s.put(
          harp(midiHz(m + 12), s.beat * 1.3, (beat === 1 ? 0.3 : 0.24) - i * 0.015, r),
          s.at(bar, beat) + i * 0.028,
          { pan: -0.25 + i * 0.12, send: 0.5, loose: 0.004 },
        );
      });
    }
    // In the bright middle, the harp also runs a little arpeggio into each bar.
    if (section === 2) {
      upper.forEach((m, i) => {
        s.put(harp(midiHz(m + 24), s.beat * 0.9, 0.2, r), s.at(bar, 2.1) + i * 0.1, { pan: 0.3, send: 0.6 });
      });
    }
  }

  MELODY.forEach((line, bar) => {
    const section = bar < 8 ? 0 : bar < 12 ? 1 : bar < 16 ? 2 : 3;
    for (const [beat, m, len] of line) {
      const t = s.at(bar, beat);
      const dur = len * s.beat;
      if (section === 0) {
        s.put(piano(midiHz(m), dur * 1.2, 0.5, r), t, { pan: 0.1, send: 0.42, loose: 0.008 });
        if (beat === 0) s.put(bell('celesta', midiHz(m + 12), 0.2, r), t + 0.01, { pan: 0.3, send: 0.6 });
      } else if (section === 1 || section === 3) {
        s.put(flute(midiHz(m), dur * 0.97, 0.7, r), t, { pan: 0.05, send: 0.5, loose: 0.01 });
        s.put(piano(midiHz(m - 12), dur, 0.18, r), t, { pan: -0.1, send: 0.4 });
      } else {
        s.put(bell('glock', midiHz(m), 0.34, r, 0.8), t, { pan: 0.2, send: 0.6, loose: 0.008 });
        s.put(bell('celesta', midiHz(m + 12), 0.16, r), t + 0.01, { pan: 0.35, send: 0.6 });
        // The flute floats a held chord tone underneath.
        if (beat === 0)
          s.put(flute(midiHz(CHORDS[bar]!.pad[1]! + 12), s.bar * 0.9, 0.42, r), t, { pan: -0.15, send: 0.5 });
      }
    }
  });

  // A little glitter, placed once and kept.
  const sparkle = [91, 95, 98, 102, 103];
  for (let i = 0; i < 16; i++) {
    const bar = 2 + Math.floor((i * 17) / 16);
    const beat = [1.5, 2.5, 0.5][i % 3]!;
    s.put(
      bell(i % 2 ? 'glass' : 'glock', midiHz(sparkle[(i * 2) % sparkle.length]! - 12), 0.11 + (i % 3) * 0.03, r),
      s.at(bar, beat),
      { pan: -0.6 + (i % 5) * 0.3, send: 0.8 },
    );
  }

  return s.render({ size: 0.78, damping: 0.38, preDelay: 0.022 }, 1.0);
}
