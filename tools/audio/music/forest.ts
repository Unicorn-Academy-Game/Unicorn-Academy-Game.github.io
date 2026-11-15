/**
 * The forest theme: twelve bars of 4/4 at 80 bpm, exactly 36 seconds, in C with a lydian lift. Soft
 * felt piano and harp carry it, a breathy flute joins for the second and third phrases, a celesta
 * glitters on top, and warm pads hold the harmony underneath. The last bar leans on G so the loop
 * falls back into the first bar without a seam.
 */
import { midiHz, type Stereo, seedOf } from '../dsp';
import { Song } from '../song';
import { bell, flute, harp, pad, piano, sub, tick } from '../voices';

interface Chord {
  /** Voicing for the pad and the piano, low to high. */
  pad: number[];
  /** The bass note. */
  root: number;
  /** Pitch classes, for the harp's arpeggios. */
  pcs: number[];
}

const CHORDS: Chord[] = [
  { pad: [48, 55, 59, 64], root: 36, pcs: [0, 4, 7, 11] }, // Cmaj7
  { pad: [52, 55, 59, 62], root: 40, pcs: [4, 7, 11, 2] }, // Em7
  { pad: [53, 57, 60, 64], root: 41, pcs: [5, 9, 0, 4] }, // Fmaj7
  { pad: [55, 59, 62, 64], root: 43, pcs: [7, 11, 2, 4] }, // G6
  { pad: [55, 57, 60, 64], root: 45, pcs: [9, 0, 4, 7] }, // Am7
  { pad: [52, 55, 59, 64], root: 40, pcs: [4, 7, 11, 2] }, // Em
  { pad: [53, 57, 60, 64, 71], root: 41, pcs: [5, 9, 0, 4, 11] }, // Fmaj7 #11
  { pad: [55, 60, 62, 67], root: 43, pcs: [7, 0, 2, 4] }, // Gsus4
  { pad: [50, 57, 60, 65], root: 38, pcs: [2, 5, 9, 0] }, // Dm7
  { pad: [55, 60, 62, 65], root: 43, pcs: [7, 0, 2, 5] }, // G7sus4
  { pad: [48, 55, 59, 62, 64], root: 36, pcs: [0, 4, 7, 11, 2] }, // Cmaj9
  { pad: [55, 57, 60, 65], root: 43, pcs: [7, 5, 9, 0] }, // G11
];

/** Melody as [beat in bar, midi note, beats long]. */
const MELODY: [number, number, number][][] = [
  [
    [0, 76, 1.5],
    [1.5, 79, 0.5],
    [2, 81, 2],
  ],
  [
    [0, 79, 1],
    [1, 76, 1],
    [2, 71, 1],
    [3, 74, 1],
  ],
  [
    [0, 72, 1.5],
    [1.5, 74, 0.5],
    [2, 76, 1],
    [3, 79, 1],
  ],
  [
    [0, 81, 1],
    [1, 79, 1],
    [2, 74, 2],
  ],
  [
    [0, 84, 1.5],
    [1.5, 83, 0.5],
    [2, 81, 2],
  ],
  [
    [0, 79, 1],
    [1, 83, 1],
    [2, 79, 1],
    [3, 76, 1],
  ],
  [
    [0, 81, 1.5],
    [1.5, 84, 0.5],
    [2, 83, 1],
    [3, 81, 1],
  ],
  [
    [0, 79, 2],
    [2, 74, 1],
    [3, 76, 1],
  ],
  [
    [0, 77, 1.5],
    [1.5, 81, 0.5],
    [2, 86, 2],
  ],
  [
    [0, 84, 1],
    [1, 81, 1],
    [2, 79, 2],
  ],
  [
    [0, 76, 1.5],
    [1.5, 79, 0.5],
    [2, 86, 1],
    [3, 84, 1],
  ],
  [
    [0, 83, 2],
    [2, 79, 1],
    [3, 74, 1],
  ],
];

/** Chord tones from just below middle C up to the third octave, ascending. */
function ladder(pcs: number[], low = 59, high = 88): number[] {
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}

export function forestTheme(): Stereo {
  const s = new Song(80, 4, 12, seedOf('forest-theme'));
  const r = s.r;
  const eighth = s.beat / 2;

  for (let bar = 0; bar < 12; bar++) {
    const chord = CHORDS[bar]!;
    const phrase = Math.floor(bar / 4);
    const t0 = s.at(bar, 0);

    // Warm pads hold the harmony and swell a little with each phrase.
    const level = [0.5, 0.58, 0.68][phrase]!;
    for (const m of chord.pad)
      s.put(pad(midiHz(m), s.bar + 0.7, level, r, 1.3, 1.9), t0 - 0.05, { pan: (m - 60) / 30, send: 0.55, gain: 1 });
    // A low note under it all.
    s.put(sub(midiHz(chord.root), s.bar * 0.92, 0.34, r), t0, { send: 0.12 });

    // A quiet comp on the piano: the upper chord tones rolled on beats one and three.
    const upper = chord.pad.slice(1);
    upper.forEach((m, i) => {
      s.put(piano(midiHz(m + 12), s.beat * 1.9, 0.26 - i * 0.015, r), t0 + i * 0.03, {
        pan: 0.12,
        send: 0.4,
        loose: 0.006,
      });
    });
    upper.slice(0, 3).forEach((m, i) => {
      s.put(piano(midiHz(m + 12), s.beat * 1.5, 0.18 - i * 0.01, r), s.at(bar, 2) + i * 0.035, {
        pan: 0.12,
        send: 0.4,
        loose: 0.006,
      });
    });

    // The harp turns the chord over in eighths.
    const notes = ladder(chord.pcs);
    const patterns = [
      [0, 1, 2, 3, 4, 3, 2, 1],
      [0, 2, 1, 3, 2, 4, 3, 2],
      [0, 1, 2, 4, 3, 2, 5, 4],
    ];
    const pattern = patterns[phrase]!;
    pattern.forEach((idx, i) => {
      const m = notes[Math.min(idx, notes.length - 1)]!;
      const accent = i % 4 === 0 ? 1 : 0.68;
      s.put(harp(midiHz(m), s.beat * 2.4, (0.3 + phrase * 0.03) * accent, r), t0 + i * eighth, {
        pan: -0.3 + 0.05 * (i % 3),
        send: 0.5,
        loose: 0.005,
      });
      if (phrase === 2 && i % 2 === 0)
        s.put(bell('celesta', midiHz(m + 12), 0.16, r), t0 + i * eighth + 0.01, { pan: 0.35, send: 0.65 });
    });
  }

  // The tune. The piano sings it first, then the flute takes it, with the celesta ringing on top.
  MELODY.forEach((line, bar) => {
    const phrase = Math.floor(bar / 4);
    for (const [beat, m, len] of line) {
      const t = s.at(bar, beat);
      const dur = len * s.beat;
      if (phrase === 0) {
        s.put(piano(midiHz(m), dur * 1.15, 0.52, r), t, { pan: 0.1, send: 0.42, loose: 0.008 });
        if (beat === 0 || len >= 2) s.put(bell('celesta', midiHz(m + 12), 0.22, r), t + 0.01, { pan: 0.3, send: 0.6 });
      } else {
        s.put(flute(midiHz(m), dur * 0.97, phrase === 1 ? 0.7 : 0.78, r), t, { pan: 0.05, send: 0.5, loose: 0.01 });
        s.put(piano(midiHz(m - 12), dur, 0.2, r), t, { pan: -0.1, send: 0.4 });
        if (phrase === 2 && (beat === 0 || len >= 2))
          s.put(bell('celesta', midiHz(m + 12), 0.2, r), t + 0.012, { pan: 0.35, send: 0.65 });
      }
    }
  });

  // Glitter in the gaps, placed once and kept, so each loop sounds the same and still feels alive.
  const sparkle = [88, 91, 93, 96, 100];
  for (let i = 0; i < 14; i++) {
    const bar = 3 + Math.floor((i * 9) / 14);
    const beat = [1.5, 2.5, 3.5, 0.5][i % 4]!;
    s.put(
      bell(i % 3 === 0 ? 'glass' : 'glock', midiHz(sparkle[(i * 3) % sparkle.length]! - 12), 0.12 + (i % 3) * 0.03, r),
      s.at(bar, beat),
      { pan: -0.6 + (i % 5) * 0.3, send: 0.8 },
    );
  }
  // A whisper of brushed pulse in the last phrase.
  for (let bar = 8; bar < 12; bar++)
    for (const beat of [1, 3]) s.put(tick(0.1, r), s.at(bar, beat), { pan: 0.4, send: 0.2 });

  return s.render({ size: 0.82, damping: 0.4, preDelay: 0.025 }, 1.05);
}
