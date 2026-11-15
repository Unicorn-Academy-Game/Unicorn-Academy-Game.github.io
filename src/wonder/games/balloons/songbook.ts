import { type Degree, degreeOf } from './notes';

/**
 * The songs the balloons teach. Every one is an old tune that belongs to everybody and sits inside
 * the five notes of the game, so a child can play it by popping the colours in order, and it sounds
 * like the song because it is the song.
 */

export interface Step {
  readonly degree: Degree;
  /** How long the note is held when the song plays itself, in beats. */
  readonly beats: number;
}

export interface Song {
  readonly id: string;
  /**
   * The song in pieces the player can hold in their head: the garland shows one piece at a time.
   */
  readonly phrases: readonly (readonly Step[])[];
}

/**
 * The most notes in a phrase, which is as many balloons as fit in the garland on a narrow screen.
 */
export const LONGEST_PHRASE = 8;

/**
 * A song written down as letters, `|` between phrases, and `:2` after a note for a note that lasts
 * two beats.
 */
function written(id: string, text: string): Song {
  const phrases = text.split('|').map((phrase) =>
    phrase
      .trim()
      .split(/\s+/)
      .map((token): Step => {
        const [letter, beats] = token.split(':');
        return { degree: degreeOf(letter!), beats: beats === undefined ? 1 : Number(beats) };
      }),
  );
  return { id, phrases };
}

export const SONGS: readonly Song[] = [
  written('mary', 'E D C D E E E:2 | D D D:2 | E G G:2'),
  written('macdonald', 'C C C G | A A G:2 | E E D D | C:4'),
  written('buns', 'E D C:2 | E D C:2 | C C C C D D D D | E D C:2'),
  written('clair', 'C C C D E:2 D:2 | C E D D C:4'),
  written('jingle', 'E E E:2 | E E E:2 | E G C D E:4'),
  written('lamb', 'E D C D E E E E | D D E D C:4'),
  written('susanna', 'C D E G G A G E | C D E E D C D:2'),
];

/** What a pop did to the song the player is on. */
export type Outcome =
  /** It was not the note that is wanted. Nothing is lost. */
  | 'free'
  /** It was the wanted note, and the phrase goes on. */
  | 'hit'
  /** It was the last note of a phrase. */
  | 'phrase'
  /** It was the last note of the song. */
  | 'song';

/**
 * Where the player is in the songbook. It asks for one note at a time, in order, and goes on to the
 * next song when a song is done. A balloon that is not the one asked for is never wrong: it plays
 * its own note and the song waits where it was.
 */
export class Progress {
  private songAt = 0;
  private phraseAt = 0;
  private stepAt = 0;
  private finished = 0;
  private lastSong: Song | null = null;
  private strays = 0;

  constructor(private readonly songs: readonly Song[] = SONGS) {
    if (songs.length === 0) throw new Error('the songbook is empty');
  }

  get song(): Song {
    return this.songs[this.songAt]!;
  }

  get phrase(): readonly Step[] {
    return this.song.phrases[this.phraseAt]!;
  }

  /** How many notes of the phrase the player has played. */
  get done(): number {
    return this.stepAt;
  }

  /** The note that is wanted now. */
  get target(): Degree {
    return this.phrase[this.stepAt]!.degree;
  }

  /**
   * The next `count` notes that will be wanted if the player plays them in order, the one wanted
   * now first. Fewer at the end of the song.
   */
  next(count: number): Degree[] {
    const steps = this.song.phrases.flat();
    const at = this.song.phrases.slice(0, this.phraseAt).reduce((n, p) => n + p.length, 0) + this.stepAt;
    return steps.slice(at, at + count).map((s) => s.degree);
  }

  /** How many songs the player has played to the end. */
  get completed(): number {
    return this.finished;
  }

  /** The song the player played last, to play back to them. */
  get played(): Song | null {
    return this.lastSong;
  }

  /**
   * Balloons the player has popped since the wanted one, so a game can point harder at it the
   * longer it is passed over.
   */
  get passed(): number {
    return this.strays;
  }

  /** The player popped a balloon of this note. */
  pop(degree: Degree): Outcome {
    if (degree !== this.target) {
      this.strays++;
      return 'free';
    }
    this.strays = 0;
    this.stepAt++;
    if (this.stepAt < this.phrase.length) return 'hit';
    this.stepAt = 0;
    this.phraseAt++;
    if (this.phraseAt < this.song.phrases.length) return 'phrase';
    this.phraseAt = 0;
    this.finished++;
    this.lastSong = this.song;
    this.songAt = (this.songAt + 1) % this.songs.length;
    return 'song';
  }

  /** Back to the first note of the first song. */
  reset(): void {
    this.songAt = 0;
    this.phraseAt = 0;
    this.stepAt = 0;
    this.finished = 0;
    this.lastSong = null;
    this.strays = 0;
  }
}
