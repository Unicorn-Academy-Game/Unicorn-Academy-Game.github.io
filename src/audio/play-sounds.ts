import type { PlaySounds } from '../game/play-ports';
import type { WonderSound } from '../wonder/sound';
import { bounceScore, openScore } from './reading-sounds';
import { chord, note, play, run, type Score } from './spell-sounds';

/**
 * What the memory and maths tables sound like, apart from the voice. They are made the way the
 * spelling sounds are: every note is made at the moment it is asked for, in the key the rest of the
 * game is in, so a run of right answers is a little tune. Nothing is loud, sharp or startling, and
 * a try that is not it is a soft low note and never a buzz. They go to the effects level, so the
 * volume and the mute the player has set govern them.
 */

/** A card is turned, or a choice touched: a soft wooden note with a tap under it. */
const flipScore = (): Score => [
  { at: 0, voice: 'marimba', midi: note(2), gain: 0.55 },
  { at: 0, fx: 'tap', gain: 0.2 },
];

/** The most steps a run of right answers climbs, so a long run never goes shrill. */
const CLIMB = 4;

/**
 * Two cards the same, or an answer right: two chimes going up, each run of them a step higher than
 * the last, with a sparkle.
 */
function pairScore(streak: number): Score {
  const up = Math.min(CLIMB, Math.max(0, Math.floor(streak) - 1));
  return [
    { at: 0, voice: 'marimba', midi: note(3 + up), gain: 0.8 },
    { at: 0.1, voice: 'chime', midi: note(5 + up), gain: 0.55, seconds: 0.6 },
    { at: 0.1, fx: 'twinkle', gain: 0.3, size: 0.2 },
  ];
}

/**
 * The game or the round is over: a climb whose length is the stars, then a chord, a cheer, and a
 * star for each of the better ones.
 */
function finishScore(stars: number): Score {
  const n = Math.max(1, Math.min(3, Math.floor(stars)));
  const count = 3 + n * 2;
  const end = count * 0.09 + 0.1;
  return [
    ...run('harp', 0, count, 0.09, 0.6, 0.8),
    ...chord('chime', n >= 2 ? [5, 7, 10] : [5, 7], 0.6, end, 1.2),
    { at: end, fx: 'cheer', gain: 0.3 + n * 0.2, size: 0.2 + n * 0.15 },
    ...(n === 3
      ? [
          { at: end + 0.5, fx: 'star' as const, gain: 0.8, size: 0.5, step: 2 },
          { at: end + 0.8, fx: 'star' as const, gain: 0.8, size: 0.5, step: 4 },
        ]
      : []),
  ];
}

/**
 * What the tables sound like, played on the game's sound. The sound is asked for each time, so it
 * is whatever the game has when it is needed.
 */
export class PlaySoundBank implements PlaySounds {
  constructor(private readonly sound: () => WonderSound) {}

  open(): void {
    play(this.sound(), openScore());
  }

  flip(): void {
    play(this.sound(), flipScore());
  }

  pair(streak: number): void {
    play(this.sound(), pairScore(streak));
  }

  nudge(): void {
    play(this.sound(), bounceScore());
  }

  finish(stars: number): void {
    play(this.sound(), finishScore(stars));
  }
}
