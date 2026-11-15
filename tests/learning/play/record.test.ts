import { describe, expect, it } from 'vitest';
import { emptyPlay, mergePlay, PLAY_VERSION, type PlayRecord, readPlay, samePlay } from '../../../src/shared/play';

const some = (): PlayRecord => ({
  v: PLAY_VERSION,
  memory: { played: 4, sizes: { '3': { wins: 3, best: 5, stars: 3 }, '6': { wins: 1, best: 14, stars: 2 } } },
  maths: {
    played: 7,
    strands: { counting: { level: 2, rounds: 5, flawless: 3 }, 'add-up': { level: 1, rounds: 2, flawless: 0 } },
  },
});

describe('reading what is stored', () => {
  it('gives an empty record for nothing, and for something that is not a record', () => {
    for (const raw of [undefined, null, 7, 'play', [], true])
      expect(readPlay(raw)).toEqual({ play: emptyPlay(), newer: false });
  });

  it('reads back what was written, whole', () => {
    expect(readPlay(JSON.parse(JSON.stringify(some())))).toEqual({ play: some(), newer: false });
  });

  it('says a newer record is newer and reads it as empty, so that it can be left alone', () => {
    expect(readPlay({ ...some(), v: PLAY_VERSION + 1 })).toEqual({ play: emptyPlay(), newer: true });
  });

  it('keeps what can be read and leaves out what cannot, so one bad number never costs the rest', () => {
    // Parsed from text, so that `__proto__` is a key of its own, as it is in anything that came off
    // a disk.
    const read = readPlay(
      JSON.parse(
        JSON.stringify({
          v: 1,
          memory: {
            played: -3,
            sizes: {
              '3': { wins: 2, best: 6, stars: 2 },
              '4': { wins: 1, best: 0, stars: 2 },
              '5': { wins: 1, best: 9, stars: 4 },
              three: { wins: 1, best: 4, stars: 1 },
              '12345': { wins: 1, best: 4, stars: 1 },
            },
          },
          maths: {
            played: 2.5,
            strands: {
              counting: { level: 3, rounds: 4, flawless: 9 },
              Bad: { level: 1, rounds: 1, flawless: 0 },
              shapes: { level: 4, rounds: 1, flawless: 0 },
              clocks: 'x',
            },
          },
        }).replace('"strands":{', '"strands":{"__proto__":{"level":1,"rounds":1,"flawless":0},'),
      ),
    );
    expect(read.play.memory).toEqual({ played: 0, sizes: { '3': { wins: 2, best: 6, stars: 2 } } });
    expect(read.play.maths.played).toBe(0);
    expect(read.play.maths.strands, 'flawless rounds cannot be more than the rounds').toEqual({
      counting: { level: 3, rounds: 4, flawless: 4 },
    });
    expect(Object.getPrototypeOf(read.play.maths.strands)).toBe(Object.prototype);
  });

  it('keeps no more kinds of sum than it has room for', () => {
    const strands = Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [
        `kind-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
        { level: 1, rounds: 1, flawless: 0 },
      ]),
    );
    expect(Object.keys(readPlay({ v: 1, maths: { strands } }).play.maths.strands).length).toBeLessThanOrEqual(32);
  });
});

describe('putting two records together', () => {
  const a = some();
  const b: PlayRecord = {
    v: 1,
    memory: { played: 9, sizes: { '3': { wins: 2, best: 4, stars: 3 }, '8': { wins: 1, best: 30, stars: 1 } } },
    maths: {
      played: 3,
      strands: { counting: { level: 3, rounds: 3, flawless: 1 }, shapes: { level: 1, rounds: 1, flawless: 1 } },
    },
  };

  it('keeps the better of every number and loses no kind', () => {
    const both = mergePlay(a, b);
    expect(both.memory.played).toBe(9);
    expect(both.memory.sizes).toEqual({
      '3': { wins: 3, best: 4, stars: 3 },
      '6': { wins: 1, best: 14, stars: 2 },
      '8': { wins: 1, best: 30, stars: 1 },
    });
    expect(both.maths.played).toBe(7);
    expect(both.maths.strands).toEqual({
      counting: { level: 3, rounds: 5, flawless: 3 },
      'add-up': { level: 1, rounds: 2, flawless: 0 },
      shapes: { level: 1, rounds: 1, flawless: 1 },
    });
  });

  it('gives the same record whichever comes first, and the same again when it is put together with itself', () => {
    expect(samePlay(mergePlay(a, b), mergePlay(b, a))).toBe(true);
    expect(samePlay(mergePlay(a, a), a)).toBe(true);
    expect(samePlay(mergePlay(a, emptyPlay()), a)).toBe(true);
    expect(samePlay(mergePlay(mergePlay(a, b), emptyPlay()), mergePlay(a, b))).toBe(true);
  });

  it('compares two records by what they say and not by the order of their keys', () => {
    const swapped: PlayRecord = {
      ...a,
      memory: { ...a.memory, sizes: { '6': a.memory.sizes['6']!, '3': a.memory.sizes['3']! } },
    };
    expect(samePlay(a, swapped)).toBe(true);
    expect(samePlay(a, { ...a, memory: { ...a.memory, played: 5 } })).toBe(false);
  });
});
