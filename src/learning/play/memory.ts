import { WORD_IDS, WORDS, type WordId } from '../../content/lexicon';
import type { PlayRecord } from '../../shared/play';
import { shuffled } from './random';

/**
 * The memory game's rules, with no screen and no clock. A game is a board of cards in two rows.
 * Each card has a word's picture on its face, every picture is on two cards, and the player turns
 * two at a time looking for the ones that are the same. A pair that is the same stays up. A pair
 * that is not turns back down, and nothing is said about it: it was a look, and the next look is
 * better for it.
 */

/** How many pairs a game can have: three to eight, which is six to sixteen cards in two rows. */
export const PAIR_SIZES = [3, 4, 6, 8] as const;
export type Pairs = (typeof PAIR_SIZES)[number];

/**
 * The pictures of two words that look the same cannot be told apart on two cards, so a deal takes
 * one word for each picture.
 */
const sameLook = (id: WordId): string => {
  const how = WORDS[id].picture;
  return how.kind === 'portrait' ? `portrait.${how.unicorn}` : `${how.bundle}.${how.sprite}`;
};

/**
 * Every word the game can put on a card: all the words of the book that have a picture of their
 * own.
 */
export const POOL: readonly WordId[] = (() => {
  const seen = new Set<string>();
  return WORD_IDS.filter((id) => {
    const look = sameLook(id);
    if (seen.has(look)) return false;
    seen.add(look);
    return true;
  });
})();

export interface Board {
  /** The word on the face of each card, by place. */
  readonly faces: readonly WordId[];
  /** Which places are paired, and so stay up. */
  readonly paired: readonly boolean[];
  /**
   * The places turned up that are not paired: none, one, or two that are not the same, which turn
   * back down soon.
   */
  readonly up: readonly number[];
  /** How many times the player has turned a second card over. */
  readonly turns: number;
}

/**
 * A new board: `pairs` words taken from the pool at random, each on two cards, and the cards laid
 * out at random.
 */
export function deal(pairs: number, random: () => number, pool: readonly WordId[] = POOL): Board {
  if (!Number.isInteger(pairs) || pairs < 1 || pairs > pool.length)
    throw new RangeError(`${pairs} pairs cannot be dealt from ${pool.length} words`);
  const words = shuffled(pool, random).slice(0, pairs);
  const faces = shuffled([...words, ...words], random);
  return { faces, paired: faces.map(() => false), up: [], turns: 0 };
}

/**
 * What a turn came to: nothing (the card could not be turned), a first card, a second that is the
 * same as the first, or a second that is not.
 */
export type Turned = 'ignored' | 'first' | 'matched' | 'missed';

/**
 * Two cards that were not the same, turned back down. A board with no such pair is the board it
 * was.
 */
export function settle(board: Board): Board {
  return board.up.length < 2 ? board : { ...board, up: [] };
}

/**
 * The player touches the card at `at`. A card that is paired, that is already up, or that is not on
 * the board does nothing. A card touched while two that were not the same are still up turns them
 * back down at once and is the first of a new pair, so they never wait to try again.
 */
export function turn(before: Board, at: number): { board: Board; result: Turned } {
  const board = settle(before);
  if (!Number.isInteger(at) || at < 0 || at >= board.faces.length || board.paired[at] || before.up.includes(at))
    return { board: before, result: 'ignored' };
  if (board.up.length === 0) return { board: { ...board, up: [at] }, result: 'first' };
  const first = board.up[0]!;
  const turns = board.turns + 1;
  if (board.faces[first] !== board.faces[at]) return { board: { ...board, up: [first, at], turns }, result: 'missed' };
  const paired = board.paired.map((was, place) => was || place === first || place === at);
  return { board: { ...board, paired, up: [], turns }, result: 'matched' };
}

/** How many pairs are found. */
export const found = (board: Board): number => board.paired.filter(Boolean).length / 2;

/** Whether every card is paired. */
export const finished = (board: Board): boolean => board.paired.every(Boolean);

/**
 * The stars a game earns. Every game that is finished is one star. It is two when it took no more
 * than three turns for each pair, and three when it took no more than two. A game with no luck in
 * it at all, in which the player remembers every card they have seen, takes about one and a half
 * turns for each pair.
 */
export function starsFor(pairs: number, turns: number): 1 | 2 | 3 {
  if (turns <= pairs * 2) return 3;
  if (turns <= pairs * 3) return 2;
  return 1;
}

/**
 * The record with a game finished in `turns` turns added. A best that is not beaten, and fewer
 * stars than the player has, are left as they were.
 */
export function withGame(play: PlayRecord, pairs: Pairs, turns: number): PlayRecord {
  const name = String(pairs);
  const before = play.memory.sizes[name];
  const stars = starsFor(pairs, turns);
  return {
    ...play,
    memory: {
      played: play.memory.played + 1,
      sizes: {
        ...play.memory.sizes,
        [name]: {
          wins: (before?.wins ?? 0) + 1,
          best: Math.min(before?.best ?? turns, turns),
          stars: Math.max(before?.stars ?? 1, stars) as 1 | 2 | 3,
        },
      },
    },
  };
}

/**
 * The size of the game the player plays when they sit down: the first they have not finished, or
 * the biggest when they have finished them all.
 */
export function startSize(play: PlayRecord): Pairs {
  return (
    PAIR_SIZES.find((pairs) => play.memory.sizes[String(pairs)] === undefined) ?? PAIR_SIZES[PAIR_SIZES.length - 1]!
  );
}
