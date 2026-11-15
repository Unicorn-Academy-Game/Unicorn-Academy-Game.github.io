/**
 * What the player has done at the two tables in front of the palace, the memory game and the maths
 * game. It is kept on the device beside their spell book and is not part of it, so a book that is
 * put away or replaced never touches it, and it holds nothing but good news: how many games they
 * have finished, the fewest turns a memory game took, and how far they have got in each kind of
 * sum.
 *
 * Every function here returns a new record, and putting two together keeps the better of each
 * number, so two tabs or two copies of the page can never take a star away.
 */

export const PLAY_VERSION = 1;

/** The most kinds of sum a record keeps, so a record that grew wild cannot fill the device. */
const MAX_STRANDS = 32;
/** The three levels of every kind of sum. */
export const MATHS_LEVELS = [1, 2, 3] as const;
export type MathsLevel = (typeof MATHS_LEVELS)[number];
/** The most games or rounds a counter holds. */
const MAX_COUNT = 1_000_000;
const STRAND_NAME = /^[a-z][a-z-]{0,23}$/;

/**
 * How a memory game of one size has gone: games won, the fewest turns one took, and the most stars
 * one earned.
 */
interface MemorySize {
  wins: number;
  best: number;
  stars: 1 | 2 | 3;
}

/**
 * How far the player is in one kind of sum: the level they play at, the rounds they have finished,
 * and how many of them had every answer right at the first try.
 */
interface Strand {
  level: MathsLevel;
  rounds: number;
  flawless: number;
}

export interface PlayRecord {
  v: typeof PLAY_VERSION;
  memory: {
    /** Games finished, whatever their size. */
    played: number;
    /** By the number of pairs in the game. */
    sizes: Readonly<Record<string, MemorySize>>;
  };
  maths: {
    /** Rounds finished, whatever the kind. */
    played: number;
    strands: Readonly<Record<string, Strand>>;
  };
}

export const emptyPlay = (): PlayRecord => ({
  v: PLAY_VERSION,
  memory: { played: 0, sizes: {} },
  maths: { played: 0, strands: {} },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, MAX_COUNT) : 0;

function readSize(value: unknown): MemorySize | null {
  if (!isRecord(value)) return null;
  const best = count(value.best);
  const stars = value.stars;
  if (best < 1 || (stars !== 1 && stars !== 2 && stars !== 3)) return null;
  return { wins: Math.max(1, count(value.wins)), best, stars };
}

function readStrand(value: unknown): Strand | null {
  if (!isRecord(value)) return null;
  const level = value.level;
  if (level !== 1 && level !== 2 && level !== 3) return null;
  const rounds = count(value.rounds);
  return { level, rounds, flawless: Math.min(rounds, count(value.flawless)) };
}

export interface ReadPlay {
  play: PlayRecord;
  /**
   * A newer version of the game wrote the record. It reads as empty, and nothing should write over
   * it.
   */
  newer: boolean;
}

/**
 * Reads what is stored as kindly as it can. An entry that cannot be read is left out and the rest
 * is kept, so one bad number never costs the player the others, and a record from a newer version
 * reads as empty and says so, so that it can be left alone.
 */
export function readPlay(raw: unknown): ReadPlay {
  if (!isRecord(raw)) return { play: emptyPlay(), newer: false };
  const version = raw.v;
  if (typeof version === 'number' && version > PLAY_VERSION) return { play: emptyPlay(), newer: true };
  const memory = isRecord(raw.memory) ? raw.memory : {};
  const maths = isRecord(raw.maths) ? raw.maths : {};
  const sizes: Record<string, MemorySize> = {};
  if (isRecord(memory.sizes)) {
    for (const [pairs, entry] of Object.entries(memory.sizes)) {
      const size = /^[1-9][0-9]?$/.test(pairs) ? readSize(entry) : null;
      if (size) sizes[pairs] = size;
    }
  }
  const strands: Record<string, Strand> = {};
  if (isRecord(maths.strands)) {
    for (const [name, entry] of Object.entries(maths.strands)) {
      if (Object.keys(strands).length >= MAX_STRANDS) break;
      const strand = STRAND_NAME.test(name) ? readStrand(entry) : null;
      if (strand) strands[name] = strand;
    }
  }
  return {
    play: {
      v: PLAY_VERSION,
      memory: { played: count(memory.played), sizes },
      maths: { played: count(maths.played), strands },
    },
    newer: false,
  };
}

function joinSizes(a: PlayRecord['memory']['sizes'], b: PlayRecord['memory']['sizes']): Record<string, MemorySize> {
  const sizes: Record<string, MemorySize> = {};
  for (const pairs of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[pairs];
    const y = b[pairs];
    sizes[pairs] =
      x && y
        ? {
            wins: Math.max(x.wins, y.wins),
            best: Math.min(x.best, y.best),
            stars: Math.max(x.stars, y.stars) as MemorySize['stars'],
          }
        : (x ?? y)!;
  }
  return sizes;
}

function joinStrands(a: PlayRecord['maths']['strands'], b: PlayRecord['maths']['strands']): Record<string, Strand> {
  const strands: Record<string, Strand> = {};
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[name];
    const y = b[name];
    strands[name] =
      x && y
        ? {
            level: Math.max(x.level, y.level) as MathsLevel,
            rounds: Math.max(x.rounds, y.rounds),
            flawless: Math.max(x.flawless, y.flawless),
          }
        : (x ?? y)!;
  }
  return strands;
}

/**
 * Both records put together, keeping the better of every number, which gives the same record
 * whichever comes first.
 */
export function mergePlay(a: PlayRecord, b: PlayRecord): PlayRecord {
  return {
    v: PLAY_VERSION,
    memory: { played: Math.max(a.memory.played, b.memory.played), sizes: joinSizes(a.memory.sizes, b.memory.sizes) },
    maths: { played: Math.max(a.maths.played, b.maths.played), strands: joinStrands(a.maths.strands, b.maths.strands) },
  };
}

/** Whether two records say the same, so that a change that changes nothing is not written. */
export const samePlay = (a: PlayRecord, b: PlayRecord): boolean =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/**
 * The record with its keys in order, so two that say the same compare the same however they were
 * made.
 */
function sorted(play: PlayRecord): unknown {
  const keys = <T>(map: Readonly<Record<string, T>>): [string, T][] =>
    Object.entries(map).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return [play.v, play.memory.played, keys(play.memory.sizes), play.maths.played, keys(play.maths.strands)];
}
