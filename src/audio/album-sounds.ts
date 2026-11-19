import type { WonderSound } from '../wonder/sound';
import { chord, flyScore, note, play, run, type Score } from './spell-sounds';

/**
 * What the sticker book and the camera sound like, made from the same notes as everything else so
 * they are in tune with the rest of the game. They are small and glad, and nothing here is ever
 * loud or sharp.
 */

/** A sticker is stuck on: a soft tap, a short climb of harp, and a chime over a sparkle. */
export const stickerScore = (): Score => [
  { at: 0, fx: 'tap', gain: 0.5 },
  ...run('harp', 0, 5, 0.07, 0.6, 0.8, 0.08),
  ...chord('chime', [4, 7], 0.55, 0.42, 1),
  { at: 0.42, fx: 'twinkle', gain: 0.5, size: 0.3 },
];

/** A picture is taken: a quick tap like a click, and two small bells going up, as bright as a flash. */
export const shutterScore = (): Score => [
  { at: 0, fx: 'tap', gain: 0.55 },
  { at: 0.07, voice: 'bell', midi: note(5), gain: 0.4 },
  { at: 0.15, voice: 'bell', midi: note(8), gain: 0.35 },
  { at: 0.15, fx: 'twinkle', gain: 0.35, size: 0.2 },
];

/** A picture is put in the album, or taken out: a soft tap and one low bell. */
export const keepScore = (): Score => [
  { at: 0, fx: 'tap', gain: 0.35 },
  { at: 0.05, voice: 'bell', midi: note(2), gain: 0.3 },
];

/** A stamp goes down: a soft tap and one small bell, a little higher each time round the five that it can be. */
export const stampScore = (step = 0): Score => [
  { at: 0, fx: 'tap', gain: 0.45 },
  { at: 0.03, voice: 'bell', midi: note([2, 3, 5, 7, 8][((step % 5) + 5) % 5]!), gain: 0.28 },
];

/** A drawing is kept: three bells going up, and a twinkle, glad that something new is in the album. */
export const drawnScore = (): Score => [
  { at: 0, fx: 'tap', gain: 0.4 },
  { at: 0.05, voice: 'bell', midi: note(4), gain: 0.38 },
  { at: 0.14, voice: 'bell', midi: note(7), gain: 0.36 },
  { at: 0.23, voice: 'bell', midi: note(9), gain: 0.34 },
  { at: 0.23, fx: 'twinkle', gain: 0.35, size: 0.25 },
];

/**
 * The sounds of the sticker book, played on the game's sound. The sound is asked for each time, so
 * it is whatever the game has when it is needed.
 */
export class AlbumSounds {
  constructor(private readonly sound: () => WonderSound) {}

  /** A sticker is stuck in the book. */
  earned(): void {
    play(this.sound(), stickerScore());
  }

  /** The sticker sets off for the book's button, and arrives. */
  fly(): void {
    play(this.sound(), flyScore());
  }

  /** A picture is taken. */
  shutter(): void {
    play(this.sound(), shutterScore());
  }

  /** A picture is put away. */
  keep(): void {
    play(this.sound(), keepScore());
  }

  /** A stamp is pressed on a drawing. */
  stamped(step: number): void {
    play(this.sound(), stampScore(step));
  }

  /** A drawing is kept in the album. */
  drawn(): void {
    play(this.sound(), drawnScore());
  }
}
