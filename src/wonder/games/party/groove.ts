import {
  arpeggio,
  bass,
  CHORDS,
  type Chord,
  chimes,
  drum,
  type Layer,
  pad,
  rhythm,
  type Slot,
  STEPS,
  type Style,
  voicing,
} from '../../engine/band';
import type { VoiceName } from '../../sound';

/**
 * The music of the party. It is one song of six parts, and each friend brings her part when she is
 * touched: one the beat, one a bouncing marimba, one the claps, one a harp, one a riff, one a pad
 * with a flute over it. Nothing plays until somebody is dancing but a quiet glass and a hum, and
 * the song is the dancers. Every part is of the one key, so any of them with any other is right.
 */

/** How many parts there are. */
export const PART_COUNT = 6;

/** What a part is, so that the game can show it and play its first notes at once. */
export interface PartInfo {
  readonly name: string;
  /**
   * The instrument she is heard as, and where her notes are played from, for the flourish when she
   * is touched.
   */
  readonly voice: VoiceName;
  readonly low: number;
  /** The rhythm that she dances to and sparkles on: where in the bar her part sounds. */
  readonly marks: readonly number[];
}

const marks = rhythm;

export const PARTS: readonly PartInfo[] = [
  { name: 'beat', voice: 'kick', low: 36, marks: marks('x...x...x...x...') },
  { name: 'marimba', voice: 'marimba', low: 60, marks: marks('x.xx.x.xx.xx.x.x') },
  { name: 'claps', voice: 'snare', low: 60, marks: marks('....x.......x...') },
  { name: 'harp', voice: 'harp', low: 60, marks: marks('x.x.x.x.x.x.x.x.') },
  { name: 'riff', voice: 'pluck', low: 72, marks: marks('x..x..x...x..x..') },
  { name: 'flute', voice: 'flute', low: 72, marks: marks('..x...x...x...x.') },
];

/** Whether a part sounds at a sixteenth of the bar. */
export const sounds = (part: number, step: number): boolean => (PARTS[part]?.marks[step % STEPS] ?? 0) > 0;

/**
 * Which parts each of `friends` brings, in the order she brings them. A friend who is touched again
 * brings her next.
 */
export function partsOf(friends: number): number[][] {
  const k = Math.max(1, Math.min(PART_COUNT, friends));
  const each: number[][] = Array.from({ length: k }, () => []);
  for (let part = 0; part < PART_COUNT; part++) each[part % k]!.push(part);
  return each;
}

/** The tempo of the party, and how much quicker the parade is. */
export const TEMPO = 112;

/** What is playing: which parts have been brought in, and whether the parade has begun. */
export class Groove {
  /** Which parts are playing. */
  readonly on: boolean[] = Array.from({ length: PART_COUNT }, () => false);
  /** The parade: the whole band and a drum roll. */
  march = false;
  readonly style: Style = styleOf(this);

  get playing(): number {
    return this.on.filter(Boolean).length;
  }

  join(part: number): void {
    if (part >= 0 && part < PART_COUNT) this.on[part] = true;
  }

  reset(): void {
    this.on.fill(false);
    this.march = false;
  }
}

/** A layer that sounds only while its part is playing. */
const part = (groove: Groove, index: number, layer: Layer): Layer => ({
  ...layer,
  play: (slot: Slot) => (groove.on[index] ? layer.play(slot) : null),
});

/** A layer that sounds only for the parade. */
const parade = (groove: Groove, layer: Layer): Layer => ({
  ...layer,
  play: (slot: Slot) => (groove.march ? layer.play(slot) : null),
});

/**
 * The party's song as a style that is played by whoever is dancing. A style says what its layers
 * are, and these layers each ask the groove if they are wanted, so the band plays whatever is going
 * on without being told.
 */
function styleOf(groove: Groove): Style {
  const always = { joins: 0 } as const;
  return {
    name: 'party-time',
    tempo: TEMPO,
    swing: 0.05,
    progression: [CHORDS.Am, CHORDS.D, CHORDS.G, CHORDS.C],
    layers: [
      // Before anyone dances: the room, a hum and now and then a glass note, waiting.
      pad({ ...always, gain: 0.2 }),
      chimes('glass', 'x...x...x...x...', 0.42, { ...always, gain: 0.15, low: 72, span: 14, pan: 0.3 }),
      // The beat: four to the floor and a bass that jumps an octave.
      part(groove, 0, drum('kick', 'x...x...x...x...', { ...always, gain: 0.52 })),
      part(groove, 0, bass('X.x.X.x.X.x.X.x.', { ...always, gain: 0.54 })),
      part(
        groove,
        1,
        arpeggio('marimba', 'x.xx.x.xx.xx.x.x', { ...always, gain: 0.38, run: 'skip', low: 60, pan: -0.2 }),
      ),
      part(groove, 2, drum('snare', '....x.......x...', { ...always, gain: 0.3 })),
      part(groove, 2, drum('hat', 'o.X.o.X.o.X.o.X.', { ...always, gain: 0.18 })),
      part(
        groove,
        3,
        arpeggio('harp', 'x.x.x.x.x.x.x.x.', { ...always, gain: 0.28, run: 'updown', low: 60, pan: 0.2 }),
      ),
      part(groove, 3, chimes('glass', '..x...x...x...x.', 0.6, { ...always, gain: 0.2, low: 84, span: 12, pan: -0.3 })),
      part(
        groove,
        4,
        arpeggio('pluck', 'x..x..x...x..x..', { ...always, gain: 0.36, run: 'updown', low: 72, pan: 0.25 }),
      ),
      part(groove, 5, pad({ ...always, gain: 0.3 })),
      part(
        groove,
        5,
        chimes('flute', '..x...x...x...x.', 0.7, { ...always, gain: 0.24, low: 72, span: 14, pan: -0.25 }),
      ),
      // The parade: a roll on the drum and the beat doubled.
      parade(groove, drum('snare', 'xoxoxoxoxoxoxoxx', { ...always, gain: 0.2 })),
      parade(groove, drum('kick', 'x.x.x.x.x.x.x.x.', { ...always, gain: 0.34 })),
    ],
  };
}

/** The whole song with every part playing, for the tools that look at all the music at once. */
export const DISCO: Style = (() => {
  const groove = new Groove();
  groove.on.fill(true);
  return styleOf(groove);
})();

/**
 * One note of what a friend plays the moment she is touched, so she is heard before her part comes
 * round: when it sounds after now, and what.
 */
export interface Flourish {
  readonly voice: VoiceName;
  readonly midi: number;
  readonly after: number;
  readonly gain: number;
}

/**
 * What a part plays when its friend is touched, on the chord that is playing: a short run of its
 * own sound.
 */
export function flourishOf(index: number, chord: Chord): Flourish[] {
  const info = PARTS[index] ?? PARTS[0]!;
  if (info.voice === 'kick') {
    const root = voicing(chord, 36)[0]!;
    return [
      { voice: 'kick', midi: 60, after: 0, gain: 0.9 },
      { voice: 'bass', midi: root, after: 0.09, gain: 0.8 },
      { voice: 'bass', midi: root + 12, after: 0.18, gain: 0.7 },
    ];
  }
  if (info.voice === 'snare') {
    return [
      { voice: 'snare', midi: 60, after: 0, gain: 0.7 },
      { voice: 'snare', midi: 60, after: 0.1, gain: 0.55 },
      { voice: 'hat', midi: 60, after: 0.17, gain: 0.5 },
      { voice: 'snare', midi: 60, after: 0.22, gain: 0.8 },
    ];
  }
  const notes = voicing(chord, info.low);
  const ladder = [...notes, notes[0]! + 12];
  return ladder.map((midi, i) => ({ voice: info.voice, midi, after: i * 0.07, gain: 0.75 }));
}
