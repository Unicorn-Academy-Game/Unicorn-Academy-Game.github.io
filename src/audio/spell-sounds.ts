import { occasionOf, type Worth } from '../learning';
import { scaleNote } from '../wonder/music';
import type { FxName, VoiceName, WonderSound } from '../wonder/sound';
import { TONIC } from './synth/sfx';

/**
 * What spelling sounds like. Every note is made at the moment it is asked for, in the key the rest
 * of the game's synth is in, so no sound file ships and any run of letters is in tune with
 * everything else. The sounds are gentle: a letter that is right rings, a key that is not is a soft
 * low note, and a word that is finished is a little fanfare, and nothing is ever loud, sharp or
 * startling. They go to the effects level, so the volume and the mute the player has set govern
 * them.
 */

/** One sound of a score, and when it starts, in seconds from when the score is played. */
export type Sound =
  | {
      readonly at: number;
      readonly voice: VoiceName;
      readonly midi: number;
      readonly gain: number;
      readonly seconds?: number;
    }
  | { readonly at: number; readonly fx: FxName; readonly gain: number; readonly size?: number; readonly step?: number };

export type Score = readonly Sound[];

/** The note `n` steps up the key's pentatonic scale from the tonic. */
export const note = (n: number): number => scaleNote(TONIC, n);

/**
 * How many steps the letters climb before they start again from the bottom, so a long word never
 * goes shrill.
 */
export const LADDER = 10;

/** A run of notes up the scale, one after another. */
export const run = (
  voice: VoiceName,
  from: number,
  count: number,
  gap: number,
  gain: number,
  seconds?: number,
  at = 0,
): Sound[] =>
  Array.from({ length: count }, (_, i) => ({
    at: at + i * gap,
    voice,
    midi: note(from + i),
    gain,
    ...(seconds !== undefined ? { seconds } : {}),
  }));

/** Notes that sound together. */
export const chord = (voice: VoiceName, steps: readonly number[], gain: number, at: number, seconds: number): Sound[] =>
  steps.map((n) => ({ at, voice, midi: note(n), gain, seconds }));

/** The card opens: two small bells, the second higher. */
export const openScore = (): Score => [
  { at: 0, voice: 'bell', midi: note(2), gain: 0.5 },
  { at: 0.09, voice: 'bell', midi: note(4), gain: 0.4 },
];

/** A page of the book turns: one soft bell. */
export const turnScore = (): Score => [{ at: 0, voice: 'bell', midi: note(3), gain: 0.3 }];

/**
 * A right letter lands. Each one is a step higher than the last, and the last of the word has a
 * little sparkle with it.
 */
export const letterScore = (index: number, last: boolean): Score => {
  const midi = note(index % LADDER);
  return [
    { at: 0, voice: 'marimba', midi, gain: 0.9 },
    ...(last ? [{ at: 0, voice: 'glass' as const, midi, gain: 0.35, seconds: 0.5 }] : []),
  ];
};

/**
 * A key that is not the next letter. Soft and low, and in the key, so it is a nudge and never a
 * buzz.
 */
export const missScore = (): Score => [{ at: 0, voice: 'pluck', midi: note(-4), gain: 0.32, seconds: 0.2 }];

/** A faded key is touched. The game heard the player, and nothing else happens. */
export const fadedScore = (): Score => [{ at: 0, fx: 'tap', gain: 0.3 }];

/** The right key starts to glow. */
export const hintScore = (): Score => [{ at: 0, fx: 'twinkle', gain: 0.5, size: 0.2 }];

/** The picture sets off for the book, and arrives. */
export const flyScore = (): Score => [
  { at: 0, fx: 'whoosh', gain: 0.3, size: 0.25 },
  { at: 0.55, fx: 'coin', gain: 0.6 },
];

/**
 * A word is spelled. Every word gets a short climb of harp and a bright chord. A new star adds a
 * rising jingle for each star earned, and a round number of words, a finished page and the whole
 * book are each a bigger celebration than the last.
 */
export function doneScore(reward: Worth): Score {
  const occasion = occasionOf(reward);
  const big = occasion === 'everything';
  const page = occasion === 'page';
  const round = occasion === 'milestone';
  const score: Sound[] = [];
  if (big || page || round) {
    score.push(...run('harp', 0, 10, 0.06, 0.65, 1.1));
    score.push(...chord('chime', [5, 7, 10], 0.7, 0.62, 1.4));
    score.push({ at: 0.62, fx: 'cheer', gain: big ? 0.9 : 0.7, size: big ? 0.9 : page ? 0.7 : 0.5 });
    if (page || big) score.push({ at: 0, fx: 'swell', gain: 0.5, size: 0.4 });
    if (big) score.push(...run('glass', 2, 8, 0.07, 0.4, 0.8, 1.1));
  } else {
    score.push(...run('harp', 0, 6, 0.07, 0.65, 0.9));
    score.push(...chord('chime', [5, 7], 0.6, 0.45, 1));
    score.push({ at: 0.45, fx: 'cheer', gain: 0.4, size: 0.3 });
  }
  // A star for each one the player has just earned, each higher than the one before.
  const first = big || page || round ? 1.3 : 0.7;
  for (let k = 0; k < reward.stars.after - reward.stars.before; k++)
    score.push({ at: first + k * 0.32, fx: 'star', gain: 0.8, size: 0.5, step: 2 * (reward.stars.before + k) });
  return score;
}

/** How long a score takes, from the first sound to the last one starting. */
export const lengthOf = (score: Score): number => score.reduce((end, s) => Math.max(end, s.at), 0);

/** Plays a score on a sound. */
export function play(sound: WonderSound, score: Score): void {
  for (const s of score) {
    if ('voice' in s)
      sound.note(s.voice, s.midi, {
        gain: s.gain,
        delay: s.at,
        ...(s.seconds !== undefined ? { seconds: s.seconds } : {}),
      });
    else
      sound.fx(s.fx, {
        gain: s.gain,
        delay: s.at,
        ...(s.size !== undefined ? { size: s.size } : {}),
        ...(s.step !== undefined ? { step: s.step } : {}),
      });
  }
}

/**
 * What spelling sounds like, played on the game's sound. The sound is asked for each time, so it is
 * whatever the game has when it is needed.
 */
export class SpellSounds {
  constructor(private readonly sound: () => WonderSound) {}

  /** The card opens, or the book does. */
  open(): void {
    play(this.sound(), openScore());
  }

  /** A page of the book turns. */
  turn(): void {
    play(this.sound(), turnScore());
  }

  /** The `index`th letter of the word (the first is 0) was right. */
  letter(index: number, last: boolean): void {
    play(this.sound(), letterScore(index, last));
  }

  miss(): void {
    play(this.sound(), missScore());
  }

  faded(): void {
    play(this.sound(), fadedScore());
  }

  hint(): void {
    play(this.sound(), hintScore());
  }

  fly(): void {
    play(this.sound(), flyScore());
  }

  done(reward: Worth): void {
    play(this.sound(), doneScore(reward));
  }
}
