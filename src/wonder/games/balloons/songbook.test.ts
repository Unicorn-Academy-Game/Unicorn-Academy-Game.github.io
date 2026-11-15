import { describe, expect, it } from 'vitest';
import { PENTATONIC } from '../../music';
import { midiOf } from './notes';
import { LONGEST_PHRASE, Progress, SONGS, type Song, type Step } from './songbook';

const notesOf = (song: Song): number[] => song.phrases.flat().map((s) => s.degree);
const step = (degree: 0 | 1 | 2 | 3 | 4): Step => ({ degree, beats: 1 });

describe('the songbook', () => {
  it('has songs that sit inside the five notes, so any of them can be played by popping balloons', () => {
    for (const song of SONGS) {
      for (const step of song.phrases.flat()) expect(PENTATONIC, song.id).toContain(midiOf(step.degree) % 12);
    }
  });

  it('keeps a phrase short enough to hold in the head and to show on a narrow screen', () => {
    for (const song of SONGS) {
      for (const phrase of song.phrases) {
        expect(phrase.length, song.id).toBeGreaterThan(0);
        expect(phrase.length, song.id).toBeLessThanOrEqual(LONGEST_PHRASE);
      }
    }
  });

  it('writes down the tunes as they are sung', () => {
    const mary = SONGS.find((s) => s.id === 'mary')!;
    // Ma-ry had a lit-tle lamb, lit-tle lamb, lit-tle lamb: E D C D E E E, D D D, E G G.
    expect(notesOf(mary)).toEqual([2, 1, 0, 1, 2, 2, 2, 1, 1, 1, 2, 3, 3]);
    const macdonald = SONGS.find((s) => s.id === 'macdonald')!;
    // Old Mac-Don-ald had a farm, E-I-E-I-O.
    expect(notesOf(macdonald)).toEqual([0, 0, 0, 3, 4, 4, 3, 2, 2, 1, 1, 0]);
  });

  it('gives every note a length, and ends each song on a note that rings longer than the rest', () => {
    for (const song of SONGS) {
      for (const step of song.phrases.flat()) expect(step.beats, song.id).toBeGreaterThan(0);
      const last = song.phrases.at(-1)!.at(-1)!;
      expect(last.beats, song.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('has no two songs with the same name', () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
  });
});

describe('where the player is in a song', () => {
  const play = (p: Progress, count: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(p.pop(p.target));
    return out;
  };

  it('asks for the first note of the first song, and the note that comes after it when the player plays it', () => {
    const p = new Progress();
    expect(p.song.id).toBe('mary');
    expect(p.target).toBe(2);
    expect(p.pop(2)).toBe('hit');
    expect(p.target).toBe(1);
    expect(p.done).toBe(1);
  });

  it('says which notes it will ask for next, across the phrases of a song, and fewer at the end', () => {
    const p = new Progress([
      {
        id: 'x',
        phrases: [
          [step(0), step(1)],
          [step(2), step(3), step(4)],
        ],
      },
    ]);
    expect(p.next(2)).toEqual([0, 1]);
    p.pop(0);
    expect(p.next(2)).toEqual([1, 2]);
    p.pop(1);
    expect(p.next(3)).toEqual([2, 3, 4]);
    p.pop(2);
    p.pop(3);
    expect(p.next(3)).toEqual([4]);
    expect(p.next(0)).toEqual([]);
  });

  it('is never cross with a note that is not the one asked for, and waits where it was', () => {
    const p = new Progress();
    expect(p.pop(4)).toBe('free');
    expect(p.pop(0)).toBe('free');
    expect(p.target).toBe(2);
    expect(p.done).toBe(0);
  });

  it('counts the balloons passed over since the wanted one, and starts again when it is popped', () => {
    const p = new Progress();
    p.pop(4);
    p.pop(4);
    p.pop(1);
    expect(p.passed).toBe(3);
    p.pop(2);
    expect(p.passed).toBe(0);
  });

  it('says when a phrase and when a song is done, and starts the next one at once', () => {
    const p = new Progress();
    const first = SONGS[0]!;
    const outcomes = play(p, first.phrases.flat().length);
    expect(outcomes.filter((o) => o === 'phrase')).toHaveLength(first.phrases.length - 1);
    expect(outcomes.at(-1)).toBe('song');
    expect(p.completed).toBe(1);
    expect(p.played).toBe(first);
    expect(p.song.id).toBe(SONGS[1]!.id);
    expect(p.done).toBe(0);
    expect(p.target).toBe(SONGS[1]!.phrases[0]![0]!.degree);
  });

  it('can be played right through every song and goes round to the first again', () => {
    const p = new Progress();
    for (const song of SONGS) {
      expect(p.song).toBe(song);
      const outcomes = play(p, song.phrases.flat().length);
      expect(outcomes.at(-1)).toBe('song');
    }
    expect(p.completed).toBe(SONGS.length);
    expect(p.song).toBe(SONGS[0]);
  });

  it('starts over from the first song', () => {
    const p = new Progress();
    play(p, 5);
    p.reset();
    expect(p.song).toBe(SONGS[0]);
    expect(p.done).toBe(0);
    expect(p.completed).toBe(0);
    expect(p.played).toBeNull();
  });

  it('refuses an empty songbook', () => {
    expect(() => new Progress([])).toThrow(/empty/);
  });
});
