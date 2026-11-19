import { describe, expect, it } from 'vitest';
import { DIGITS, LETTERS } from '../../src/content/letters';
import { WORDS } from '../../src/content/lexicon';
import { PRODUCE_IDS } from '../../src/content/produce';
import { PROP_DEFS } from '../../src/content/props';
import {
  COUNTED,
  factNames,
  factsOf,
  NOTHING_YET,
  newlyEarned,
  progressOf,
  STICKER_PAGE_IDS,
  STICKER_PAGES,
  STICKERS,
  type Standing,
  stickerOf,
  stickersOf,
  TAPPED,
  writtenName,
} from '../../src/content/stickers';
import { isFree, WONDER_IDS } from '../../src/content/wonders';
import { MAP_IDS, UNICORN_IDS } from '../../src/shared/ids';
import { LIFE_KINDS } from '../../src/shared/life';

const EVERYTHING: Standing = {
  visited: [...MAP_IDS],
  recruited: [...UNICORN_IDS],
  words: 300,
  allWords: true,
  sentences: 100,
  mathsRounds: 50,
  memoryGames: 50,
  memoryPairs: 16,
};
const lots = Object.fromEntries(COUNTED.map((name) => [name, 1000]));

describe('the table of stickers', () => {
  it('gives every sticker an id of its own and a name of its own', () => {
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    expect(new Set(STICKERS.map((s) => s.name)).size).toBe(STICKERS.length);
    for (const s of STICKERS) expect(s.id, s.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('draws every sticker from a word of the Spell Book', () => {
    for (const s of STICKERS) expect(Object.hasOwn(WORDS, s.emblem), `${s.id} is drawn as ${s.emblem}`).toBe(true);
    for (const page of STICKER_PAGES) expect(Object.hasOwn(WORDS, page.emblem), page.id).toBe(true);
  });

  it('puts every sticker on a page, and no page has more than a page holds, or none', () => {
    expect(STICKER_PAGES.map((p) => p.id)).toEqual([...STICKER_PAGE_IDS]);
    for (const page of STICKER_PAGES) {
      const count = stickersOf(page.id).length;
      expect(count, page.id).toBeGreaterThan(0);
      expect(count, page.id).toBeLessThanOrEqual(12);
    }
    expect(STICKER_PAGES.reduce((n, p) => n + stickersOf(p.id).length, 0)).toBe(STICKERS.length);
  });

  it('keeps the stickers of the games played in the snow with the winter ones, and the rest in Games', () => {
    const winterGames = ['tree-trim', 'sleigh-run'];
    expect(stickersOf('games').map((s) => s.id)).toEqual(
      WONDER_IDS.filter((id) => !winterGames.includes(id)).map((id) => `game-${id}`),
    );
    for (const id of winterGames) expect(stickerOf(`game-${id}`)?.page, id).toBe('winter');
  });

  it('asks only for facts that something keeps, and for a number that can be reached', () => {
    const known = factNames();
    for (const s of STICKERS) {
      expect(s.needs.length, s.id).toBeGreaterThan(0);
      for (const need of s.needs) {
        expect(known.has(need.fact), `${s.id} waits on ${need.fact}`).toBe(true);
        expect(Number.isInteger(need.atLeast) && need.atLeast >= 1, `${s.id} asks for ${need.atLeast}`).toBe(true);
      }
    }
  });

  it('says what to do for each sticker, in words a parent can read out', () => {
    for (const s of STICKERS) {
      expect(s.hint.length, s.id).toBeGreaterThan(4);
      expect(s.name.length, s.id).toBeGreaterThan(2);
      expect(`${s.name} ${s.hint}`, s.id).not.toMatch(/[\u2013\u2014\u2018\u2019\u201c\u201d]/);
    }
  });

  it('can be earned in full: a player who has done everything has every sticker', () => {
    const facts = factsOf(lots, EVERYTHING);
    expect(newlyEarned(facts, {}).map((s) => s.id)).toEqual(STICKERS.map((s) => s.id));
  });

  it('cannot be earned by a player who has done nothing, except for meeting Wildstar', () => {
    const facts = factsOf({}, { ...NOTHING_YET, recruited: ['wildstar'] });
    expect(newlyEarned(facts, {}).map((s) => s.id)).toEqual(['hello']);
  });

  it('looks up a sticker by its id', () => {
    expect(stickerOf('hello')?.name).toBe('Hello, Wildstar!');
    expect(stickerOf('nothing-of-the-kind')).toBeUndefined();
    expect(stickerOf('constructor')).toBeUndefined();
  });
});

describe('the facts', () => {
  it('has a name for every thing the game counts, and none is counted twice', () => {
    expect(new Set(COUNTED).size).toBe(COUNTED.length);
    for (const name of COUNTED) expect(factNames().has(name), name).toBe(true);
    for (const id of PRODUCE_IDS) expect(COUNTED).toContain(`produce:${id}`);
    for (const kind of LIFE_KINDS) expect(COUNTED).toContain(`poke:${kind}`);
    for (const id of WONDER_IDS) expect(COUNTED).toContain(`wonder:${id}`);
  });

  it('counts a tap only on a toy that answers a tap with a treat', () => {
    expect(TAPPED.length).toBeGreaterThan(0);
    for (const toy of TAPPED) {
      expect(PROP_DEFS[toy]?.tap, toy).toBe('delight');
      expect(COUNTED, toy).toContain(`tap:${toy}`);
      expect(stickerOf(`tap-${toy}`)?.page, toy).toBe('winter');
    }
  });

  it('keeps every name short enough for a record to hold', () => {
    for (const name of factNames()) expect(name, name).toMatch(/^[a-z][a-z0-9:-]{0,31}$/);
  });

  it('adds up the casts, and the kinds of magic that were cast', () => {
    const facts = factsOf({ 'cast:light': 4, 'cast:fire': 2, 'cast:ice': 0 }, NOTHING_YET);
    expect(facts.casts).toBe(6);
    expect(facts.magics).toBe(2);
  });

  it('adds up the food and the gems apart, and counts the kinds of each', () => {
    const facts = factsOf(
      { 'produce:apple': 3, 'produce:carrot': 2, 'produce:ruby': 5, 'produce:shell': 9, 'produce:pearl': 1 },
      NOTHING_YET,
    );
    expect(facts.food).toBe(5);
    expect(facts.foods).toBe(2);
    expect(facts.gems).toBe(5);
    expect(facts['gem-kinds']).toBe(1);
  });

  it('adds up the creatures that were greeted, and the games that were finished', () => {
    const facts = factsOf(
      { 'poke:bunny': 3, 'poke:frog': 1, 'finale:lily-hop': 2, 'finale:sparkle-sky': 1 },
      NOTHING_YET,
    );
    expect(facts.pokes).toBe(4);
    expect(facts['critter-kinds']).toBe(2);
    expect(facts.finales).toBe(3);
    expect(facts['finale-kinds']).toBe(2);
  });

  it('reads the places and the friends from the world', () => {
    const facts = factsOf(
      {},
      {
        ...NOTHING_YET,
        visited: ['forest', 'palace-hall', 'palace-tea', 'beach', 'not-a-place'],
        recruited: ['wildstar', 'leaf'],
      },
    );
    expect(facts['visited:beach']).toBe(1);
    expect(facts['visited:palace-garden']).toBeUndefined();
    expect(facts['visited:not-a-place']).toBeUndefined();
    expect(facts.rooms).toBe(2);
    expect(facts.places).toBe(4);
    expect(facts.friends).toBe(2);
    expect(facts['friend:leaf']).toBe(1);
    expect(facts['friend:storm']).toBeUndefined();
  });

  it('reads the books of learning', () => {
    const facts = factsOf(
      {},
      { ...NOTHING_YET, words: 12, allWords: false, sentences: 3, mathsRounds: 4, memoryGames: 2, memoryPairs: 6 },
    );
    expect(facts.words).toBe(12);
    expect(facts['words-all']).toBe(0);
    expect(facts.sentences).toBe(3);
    expect(facts['maths-rounds']).toBe(4);
    expect(facts['memory-games']).toBe(2);
    expect(facts['memory-pairs']).toBe(6);
  });

  it('does not let a count that the world also names be taken for it', () => {
    // A count stored under a name the world answers for is not believed over the world.
    const facts = factsOf({ friends: 6, places: 25, words: 300 }, NOTHING_YET);
    expect(facts.friends).toBe(0);
    expect(facts.places).toBe(0);
    expect(facts.words).toBe(0);
  });
});

describe('earning stickers', () => {
  it('earns what has reached its number, and not what has not', () => {
    const facts = factsOf({ 'cast:light': 10, 'cast:fire': 9 }, NOTHING_YET);
    const ids = newlyEarned(facts, {}).map((s) => s.id);
    expect(ids).toContain('spell');
    expect(ids).toContain('magic-light');
    expect(ids).not.toContain('magic-fire');
  });

  it('does not offer a sticker the player has already got', () => {
    const facts = factsOf({ 'cast:light': 10 }, NOTHING_YET);
    expect(newlyEarned(facts, { spell: 5 }).map((s) => s.id)).toEqual(['magic-light']);
  });

  it('earns a sticker that asks for several things only when it has all of them', () => {
    const rainbow = stickerOf('rainbow-magic');
    expect(rainbow).toBeDefined();
    const five = Object.fromEntries(['light', 'nature', 'ice', 'water', 'fire'].map((k) => [`cast:${k}`, 1]));
    expect(newlyEarned(factsOf(five, NOTHING_YET), {}).map((s) => s.id)).not.toContain('rainbow-magic');
    expect(newlyEarned(factsOf({ ...five, 'cast:lightning': 1 }, NOTHING_YET), {}).map((s) => s.id)).toContain(
      'rainbow-magic',
    );
  });

  it('earns the herd only when every friend has joined', () => {
    const most = factsOf({}, { ...NOTHING_YET, recruited: UNICORN_IDS.slice(0, 5) });
    expect(newlyEarned(most, {}).map((s) => s.id)).not.toContain('herd');
    const all = factsOf({}, { ...NOTHING_YET, recruited: [...UNICORN_IDS] });
    expect(newlyEarned(all, {}).map((s) => s.id)).toContain('herd');
  });

  it('says how far the player has come to a sticker that asks for a number', () => {
    const casts = stickerOf('spells-100')!;
    expect(progressOf(casts, factsOf({ 'cast:light': 37 }, NOTHING_YET))).toEqual({ have: 37, of: 100 });
    expect(progressOf(casts, factsOf({ 'cast:light': 400 }, NOTHING_YET))).toEqual({ have: 100, of: 100 });
    expect(progressOf(stickerOf('spell')!, factsOf({}, NOTHING_YET))).toBeNull();
    expect(progressOf(stickerOf('rainbow-magic')!, factsOf({}, NOTHING_YET))).toEqual({ have: 0, of: 6 });
  });

  it('counts a letter and a numeral the player wrote, in each page of their own', () => {
    const names = new Set(COUNTED);
    for (const letter of LETTERS)
      for (const kind of ['upper', 'lower'] as const) expect(names.has(writtenName(kind, letter))).toBe(true);
    for (const digit of DIGITS) expect(names.has(writtenName('digits', digit))).toBe(true);
    expect(writtenName('digits', '7')).toBe('digits:7');
    expect(
      new Set([...LETTERS.map((l) => writtenName('upper', l)), ...DIGITS.map((d) => writtenName('digits', d))]).size,
    ).toBe(LETTERS.length + DIGITS.length);
  });

  it('earns the first number for one numeral, and every number for all ten, and no letter counts for either', () => {
    const none = factsOf({}, NOTHING_YET);
    expect(none.digits).toBe(0);
    const letters = Object.fromEntries(
      LETTERS.flatMap((l) => [
        [writtenName('upper', l), 1],
        [writtenName('lower', l), 1],
      ]),
    );
    expect(newlyEarned(factsOf(letters, NOTHING_YET), {}).map((s) => s.id)).not.toContain('write-number');
    const one = factsOf({ [writtenName('digits', '3')]: 1 }, NOTHING_YET);
    expect(one.digits).toBe(1);
    expect(newlyEarned(one, {}).map((s) => s.id)).toContain('write-number');
    expect(newlyEarned(one, {}).map((s) => s.id)).not.toContain('numbers-all');
    const nine = Object.fromEntries(DIGITS.slice(1).map((d) => [writtenName('digits', d), 1]));
    expect(newlyEarned(factsOf(nine, NOTHING_YET), {}).map((s) => s.id)).not.toContain('numbers-all');
    const all = Object.fromEntries(DIGITS.map((d) => [writtenName('digits', d), 3]));
    expect(factsOf(all, NOTHING_YET).digits).toBe(DIGITS.length);
    expect(newlyEarned(factsOf(all, NOTHING_YET), {}).map((s) => s.id)).toContain('numbers-all');
  });

  it('asks for every game that can be finished, and not for the one that cannot', () => {
    const finishable = WONDER_IDS.filter((id) => !isFree(id));
    expect(finishable.length).toBeLessThan(WONDER_IDS.length);
    const need = stickerOf('finales-all')!.needs[0]!;
    expect(need.atLeast).toBe(finishable.length);
  });
});
