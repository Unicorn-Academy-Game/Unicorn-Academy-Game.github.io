import type { ReadingSounds } from '../game/reading-ports';
import type { WonderSound } from '../wonder/sound';
import { chord, LADDER, note, play, run, type Score, type Sound } from './spell-sounds';

/**
 * What the reading computer sounds like, apart from the voice. It is made the way the spelling
 * sounds are: every note is made at the moment it is asked for, in the key the rest of the game is
 * in, so a word of any length is a little tune and nothing is out of tune. A tile that is touched
 * rings a step higher than the last. Nothing is loud, sharp or startling, and a touch of the wrong
 * one is a soft low note and never a buzz. They go to the effects level, so the volume and the mute
 * the player has set govern them.
 */

/** The computer wakes up: three small bells going up, and a sparkle on the last. */
export const openScore = (): Score => [
  { at: 0, voice: 'glass', midi: note(0), gain: 0.45, seconds: 0.4 },
  { at: 0.08, voice: 'glass', midi: note(2), gain: 0.45, seconds: 0.4 },
  { at: 0.16, voice: 'glass', midi: note(5), gain: 0.5, seconds: 0.6 },
  { at: 0.16, fx: 'twinkle', gain: 0.35, size: 0.2 },
];

/**
 * The `index`th tile of a word, or word of a sentence, was touched (the first is 0), of `of`. Each
 * rings a step higher than the last and starts again from the bottom after a few, so a long word
 * never goes shrill. The last has a sparkle with it.
 */
export const tileScore = (index: number, of: number): Score => {
  const midi = note(index % LADDER);
  const last = index === of - 1;
  return [
    { at: 0, voice: 'marimba', midi, gain: 0.85 },
    ...(last ? [{ at: 0, voice: 'glass' as const, midi, gain: 0.35, seconds: 0.5 }] : []),
  ];
};

/**
 * A touch of the one that was not next. Soft and low, and in the key, so it is a nudge and never a
 * buzz.
 */
export const bounceScore = (): Score => [{ at: 0, voice: 'pluck', midi: note(-4), gain: 0.3, seconds: 0.2 }];

/**
 * The pieces come together into the word: a sweep, and three notes of a chord going up as they
 * meet.
 */
export const joinScore = (): Score => [
  { at: 0, fx: 'whoosh', gain: 0.3, size: 0.25 },
  { at: 0.12, voice: 'chime', midi: note(2), gain: 0.5, seconds: 0.5 },
  { at: 0.2, voice: 'chime', midi: note(4), gain: 0.5, seconds: 0.5 },
  { at: 0.28, voice: 'chime', midi: note(7), gain: 0.55, seconds: 0.7 },
];

/** The one the player needs began to shine, or the word was said to them. */
export const hintScore = (): Score => [{ at: 0, fx: 'twinkle', gain: 0.5, size: 0.2 }];

/**
 * A thing was read. One the player needed help with is a short climb and a soft chime. One they
 * read with no help is the little fanfare with a star. A word they now read on their own is made
 * more of, with a longer climb, a bigger chord and two stars.
 */
export function foundScore(clean: boolean, reads: boolean): Score {
  if (reads) {
    return [
      ...run('harp', 0, 10, 0.06, 0.65, 1.1),
      ...chord('chime', [5, 7, 10], 0.7, 0.62, 1.4),
      { at: 0.62, fx: 'cheer', gain: 0.7, size: 0.5 },
      { at: 1.3, fx: 'star', gain: 0.8, size: 0.5, step: 2 },
      { at: 1.62, fx: 'star', gain: 0.8, size: 0.5, step: 4 },
    ];
  }
  if (clean) {
    return [
      ...run('harp', 0, 6, 0.07, 0.65, 0.9),
      ...chord('chime', [5, 7], 0.6, 0.45, 1),
      { at: 0.45, fx: 'cheer', gain: 0.4, size: 0.3 },
      { at: 0.8, fx: 'star', gain: 0.8, size: 0.5, step: 2 },
    ];
  }
  return [...run('harp', 0, 4, 0.08, 0.5, 0.8), ...chord('chime', [5], 0.4, 0.3, 0.8)];
}

/**
 * A stage was cleared, which is a fanfare of its own, and the last stage of a chapter is a bigger
 * one.
 */
export function clearedScore(chapter: boolean): Score {
  const score: Sound[] = [
    ...run('harp', 0, 10, 0.06, 0.65, 1.1),
    ...chord('chime', [5, 7, 10], 0.7, 0.62, 1.4),
    { at: 0, fx: 'swell', gain: 0.5, size: 0.4 },
    { at: 0.62, fx: 'cheer', gain: chapter ? 0.9 : 0.7, size: chapter ? 0.8 : 0.5 },
  ];
  if (chapter) score.push(...run('glass', 2, 8, 0.07, 0.4, 0.8, 1.1));
  return score;
}

/**
 * The round is over: a note for each thing the player read, each higher than the last, and a chord
 * that is bigger the more of the seven they read.
 */
export function roundScore(read: number): Score {
  const count = Math.max(0, Math.min(7, Math.floor(read)));
  if (count === 0) return [{ at: 0, voice: 'bell', midi: note(3), gain: 0.35, seconds: 0.6 }];
  return [
    ...run('harp', 0, count, 0.1, 0.6, 0.8),
    ...chord('chime', count >= 5 ? [5, 7, 10] : [5, 7], 0.6, count * 0.1 + 0.15, 1.2),
    { at: count * 0.1 + 0.15, fx: 'cheer', gain: 0.3 + count * 0.07, size: 0.2 + count * 0.07 },
  ];
}

/**
 * What reading sounds like, played on the game's sound. The sound is asked for each time, so it is
 * whatever the game has when it is needed.
 */
export class ReadingSoundBank implements ReadingSounds {
  constructor(private readonly sound: () => WonderSound) {}

  open(): void {
    play(this.sound(), openScore());
  }

  tile(at: number, of: number): void {
    play(this.sound(), tileScore(at, of));
  }

  bounce(): void {
    play(this.sound(), bounceScore());
  }

  join(): void {
    play(this.sound(), joinScore());
  }

  hint(): void {
    play(this.sound(), hintScore());
  }

  found(clean: boolean, reads: boolean): void {
    play(this.sound(), foundScore(clean, reads));
  }

  cleared(chapter: boolean): void {
    play(this.sound(), clearedScore(chapter));
  }

  round(read: number): void {
    play(this.sound(), roundScore(read));
  }
}
