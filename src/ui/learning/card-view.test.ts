import { describe, expect, it } from 'vitest';
import { WORD_IDS } from '../../content/lexicon';
import { ALPHABET, begin, help, isDone, LAYOUTS, press, type Spelling, type Worth } from '../../learning';
import { KEYBOARD_LAYOUTS, MAX_LEVEL } from '../../shared/learning';
import { badgeOf, cardView, keyViews } from './card-view';

/** Chance that is always the same, so a card is always the same. */
const random = (): number => 0.3;
const start = (word: Parameters<typeof begin>[0], level: number): Spelling => begin(word, level, random);
const typed = (s: Spelling, keys: string): Spelling => [...keys].reduce((now, key) => press(now, key).spelling, s);

describe('the places for the letters', () => {
  it('show every letter faintly where it goes at the rung that copies, with the first place next', () => {
    const view = cardView(start('frog', 0), false);
    expect(view.slots).toEqual([
      { state: 'next', letter: 'f', guide: true },
      { state: 'empty', letter: 'r', guide: true },
      { state: 'empty', letter: 'o', guide: true },
      { state: 'empty', letter: 'g', guide: true },
    ]);
    expect(view.shown).toBe(true);
    expect(view.above).toBeNull();
    expect(view.hasAbove).toBe(false);
  });

  it("put a right letter in its place, which is the player's and no longer a guide, and move on to the next", () => {
    const view = cardView(typed(start('frog', 0), 'f'), false);
    expect(view.slots[0]).toEqual({ state: 'placed', letter: 'f', guide: false });
    expect(view.slots[1]).toEqual({ state: 'next', letter: 'r', guide: true });
    expect(view.slots[2]!.state).toBe('empty');
  });

  it('write the word above empty places at the rung that follows', () => {
    const view = cardView(start('frog', 1), false);
    expect(view.above).toBe('frog');
    expect(view.hasAbove).toBe(true);
    expect(view.shown).toBe(true);
    expect(view.slots.map((slot) => slot.letter)).toEqual([null, null, null, null]);
    expect(view.slots.map((slot) => slot.guide)).toEqual([false, false, false, false]);
    expect(view.slots.map((slot) => slot.state)).toEqual(['next', 'empty', 'empty', 'empty']);
  });

  it('give the first letter at the rung that hides the rest, keep the word out of sight, and show it only while the player peeks', () => {
    const s = start('frog', 2);
    const hidden = cardView(s, false);
    expect(hidden.slots[0]).toEqual({ state: 'placed', letter: 'f', guide: false });
    expect(hidden.slots[1]).toEqual({ state: 'next', letter: null, guide: false });
    expect(hidden.above).toBeNull();
    expect(hidden.shown).toBe(false);
    expect(hidden.hasAbove).toBe(true);
    const peek = cardView(s, true);
    expect(peek.above).toBe('frog');
    expect(peek.hasAbove).toBe(true);
    expect(peek.slots).toEqual(hidden.slots);
  });

  it('show only the picture and empty places at the rungs that ask the player to remember, even when told they are peeking', () => {
    for (const level of [3, 4, 5]) {
      for (const peeking of [false, true]) {
        const view = cardView(start('frog', level), peeking);
        expect(view.above, `level ${level}`).toBeNull();
        expect(view.hasAbove).toBe(false);
        expect(view.shown).toBe(false);
        expect(view.slots.map((slot) => slot.letter)).toEqual([null, null, null, null]);
      }
    }
  });

  it('do not take the guesses for a peek at the rungs that have none, and do not show the row once the word is done', () => {
    expect(cardView(start('frog', 0), true).above).toBeNull();
    expect(cardView(start('frog', 1), true).above).toBe('frog');
    for (const level of [0, 1, 2, 3]) {
      const done = cardView(typed(start('frog', level), 'frog'), true);
      expect(done.done).toBe(true);
      expect(done.above).toBeNull();
      expect(done.slots.map((slot) => slot.state)).toEqual(['placed', 'placed', 'placed', 'placed']);
      expect(done.slots.map((slot) => slot.letter).join('')).toBe('frog');
    }
  });

  it('only ever hold what the player has spelled so far, whatever they press, at every level and for every word', () => {
    for (const word of WORD_IDS) {
      for (let level = 0; level <= MAX_LEVEL; level++) {
        let s = start(word, level);
        const pressed = [...word, ...ALPHABET];
        for (const key of pressed) {
          s = press(s, key).spelling;
          const view = cardView(s, level === 2);
          expect(view.slots, `${word} at ${level}`).toHaveLength(word.length);
          expect(
            view.slots
              .filter((slot) => slot.state === 'placed')
              .map((slot) => slot.letter)
              .join(''),
            `${word} at ${level}`,
          ).toBe(word.slice(0, s.placed));
          for (const slot of view.slots) if (slot.state !== 'placed' && !slot.guide) expect(slot.letter).toBeNull();
          expect(view.slots.filter((slot) => slot.state === 'next')).toHaveLength(isDone(s) ? 0 : 1);
        }
      }
    }
  });
});

describe('the keys', () => {
  it('are every letter once, in the rows of whichever keyboard was chosen', () => {
    for (const layout of KEYBOARD_LAYOUTS) {
      const rows = keyViews(layout, start('frog', 3));
      expect(rows.map((row) => row.map((key) => key.letter).join(''))).toEqual(LAYOUTS[layout]);
    }
  });

  it('fade the letters the rung does not use and keep every key in its place', () => {
    const rows = keyViews('abc', start('frog', 0));
    expect(
      rows
        .flat()
        .filter((key) => key.state !== 'off')
        .map((key) => key.letter)
        .sort()
        .join(''),
    ).toBe('fgor');
    expect(rows.flat().filter((key) => key.state === 'off')).toHaveLength(22);
    expect(rows.map((row) => row.length)).toEqual([9, 9, 8]);
    const qwerty = keyViews('qwerty', start('frog', 0));
    expect(
      qwerty
        .flat()
        .filter((key) => key.state !== 'off')
        .map((key) => key.letter)
        .sort()
        .join(''),
    ).toBe('fgor');
    expect(qwerty.map((row) => row.length)).toEqual([10, 9, 7]);
  });

  it('light the key the player needs at the rung that copies, and that one only', () => {
    let s = start('frog', 0);
    for (const letter of 'frog') {
      const lit = keyViews('abc', s)
        .flat()
        .filter((key) => key.state === 'lit');
      expect(lit.map((key) => key.letter)).toEqual([letter]);
      s = press(s, letter).spelling;
    }
  });

  it('light nothing at the rungs that follow until the player is helped, and then the key they need', () => {
    let s = start('frog', 3);
    expect(
      keyViews('abc', s)
        .flat()
        .some((key) => key.state === 'lit'),
    ).toBe(false);
    s = help(s);
    expect(
      keyViews('abc', s)
        .flat()
        .filter((key) => key.state === 'lit')
        .map((key) => key.letter),
    ).toEqual(['f']);
  });

  it('leave no key faded at the rungs that use them all, and fade every key once the word is done', () => {
    expect(
      keyViews('abc', start('frog', 4))
        .flat()
        .filter((key) => key.state === 'off'),
    ).toEqual([]);
    for (const level of [0, 1, 3]) {
      const done = keyViews('abc', typed(start('frog', level), 'frog'));
      expect(
        done.flat().every((key) => key.state === 'off'),
        `level ${level}`,
      ).toBe(true);
    }
  });

  it('leave the keys of the bank at the rung that follows, which are the word and four others', () => {
    const on = keyViews('abc', start('frog', 1))
      .flat()
      .filter((key) => key.state !== 'off');
    expect(on).toHaveLength(8);
    for (const letter of 'frog') expect(on.map((key) => key.letter)).toContain(letter);
  });
});

describe('the badge of a big moment', () => {
  const worth = (patch: Partial<Worth> = {}): Worth => ({
    stars: { before: 1, after: 1 },
    milestone: null,
    pages: [],
    everything: false,
    ...patch,
  });

  it('is a crown for every word, a rosette with a star for a finished page, and a rosette with the number for a round number', () => {
    expect(badgeOf(worth({ everything: true }))).toEqual({ shape: 'crown', number: null });
    expect(badgeOf(worth({ pages: ['meadow'] }))).toEqual({ shape: 'rosette', number: null });
    expect(badgeOf(worth({ milestone: 10 }))).toEqual({ shape: 'rosette', number: 10 });
  });

  it('is the biggest of them when a word is more than one, and the number is only ever on a round number', () => {
    expect(badgeOf(worth({ everything: true, pages: ['friends'], milestone: 30 }))).toEqual({
      shape: 'crown',
      number: null,
    });
    expect(badgeOf(worth({ pages: ['meadow'], milestone: 5 }))).toEqual({ shape: 'rosette', number: null });
  });

  it('is nothing for a word, or for a new star, which the stars on the card already show', () => {
    expect(badgeOf(worth())).toBeNull();
    expect(badgeOf(worth({ stars: { before: 0, after: 1 } }))).toBeNull();
  });
});
