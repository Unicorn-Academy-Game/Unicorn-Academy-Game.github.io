import { describe, expect, it } from 'vitest';
import { WORDS, type WordId } from '../../../src/content/lexicon';
import {
  type Board,
  deal,
  finished,
  found,
  PAIR_SIZES,
  POOL,
  settle,
  starsFor,
  startSize,
  turn,
  withGame,
} from '../../../src/learning/play/memory';
import { shuffled } from '../../../src/learning/play/random';
import { emptyPlay } from '../../../src/shared/play';
import { seeded } from '../helpers';

const counts = (faces: readonly WordId[]): Map<WordId, number> => {
  const out = new Map<WordId, number>();
  for (const word of faces) out.set(word, (out.get(word) ?? 0) + 1);
  return out;
};

/** A board whose faces the test chose, so that the places of the pairs are known. */
const board = (...faces: WordId[]): Board => ({ faces, paired: faces.map(() => false), up: [], turns: 0 });

describe('the words a game is dealt from', () => {
  it('are all words of the book, each with a picture that no other card in the pool has', () => {
    const looks = POOL.map((id) => {
      const how = WORDS[id].picture;
      return how.kind === 'portrait' ? `portrait.${how.unicorn}` : `${how.bundle}.${how.sprite}`;
    });
    expect(new Set(looks).size, 'two words with the same picture would make two cards that cannot be told apart').toBe(
      POOL.length,
    );
    expect(POOL.length, 'enough for the biggest game, and plenty to vary it').toBeGreaterThan(
      PAIR_SIZES[PAIR_SIZES.length - 1]! * 8,
    );
  });
});

describe('a deal', () => {
  it('puts every picture on exactly two cards, none twice over, in every size, face down, with no turns taken', () => {
    for (const pairs of PAIR_SIZES) {
      for (let seed = 1; seed <= 25; seed++) {
        const dealt = deal(pairs, seeded(seed));
        expect(dealt.faces).toHaveLength(pairs * 2);
        expect(counts(dealt.faces).size).toBe(pairs);
        for (const n of counts(dealt.faces).values()) expect(n).toBe(2);
        expect(dealt.faces.every((word) => POOL.includes(word))).toBe(true);
        expect(dealt.paired.some(Boolean)).toBe(false);
        expect(dealt.up).toEqual([]);
        expect(dealt.turns).toBe(0);
      }
    }
  });

  it('is a different board each time: the cards, and where they lie', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) layouts.add(deal(4, seeded(seed * 7919)).faces.join(','));
    expect(layouts.size, 'sixty deals, sixty boards').toBe(60);
    const sameWords = new Set<string>();
    for (let seed = 1; seed <= 60; seed++)
      sameWords.add([...new Set(deal(3, seeded(seed * 104729)).faces)].sort().join(','));
    expect(sameWords.size, 'and not the same three pictures with the cards moved about').toBeGreaterThan(50);
  });

  it('uses the whole pool, so every picture the game has comes up', () => {
    const seen = new Set<WordId>();
    for (let seed = 1; seed <= 500; seed++) for (const word of deal(8, seeded(seed)).faces) seen.add(word);
    expect(seen.size).toBe(POOL.length);
  });

  it('shuffles fairly: of three things, each of the six orders comes up about as often as the others', () => {
    const orders = new Map<string, number>();
    for (let seed = 1; seed <= 6000; seed++) {
      const key = shuffled([0, 1, 2], seeded(seed)).join('');
      orders.set(key, (orders.get(key) ?? 0) + 1);
    }
    expect(orders.size).toBe(6);
    for (const n of orders.values()) expect(n).toBeGreaterThan(850);
    for (const n of orders.values()) expect(n).toBeLessThan(1150);
  });

  it('survives a random that answers its top value, and refuses sizes it cannot deal', () => {
    expect(shuffled([1, 2, 3], () => 0.999999999)).toHaveLength(3);
    expect(() => deal(0, seeded(1))).toThrow(RangeError);
    expect(() => deal(POOL.length + 1, seeded(1))).toThrow(RangeError);
    expect(() => deal(2.5, seeded(1))).toThrow(RangeError);
  });
});

describe('turning cards', () => {
  const b = board('bee', 'frog', 'bee', 'frog');

  it('turns a first card up, and a second that is the same pairs them and stays up', () => {
    const one = turn(b, 0);
    expect(one.result).toBe('first');
    expect(one.board.up).toEqual([0]);
    expect(one.board.turns, 'a turn is two cards').toBe(0);
    const two = turn(one.board, 2);
    expect(two.result).toBe('matched');
    expect(two.board.paired).toEqual([true, false, true, false]);
    expect(two.board.up).toEqual([]);
    expect(two.board.turns).toBe(1);
    expect(found(two.board)).toBe(1);
  });

  it('turns a second card that is not the same up beside the first, and counts the turn', () => {
    const two = turn(turn(b, 0).board, 1);
    expect(two.result).toBe('missed');
    expect(two.board.up).toEqual([0, 1]);
    expect(two.board.paired.some(Boolean)).toBe(false);
    expect(two.board.turns).toBe(1);
  });

  it('turns the two that were not the same back down when told to, and not before', () => {
    const missed = turn(turn(b, 0).board, 1).board;
    expect(settle(missed).up).toEqual([]);
    expect(settle(missed).turns).toBe(1);
    expect(settle(b)).toBe(b);
    const one = turn(b, 0).board;
    expect(settle(one), 'a single card waits for its pair').toBe(one);
  });

  it('turns a card touched while two that were not the same are up as the first of a new pair, so the player never has to wait', () => {
    const missed = turn(turn(b, 0).board, 1).board;
    const next = turn(missed, 2);
    expect(next.result).toBe('first');
    expect(next.board.up).toEqual([2]);
    expect(next.board.turns, 'the turn that missed still counts, and this one has not begun').toBe(1);
  });

  it('does nothing for a card that is up, paired, or not on the board, and gives back the board it was handed', () => {
    const one = turn(b, 0).board;
    expect(turn(one, 0)).toEqual({ board: one, result: 'ignored' });
    const missed = turn(one, 1).board;
    expect(turn(missed, 0).result, 'a card of the two that are showing').toBe('ignored');
    expect(turn(missed, 1).board).toBe(missed);
    const paired = turn(turn(b, 0).board, 2).board;
    expect(turn(paired, 2)).toEqual({ board: paired, result: 'ignored' });
    for (const at of [-1, 4, 1.5, Number.NaN, Infinity]) expect(turn(b, at)).toEqual({ board: b, result: 'ignored' });
  });

  it('is finished when every card is paired, and not before', () => {
    let state = b;
    expect(finished(state)).toBe(false);
    state = turn(turn(state, 0).board, 2).board;
    expect(finished(state)).toBe(false);
    state = turn(turn(state, 1).board, 3).board;
    expect(finished(state)).toBe(true);
    expect(found(state)).toBe(2);
    expect(state.turns).toBe(2);
  });

  it('can be played to the end from any deal by a player who remembers every card the player has seen, and they earn at least two stars', () => {
    for (const pairs of PAIR_SIZES) {
      for (let seed = 1; seed <= 20; seed++) {
        let state = deal(pairs, seeded(seed));
        const seen = new Set<number>();
        for (let guard = 0; !finished(state); guard++) {
          expect(guard, 'a game ends').toBeLessThan(pairs * 4);
          const down = state.faces.map((_, place) => place).filter((place) => !state.paired[place]);
          const first = down[0]!;
          state = turn(state, first).board;
          seen.add(first);
          // Its pair, if the player has seen it, and otherwise a card they have not seen.
          const known = down.find(
            (place) => place !== first && seen.has(place) && state.faces[place] === state.faces[first],
          );
          const second = known ?? down.find((place) => place !== first && !seen.has(place))!;
          seen.add(second);
          state = turn(state, second).board;
        }
        expect(state.turns).toBeLessThanOrEqual(pairs * 3);
        expect(starsFor(pairs, state.turns)).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('stars and records', () => {
  it('give one star for a game finished, two for no more than three turns a pair, and three for no more than two', () => {
    expect(starsFor(3, 3)).toBe(3);
    expect(starsFor(3, 6)).toBe(3);
    expect(starsFor(3, 7)).toBe(2);
    expect(starsFor(3, 9)).toBe(2);
    expect(starsFor(3, 10)).toBe(1);
    expect(starsFor(8, 16)).toBe(3);
    expect(starsFor(8, 24)).toBe(2);
    expect(starsFor(8, 60)).toBe(1);
  });

  it('keep the best of every game of a size, and add the game to the counts', () => {
    const first = withGame(emptyPlay(), 3, 9);
    expect(first.memory).toEqual({ played: 1, sizes: { '3': { wins: 1, best: 9, stars: 2 } } });
    const better = withGame(first, 3, 5);
    expect(better.memory.sizes['3']).toEqual({ wins: 2, best: 5, stars: 3 });
    const worse = withGame(better, 3, 14);
    expect(worse.memory.sizes['3'], 'a worse game takes nothing away').toEqual({ wins: 3, best: 5, stars: 3 });
    expect(worse.memory.played).toBe(3);
    expect(withGame(worse, 6, 30).memory.sizes['3']).toEqual(worse.memory.sizes['3']);
  });

  it('start the player at the first size they have not finished, and at the biggest once they have finished them all', () => {
    let play = emptyPlay();
    expect(startSize(play)).toBe(3);
    const order: number[] = [];
    for (const pairs of PAIR_SIZES) {
      play = withGame(play, pairs, pairs * 2);
      order.push(startSize(play));
    }
    expect(order).toEqual([4, 6, 8, 8]);
  });
});
